#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MLflowVpclinkStack } from '../lib/mlflow-vpclink-stack';
import { HttpApiGatewayStack } from '../lib/http-api-gateway-stack';
import { SageMakerNotebookInstance } from '../lib/sagemaker-notebook-instance';
const env = { region: (process.env['AWS_REGION'] || 'us-west-2') };

const app = new cdk.App();
const mlflowVpclinkStack = new MLflowVpclinkStack(
    app,
    'MLflowVpclinkStack',
    { env: env }
);

const apiGatewayStack = new HttpApiGatewayStack(
    app,
    'HTTPApiGatewayStack',
    mlflowVpclinkStack.httpVpcLink,
    mlflowVpclinkStack.httpApiListener ,
    { env: env }
);

new SageMakerNotebookInstance(
    app, 
    'SageMakerNotebookInstance', 
    apiGatewayStack.api,
    { env: env }
)