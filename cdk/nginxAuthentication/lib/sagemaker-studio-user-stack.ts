import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import * as iam from "aws-cdk-lib/aws-iam";

export class SageMakerStudioUserStack extends cdk.Stack {
    constructor(
        scope: Construct,
        id: string,
        mlflowSecretArn: string,
        httpGatewayStackName: string,
        domainId: string,
        props?: cdk.StackProps
    ){
        super(scope, id, props);
        
        // SageMaker Execution Role
        const sagemakerExecutionRole = new iam.Role(this, "sagemaker-execution-role", {
          assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess")
          ],
          inlinePolicies: {
            retrieveApiGatewayUrl: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  resources: [`arn:*:cloudformation:${this.region}:${this.account}:stack/${httpGatewayStackName}/*`],
                  actions: ["cloudformation:DescribeStacks"],
                })
              ],
            }),
            s3Buckets: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  resources: ["arn:aws:s3:::*mlflow*"],
                  actions: ["s3:ListBucket","s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:PutObjectTagging", "s3:CreateBucket"],
                })
              ],
            }),
            secretsManagerRestricted: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  resources: [mlflowSecretArn],
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
          },
        });
        
        if (domainId == "") {
          const defaultVpc = ec2.Vpc.fromLookup(this, 'DefaultVPC', { isDefault: true });
          const subnetIds: string[] = [];

          defaultVpc.publicSubnets.forEach((subnet, index) => {
            subnetIds.push(subnet.subnetId);
          });

          const cfnStudioDomain = new sagemaker.CfnDomain(this, 'MyStudioDomain', {
            authMode: 'IAM',
            defaultUserSettings: {
              executionRole: sagemakerExecutionRole.roleArn,
            },
            domainName: 'StudioDomainName',
            vpcId: defaultVpc.vpcId,
            subnetIds: subnetIds,
          });

          const cfnUserProfile = new sagemaker.CfnUserProfile(this, 'MyCfnUserProfile', {
            domainId: cfnStudioDomain.attrDomainId,
            userProfileName: 'mlflow-user',
            userSettings: {
              executionRole: sagemakerExecutionRole.roleArn,
              }
            }
          );
        }
        else {
          const cfnUserProfile = new sagemaker.CfnUserProfile(this, 'MyCfnUserProfile', {
            domainId: domainId,
            userProfileName: 'mlflow-user',
            userSettings: {
              executionRole: sagemakerExecutionRole.roleArn,
              }
            }
          );
        }
    }
}
