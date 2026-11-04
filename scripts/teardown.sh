#!/usr/bin/env bash
# Remove the Everytown OCI deployment: empties the app's buckets, deletes the app stack, then the database stack
# (Aurora keeps a final snapshot), then the Phoenix observability stack (its data volume keeps a final snapshot),
# then the artifact bucket. Safe to re-run.
# Usage: scripts/teardown.sh [--yes]   Optional env: STACK, DB_STACK, OBS_STACK, AWS_REGION (same defaults as the
#   deploy scripts).
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${STACK:-everytown-oci}
DB_STACK=${DB_STACK:-everytown-oci-db}
OBS_STACK=${OBS_STACK:-everytown-oci-obs}
export AWS_DEFAULT_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
REGION=$AWS_DEFAULT_REGION
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
ARTIFACTS=oci-artifacts-$ACCOUNT-$REGION

if [ "${1:-}" != --yes ]; then
  if [ ! -t 0 ]; then
    echo "Refusing to run non-interactively without --yes." >&2
    exit 1
  fi
  read -r -p "Delete stacks $STACK, $DB_STACK and $OBS_STACK (all assessments and AI traces; final DB and Phoenix volume snapshots are kept) and bucket $ARTIFACTS in $REGION ($ACCOUNT)? Type 'delete': " answer
  [ "$answer" = delete ] || { echo "Aborted."; exit 1; }
fi

stack_exists() { aws cloudformation describe-stacks --stack-name "$1" >/dev/null 2>&1; }

# Prints a stack output, or nothing when the stack or output does not exist.
out() {
  local value
  value=$(aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text 2>/dev/null) || return 0
  [ "$value" = None ] || printf '%s' "$value"
}

# Deletes every object, and every version and delete marker if the bucket was ever versioned.
empty_bucket() {
  local bucket=$1 kind batch
  aws s3api head-bucket --bucket "$bucket" 2>/dev/null || return 0
  echo "Emptying s3://$bucket"
  aws s3 rm --only-show-errors --recursive "s3://$bucket"
  [ "$(aws s3api get-bucket-versioning --bucket "$bucket" --query Status --output text)" = None ] && return 0
  for kind in Versions DeleteMarkers; do
    while :; do
      batch=$(aws s3api list-object-versions --bucket "$bucket" --max-keys 1000 --no-paginate --output json \
        --query "{Objects: ${kind}[].{Key: Key, VersionId: VersionId}, Quiet: \`true\`}")
      case $batch in *'"Objects": null'*|*'"Objects": []'*) break ;; esac
      aws s3api delete-objects --bucket "$bucket" --delete "$batch" >/dev/null
    done
  done
}

delete_stack() {
  stack_exists "$1" || { echo "Stack $1 not found, skipping."; return 0; }
  echo "Deleting stack $1 (CloudFront and Aurora can take 10+ minutes)..."
  aws cloudformation delete-stack --stack-name "$1"
  aws cloudformation wait stack-delete-complete --stack-name "$1"
}

# 1. App stack. StoreBucket only exists on stacks deployed before v0.5.
for key in SiteBucket DocsBucket StoreBucket; do
  bucket=$(out "$STACK" "$key")
  [ -z "$bucket" ] || empty_bucket "$bucket"
done
delete_stack "$STACK"

# 2. Database stack (DeletionPolicy Snapshot keeps a final cluster snapshot).
CLUSTER_ID=$(out "$DB_STACK" DbClusterArn)
CLUSTER_ID=${CLUSTER_ID##*:}
delete_stack "$DB_STACK"

# 2b. Phoenix observability stack (DeletionPolicy Snapshot keeps a final snapshot of the data volume).
OBS_VOLUME=$(out "$OBS_STACK" DataVolumeId)
delete_stack "$OBS_STACK"

# 3. Lambda artifacts (created by deploy.sh, outside CloudFormation).
if aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null; then
  empty_bucket "$ARTIFACTS"
  aws s3api delete-bucket --bucket "$ARTIFACTS"
  echo "Deleted bucket $ARTIFACTS"
fi

echo
echo "Remaining:"
for s in "$STACK" "$DB_STACK" "$OBS_STACK"; do
  stack_exists "$s" && echo "  stack $s: $(aws cloudformation describe-stacks --stack-name "$s" --query 'Stacks[0].StackStatus' --output text)"
done
aws s3api head-bucket --bucket "$ARTIFACTS" 2>/dev/null && echo "  bucket $ARTIFACTS"
if [ -n "$CLUSTER_ID" ]; then
  snapshots=$(aws rds describe-db-cluster-snapshots --db-cluster-identifier "$CLUSTER_ID" --snapshot-type manual \
    --query 'DBClusterSnapshots[].[DBClusterSnapshotIdentifier,SnapshotCreateTime]' --output text 2>/dev/null) || snapshots=
  while read -r snapshot created; do
    [ -n "$snapshot" ] && echo "  final DB snapshot $snapshot ($created); delete with: aws rds delete-db-cluster-snapshot --db-cluster-snapshot-identifier $snapshot"
  done <<< "$snapshots"
else
  echo "  (database stack was already gone; list old snapshots with: aws rds describe-db-cluster-snapshots --snapshot-type manual)"
fi
if [ -n "$OBS_VOLUME" ]; then
  snapshots=$(aws ec2 describe-snapshots --owner-ids self --filters Name=volume-id,Values="$OBS_VOLUME" \
    --query 'Snapshots[].[SnapshotId,StartTime]' --output text 2>/dev/null) || snapshots=
  while read -r snapshot created; do
    [ -n "$snapshot" ] && echo "  final Phoenix volume snapshot $snapshot ($created); delete with: aws ec2 delete-snapshot --snapshot-id $snapshot"
  done <<< "$snapshots"
fi
echo "Done."
