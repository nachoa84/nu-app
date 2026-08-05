#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
cp -p "$HERE/app.js" "$ROOT/app.js"
cp -p "$HERE/index.html" "$ROOT/index.html"
cp -p "$HERE/service-worker.js" "$ROOT/service-worker.js"
echo "✅ Restauración terminada."
