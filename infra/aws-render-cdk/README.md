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

The render task now runs in isolated private subnets with no public IP. S3, ECR and CloudWatch Logs VPC endpoints provide required service access without inbound connectivity. The stack still remains an external-testing boundary until idempotent handoff, bounded-jitter retry, terminal unrecoverable state, and Neon render_jobs lineage are E2E-verified.

Do not put AWS credentials in render manifests.
