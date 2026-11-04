#!/usr/bin/env bash
# Deploy Arize Phoenix (AI tracing, annotations, eval datasets and experiments) as its own stack, separate from the app.
# Idempotent. Expects AWS credentials in the environment. Generates secrets once into infra/.phoenix.env (git-ignored,
# mode 600), deploys infra/observability.yaml, waits for Phoenix through CloudFront, then creates the app's system API
# key and the Phoenix projects. scripts/deploy.sh picks up PHOENIX_URL and PHOENIX_API_KEY from that file.
# Optional env: OBS_STACK (default everytown-oci-obs), AWS_REGION, PHOENIX_INSTANCE_TYPE (template default t3.small),
#   PHOENIX_SNAPSHOT_ID (first deploy only: restore the data volume from an earlier stack's final snapshot).
set -euo pipefail
cd "$(dirname "$0")/.."

STACK=${OBS_STACK:-everytown-oci-obs}
export AWS_DEFAULT_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-west-2}}
ENV_FILE=infra/.phoenix.env

# Prints a stack output, or nothing when the stack or output does not exist.
out() {
  local value
  value=$(aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue" --output text 2>/dev/null) || return 0
  [ "$value" = None ] || printf '%s' "$value"
}

# 1. Secrets: generated once, never printed. Phoenix wants 32+ characters with a digit and a lowercase letter.
if [ ! -s "$ENV_FILE" ]; then
  (umask 077; python3 - > "$ENV_FILE" <<'PY'
import secrets

def token():
    while True:
        t = secrets.token_hex(32)
        if any(c.isdigit() for c in t) and any(c.isalpha() for c in t):
            return t

print(f"PHOENIX_SECRET={token()}")
print(f"PHOENIX_ADMIN_SECRET={token()}")
print("PHOENIX_ADMIN_USER=admin@localhost")
print(f"PHOENIX_ADMIN_INITIAL_PASSWORD={secrets.token_hex(12)}")
PY
  )
fi
chmod 600 "$ENV_FILE"
# shellcheck source=/dev/null
. "$ENV_FILE"

PARAMS=(PhoenixSecret="$PHOENIX_SECRET" PhoenixAdminSecret="$PHOENIX_ADMIN_SECRET"
  AdminInitialPassword="$PHOENIX_ADMIN_INITIAL_PASSWORD")
PARAMS+=(CloudFrontPrefixListId="$(aws ec2 describe-managed-prefix-lists \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' --output text)")
[ -n "${PHOENIX_INSTANCE_TYPE:-}" ] && PARAMS+=(InstanceType="$PHOENIX_INSTANCE_TYPE")

# A failed first create leaves ROLLBACK_COMPLETE, which can only be deleted (it holds no data).
STATUS=$(aws cloudformation describe-stacks --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text 2>/dev/null) || STATUS=
if [ "$STATUS" = ROLLBACK_COMPLETE ]; then
  aws cloudformation delete-stack --stack-name "$STACK"
  aws cloudformation wait stack-delete-complete --stack-name "$STACK"
  STATUS=
fi

# 2. Network and AMI: chosen on the first deploy only. Later deploys keep them, since changing either replaces the
#    instance (and the data volume cannot move between zones).
if [ -z "$STATUS" ]; then
  VPC=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)
  OFFERED=" $(aws ec2 describe-instance-type-offerings --location-type availability-zone \
    --filters Name=instance-type,Values="${PHOENIX_INSTANCE_TYPE:-t3.small}" \
    --query 'InstanceTypeOfferings[].Location' --output text | tr '\t' ' ') "
  SUBNET='' AZ=''
  while read -r subnet az; do
    case $OFFERED in *" $az "*) SUBNET=$subnet AZ=$az; break ;; esac
  done < <(aws ec2 describe-subnets --filters Name=vpc-id,Values="$VPC" Name=default-for-az,Values=true \
    --query 'sort_by(Subnets, &AvailabilityZone)[].[SubnetId, AvailabilityZone]' --output text)
  [ -n "$SUBNET" ] || { echo "No default subnet offers ${PHOENIX_INSTANCE_TYPE:-t3.small}." >&2; exit 1; }
  AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
    --query Parameter.Value --output text)
  PARAMS+=(VpcId="$VPC" SubnetId="$SUBNET" AvailabilityZone="$AZ" ImageId="$AMI"
    DataSnapshotId="${PHOENIX_SNAPSHOT_ID:-}")
fi

# 3. Stack (instance boot waits for Phoenix /healthz; CloudFront takes a few minutes).
echo "Deploying $STACK (first create takes 5 to 10 minutes)..."
aws cloudformation deploy --stack-name "$STACK" --template-file infra/observability.yaml \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset --parameter-overrides "${PARAMS[@]}"
URL=$(out "$STACK" PhoenixUrl)

# 4. Wait until Phoenix answers through CloudFront (a new distribution can take a few minutes to reach every edge).
code=
for _ in $(seq 90); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL/healthz") || code=
  [ "$code" = 200 ] && break
  sleep 10
done
[ "$code" = 200 ] || { echo "Phoenix did not become healthy at $URL/healthz (last status: ${code:-none})." >&2; exit 1; }

# 5. System API key for the app (kept while it still works) and the projects. Updates PHOENIX_URL/PHOENIX_API_KEY.
PHOENIX_URL=$URL PHOENIX_ADMIN_SECRET=$PHOENIX_ADMIN_SECRET PHOENIX_API_KEY=${PHOENIX_API_KEY:-} \
  python3 - "$ENV_FILE" <<'PY'
import json, os, sys, urllib.error, urllib.request

url, env_file = os.environ["PHOENIX_URL"], sys.argv[1]

def call(method, path, token, body=None):
    req = urllib.request.Request(url + path, method=method, data=json.dumps(body).encode() if body else None,
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)

def works(token):
    try:
        call("GET", "/v1/projects?limit=1", token)
        return True
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            return False
        raise

key = os.environ.get("PHOENIX_API_KEY", "")
if key and works(key):
    print("Phoenix API key: existing key still works.")
else:
    created = call("POST", "/v1/system/api_keys", os.environ["PHOENIX_ADMIN_SECRET"],
                   {"data": {"name": "everytown-oci-app", "description": "Lambda OTLP traces and eval runs"}})
    key = created["data"]["key"]
    print("Phoenix API key: created a new system key (everytown-oci-app).")

# Saved before anything else can fail: Phoenix shows a key only once.
lines = [l for l in open(env_file).read().splitlines() if not l.startswith(("PHOENIX_URL=", "PHOENIX_API_KEY="))]
lines += [f"PHOENIX_URL={url}", f"PHOENIX_API_KEY={key}"]
fd = os.open(env_file, os.O_WRONLY | os.O_TRUNC | os.O_CREAT, 0o600)
with os.fdopen(fd, "w") as f:
    f.write("\n".join(lines) + "\n")

existing = {p["name"] for p in call("GET", "/v1/projects?limit=100", key)["data"]}
for name, description in (("everytown-oci", "Live app traces: report pipeline, coach, staff AI, read-aloud"),
                          ("everytown-oci-evals", "Offline eval runs and experiments")):
    if name not in existing:
        call("POST", "/v1/projects", key, {"name": name, "description": description})
        print(f"Phoenix project created: {name}")
PY

echo "PhoenixUrl: $URL"
echo "Log in as $PHOENIX_ADMIN_USER with PHOENIX_ADMIN_INITIAL_PASSWORD from $ENV_FILE (never commit it); Phoenix asks"
echo "for a new password on first login. The app's API key is in the same file."
echo "Run scripts/deploy.sh to send app traces there."
