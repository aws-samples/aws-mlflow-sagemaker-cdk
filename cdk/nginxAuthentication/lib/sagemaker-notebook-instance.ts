import * as sagemaker from '@aws-cdk/aws-sagemaker';
import * as cdk from "@aws-cdk/core";
import * as iam from "@aws-cdk/aws-iam";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as apig from "@aws-cdk/aws-apigatewayv2";

export class SageMakerNotebookInstance extends cdk.Stack {
    constructor(
        scope: cdk.Construct,
        id: string,
        api: apig.HttpApi,
        mlflowSecretName: string,
        mlflowTokenName: string,
        mlflowSecretArn: string,
        props?: cdk.StackProps
    ){
        super(scope, id, props);
        
        // SageMaker Executio Role
        const sagemakerExecutionRole = new iam.Role(this, "sagemaker-execution-role", {
          assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com"),
          managedPolicies: [
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSageMakerFullAccess"),
            iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ContainerRegistryFullAccess"), // need to push mlflow container
          ],
          inlinePolicies: {
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
        
        /** Create the SageMaker Notebook Lifecycle Config */
        const lifecycleConfig = new sagemaker.CfnNotebookInstanceLifecycleConfig(
          this, 
          'lifecycle-config',
          {
            notebookInstanceLifecycleConfigName: `MlflowNotebook-lifecycle-config`,
            onCreate: [
              {
                content: cdk.Fn.base64(
`echo "export MLFLOWSERVER=${api.apiEndpoint}" | tee -a /home/ec2-user/.bashrc
echo "export MLFLOW_SECRET_NAME=${mlflowSecretName}" | tee -a /home/ec2-user/.bashrc
echo "export MLFLOW_KEY=${mlflowTokenName}" | tee -a /home/ec2-user/.bashrc`
                )
              }
            ],
            onStart: [
              {
                content: cdk.Fn.base64(
`export MLFLOWSERVER=${api.apiEndpoint}
export MLFLOW_SECRET_NAME=${mlflowSecretName}
export MLFLOW_KEY=${mlflowTokenName}`
                )
              }
            ]
          });
    
        const notebook = new sagemaker.CfnNotebookInstance(
                this,
                'MlflowNotebook',
                {
                    roleArn: sagemakerExecutionRole.roleArn,
                    instanceType: "ml.t3.large",
                    volumeSizeInGb: 40,
                    notebookInstanceName: "MLFlow-SageMaker-PrivateLink",
                    defaultCodeRepository: "https://github.com/aws-samples/aws-mlflow-sagemaker-cdk",
                    lifecycleConfigName: lifecycleConfig.notebookInstanceLifecycleConfigName
                }
            );
    }
}
