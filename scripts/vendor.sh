#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/vendor"

cp "$ROOT/node_modules/marked/lib/marked.umd.js" "$ROOT/vendor/marked.umd.js"
cp "$ROOT/node_modules/dompurify/dist/purify.min.js" "$ROOT/vendor/purify.min.js"
cp "$ROOT/node_modules/@highlightjs/cdn-assets/highlight.min.js" "$ROOT/vendor/highlight.min.js"

echo "vendored:"
ls -lh "$ROOT/vendor"