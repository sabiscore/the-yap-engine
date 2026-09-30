#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$BASH_SOURCE")/.." && pwd)"
cd "$ROOT"

if [[ -f env.local ]]; then
  set -a
  source env.local
  set +a
fi

echo "[hub] preflight"
node scripts/doctor.mjs

: "$SWARMX_VIDEO_API_TOKEN"
: "$SWARMX_DASHBOARD_ACCESS_TOKEN"

docker compose --env-file env.local -f docker-compose.yml -f docker-compose.8gb.yml config >/dev/null
docker compose --env-file env.local -f docker-compose.yml -f docker-compose.8gb.yml up -d --wait

echo "[hub] dashboard: http://127.0.0.1:3000"
echo "[hub] api health: http://127.0.0.1:3001/health"
curl -fsS http://127.0.0.1:3000 >/dev/null
echo "[hub] smoke: dashboard reachable"
