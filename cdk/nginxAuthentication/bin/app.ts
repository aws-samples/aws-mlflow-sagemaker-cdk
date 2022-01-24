#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MLflowVpcStack } from '../lib/mlflow-vpc-stack';
import { HttpGatewayStack } from '../lib/http-gateway-stack';
import { SageMakerNotebookInstanceStack } from '../lib/sagemaker-notebook-instance-stack';
const env = { region: (process.env['AWS_REGION'] || 'us-west-2') };

const mlflowSecretName = 'mlflow-credentials'

const app = new cdk.App();

const mlflowVpcStack = new MLflowVpcStack(
    app,
    'MLflowVpcStack',
    mlflowSecretName,
    { env: env }
);

const httpGatewayStack = new HttpGatewayStack(
    app,
    'HttpGatewayStack',
    mlflowVpcStack.vpc,
    mlflowVpcStack.httpApiListener,
    { env: env }
);

new SageMakerNotebookInstanceStack(
    app,
    'SageMakerNotebookInstanceStack', 
    httpGatewayStack.api,
    mlflowSecretName,
    mlflowVpcStack.mlflowSecretArn,
    { env: env }
)