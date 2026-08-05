#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/home/runner/workspace"
BACKUP="/home/runner/workspace/_backup-collagen-30dias-20260805-121430"

cp -p "$BACKUP/index.html" "$ROOT/index.html"
cp -p "$BACKUP/progress-view.js" "$ROOT/progress-view.js"
cp -p "$BACKUP/service-worker.js" "$ROOT/service-worker.js"
cp -p "$BACKUP/server.js" "$ROOT/server.js"

if [[ -f "$BACKUP/routine-content-collagen-8-30.js" ]]; then
  cp -p "$BACKUP/routine-content-collagen-8-30.js"     "$ROOT/routine-content-collagen-8-30.js"
else
  rm -f "$ROOT/routine-content-collagen-8-30.js"
fi

echo "Restauración terminada. Reiniciá el Remix."
