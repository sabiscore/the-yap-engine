# AWS Phase-D Render Boundary

This CDK app is an asynchronous external-testing boundary, not a replacement for SwarmXQ.

## Resources

- private, versioned S3 bucket with `jobs/` and `results/` prefixes;
- Lambda dispatcher triggered only by `jobs/*.json`;
- ECS/Fargate cluster;
- 1 vCPU / 4 GiB render task;
- isolated FFmpeg worker image;
- CloudWatch log group.

The Lambda submits one Fargate task per manifest. The Fargate task downloads only declared S3 inputs and writes only under `results/`.

## Deploy

```bash
npm install
npx cdk bootstrap
npx cdk synth
npx cdk deploy --require-approval broadening
```

The current stack deliberately uses public subnets with no inbound rules and public IPs for low-cost external testing. Move to private subnets plus VPC endpoints/NAT before treating this as a hardened production account.

Do not put AWS credentials in render manifests.
