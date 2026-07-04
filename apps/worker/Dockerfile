# apps/worker — API-Football ingestion + scoring worker (pg-boss).
# Build from the REPO ROOT (the build context must include the whole workspace):
#   docker build -f apps/worker/Dockerfile -t bolivia-fantasy-worker .

########################################################################
# 1. Build
########################################################################
FROM node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Warm the pnpm store from the lockfile alone (cache-friendly layer).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

# Build the worker and its workspace dependencies (db, scoring, shared).
RUN pnpm --filter @bolivia-fantasy/worker... run build

# Self-contained production bundle (package + pruned node_modules).
RUN pnpm --filter @bolivia-fantasy/worker deploy --legacy --prod /out

########################################################################
# 2. Runtime — no ports; the worker only talks to Postgres/API-Football.
########################################################################
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out .

USER node
CMD ["node", "dist/index.js"]
