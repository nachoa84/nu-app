#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$(cd "$(dirname "$0")" && pwd)"
for FILE in app.js ui-core.js daily-view.js daily.css favorites.js favorites.css media-preview.js index.html service-worker.js; do
  cp -p "$HERE/$FILE" "$ROOT/$FILE"
done
echo "✅ Restauración terminada."
