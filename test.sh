#!/usr/bin/env bash
# The whole gate in one command. Everything here is deterministic except the last
# step, which drives the built file in a real browser.
set -euo pipefail
cd "$(dirname "$0")"

echo "== rules =="
node --test test/sim.test.mjs
node --test test/balance.test.mjs

echo "== build =="
./build.sh

echo "== browser: the built file, desktop and mobile =="
node test/render.mjs

echo
echo "all checks passed"
