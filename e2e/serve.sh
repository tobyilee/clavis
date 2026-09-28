#!/usr/bin/env bash
# Starts the Worker (API + built SPA) for the E2E tests on :8788, on a fresh local D1/R2.
# The web app must be built first (pnpm build). DEV_ACCESS_EMAIL signs the browser in as
# a person — only honored for localhost requests (apps/worker/src/auth/access.ts).
# --local: no remote bindings, so Workers AI and Vectorize are absent (search falls back to
# full text) and no Cloudflare login is needed, as in CI.
set -euo pipefail
cd "$(dirname "$0")/../apps/worker"
STATE=../../e2e/.state
rm -rf "$STATE"
./node_modules/.bin/wrangler d1 migrations apply DB --local --persist-to "$STATE" >/dev/null
exec ./node_modules/.bin/wrangler dev --local --port 8788 --persist-to "$STATE" \
  --var DEV_ACCESS_EMAIL:e2e@gmail.com --var APP_ORIGIN:http://localhost:8788 --show-interactive-dev-session=false
