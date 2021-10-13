import * as cdk from "@aws-cdk/core";
import * as elbv2 from "@aws-cdk/aws-elasticloadbalancingv2";
import * as ec2 from "@aws-cdk/aws-ec2";
import * as logs from "@aws-cdk/aws-logs";
import * as apig from "@aws-cdk/aws-apigatewayv2";

export class SageMakerVpcStack extends cdk.Stack {
  // 👇 Export Vpc
  public readonly vpc: ec2.Vpc;

  constructor(
    scope: cdk.Construct,
    id: string,
    httpVpcLink: cdk.CfnResource,
    httpApiListener: elbv2.ApplicationListener,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // 👇 SageMaker VPC
    this.vpc = new ec2.Vpc(this, "SageMakerVPC", {
      natGateways: 0,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "ingress",
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    // 👇 HTTP Api
    const api = new apig.HttpApi(this, "mlflow-api", {
      createDefaultStage: true,
    });

    // 👇 HTTP Api Integration
    const integration = new apig.CfnIntegration(
      this,
      "MLflowIntegration",
      {
        apiId: api.httpApiId,
        connectionId: httpVpcLink.ref,
        connectionType: "VPC_LINK",
        description: "API Integration",
        integrationMethod: "ANY",
        integrationType: "HTTP_PROXY",
        integrationUri: httpApiListener.listenerArn,
        payloadFormatVersion: "1.0",
      }
    );

    // 👇 HTTP Api Route
    new apig.CfnRoute(this, "Route", {
      apiId: api.httpApiId,
      routeKey: "ANY /{proxy+}",
      target: `integrations/${integration.ref}`,
    });

    // 👇 API and Service Endpoints
    const httpApiEndpoint = api.apiEndpoint;
    
    new cdk.CfnOutput(this, "MLflow API endpoint: ", {
      value: httpApiEndpoint,
    });
  }
}
