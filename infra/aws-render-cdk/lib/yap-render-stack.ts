import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as logs from "aws-cdk-lib/aws-logs";

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
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        }
      ]
    });

    const cluster = new ecs.Cluster(this, "RenderCluster", { vpc });

    const taskRole = new iam.Role(this, "RenderTaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com")
    });
    bucket.grantReadWrite(taskRole);

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
const SUBNETS = process.env.SUBNETS.split(",");
const SECURITY_GROUP = process.env.SECURITY_GROUP;
const BUCKET = process.env.BUCKET;

exports.handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  for (const record of records) {
    const key = decodeURIComponent(String(record?.s3?.object?.key || "").replace(/\\+/g, " "));
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
          assignPublicIp: "ENABLED"
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
        SUBNETS: vpc.publicSubnets.map((subnet) => subnet.subnetId).join(","),
        SECURITY_GROUP: cluster.connections.securityGroups[0]?.securityGroupId ?? "",
        BUCKET: bucket.bucketName
      }
    });

    const dispatcherSg = new ec2.SecurityGroup(this, "DispatcherSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "No inbound access; Fargate render tasks are outbound-only."
    });

    taskDefinition.taskRole?.grantAssumeRole(dispatcher);
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

    const taskSecurityGroup = new ec2.SecurityGroup(this, "RenderSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Render tasks have no inbound ports."
    });

    dispatcher.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ecs:DescribeTasks"],
      resources: ["*"]
    }));

    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(dispatcher),
      { prefix: "jobs/", suffix: ".json" }
    );

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

    // The SG is intentionally created after the task definition. The first
    // version of the dispatcher uses the task-definition network security
    // group only when explicitly supplied by deployment automation.
    void dispatcherSg;
    void taskSecurityGroup;
  }
}
