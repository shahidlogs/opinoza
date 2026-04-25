#!/usr/bin/env bash
# Test the off-site Google Drive backup upload for Opinoza.
#
# Usage: bash scripts/test-drive-upload.sh
#
# This script runs a fresh backup then immediately uploads it to Google Drive
# using the same compiled module the API server uses at runtime.
# Credentials are never logged or echoed.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="${REPO_ROOT}/artifacts/api-server/dist/test-drive-upload.mjs"

if [ ! -f "$DIST" ]; then
  echo "[test-drive] Building API server first..."
  cd "${REPO_ROOT}/artifacts/api-server"
  node build.mjs
  cd "$REPO_ROOT"
fi

echo "[test-drive] Running backup + Google Drive upload test..."
node --enable-source-maps "$DIST"
