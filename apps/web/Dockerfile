# apps/web — Next.js 15 app (standalone output).
# Build from the REPO ROOT (the build context must include the whole workspace):
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t bolivia-fantasy-web .
#
# NEXT_PUBLIC_* variables are inlined into the client bundle at BUILD time —
# they must be passed as build args (Railway forwards service variables to
# declared ARGs automatically), not just set at runtime.

########################################################################
# 1. Build
########################################################################
FROM node:22-alpine AS build

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo

# Warm the pnpm store from the lockfile alone (cache-friendly layer).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY . .
RUN pnpm install --frozen-lockfile --offline

# Baked into the client bundle — REQUIRED at build time.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# `next build` evaluates the Auth.js config, which insists on a secret.
# Only the build stage sees this placeholder; the real AUTH_SECRET is a
# runtime environment variable and never ends up in the image.
ARG AUTH_SECRET=build-time-placeholder-not-a-secret
ENV AUTH_SECRET=$AUTH_SECRET

# Build web and its workspace dependencies (scoring, shared).
RUN pnpm --filter @bolivia-fantasy/web... run build

########################################################################
# 2. Runtime — Next standalone output: a minimal server.js plus only the
#    node_modules the server actually traces. No pnpm needed here.
########################################################################
FROM node:22-alpine AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
WORKDIR /app

# The standalone folder mirrors the monorepo layout (apps/web/...).
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
# Static assets are not part of standalone output and must be copied in.
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

USER node
# Next reads PORT (Railway injects it); 3000 is the local default.
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
