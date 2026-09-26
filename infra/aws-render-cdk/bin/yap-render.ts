#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { YapRenderStack } from "../lib/yap-render-stack.js";

const app = new cdk.App();

new YapRenderStack(app, "YapEngineRenderStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
  }
});
