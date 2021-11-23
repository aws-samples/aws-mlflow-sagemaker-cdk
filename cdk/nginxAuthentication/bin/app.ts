#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MLflowVpclinkStack } from '../lib/mlflow-vpclink-stack';
import { HttpGatewayStack } from '../lib/http-gateway-stack';
import { SageMakerNotebookInstance } from '../lib/sagemaker-notebook-instance';
const env = { region: (process.env['AWS_REGION'] || 'us-west-2') };
const mlflowSecretName = 'mlflow-credentials'
const mlflowSecretArn = (process.env['MLFLOW_SECRET_ARN'] || mlflowSecretName)

const mlflowUsername = 'admin'

const app = new cdk.App();

const mlflowVpclinkStack = new MLflowVpclinkStack(
    app,
    'MLflowVpclinkStack',
    mlflowSecretName,
    mlflowUsername,
    { env: env }
);

const httpGatewayStack = new HttpGatewayStack(
    app,
    'HttpGatewayStack',
    mlflowVpclinkStack.httpVpcLink,
    mlflowVpclinkStack.httpApiListener,
    { env: env }
);

new SageMakerNotebookInstance(
    app,
    'SageMakerNotebookInstance', 
    httpGatewayStack.api,
    mlflowSecretName,
    mlflowUsername,
    httpGatewayStack.mlflowSecretArn,
    { env: env }
)