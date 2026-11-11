#!/bin/sh
# Spike S2: run the whole proof. Usage (from anywhere):  sh spikes/s2-editors/run-e2e.sh
# 1. dev server + Playwright (StrictMode double-mount active)   2. vite build   3. vite preview + Playwright
# Playwright's webServer starts/stops Vite on port 5182 itself (no orphaned processes).
set -e
cd "$(dirname "$0")"
rm -rf results test-results
echo "== MODE=dev"
MODE=dev bunx playwright test
echo "== vite build"
node ../../node_modules/vite/bin/vite.js build --config vite.config.ts 2>&1 | tee results/build.log
echo "== MODE=preview"
MODE=preview bunx playwright test
