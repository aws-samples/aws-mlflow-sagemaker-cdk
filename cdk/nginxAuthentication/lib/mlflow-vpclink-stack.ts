import * as cdk from "@aws-cdk/core";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as ecs from "@aws-cdk/aws-ecs";
import * as iam from "@aws-cdk/aws-iam";
import * as logs from "@aws-cdk/aws-logs";
import * as servicediscovery from "@aws-cdk/aws-servicediscovery";
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import * as s3 from '@aws-cdk/aws-s3';
import { CfnDBCluster, CfnDBSubnetGroup } from '@aws-cdk/aws-rds';

const { ApplicationProtocol } = elbv2;
const dbName = "mlflowdb"
const dbPort = 3306
const dbUsername = "master"
const clusterName = "mlflowCluster"
const serviceName = "mlflowService"
const cidr = "10.0.0.0/16"
const containerPort = 5000

const mlflowUsername = "admin"

export class MLflowVpclinkStack extends cdk.Stack {

  // 👇 Export Vpclink and ALB Listener
  public readonly httpVpcLink: cdk.CfnResource;
  public readonly httpApiListener: elbv2.ApplicationListener;
  public readonly mlflowSecretArn: string;

  readonly bucketName = `mlops-${this.account}-${this.region}`

  constructor(
    scope: cdk.Construct, 
    id: string,
    mlflowSecretName: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, 'MLOpsVPC', {
      cidr: cidr,
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE,
          cidrMask: 26,
        },
        {
          name: 'isolated',
          subnetType: ec2.SubnetType.ISOLATED,
          cidrMask: 28,
        },
      ],
    });

    // S3 bucket
    const mlOpsBucket = new s3.Bucket(this, "mlOpsBucket", {
      versioned: false,
      bucketName: this.bucketName,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      encryption: s3.BucketEncryption.KMS_MANAGED
    })

    // DB SubnetGroup
    const subnetIds: string[] = [];
    vpc.isolatedSubnets.forEach((subnet, index) => {
      subnetIds.push(subnet.subnetId);
    });

    const dbSubnetGroup: CfnDBSubnetGroup = new CfnDBSubnetGroup(this, 'AuroraSubnetGroup', {
      dbSubnetGroupDescription: 'Subnet group to access aurora',
      dbSubnetGroupName: 'aurora-serverless-subnet-group',
      subnetIds
    });

    // DB Credentials
    const databaseCredentialsSecret = new secretsmanager.Secret(this, 'DBCredentialsSecret', {
      secretName: `${serviceName}-credentials`,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: dbUsername,
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    });
    
    // Mflow credentials
    const mlflowCredentialsSecret = new secretsmanager.Secret(this, 'MlflowCredentialsSecret', {
      secretName: mlflowSecretName,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          username: mlflowUsername,
        }),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: 'password'
      }
    });

    // 👇 DB SecurityGroup
    const dbClusterSecurityGroup = new ec2.SecurityGroup(this, 'DBClusterSecurityGroup', { vpc });
    dbClusterSecurityGroup.addIngressRule(ec2.Peer.ipv4(cidr), ec2.Port.tcp(dbPort));

    const dbConfig = {
      dbClusterIdentifier: `${serviceName}-cluster`,
      engineMode: 'serverless',
      engine: 'aurora-mysql',
      engineVersion: '5.7.12',
      databaseName: dbName,
      masterUsername: databaseCredentialsSecret.secretValueFromJson('username').toString(),
      masterUserPassword: databaseCredentialsSecret.secretValueFromJson('password').toString(),
      // Note: aurora serverless cluster can be accessed within its VPC only
      // https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless.html
      dbSubnetGroupName: dbSubnetGroup.dbSubnetGroupName,
      scalingConfiguration: {
        autoPause: true,
        maxCapacity: 2,
        minCapacity: 2,
        secondsUntilAutoPause: 3600,
      },
      vpcSecurityGroupIds: [
        dbClusterSecurityGroup.securityGroupId
      ]
    };

    // 👇 RDS Cluster 
    const rdsCluster = new CfnDBCluster(this, 'DBCluster', dbConfig);
    rdsCluster.addDependsOn(dbSubnetGroup)

    // 👇 ECS Cluster
    const cluster = new ecs.Cluster(this, "Fargate Cluster", {
      vpc: vpc,
      clusterName: clusterName,
    });

    // 👇 Cloud Map Namespace
    const dnsNamespace = new servicediscovery.PrivateDnsNamespace(
      this,
      "DnsNamespace",
      {
        name: "http-api.local",
        vpc: vpc,
        description: "Private DnsNamespace for Microservices",
      }
    );

    // 👇 Fargate Task Role
    const taskrole = new iam.Role(this, "ecsTaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonS3FullAccess")
      ],
      inlinePolicies: {
        secretsManagerRestricted: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: [
                mlflowCredentialsSecret.secretArn,
                databaseCredentialsSecret.secretArn
              ],
              actions: [
                "secretsmanager:GetResourcePolicy",
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret",
                "secretsmanager:ListSecretVersionIds"
              ]
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: ["*"],
              actions: ["secretsmanager:ListSecrets"]
            })
          ]
        })
      }
    });

    // 👇 Task Definitions
    const mlflowTaskDefinition = new ecs.FargateTaskDefinition(
      this,
      "mlflowTaskDef",
      {
        taskRole: taskrole,
        family: "mlFlowStack"
      },
    );

    // 👇 Log Groups
    const mlflowServiceLogGroup = new logs.LogGroup(this, "mlflowServiceLogGroup", {
      logGroupName: "/ecs/mlflowService",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const mlflowServiceLogDriver = new ecs.AwsLogDriver({
      logGroup: mlflowServiceLogGroup,
      streamPrefix: "mlflowService",
    });
    
    // 👇 nginx Task Container
    const nginxContainer = mlflowTaskDefinition.addContainer(
      "nginxContainer",
      {
        containerName: "nginxContainer",
        essential: true,
        // memoryReservationMiB: 512,
        // cpu: 512,
        portMappings: [{
          containerPort: 80,
          protocol: ecs.Protocol.TCP
        }],
        image: ecs.ContainerImage.fromAsset('../../src/nginx/basic_auth', {}),
        secrets: {
          MLFLOW_USERNAME: ecs.Secret.fromSecretsManager(mlflowCredentialsSecret, 'username'),
          MLFLOW_PASSWORD: ecs.Secret.fromSecretsManager(mlflowCredentialsSecret, 'password')
        },
        logging: mlflowServiceLogDriver,
      }
    );
    
    // 👇 MlFlow Task Container
    const mlflowServiceContainer = mlflowTaskDefinition.addContainer(
      "mlflowContainer",
      {
        containerName: "mlflowContainer",
        essential: true,
        // memoryReservationMiB: 512,
        // cpu: 512,
        portMappings: [{
          containerPort: containerPort,
          protocol: ecs.Protocol.TCP,
        }],
        image: ecs.ContainerImage.fromAsset('../../src/mlflow', {}),
        environment: {
          'BUCKET': `s3://${mlOpsBucket.bucketName}`,
          'HOST': rdsCluster.attrEndpointAddress,
          'PORT': `${dbPort}`,
          'DATABASE': dbName
        },
        secrets: {
          USERNAME: ecs.Secret.fromSecretsManager(databaseCredentialsSecret, 'username'),
          PASSWORD: ecs.Secret.fromSecretsManager(databaseCredentialsSecret, 'password')
        },
        logging: mlflowServiceLogDriver,
      });

    // 👇 Security Group
    const mlflowServiceSecGrp = new ec2.SecurityGroup(
      this,
      "mlflowServiceSecurityGroup",
      {
        allowAllOutbound: true,
        securityGroupName: "mlflowServiceSecurityGroup",
        vpc: vpc,
      }
    );
    mlflowServiceSecGrp.connections.allowFromAnyIpv4(ec2.Port.tcp(containerPort));
    mlflowServiceSecGrp.connections.allowFromAnyIpv4(ec2.Port.tcp(80));

    // 👇 Fargate Services
    const mlflowService = new ecs.FargateService(this, "mlflowService", {
      cluster: cluster,
      serviceName: serviceName,
      taskDefinition: mlflowTaskDefinition,
      assignPublicIp: false,
      desiredCount: 2,
      securityGroups: [mlflowServiceSecGrp],
      cloudMapOptions: {
        name: "mlflowService",
        cloudMapNamespace: dnsNamespace,
      },
    });

    // 👇 ALB
    const httpApiInternalALB = new elbv2.ApplicationLoadBalancer(
      this,
      "httpapiInternalALB",
      {
        vpc: vpc,
        internetFacing: false,
      }
    );

    // 👇 ALB Listener
    this.httpApiListener = httpApiInternalALB.addListener("httpapiListener", {
      port: 80,
      protocol: ApplicationProtocol.HTTP,

    });
    
    // 👇 Target Groups
    const mlflowServiceTargetGroup = this.httpApiListener.addTargets(
      "mlflowServiceTargetGroup",
      {
        healthCheck: {
          path: "/elb-status"
        },
        targets: [
          mlflowService.loadBalancerTarget(
            {
              containerName: 'nginxContainer',
              containerPort: 80
            }
          )
        ],
        port: 80,
        protocol: ApplicationProtocol.HTTP,
      }
    );

    // 👇 Task Auto Scaling
    const autoScaling = mlflowService.autoScaleTaskCount({ maxCapacity: 6 });
    autoScaling.scaleOnCpuUtilization('CpuScaling', {
      targetUtilizationPercent: 70,
      scaleInCooldown: cdk.Duration.seconds(60),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // 👇 VPC Link
    this.httpVpcLink = new cdk.CfnResource(this, "HttpVpcLink", {
      type: "AWS::ApiGatewayV2::VpcLink",
      properties: {
        Name: "http-api-vpclink",
        SubnetIds: vpc.privateSubnets.map((m) => m.subnetId),
      },
    });
    
    this.mlflowSecretArn = mlflowCredentialsSecret.secretArn

    new cdk.CfnOutput(this, "ALB Dns Name : ", {
      value: httpApiInternalALB.loadBalancerDnsName,
    });

  }
}
