# ═══════════════════════════════════════════════════════════════════════════════
# SwarmX Dashboard — Production Dockerfile (Next.js 16 / Node 22)
#
# Build context: REPO ROOT (not apps/swarmx-dashboard)
# [DC-FIX-03] Build context must be the repo root so Docker can COPY
#             packages/swarmx-types which lives outside the dashboard directory.
#             Using apps/swarmx-dashboard as context caused Docker to reject
#             the COPY with "path outside build context" on every CI run.
#
# Usage (from repo root):
#   docker build -f apps/swarmx-dashboard/Dockerfile \
#     --build-arg NEXT_PUBLIC_SWARMX_VERSION=2026.6.0 \
#     -t swarmx-dashboard .
#
# Production hardening:
#   - Multi-stage: deps → builder → runtime (standalone output only)
#   - Next.js standalone mode eliminates the need to ship node_modules
#   - Non-root user for Kubernetes PSA compliance
#   - NEXT_TELEMETRY_DISABLED=1 — prevents Next.js from phoning home
#   - Only the .next/standalone and .next/static directories are copied
# ═══════════════════════════════════════════════════════════════════════════════

ARG NODE_VERSION=22.13.1
ARG PNPM_VERSION=12.6.0

FROM node:${NODE_VERSION}-bookworm-slim AS base

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# ── Workspace type package (required at build time) ───────────────────────────
FROM base AS deps

COPY packages/swarmx-types/package.json  ./packages/swarmx-types/package.json
COPY packages/swarmx-types/src/          ./packages/swarmx-types/src/

COPY apps/swarmx-dashboard/package.json  ./apps/swarmx-dashboard/package.json
COPY pnpm-workspace.yaml                 ./pnpm-workspace.yaml
COPY package.json                        ./package.json
COPY pnpm-lock.yaml                      ./pnpm-lock.yaml

# Install pnpm and install dependencies
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
RUN pnpm install --frozen-lockfile

# ── Next.js build ─────────────────────────────────────────────────────────────
FROM deps AS builder

ARG NEXT_PUBLIC_SWARMX_VERSION=2026.6.0
ENV NEXT_PUBLIC_SWARMX_VERSION=${NEXT_PUBLIC_SWARMX_VERSION}

COPY apps/swarmx-dashboard/ ./apps/swarmx-dashboard/

WORKDIR /app/apps/swarmx-dashboard
RUN pnpm build

# ── Minimal runtime image ──────────────────────────────────────────────────────
FROM base AS runtime

WORKDIR /app

# Copy the Next.js standalone server bundle (no node_modules needed)
COPY --from=builder /app/apps/swarmx-dashboard/.next/standalone ./
COPY --from=builder /app/apps/swarmx-dashboard/.next/static     ./.next/static
COPY --from=builder /app/apps/swarmx-dashboard/public           ./public

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=8s --start-period=30s --retries=4 \
    CMD node -e "require('http').get('http://localhost:3000',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# Run as the built-in non-root node user
USER node

CMD ["node", "server.js"]
