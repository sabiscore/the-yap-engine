# SwarmXQ API — Production Dockerfile (Fastify 5 / Node 22 / TypeScript ESM)
#
# Build context: REPO ROOT (not apps/swarmx-api)
# packages/swarmx-types lives outside the app directory and must be reachable.
#
# Usage (from repo root):
#   docker build -f apps/swarmx-api/Dockerfile -t swarmx-api .
#
# tsconfig: outDir=dist, rootDir=../.. (repo root)
# Compiled server path: apps/swarmx-api/dist/apps/swarmx-api/src/server-runtime.js

ARG NODE_VERSION=22.13.1
ARG PNPM_VERSION=12.6.0

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV NODE_ENV=production
WORKDIR /app

# ── Dependency installation ───────────────────────────────────────────────────
# Copy workspace manifests and lockfile first for layer caching.
# Changes to source do not invalidate this layer.
FROM base AS deps

COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json                               ./package.json
COPY packages/swarmx-types/package.json         ./packages/swarmx-types/package.json
COPY apps/swarmx-api/package.json               ./apps/swarmx-api/package.json

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate && \
    pnpm install --frozen-lockfile

# ── TypeScript compilation ────────────────────────────────────────────────────
FROM deps AS builder

COPY packages/swarmx-types/src/ ./packages/swarmx-types/src/
COPY apps/swarmx-api/src/        ./apps/swarmx-api/src/
COPY apps/swarmx-api/tsconfig.json ./apps/swarmx-api/tsconfig.json

# tsc rootDir=../.. + outDir=dist →
#   apps/swarmx-api/dist/apps/swarmx-api/src/server-runtime.js
RUN pnpm -F swarmx-api build

# ── Minimal production runtime ────────────────────────────────────────────────
FROM base AS runtime

# Workspace layout required for @swarmx/types workspace: link resolution
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY package.json                               ./package.json
COPY packages/swarmx-types/package.json         ./packages/swarmx-types/package.json
COPY packages/swarmx-types/src/                 ./packages/swarmx-types/src/
COPY apps/swarmx-api/package.json               ./apps/swarmx-api/package.json

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate && \
    pnpm install --frozen-lockfile --prod

# Compiled output from builder stage
COPY --from=builder /app/apps/swarmx-api/dist ./apps/swarmx-api/dist

WORKDIR /app/apps/swarmx-api

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=6 \
    CMD node -e "require('http').get('http://localhost:3001/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

USER node

CMD ["node", "dist/apps/swarmx-api/src/server-runtime.js"]
