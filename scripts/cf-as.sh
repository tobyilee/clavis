#!/usr/bin/env bash
# Runs wrangler in apps/worker as the Cloudflare user an alias names, without a browser login.
#
#   scripts/cf-as.sh <alias> <wrangler args...>
#   scripts/cf-as.sh cfuser whoami
#   scripts/cf-as.sh cfuser deploy -c wrangler.cfuser.jsonc
#
# The API token comes from CLOUDFLARE_API_TOKEN_<ALIAS> in .agent.env (upper case, `-` → `_`).
# It is exported to this one wrangler run only: the calling shell and the login saved by
# `wrangler login` are left as they are. Paths in the wrangler args are relative to apps/worker.
set -euo pipefail

if [ $# -lt 2 ]; then
  echo "usage: scripts/cf-as.sh <alias> <wrangler args...>" >&2
  exit 2
fi
if ! [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "alias may contain only letters, digits, '-' and '_': $1" >&2
  exit 2
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
key="CLOUDFLARE_API_TOKEN_$(printf '%s' "$1" | tr 'a-z-' 'A-Z_')"
shift

# Load .agent.env in a subshell so only the one token comes back (never printed).
token="$(
  eval "$(python3 "$root/scripts/agent-env.py")"
  printenv "$key" || true
)"
if [ -z "$token" ]; then
  echo "no $key in .agent.env (see .agent.env.example)" >&2
  exit 1
fi

export CLOUDFLARE_API_TOKEN="$token"
cd "$root/apps/worker"
exec pnpm exec wrangler "$@"
