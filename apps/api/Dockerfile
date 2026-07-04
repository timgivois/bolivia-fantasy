# apps/api — Fastify API server.
# Build from the REPO ROOT (the build context must include the whole workspace):
#   docker build -f apps/api/Dockerfile -t bolivia-fantasy-api .

########################################################################
# 1. Build: install the full workspace, compile api + its workspace
#    deps, then prune with `pnpm deploy` so the runtime image only
#    contains the API and its production dependencies.
########################################################################
FROM node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Warm the pnpm store from the lockfile alone — this layer is only
# invalidated when dependencies change, not on every source edit.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

# Build the api and its workspace dependencies (db, scoring, shared)
# in topological order.
RUN pnpm --filter @bolivia-fantasy/api... run build

# Self-contained production bundle (package + pruned node_modules).
# Workspace deps are packed via their package.json "files" — for
# @bolivia-fantasy/db that includes dist/ AND migrations/, so the
# migration runner works from this image (Railway pre-deploy step).
RUN pnpm --filter @bolivia-fantasy/api deploy --legacy --prod /out

########################################################################
# 2. Runtime
########################################################################
FROM node:22-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out .

USER node
# Fastify reads PORT (Railway injects it); 4000 is the local default.
EXPOSE 4000
CMD ["node", "dist/index.js"]
