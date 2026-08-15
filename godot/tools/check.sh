#!/usr/bin/env bash
# Full static gate for the Godot port. Run from godot/.
#
#   pip install gdtoolkit==4.5.0
#   ./tools/check.sh
#
# gdparse is the OFFICIAL GDScript parser, so a pass here means the engine will
# load every script. validate.py adds project-level checks the parser cannot do
# (asset manifest drift, room coverage, autoload wiring, scene resource paths).
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
total=$(find scripts -name '*.gd' | wc -l)

echo "── gdparse (official GDScript parser) ──"
for f in $(find scripts -name '*.gd' | sort); do
  if ! out=$(gdparse "$f" 2>&1); then
    fail=$((fail + 1)); echo "PARSE ERROR  $f"; echo "$out" | head -8
  fi
done
echo "   $((total - fail))/$total files parse"

echo
echo "── gdlint ──"
gdlint scripts/ 2>&1 | tail -3

echo
echo "── wall / floor invariants ──"
python3 tools/sim_walls.py | tail -6 || fail=$((fail + 1))

echo
echo "── runtime invariants (load errors, reachability, interactions) ──"
python3 tools/sim_runtime.py | tail -8 || fail=$((fail + 1))

echo
echo "── project checks ──"
python3 tools/validate.py | tail -6

exit $fail