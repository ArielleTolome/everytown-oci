#!/usr/bin/env bash
# Build, deploy the CloudFormation stack, sync the resource library to the KB docs bucket and ingest it.
# Expects AWS credentials in the environment. Optional: STACK, AWS_REGION, EXTRA_DOCS (dir of extra .md/.pdf docs).
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${STACK:-everytown-oci}
export AWS_DEFAULT_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
REGION=$AWS_DEFAULT_REGION
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS=oci-artifacts-$ACCOUNT-$REGION

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
KEY=oci-$(sha256sum build/oci.zip | cut -c1-16).zip
aws s3api head-object --bucket "$ARTIFACTS" --key "$KEY" >/dev/null 2>&1 \
  || aws s3 cp --only-show-errors build/oci.zip "s3://$ARTIFACTS/$KEY"

# Session secret: generated once, kept locally (git-ignored), never printed.
if [ ! -s infra/.secret ]; then
  (umask 077; python3 -c 'import secrets; print(secrets.token_hex(32))' > infra/.secret)
fi

aws cloudformation deploy --stack-name "$STACK" --template-file infra/template.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --no-fail-on-empty-changeset \
  --parameter-overrides CodeBucket="$ARTIFACTS" CodeKey="$KEY" SecretKey="$(cat infra/.secret)"

out() { aws cloudformation describe-stacks --stack-name "$STACK" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text; }
DOCS=$(out DocsBucket); KB=$(out KnowledgeBaseId); DS=$(out DataSourceId)

[ -d resources/library ] && aws s3 sync --only-show-errors --delete resources/library "s3://$DOCS/library/" --exclude '*' --include '*.md'
[ -n "${EXTRA_DOCS:-}" ] && aws s3 sync --only-show-errors --delete "$EXTRA_DOCS" "s3://$DOCS/extra/"

JOB=$(aws bedrock-agent start-ingestion-job --knowledge-base-id "$KB" --data-source-id "$DS" --query ingestionJob.ingestionJobId --output text)
while :; do
  STATUS=$(aws bedrock-agent get-ingestion-job --knowledge-base-id "$KB" --data-source-id "$DS" --ingestion-job-id "$JOB" --query ingestionJob.status --output text)
  case $STATUS in COMPLETE|FAILED|STOPPED) break ;; esac
  sleep 10
done
aws bedrock-agent get-ingestion-job --knowledge-base-id "$KB" --data-source-id "$DS" --ingestion-job-id "$JOB" \
  --query 'ingestionJob.[status,statistics,failureReasons]' --output json
[ "$STATUS" = COMPLETE ]

echo "AppUrl: $(out AppUrl)"
