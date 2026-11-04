# infra/

CloudFormation templates for the deployed app. Deploy them with the scripts in [`../scripts/`](../scripts/README.md), not by hand: the scripts look up network values, pass secrets and keep earlier parameter values. See the root [Layout](../README.md#layout).

## Files

| File | What it does |
|---|---|
| `template.yaml` | App stack (`everytown-oci`, `STACK`). CloudFront in front of an S3 site bucket and `/api/*` to one Lambda (Function URL with `AWS_IAM`, signed by an origin access control), the docs bucket plus S3 Vectors index and Bedrock Knowledge Base with its data source, a Bedrock Guardrail and version, the Lambda role and log group, Bedrock invocation log group and role, CloudWatch dashboard, `GroundingAlarm` and `ErrorsAlarm`, and an optional `MonthlyBudget`. Key parameters: `ReservedConcurrency` (default 10, caps concurrent web and AI worker runs, so it bounds Bedrock spend; 5 throttled during v1.5 testing, and AWS keeps 100 of the account's concurrency unreserved, so a shared account may not allow more), `MonthlyBudgetUsd` (default 100, 0 skips the budget), `ModelId`, `FastModelId`, `DbClusterArn`/`DbSecretArn`/`DbName` (from the database stack), `SecretKey`, `PhoenixEndpoint`/`PhoenixApiKey` (empty sends traces to CloudWatch only). Outputs include `AppUrl`, `KnowledgeBaseId`, `DataSourceId`, `DashboardUrl`, `TracesUrl`. |
| `database.yaml` | Database stack (`everytown-oci-db`, `DB_STACK`). Aurora PostgreSQL Serverless v2 with the RDS Data API, so the app needs no VPC access: subnet group, security group, cluster, one instance. Parameters: `MinCapacity` (default 0.5 ACU, 0 turns on auto-pause after `SecondsUntilAutoPause`, default 3600), `MaxCapacity` (default 2), `EngineVersion`, `VpcId`, `SubnetIds`. Outputs `DbClusterArn`, `DbSecretArn`, `DbName`. |
| `observability.yaml` | Phoenix stack (`everytown-oci-obs`, `OBS_STACK`). Arize Phoenix on one EC2 instance with its data on a separate encrypted EBS volume, reachable only through CloudFront (HTTPS): security group, instance role and profile, data volume, instance, Elastic IP, distribution. Parameters: `InstanceType`, `PhoenixImage`, `DataVolumeSize`, `DataSnapshotId` (restore from an earlier snapshot), `PhoenixSecret`, `PhoenixAdminSecret`, `AdminInitialPassword`. Output `PhoenixUrl`. |

## How it connects

- `scripts/deploy.sh` deploys `database.yaml`, then `template.yaml` with the database outputs, then uploads the site, runs `python3 -m db migrate` and `seed`, and starts Knowledge Base ingestion.
- `scripts/deploy_observability.sh` deploys `observability.yaml`; `scripts/teardown.sh` deletes all three stacks (Aurora and the Phoenix volume keep a final snapshot).
- The app stack keeps its data in the separate database stack, so app redeploys never touch assessments.

## Changing it safely

- `infra/.secret` and `infra/.phoenix.env` (`infra/.phoenix*`) hold live secrets. They are git-ignored and must never be committed, copied into docs or printed.
- Keep data on its own stack and volume: replacing the app stack or the Phoenix instance must not delete assessments or traces.
- `AWS::Bedrock::GuardrailVersion` only publishes a new version when its `Description` changes.
