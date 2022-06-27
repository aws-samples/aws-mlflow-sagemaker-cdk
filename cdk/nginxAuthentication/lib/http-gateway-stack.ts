import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as apig from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpAlbIntegration, HttpNlbIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";

import * as ec2 from "aws-cdk-lib/aws-ec2";

export class HttpGatewayStack extends cdk.Stack {
  public readonly api: apig.HttpApi;
  public readonly mlflowSecretArn: string;

  constructor(
    scope: Construct,
    id: string,
    vpc: ec2.Vpc,
    httpApiListener: elbv2.NetworkListener,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);
    
    const httpVpcLink = new cdk.CfnResource(this, 'HttpVpcLink', {
      type: "AWS::ApiGatewayV2::VpcLink",
      properties: {
        Name: "http-api-vpclink",
        SubnetIds: vpc.privateSubnets.map((m) => m.subnetId)
      },
    });
    
    const mlflowVpcLink = apig.VpcLink.fromVpcLinkAttributes(this, 'MLFlowVpcLink', {
      vpcLinkId: httpVpcLink.ref,
      vpc: vpc
    }); 
    
    // HTTP Integration with VpcLink
    const mlflowIntegration = new HttpNlbIntegration(
      'MLflowIntegration',
      httpApiListener,
      { vpcLink: mlflowVpcLink }
    )
    
    // HTTP Api
    this.api = new apig.HttpApi(this, "mlflow-api", {
      createDefaultStage: true,
      defaultIntegration: mlflowIntegration
    });

    this.api.addRoutes({
      integration: mlflowIntegration,
      path: "/{proxy+}"
    })

    // 👇 API and Service Endpoints
    const httpApiEndpoint = this.api.apiEndpoint;
    
    new cdk.CfnOutput(this, "MLflow API endpoint: ", {
      value: httpApiEndpoint,
    });
  }
}
