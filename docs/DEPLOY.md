# Deploying to Railway

This runbook takes the monorepo from GitHub to a production deployment on
[Railway](https://railway.com): one Postgres database plus three services
(`web`, `api`, `worker`), each built from its own Dockerfile.

```
Railway project "bolivia-fantasy"
├── Postgres            (Railway plugin, v16+)
├── api      apps/api/Dockerfile     — Fastify, public domain, /health
├── web      apps/web/Dockerfile     — Next.js standalone, public domain
└── worker   apps/worker/Dockerfile  — pg-boss ingestion, no public domain
```

All three Dockerfiles expect the **repo root as the build context** (they copy
the whole pnpm workspace), so every service keeps its **root directory at `/`**
and instead points at a per-app config file (`apps/<app>/railway.json`) that
selects the right Dockerfile, healthcheck and restart policy.

---

## 1. Create the project and the database

1. Railway dashboard → **New Project** → **Deploy PostgreSQL**. Name the
   project (e.g. `bolivia-fantasy`). The plugin exposes `DATABASE_URL` (private
   network) and `DATABASE_PUBLIC_URL` (TCP proxy, for one-off commands from
   your machine).
2. Rename the database service to `Postgres` if it isn't already — the
   variable references below (`${{Postgres.DATABASE_URL}}`) use that name.

## 2. Create the three services from the GitHub repo

For each of `api`, `worker`, `web` (create `api` first — `web` references its
domain):

1. **New** → **GitHub Repo** → select this repository → pick the deploy branch.
2. Rename the service (`api`, `worker`, `web`). The names matter: they are used
   in `${{service.VAR}}` cross-references below.
3. Service → **Settings**:
   - **Root Directory**: leave as `/` (repo root — required, the Docker build
     context must contain the whole workspace).
   - **Config-as-code file path** (Settings → Config-as-code): set to
     `apps/api/railway.json` / `apps/worker/railway.json` /
     `apps/web/railway.json` respectively. This is the one thing that cannot
     live in the repo itself — with three services sharing one repo root, each
     service must be told which config file is its own.
   - Everything else (Dockerfile path, start command, healthcheck, pre-deploy
     migration command, restart policy) comes from the `railway.json` files.
4. `api` and `web` need public URLs: Settings → **Networking** → **Generate
   Domain** (or attach a custom domain, see §6). `worker` needs **no** domain.

> The first build you trigger before variables are set will fail (web needs
> `NEXT_PUBLIC_API_URL` at build time; api's pre-deploy migration needs
> `DATABASE_URL`). Set the variables (§3) first, then deploy.

## 3. Environment variables

Set these per service (Service → **Variables**). Values in
`${{...}}` syntax are [Railway references](https://docs.railway.com/guides/variables)
and resolve automatically, including on the private network.

### api

| Variable      | Value                                        | Notes                                                        |
| ------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`| `${{Postgres.DATABASE_URL}}`                 | Private-network Postgres URL                                  |
| `AUTH_SECRET` | `<openssl rand -base64 32>`                  | **Must be byte-identical to the web service's** — the API decodes the Auth.js session JWTs |
| `WEB_ORIGIN`  | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}`     | CORS allow-origin; use the custom domain once attached        |
| `PORT`        | *(leave unset)*                              | Railway injects it; Fastify reads it (falls back to 4000)     |

### worker

| Variable            | Value                          | Notes                                                     |
| ------------------- | ------------------------------ | --------------------------------------------------------- |
| `DATABASE_URL`      | `${{Postgres.DATABASE_URL}}`   | Same database — pg-boss lives in the `pgboss` schema       |
| `API_FOOTBALL_KEY`  | `<your API-Football key>`      | See §7. The worker starts without it but every job fails   |
| `POLL_INTERVAL_MIN` | `12`                           | Live-poll cadence in minutes (1–59; default 12)            |

### web

| Variable               | Value                                                       | Notes                                                       |
| ---------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`  | `https://${{api.RAILWAY_PUBLIC_DOMAIN}}`                    | **Build-time**: inlined into the client bundle. Changing it requires a redeploy (rebuild), not just a restart |
| `API_URL`              | `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}`      | Optional but recommended: server-side fetches use Railway's private network instead of the public internet. Requires `PORT` to be set explicitly on the api service (e.g. `4000`) so the reference resolves |
| `AUTH_SECRET`          | *(same value as api's `AUTH_SECRET`)*                       | Session JWT encryption key                                   |
| `AUTH_URL`             | `https://<your-web-domain>`                                 | Canonical app URL for Auth.js (OAuth callbacks). See §6      |
| `AUTH_TRUST_HOST`      | *(not needed)*                                              | `apps/web/auth.ts` already sets `trustHost: true` for Railway's proxy; setting `AUTH_TRUST_HOST=true` is a harmless belt-and-braces |
| `AUTH_GOOGLE_ID`       | `<Google OAuth client ID>`                                  | §5                                                           |
| `AUTH_GOOGLE_SECRET`   | `<Google OAuth client secret>`                              | §5                                                           |
| `AUTH_FACEBOOK_ID`     | `<Facebook app ID>`                                         | §5                                                           |
| `AUTH_FACEBOOK_SECRET` | `<Facebook app secret>`                                     | §5                                                           |
| `PORT`                 | *(leave unset)*                                             | Railway injects it; the standalone server reads it           |

Notes:

- Railway passes service variables to Dockerfile builds automatically for any
  `ARG` the Dockerfile declares — `apps/web/Dockerfile` declares
  `ARG NEXT_PUBLIC_API_URL`, so the web variable above reaches `next build`.
- Generate `AUTH_SECRET` once (`openssl rand -base64 32`) and paste the same
  value into **both** `web` and `api`. If they differ, every API call returns
  401. (Tip: use a [shared variable](https://docs.railway.com/guides/variables#shared-variables)
  on the environment and reference it as `${{shared.AUTH_SECRET}}`.)

## 4. Database migrations and first deploy

Migrations run **automatically**: `apps/api/railway.json` sets

```json
"preDeployCommand": "node node_modules/@bolivia-fantasy/db/dist/migrate.js"
```

which Railway executes in the freshly built api image (with the service's
variables, so `DATABASE_URL` is set) before swapping in each new deployment.
The runner applies everything in `packages/db/migrations/` idempotently
(Drizzle keeps a `__drizzle_migrations` journal), so re-running is safe.

First-deploy sequence:

1. Set all variables (§3), then **Deploy** `api`. Watch the pre-deploy logs —
   you should see `Migrations applied successfully.` and then the healthcheck
   pass on `/health`.
2. **Seed the 16 clubs** (idempotent upsert). Two options:

   ```bash
   # Option A — inside the running api container (seed.js ships in the image):
   railway ssh --service api -- node node_modules/@bolivia-fantasy/db/dist/seed.js

   # Option B — from your machine, against the database's public TCP proxy:
   DATABASE_URL="$(railway variables get DATABASE_PUBLIC_URL --service Postgres)" \
     pnpm --filter @bolivia-fantasy/db db:seed
   ```

3. Deploy `worker` and `web`.
4. **Promote your admin user.** Sign in to the web app once with the Google or
   Facebook account that should be admin (this creates your `users` row —
   users are provisioned on first authenticated API call, keyed by email),
   then:

   ```bash
   railway connect Postgres   # opens psql
   ```

   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
   ```

5. **Trigger the initial daily-sync** (don't wait for the 06:00 La Paz cron).
   It backfills clubs' API-Football ids, players, rounds and fixtures:

   ```bash
   railway ssh --service worker -- node -e "import('pg-boss').then(async ({PgBoss}) => { const b = new PgBoss({connectionString: process.env.DATABASE_URL}); await b.start(); await b.send('daily-sync', {}); await b.stop({graceful: false}); console.log('daily-sync enqueued'); })"
   ```

   The worker logs should show `[daily-sync] starting` followed by the
   remaining API budget. (The worker must have booted at least once so the
   pg-boss queues exist.)

## 5. OAuth providers (Google + Facebook)

Auth.js mounts its handlers under `/api/auth/*` on the **web** domain. With
your production domain (say `https://fantasy.example.bo`):

**Google** — [console.cloud.google.com](https://console.cloud.google.com) →
APIs & Services → Credentials → OAuth client ID (Web application):

- Authorized JavaScript origin: `https://fantasy.example.bo`
- Authorized redirect URI: `https://fantasy.example.bo/api/auth/callback/google`
- Copy client ID/secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

**Facebook** — [developers.facebook.com](https://developers.facebook.com) →
your app → Facebook Login → Settings:

- Valid OAuth Redirect URI: `https://fantasy.example.bo/api/auth/callback/facebook`
- App Domains: `fantasy.example.bo`; switch the app to **Live** mode.
- Copy app ID/secret into `AUTH_FACEBOOK_ID` / `AUTH_FACEBOOK_SECRET`.

If you start on the generated `*.up.railway.app` domain, register those
callback URLs first and swap them when the custom domain lands (Google allows
multiple redirect URIs — keep both during the transition).

## 6. Custom domain & Auth.js behind Railway's proxy

1. web service → Settings → Networking → **Custom Domain** → add
   `fantasy.example.bo` and create the CNAME Railway shows you. Optionally give
   the api a custom domain too (e.g. `api.fantasy.example.bo`).
2. Railway terminates TLS at its edge proxy and forwards plain HTTP with
   `X-Forwarded-*` headers. Auth.js therefore needs to trust the forwarded
   host: `apps/web/auth.ts` sets `trustHost: true`, so no extra flag is
   required (`AUTH_TRUST_HOST=true` is equivalent if you ever remove it).
3. Set `AUTH_URL=https://fantasy.example.bo` on web so OAuth callback URLs are
   generated against the canonical domain (important once more than one domain
   points at the service).
4. Update the cross-service values that embed the domain:
   - web `NEXT_PUBLIC_API_URL` → the api's public domain (**redeploy web** —
     build-time value),
   - api `WEB_ORIGIN` → `https://fantasy.example.bo` (restart api), otherwise
     browsers hit CORS errors,
   - the OAuth redirect URIs in §5.

Session cookies: on HTTPS Auth.js issues `__Secure-authjs.session-token`; both
the web server code and the API accept that name — nothing to configure.

## 7. API-Football key

The worker pulls fixtures/lineups/stats from
[API-Football](https://www.api-football.com/) (Bolivian Primera División =
league `344`):

1. Create an account → subscribe to a plan → copy the key from the dashboard.
   The free tier's 100 req/day works: the worker hard-caps itself at **95
   requests/day** (`RequestBudget`) and throttles to 10 req/min.
2. Set it as `API_FOOTBALL_KEY` on the **worker** service only.
3. Watch the worker logs after §4 step 5: each job logs
   `API budget remaining today: N`. A missing key logs a warning at boot and
   fails jobs until set.

## 8. Launch checklist

- [ ] Postgres plugin running; api pre-deploy logged `Migrations applied successfully.`
- [ ] `GET https://<api-domain>/health` → `{"status":"ok"}`
- [ ] Clubs seeded (16 rows: `railway connect Postgres` → `SELECT count(*) FROM clubs;`)
- [ ] `AUTH_SECRET` identical on web and api (log in, then open a page that
      calls the API — a 401 means they differ)
- [ ] Google **and** Facebook login complete round-trip on the production domain
- [ ] Admin user promoted (`role = 'admin'`) and `/admin` reachable in the web app
- [ ] Worker booted: logs show `pg-boss started` and `worker started`
- [ ] Initial `daily-sync` ran; clubs have `api_football_id` backfilled, players
      and fixtures present
- [ ] web `NEXT_PUBLIC_API_URL` points at the api **public** domain (check a
      browser network tab — client-side requests must not hit localhost)
- [ ] api `WEB_ORIGIN` matches the web domain exactly (scheme included, no
      trailing slash) — otherwise CORS failures
- [ ] `AUTH_URL` set to the canonical web domain; OAuth redirect URIs updated
- [ ] Restart policies active (kill the api once from the dashboard, confirm it
      comes back and passes `/health`)

## Appendix: what must be configured in the dashboard (not in the repo)

| Setting | Where | Why it can't be in `railway.json` |
| ------- | ----- | --------------------------------- |
| Config-as-code file path (`apps/<app>/railway.json`) per service | Service → Settings → Config-as-code | Railway reads `railway.json` from the service root directory by default; three services share the `/` root, so each must be pointed at its own file |
| Root directory `/` | Service → Settings → Source | Service-source setting, not config-as-code |
| Public domains / custom domains | Service → Settings → Networking | Account/DNS-level state |
| All variables in §3 | Service → Variables | Secrets — never commit them |
| Postgres plugin | Project canvas | Infrastructure, not service config |
