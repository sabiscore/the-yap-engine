#!/usr/bin/env bash
# ==============================================================================
# CREATIVE HUB V3 - AUTHORITATIVE EVIDENCE COLLECTION SCRIPT
# TARGET SHA: 55b60112d4270fbe43ead4c92ef3a5afab87ba63
# ==============================================================================

set -uo pipefail

TARGET_SHA="55b60112d4270fbe43ead4c92ef3a5afab87ba63"
TARGET_BRANCH="feat/creative-hub-v3"
UTC_TS=$(TZ=UTC date +"%Y%m%dT%H%M%SZ")
WAT_TS=$(TZ=Africa/Lagos date +"%Y%m%dT%H%M%S%z")

echo "==========================================================="
echo "🚨 INITIATING EVIDENCE COLLECTION RUN"
echo "UTC Time: $UTC_TS"
echo "WAT Time: $WAT_TS"
echo "Target SHA: $TARGET_SHA"
echo "==========================================================="

# Create Evidence Directory Structure
mkdir -p evidence/{A1,A2,A3,A4,A5,A6,A7,A8,A9,A10,A11,A12,A13,A14,A15,A16,A17,A18,A19,A20}

# ---------------------------------------------------------
# A1 - Repository Integrity
# ---------------------------------------------------------
echo "[A1] Validating Repository Integrity..."
{
  echo "UTC: $UTC_TS | WAT: $WAT_TS"
  git fetch origin
  git checkout $TARGET_BRANCH
  CURRENT_SHA=$(git rev-parse HEAD)
  echo "HEAD = $CURRENT_SHA"
  if [[ "$CURRENT_SHA" != "$TARGET_SHA" ]]; then
    echo "FATAL: SHA MISMATCH. Expected $TARGET_SHA, got $CURRENT_SHA"
    exit 1
  fi
  git status --short
  git diff origin/main...HEAD --check
} 2>&1 | tee "evidence/A1/${UTC_TS}-repository-integrity.txt"

# ---------------------------------------------------------
# A2 - Dependency Lock Integrity
# ---------------------------------------------------------
echo "[A2] Verifying Dependency Lock Integrity..."
pnpm install --frozen-lockfile 2>&1 | tee "evidence/A2/${UTC_TS}-pnpm-install.txt"

# ---------------------------------------------------------
# A3 - Type Safety
# ---------------------------------------------------------
echo "[A3] Running Typecheck..."
pnpm run typecheck 2>&1 | tee "evidence/A3/${UTC_TS}-typecheck.txt"

# ---------------------------------------------------------
# A4 - Lint
# ---------------------------------------------------------
echo "[A4] Running Lint Suite..."
pnpm run lint 2>&1 | tee "evidence/A4/${UTC_TS}-lint.txt"

# ---------------------------------------------------------
# A5 - Unit / Component Tests
# ---------------------------------------------------------
echo "[A5] Running Test Suite..."
pnpm run test 2>&1 | tee "evidence/A5/${UTC_TS}-tests.txt"

# ---------------------------------------------------------
# A6 - Build
# ---------------------------------------------------------
echo "[A6] Running Production Build..."
pnpm run build 2>&1 | tee "evidence/A6/${UTC_TS}-build.txt"

# ---------------------------------------------------------
# A7 & A8 - Security & Bundle Boundaries
# ---------------------------------------------------------
echo "[A7/A8] Verifying Security and Bundle Boundaries..."
{
  echo "Checking for committed secrets..."
  git grep -i "SWARMX_VIDEO_API_TOKEN" || echo "No SWARMX_VIDEO_API_TOKEN found in text."
  echo "Checking Vercel Gateway bundle imports for worker dependencies..."
  grep -rE "(BullMQ|Redis|Ollama|FFmpeg|node-pty)" apps/swarmx-api/src/server.ts || echo "Bundle clean."
} 2>&1 | tee "evidence/A7/${UTC_TS}-security-boundary.txt" "evidence/A8/${UTC_TS}-bundle-boundary.txt"

# ---------------------------------------------------------
# A10 - Database / Persistence Regression
# ---------------------------------------------------------
echo "[A10] Validating Database Migration State..."
# Replace with your canonical DB check command, e.g., prisma migrate status or drizzle-kit check
pnpm run db:status 2>&1 | tee "evidence/A10/${UTC_TS}-persistence.txt"

# ---------------------------------------------------------
# A11 - Worker Integration Contract
# ---------------------------------------------------------
echo "[A11] Validating Worker Integration Contract..."
node scripts/assert-render-worker-artifact.mjs 2>&1 | tee "evidence/A11/${UTC_TS}-worker-contract.txt"

# ---------------------------------------------------------
# A18 - WSL2 Physical Profiling (Run on target WSL2/Linux box)
# ---------------------------------------------------------
echo "[A18] Capturing Hardware/WSL2 State..."
free -h > "evidence/A18/${UTC_TS}-free.txt"
if command -v ollama &> /dev/null; then
    ollama ps > "evidence/A18/${UTC_TS}-ollama.txt"
fi
dmesg | tail -n 50 > "evidence/A18/${UTC_TS}-dmesg.txt"

# ---------------------------------------------------------
# A19 - Exact-Head CI (Requires GitHub CLI installed)
# ---------------------------------------------------------
echo "[A19] Fetching GitHub Actions State..."
if command -v gh &> /dev/null; then
    gh run list --commit "$TARGET_SHA" --json status,conclusion,name > "evidence/A19/${UTC_TS}-github-actions.json"
else
    echo "GitHub CLI (gh) not installed. Perform A19 manually."
fi

echo "==========================================================="
echo "✅ AUTOMATED EVIDENCE COLLECTION COMPLETE."
echo "Results stored in ./evidence/"
echo "==========================================================="