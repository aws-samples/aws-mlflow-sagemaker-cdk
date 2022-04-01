import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as sagemaker from 'aws-cdk-lib/aws-sagemaker';

import * as iam from "aws-cdk-lib/aws-iam";
import * as apig from "@aws-cdk/aws-apigatewayv2-alpha";

export class SageMakerNotebookInstanceStack extends cdk.Stack {
    constructor(
        scope: Construct,
        id: string,
        mlflowSecretArn: string,
        httpGatewayStackName: string,
        props?: cdk.StackProps
    ){
        super(scope, id, props);
        
        // SageMaker Execution Role
        const sagemakerExecutionRole = new iam.Role(this, "sagemaker-execution-role", {
          assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess"),
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"), // need to push mlflow container
          ],
          inlinePolicies: {
            retrieveApiGatewayUrl: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  resources: [`arn:*:cloudformation:${this.region}:${this.account}:stack/${httpGatewayStackName}/*`],  // for a production environment, you might want to restrict this to only the relevant bucket
                  actions: ["cloudformation:DescribeStacks"],
                })
              ],
            }),
            s3Buckets: new iam.PolicyDocument({
              statements: [
                new iam.PolicyStatement({
                  effect: iam.Effect.ALLOW,
                  resources: ["*"],  // for a production environment, you might want to restrict this to only the relevant bucket
                  actions: ["s3:ListBucket","s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:PutObjectTagging"],
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
    
        // SageMaker Notebook Instance
        const notebook = new sagemaker.CfnNotebookInstance(
          this,
          'MlflowNotebook',
          {
              roleArn: sagemakerExecutionRole.roleArn,
              instanceType: "ml.t3.large",
              volumeSizeInGb: 40,
              notebookInstanceName: "MLFlow-SageMaker-PrivateLink",
              defaultCodeRepository: "https://github.com/aws-samples/aws-mlflow-sagemaker-cdk",
          }
      );
    }
}
