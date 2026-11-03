#!/usr/bin/env bash
# Build the Lambda deployment package: build/oci.zip (python3.12, x86_64).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf build/pkg build/oci.zip
mkdir -p build/pkg
# Lambda python3.12 runs on Amazon Linux 2023 (glibc 2.34), so manylinux_2_28 wheels are fine too.
python3 -m pip install -q -r requirements.txt -t build/pkg \
  --platform manylinux2014_x86_64 --platform manylinux_2_28_x86_64 \
  --only-binary=:all: --python-version 3.12 --implementation cp
cp -r app.py pipeline.py report.py lambda_handler.py db.py schema.sql engine utils data benchmark resources build/pkg/
# report.py embeds the Atkinson Hyperlegible fonts from frontend/public/fonts.
mkdir -p build/pkg/frontend/public
cp -r frontend/public/fonts build/pkg/frontend/public/
find build/pkg -name __pycache__ -type d -prune -exec rm -rf {} +
# Fixed mtimes keep the zip (and its content-hash S3 key) stable across identical builds.
find build/pkg -exec touch -h -d @315532800 {} +
(cd build/pkg && find . -type f | LC_ALL=C sort | zip -qX -@ ../oci.zip)
echo "built build/oci.zip ($(du -h build/oci.zip | cut -f1))"
