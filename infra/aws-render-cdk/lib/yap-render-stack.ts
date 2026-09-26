import * as path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as logs from "aws-cdk-lib/aws-logs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class YapRenderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, "RenderBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(14) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false
    });

    const vpc = new ec2.Vpc(this, "RenderVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "render-private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ]
    });

    vpc.addGatewayEndpoint("RenderS3Endpoint", {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{ subnetType: ec2.SubnetType.PRIVATE_ISOLATED }],
    });

    vpc.addInterfaceEndpoint("RenderEcrApiEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    vpc.addInterfaceEndpoint("RenderEcrDkrEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });
    vpc.addInterfaceEndpoint("RenderLogsEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      privateDnsEnabled: true,
      subnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    const cluster = new ecs.Cluster(this, "RenderCluster", { vpc });

    const taskSecurityGroup = new ec2.SecurityGroup(this, "RenderSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Render tasks have no inbound ports."
    });

    const taskRole = new iam.Role(this, "RenderTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com")
    });
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [bucket.arnForObjects("jobs/*")],
    }));
    taskRole.addToPolicy(new iam.PolicyStatement({
      actions: ["s3:PutObject"],
      resources: [bucket.arnForObjects("results/*")],
    }));

    const taskDefinition = new ecs.FargateTaskDefinition(this, "RenderTaskDefinition", {
      cpu: 1024,
      memoryLimitMiB: 4096,
      taskRole
    });

    const logGroup = new logs.LogGroup(this, "RenderLogs", {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    taskDefinition.addContainer("RenderWorker", {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "../worker")),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: "render"
      }),
      environment: {
        RENDER_BUCKET: bucket.bucketName
      },
      stopTimeout: cdk.Duration.seconds(30)
    });

    const dispatcher = new lambda.Function(this, "RenderDispatcher", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      code: lambda.Code.fromInline(`
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");

const ecs = new ECSClient({});
const CLUSTER = process.env.CLUSTER;
const TASK_DEFINITION = process.env.TASK_DEFINITION;
const SUBNETS = String(process.env.SUBNETS || "").split(",").filter(Boolean);
const SECURITY_GROUP = process.env.SECURITY_GROUP;
const BUCKET = process.env.BUCKET;

exports.handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];

  for (const record of records) {
    const encodedKey = String(record?.s3?.object?.key || "");
    const key = decodeURIComponent(encodedKey.replace(/\\+/g, " "));
    if (!key.startsWith("jobs/") || !key.endsWith(".json")) continue;

    await ecs.send(new RunTaskCommand({
      cluster: CLUSTER,
      taskDefinition: TASK_DEFINITION,
      launchType: "FARGATE",
      platformVersion: "LATEST",
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: SUBNETS,
          securityGroups: [SECURITY_GROUP],
          assignPublicIp: "DISABLED"
        }
      },
      overrides: {
        containerOverrides: [{
          name: "RenderWorker",
          environment: [
            { name: "RENDER_MANIFEST_KEY", value: key },
            { name: "RENDER_BUCKET", value: BUCKET }
          ]
        }]
      }
    }));
  }
};
`),
      environment: {
        CLUSTER: cluster.clusterArn,
        TASK_DEFINITION: taskDefinition.taskDefinitionArn,
        SUBNETS: vpc.isolatedSubnets.map((subnet) => subnet.subnetId).join(","),
        SECURITY_GROUP: taskSecurityGroup.securityGroupId,
        BUCKET: bucket.bucketName
      }
    });

    dispatcher.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ecs:RunTask"],
      resources: [taskDefinition.taskDefinitionArn]
    }));

    dispatcher.addToRolePolicy(new iam.PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [
        taskDefinition.taskRole!.roleArn,
        taskDefinition.executionRole!.roleArn
      ]
    }));

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(dispatcher),
      { prefix: "jobs/", suffix: ".json" }
    );

    // Render-completion callback intentionally stays outside the isolated render VPC:
    // Vercel/Neon are external endpoints and isolated subnets have no NAT path.
    // Render tasks themselves remain private and have no public IP.
    const renderCompleteFunction = new lambda.Function(this, "RenderCompleteHandler", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "index.handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        API_WEBHOOK_URL: process.env.API_WEBHOOK_URL ?? "",
        WEBHOOK_SECRET: process.env.SWARMX_RENDER_CALLBACK_SECRET ?? "",
        AWS_RENDER_BUCKET: bucket.bucketName,
      },
      code: lambda.Code.fromInline(`
exports.handler = async (event) => {
  const url = process.env.API_WEBHOOK_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!url || !secret) throw new Error("render callback environment is not configured");

  const records = Array.isArray(event?.Records) ? event.Records : [];
  for (const record of records) {
    const key = record?.s3?.object?.key ? decodeURIComponent(String(record.s3.object.key).replace(/\\+/g, " ")) : "";
    if (!key.endsWith(".validation.json")) continue;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-swarmx-render-callback-secret": secret
      },
      body: JSON.stringify({
        bucket: process.env.AWS_RENDER_BUCKET,
        validationKey: key,
        source: "aws-render-complete"
      })
    });
    if (!response.ok) {
      throw new Error(`render callback failed: ${response.status}`);
    }
  }
};
`),
    });

    bucket.grantRead(renderCompleteFunction);

    // EventBridge receives S3 Object Created events after notification delivery is enabled.
    bucket.enableEventBridgeNotification();
    const renderCompleteRule = new events.Rule(this, "RenderJobCompleteRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: {
          bucket: { name: [bucket.bucketName] },
          object: { key: [{ suffix: ".validation.json" }] },
        },
      },
    });
    renderCompleteRule.addTarget(new targets.LambdaFunction(renderCompleteFunction));

    new cdk.CfnOutput(this, "RenderBucketName", {
      value: bucket.bucketName
    });
    new cdk.CfnOutput(this, "RenderClusterArn", {
      value: cluster.clusterArn
    });
    new cdk.CfnOutput(this, "RenderTaskDefinitionArn", {
      value: taskDefinition.taskDefinitionArn
    });
    new cdk.CfnOutput(this, "RenderDispatcherName", {
      value: dispatcher.functionName
    });
  }
}
