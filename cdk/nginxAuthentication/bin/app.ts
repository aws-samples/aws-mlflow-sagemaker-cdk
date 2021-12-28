#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MLflowVpclinkStack } from '../lib/mlflow-vpclink-stack';
import { HttpGatewayStack } from '../lib/http-gateway-stack';
import { SageMakerNotebookInstanceStack } from '../lib/sagemaker-notebook-instance-stack';
const env = { region: (process.env['AWS_REGION'] || 'us-west-2') };

const mlflowSecretName = 'mlflow-credentials'

const app = new cdk.App();

const mlflowVpclinkStack = new MLflowVpclinkStack(
    app,
    'MLflowVpclinkStack',
    mlflowSecretName,
    { env: env }
);

const httpGatewayStack = new HttpGatewayStack(
    app,
    'HttpGatewayStack',
    mlflowVpclinkStack.httpVpcLink,
    mlflowVpclinkStack.httpApiListener,
    { env: env }
);

new SageMakerNotebookInstanceStack(
    app,
    'SageMakerNotebookInstanceStack', 
    httpGatewayStack.api,
    mlflowSecretName,
    mlflowVpclinkStack.mlflowSecretArn,
    { env: env }
)