#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"

cp -p "$HERE/daily-view.js" "$ROOT/daily-view.js"
cp -p "$HERE/index.html" "$ROOT/index.html"
cp -p "$HERE/service-worker.js" "$ROOT/service-worker.js"

echo "✅ Restauración terminada."
