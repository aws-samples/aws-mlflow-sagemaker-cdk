#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MLflowVpclinkStack } from '../lib/mlflow-vpclink-stack';
import { SageMakerVpcStack } from '../lib/sagemaker-vpc--stack';
import { SageMakerNotebookInstance } from '../lib/sagemaker-notebook-instance';
const env = { region: (process.env['AWS_REGION'] || 'us-west-2') };

const mlflow_secret_name = 'mlflow-server-credentials'
const mlflow_token_name = 'mlflow-token'

const app = new cdk.App();
const mlflowVpclinkStack = new MLflowVpclinkStack(
    app,
    'MLflowVpclinkStack',
    { env: env }
);

const sagemakerVpcStack = new SageMakerVpcStack(
    app,
    'SageMakerVpcStack',
    mlflowVpclinkStack.httpVpcLink,
    mlflowVpclinkStack.httpApiListener,
    mlflow_secret_name,
    mlflow_token_name,
    { env: env }
);

new SageMakerNotebookInstance(
    app,
    'SageMakerNotebookInstance', 
    sagemakerVpcStack.api,
    mlflow_secret_name,
    mlflow_token_name,
    sagemakerVpcStack.mlflowSecretArn,
    { env: env }
)