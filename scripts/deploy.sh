#!/usr/bin/env bash
# Deploy everything: database stack, Astro site, Lambda API, DB migrations + seed, Knowledge Base ingestion.
# Expects AWS credentials in the environment.
# Optional env: STACK (app stack, default everytown-oci), DB_STACK (default everytown-oci-db), AWS_REGION,
#   DB_MIN_CAPACITY (Aurora ACUs; 0 = auto-pause after an idle hour), EXTRA_DOCS (dir of extra KB docs),
#   RESERVED_CONCURRENCY (Lambda cap, template default 5), MONTHLY_BUDGET_USD (cost budget, template default 100;
#   0 skips it, needed where budgets:ModifyBudget is denied). Unset values keep the stack's previous setting.
# Observability (account and Region settings CloudFormation cannot express, both idempotent): CloudWatch Transaction
#   Search receives the app's OpenTelemetry spans, and Bedrock model invocation logging writes to the stack's log group.
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${STACK:-everytown-oci}
DB_STACK=${DB_STACK:-everytown-oci-db}
export AWS_DEFAULT_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
REGION=$AWS_DEFAULT_REGION
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS=oci-artifacts-$ACCOUNT-$REGION

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1
}

# Prints a stack output, or nothing when the stack or output does not exist.
out() {
  local value
  value=$(aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text 2>/dev/null) || return 0
  [ "$value" = None ] || printf '%s' "$value"
}

# 1. Database (own stack, data lifecycle independent of the app). Parameters not passed keep their previous value.
VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
SUBNETS=$(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true \
  --query 'Subnets[].SubnetId' --output text | tr '\t' ',')
DB_PARAMS=(VpcId="$VPC" SubnetIds="$SUBNETS")
[ -n "${DB_MIN_CAPACITY:-}" ] && DB_PARAMS+=(MinCapacity="$DB_MIN_CAPACITY")
aws cloudformation deploy --stack-name "$DB_STACK" --template-file infra/database.yaml \
  --no-fail-on-empty-changeset --parameter-overrides "${DB_PARAMS[@]}"
DB_CLUSTER_ARN=$(out "$DB_STACK" DbClusterArn)
DB_SECRET_ARN=$(out "$DB_STACK" DbSecretArn)
DB_NAME=$(out "$DB_STACK" DbName)

# 2. Static site and Lambda package.
(cd frontend && npm ci && npm run build)
scripts/build.sh

if ! aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null; then
  if [ "$REGION" = us-east-1 ]; then
    aws s3api create-bucket --bucket "$ARTIFACTS" >/dev/null
  else
    aws s3api create-bucket --bucket "$ARTIFACTS" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "$ARTIFACTS" --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi
KEY=oci-$(sha256 build/oci.zip | cut -c1-16).zip
aws s3api head-object --bucket "$ARTIFACTS" --key "$KEY" >/dev/null 2>&1 \
  || aws s3 cp --only-show-errors build/oci.zip "s3://$ARTIFACTS/$KEY"

# Session secret: generated once, kept locally (git-ignored), never printed.
if [ ! -s infra/.secret ]; then
  (umask 077; python3 -c 'import secrets; print(secrets.token_hex(32))' > infra/.secret)
fi

# 3. App stack. v0.4 stored submissions in an S3 bucket that this template removes: empty it so CloudFormation can delete it.
OLD_STORE=$(out "$STACK" StoreBucket)
[ -n "$OLD_STORE" ] && aws s3 rm --only-show-errors --recursive "s3://$OLD_STORE"

APP_PARAMS=(CodeBucket="$ARTIFACTS" CodeKey="$KEY" SecretKey="$(cat infra/.secret)"
  DbClusterArn="$DB_CLUSTER_ARN" DbSecretArn="$DB_SECRET_ARN" DbName="$DB_NAME")
[ -n "${RESERVED_CONCURRENCY:-}" ] && APP_PARAMS+=(ReservedConcurrency="$RESERVED_CONCURRENCY")
[ -n "${MONTHLY_BUDGET_USD:-}" ] && APP_PARAMS+=(MonthlyBudgetUsd="$MONTHLY_BUDGET_USD")
aws cloudformation deploy --stack-name "$STACK" --template-file infra/template.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "${APP_PARAMS[@]}"

SITE=$(out "$STACK" SiteBucket)
DIST=$(out "$STACK" DistributionId)
DOCS=$(out "$STACK" DocsBucket)
KB=$(out "$STACK" KnowledgeBaseId)
DS=$(out "$STACK" DataSourceId)

