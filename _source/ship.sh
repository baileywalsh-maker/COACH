#!/usr/bin/env bash
# Build COACH and test it against what's live, then copy it into the repo root.
#   bash _source/ship.sh        (run from anywhere in the repo)
# Doesn't commit or push: do that after reading the result.
set -euo pipefail
S="$(cd "$(dirname "$0")" && pwd)"; R="$(dirname "$S")"
OLD="$(mktemp -d)"
for f in "$R"/*; do [ -f "$f" ] && cp "$f" "$OLD"/; done      # the live app, as --old
cd "$S" && python3 build.py
NODE_PATH="${NODE_PATH:-$(npm root -g)}" CHROME="${CHROME:-$(command -v google-chrome || true)}" \
  node tests/run.js --old "$OLD" --new "$S/dist"
cp "$S"/dist/* "$R"/
echo "Built v$(cat "$S/VERSION") into the repo root. Now commit and push."
