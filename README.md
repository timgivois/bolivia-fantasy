# Fantasy Fútbol Bolivia

A fantasy football (FPL-style) web app for the **Bolivian División Profesional**. Pick a squad of real players from the Bolivian top flight, earn points from their real-life performances each matchday, and compete in public and private leagues.

## Architecture

pnpm workspaces + Turborepo monorepo:

```
bolivia-fantasy/
├── apps/
│   ├── web/        Next.js 15 (App Router) + Tailwind CSS + next-intl (es) — the player-facing app
│   ├── api/        Fastify 5 API server (REST) — game logic, leagues, squads
│   └── worker/     Node worker — polls API-Football for fixtures/stats and triggers scoring
├── packages/
│   ├── db/         @bolivia-fantasy/db — Drizzle ORM schema + Postgres client
│   ├── scoring/    @bolivia-fantasy/scoring — pure scoring engine (points rules), vitest-tested
│   └── shared/     @bolivia-fantasy/shared — zod schemas + types shared across apps
└── tools/
    └── spike/      one-off verification scripts
```

```
            ┌──────────────┐         ┌──────────────┐
            │  apps/web    │  HTTP   │  apps/api    │
            │  Next.js 15  ├────────►│  Fastify 5   │
            └──────┬───────┘         └──────┬───────┘
                   │                        │
                   ▼                        ▼
            packages/shared ◄──── packages/db ────► Postgres 16
                   ▲                        ▲
                   │                        │
            ┌──────┴───────┐  API-Football  │
            │ apps/worker  ├────────────────┘
            │ ingest+score │◄── packages/scoring
            └──────────────┘
```

## Prerequisites

- Node.js >= 22
- pnpm 10 (`corepack enable`)
- Docker (for local Postgres)

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres
docker compose up -d

# 3. Configure environment
cp .env.example .env

# 4. Run everything in dev mode (web :3000, api :4000, worker)
pnpm dev
```

Other useful commands (all run through Turborepo from the repo root):

```bash
pnpm build       # build all apps and packages
pnpm lint        # ESLint across the workspace
pnpm typecheck   # tsc --noEmit across the workspace
pnpm test        # vitest suites
```

## Deployment

The app deploys to [Railway](https://railway.com) as three Docker services
(web, api, worker) plus a Postgres plugin. Each app ships its own multi-stage
Dockerfile (`apps/*/Dockerfile`, built from the repo root) and Railway
config-as-code (`apps/*/railway.json`); database migrations run automatically
as the api service's pre-deploy step.

See **[docs/DEPLOY.md](./docs/DEPLOY.md)** for the full runbook: project
setup, per-service environment variables, OAuth redirect URIs, first-deploy
steps (migrate, seed, admin promotion, initial sync) and the launch checklist.

## Environment variables

See [.env.example](./.env.example) for the full template.

| Variable               | Used by     | Description                                                        |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| `DATABASE_URL`         | api, worker | Postgres connection string (docker-compose default works locally)  |
| `API_FOOTBALL_KEY`     | worker      | API-Football key for fixtures, lineups and player stats            |
| `POLL_INTERVAL_MIN`    | worker      | Polling interval in minutes for live data (default `12`)           |
| `PORT`                 | api         | API server port (default `4000`)                                   |
| `NEXT_PUBLIC_API_URL`  | web         | Base URL the browser uses to reach the API                         |
| `AUTH_SECRET`          | web         | Auth.js session encryption secret (`openssl rand -base64 32`)      |
| `AUTH_GOOGLE_ID`       | web         | Google OAuth client ID                                             |
| `AUTH_GOOGLE_SECRET`   | web         | Google OAuth client secret                                         |
| `AUTH_FACEBOOK_ID`     | web         | Facebook OAuth app ID                                              |
| `AUTH_FACEBOOK_SECRET` | web         | Facebook OAuth app secret                                          |