# 3b. CloudWatch Transaction Search: X-Ray may write spans to the aws/spans log group, and traces go there.
aws logs put-resource-policy --policy-name TransactionSearchXRayAccess --policy-document "{\"Version\":\"2012-10-17\",
  \"Statement\":[{\"Sid\":\"TransactionSearchXRayAccess\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"xray.amazonaws.com\"},
  \"Action\":\"logs:PutLogEvents\",\"Resource\":[\"arn:aws:logs:$REGION:$ACCOUNT:log-group:aws/spans:*\",
  \"arn:aws:logs:$REGION:$ACCOUNT:log-group:/aws/application-signals/data:*\"],\"Condition\":{\"ArnLike\":
  {\"aws:SourceArn\":\"arn:aws:xray:$REGION:$ACCOUNT:*\"},\"StringEquals\":{\"aws:SourceAccount\":\"$ACCOUNT\"}}}]}" >/dev/null
[ "$(aws xray get-trace-segment-destination --query Destination --output text)" = CloudWatchLogs ] ||
  aws xray update-trace-segment-destination --destination CloudWatchLogs >/dev/null  # active after about 10 minutes

# 3c. Bedrock model invocation logging (text only) for CloudWatch generative AI observability. Account-wide in this Region.
aws bedrock put-model-invocation-logging-configuration --logging-config "{\"cloudWatchConfig\":
  {\"logGroupName\":\"$(out "$STACK" BedrockInvocationLogGroup)\",\"roleArn\":\"$(out "$STACK" BedrockLoggingRoleArn)\"},
  \"textDataDeliveryEnabled\":true,\"imageDataDeliveryEnabled\":false,\"embeddingDataDeliveryEnabled\":false}"

# 4. Site upload: fingerprinted assets cached for a year, HTML always revalidated, the rest for an hour.
aws s3 sync --only-show-errors frontend/dist/_astro "s3://$SITE/_astro" --cache-control 'public,max-age=31536000,immutable'
aws s3 sync --only-show-errors frontend/dist "s3://$SITE" --exclude '_astro/*' --exclude '*.html' --cache-control 'public,max-age=3600'
aws s3 sync --only-show-errors frontend/dist "s3://$SITE" --exclude '*' --include '*.html' --cache-control 'no-cache'
aws s3 sync --only-show-errors --delete frontend/dist "s3://$SITE"
# The 404 page carries its status as metadata; the template's NotFoundStatusFunction turns it into HTTP 404.
aws s3 cp --only-show-errors frontend/dist/404.html "s3://$SITE/404.html" --cache-control 'no-cache' --metadata oci-status=404
aws cloudfront create-invalidation --distribution-id "$DIST" --paths '/*' --query Invalidation.Id --output text

# 5. Database schema and seed data (idempotent; the first call may wake a paused cluster).
export OCI_DB_CLUSTER_ARN=$DB_CLUSTER_ARN OCI_DB_SECRET_ARN=$DB_SECRET_ARN OCI_DB_NAME=$DB_NAME
python3 -m db migrate
python3 -m db seed

# 6. Knowledge Base: sync the resource library and ingest.
if [ -d resources/library ]; then
  aws s3 sync --only-show-errors --delete resources/library "s3://$DOCS/library/" --exclude '*' --include '*.md'
fi
if [ -n "${EXTRA_DOCS:-}" ]; then
  aws s3 sync --only-show-errors --delete "$EXTRA_DOCS" "s3://$DOCS/extra/"
fi

JOB=$(aws bedrock-agent start-ingestion-job --knowledge-base-id "$KB" --data-source-id "$DS" --query ingestionJob.ingestionJobId --output text)
while :; do
  STATUS=$(aws bedrock-agent get-ingestion-job --knowledge-base-id "$KB" --data-source-id "$DS" --ingestion-job-id "$JOB" --query ingestionJob.status --output text)
  case $STATUS in COMPLETE|FAILED|STOPPED) break ;; esac
  sleep 10
done
aws bedrock-agent get-ingestion-job --knowledge-base-id "$KB" --data-source-id "$DS" --ingestion-job-id "$JOB" \
  --query 'ingestionJob.[status,statistics,failureReasons]' --output json
[ "$STATUS" = COMPLETE ]

echo "AppUrl: $(out "$STACK" AppUrl)"
