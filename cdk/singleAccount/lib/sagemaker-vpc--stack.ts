import * as cdk from "@aws-cdk/core";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as apig from "@aws-cdk/aws-apigatewayv2";
import * as lambda from "@aws-cdk/aws-lambda";
import * as iam from "@aws-cdk/aws-iam";
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';

export class SageMakerVpcStack extends cdk.Stack {
  // 👇 Export Vpc
  //public readonly vpc: ec2.Vpc;
  public readonly api: apig.HttpApi;
  public readonly mlflowSecretArn: string;

  constructor(
    scope: cdk.Construct,
    id: string,
    httpVpcLink: cdk.CfnResource,
    httpApiListener: elbv2.ApplicationListener,
    mlflowSecretName: string,
    mlflowTokenName: string,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // 👇 DB Credentials
    const mlflowCredentialsSecret = new secretsmanager.Secret(this, 'MLflowCredentialsSecret', {
      secretName: mlflowSecretName,
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        excludePunctuation: true,
        includeSpace: false,
        generateStringKey: mlflowTokenName
      }
    });
    
    this.mlflowSecretArn = mlflowCredentialsSecret.secretArn
    
    // 👇 SageMaker VPC - to delete if not needed
    // this.vpc = new ec2.Vpc(this, "SageMakerVPC", {
    //   natGateways: 0,
    //   subnetConfiguration: [
    //     {
    //       cidrMask: 24,
    //       name: "ingress",
    //       subnetType: ec2.SubnetType.PUBLIC,
    //     },
    //   ],
    // });
    
    // 👇 HTTP Api
    this.api = new apig.HttpApi(this, "mlflow-api", {
      createDefaultStage: true,
    });

    // 👇 HTTP Api Integration
    const integration = new apig.CfnIntegration(
      this,
      "MLflowIntegration",
      {
        apiId: this.api.httpApiId,
        connectionId: httpVpcLink.ref,
        connectionType: "VPC_LINK",
        description: "API Integration",
        integrationMethod: "ANY",
        integrationType: "HTTP_PROXY",
        integrationUri: httpApiListener.listenerArn,
        payloadFormatVersion: "1.0",
      }
    );
    
    // Define the role for the lambda function
    const lambdaRole = new iam.Role(this, 'LambdaAuthorizerExecutionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
      ],
      inlinePolicies: {
        secretsManagerRestricted: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: [this.mlflowSecretArn],
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

    // defines an AWS Lambda resource
    const authHandler = new lambda.Function(this, 'AuthHandler', {
      runtime: lambda.Runtime.PYTHON_3_9,    // execution environment
      code: lambda.Code.fromAsset('../../src/lambda'),  // code loaded from "lambda" directory
      handler: 'token-authorizer.lambda_handler',        // file is "token-authorizer", function is "lambda_handler"
      role: lambdaRole,
      environment: {
        MLFLOW_SECRET_NAME: mlflowSecretName,
        MLFLOW_KEY: mlflowTokenName
      }
    });

    const authorizer = new apig.CfnAuthorizer(this, "LambdaAuthorizer", {
      name: 'LambdaAuthorizer',
      apiId: this.api.apiId,
      authorizerType: 'REQUEST',
      authorizerUri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${authHandler.functionArn}/invocations`,
      enableSimpleResponses: true,
      identitySource: ['$request.header.Authorization'],
      authorizerPayloadFormatVersion: '2.0'
    })
    
    new lambda.CfnPermission(this, 'APIInvokeLambdaPermission', {
      functionName: authHandler.functionName,
      action: 'lambda:InvokeFunction',
      principal: 'apigateway.amazonaws.com',
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.apiId}/authorizers/${authorizer.ref}`
    })

    // 👇 HTTP Api Route
    new apig.CfnRoute(this, "Route", {
      apiId: this.api.httpApiId,
      routeKey: "ANY /{proxy+}",
      target: `integrations/${integration.ref}`,
      authorizerId: `${authorizer.ref}`,
      authorizationType: 'CUSTOM'
    });

    // 👇 API and Service Endpoints
    const httpApiEndpoint = this.api.apiEndpoint;
    
    new cdk.CfnOutput(this, "MLflow API endpoint: ", {
      value: httpApiEndpoint,
    });
  }
}
