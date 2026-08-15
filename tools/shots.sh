#!/bin/bash
# Capture + render a set of scenes for visual QA.
set -e
cd "$(dirname "$0")/.."
node tools/capture-build.mjs > /dev/null
mkdir -p /tmp/cap /tmp/shots
for s in "$@"; do
  node tools/capture.mjs "$s" "/tmp/cap/$s.glb" 2>&1 | grep -E "stats|wrote" | sed "s/^/[$s] /"
  python3 tools/glbview.py "/tmp/cap/$s.glb" "/tmp/shots/$s.png" \
    --size 560 --width 900 --cam "/tmp/cap/$s.cam.json" --no-grid > /dev/null
done
echo "done: $*"
