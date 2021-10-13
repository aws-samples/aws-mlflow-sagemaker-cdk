#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MLflowVpclinkStack } from '../lib/mlflow-vpclink-stack';
import { SageMakerVpcStack } from '../lib/sagemaker-vpc--stack';
import { SageMakerNotebookInstance } from '../lib/sagemaker-notebook-instance';
const env = { region: (process.env['AWS_REGION'] || 'us-west-2') };

const app = new cdk.App();
const mlflowVpclinkStack = new MLflowVpclinkStack(app, 'MLflowVpclinkStack', { env: env });
const sagemakerVpcStack = new SageMakerVpcStack(app, 'SageMakerVpcStack', mlflowVpclinkStack.httpVpcLink, mlflowVpclinkStack.httpApiListener , { env: env });
new SageMakerNotebookInstance(app, 'SageMakerNotebookInstance', sagemakerVpcStack.vpc, { env: env })