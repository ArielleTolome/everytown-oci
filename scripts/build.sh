#!/usr/bin/env bash
# Build the Lambda deployment package: build/oci.zip (python3.12, x86_64).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf build/pkg build/oci.zip build/wheels
mkdir -p build/pkg build/wheels
# Lambda python3.12 runs on Amazon Linux 2023 (glibc 2.34), so manylinux_2_28 wheels are fine too.
# Download, then unzip every wheel into build/pkg: `pip install --target` skips a top-level folder that already
# exists, which silently dropped protobuf when googleapis-common-protos also installed into the shared google/ folder.
python3 -m pip download -q -r requirements.txt -d build/wheels \
  --platform manylinux2014_x86_64 --platform manylinux_2_28_x86_64 \
  --only-binary=:all: --python-version 3.12 --implementation cp
for w in build/wheels/*.whl; do unzip -qo "$w" -d build/pkg; done
cp -r app.py pipeline.py report.py lambda_handler.py db.py observability.py schema.sql features engine utils data benchmark resources build/pkg/
# Online eval checks (pure code) run after each traced report; the offline datasets and runner stay out of the zip.
mkdir -p build/pkg/evals && cp evals/__init__.py evals/checks.py build/pkg/evals/
# report.py embeds the Atkinson Hyperlegible fonts from frontend/public/fonts.
mkdir -p build/pkg/frontend/public
cp -r frontend/public/fonts build/pkg/frontend/public/
find build/pkg -name __pycache__ -type d -prune -exec rm -rf {} +
# Fixed mtimes keep the zip (and its content-hash S3 key) stable across identical builds.
find build/pkg -exec touch -h -d @315532800 {} +
(cd build/pkg && find . -type f | LC_ALL=C sort | zip -qX -@ ../oci.zip)
echo "built build/oci.zip ($(du -h build/oci.zip | cut -f1))"
