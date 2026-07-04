# @bolivia-fantasy/worker

Data-ingestion worker for API-Football (Bolivia Primera División, league id
344). Runs as a single long-lived Node process; jobs are queued and scheduled
with [pg-boss](https://github.com/timgit/pg-boss) directly on the app's
Postgres — no Redis required.

## Jobs

| Job | Schedule | API cost | What it does |
| --- | --- | --- | --- |
| `daily-sync` | 06:00 America/La_Paz | ~4+ req | Backfills `clubs.apiFootballId` (fuzzy name match vs `/teams`), upserts players (position-mapped, priced by position default), rounds (parsed from `/fixtures/rounds`, `lockAt` = earliest kickoff) and fixtures |
| `match-window-poller` | every `POLL_INTERVAL_MIN` min (default 12) | 0 when idle | Polls only fixtures with kickoff in `[now-3h, now+15min]`. For in-play fixtures: pulls `/fixtures/events`, writes provisional stats, `NOTIFY live_scores` (consumed by the API's SSE endpoint). Queues `post-match` the moment a fixture hits FT |
| `post-match` | queued per finished fixture | 2 req | Pulls `/fixtures/players` + `/fixtures/events`, upserts authoritative stat lines; when the whole round is finished, finalizes it: scores every squad with `@bolivia-fantasy/scoring`, writes `round_scores`, updates `fantasy_squads.totalPoints` |

## Request budget

Every API call is charged to a persistent daily counter (`api_request_log`,
one row per day, atomic guarded upsert) **before** the HTTP request is made.
Hard stop at 95/day (5 held back for manual debugging on the 100/day free
tier), plus a 10 req/min sliding-window throttle in the client. Upgrading to
a paid API plan only requires lowering `POLL_INTERVAL_MIN` — no code changes.

## Design decisions

- **Provisional vs authoritative stats**: live polls derive stats from the
  event stream only (goals/assists/cards/pens; minutes estimated from
  elapsed time). Clean sheets and goals conceded are *not* set provisionally —
  they need the final score and arrive with the post-match pass, which
  overwrites live rows. Rows flagged `is_correction` (admin edits) are never
  overwritten by either pass.
- **Second yellow**: API-Football reports `yellow: 2, red: 1`; we store
  `yellow: 1, red: 1` as the scoring engine expects (no double-counting).
- **Own goals** only exist in the event stream and are merged into the
  post-match stat lines.
- **Idempotency**: round finalization applies the *delta* vs the previously
  finalized score to `totalPoints`, so re-running a post-match job never
  double-counts.
- **Unknown players** (not yet in our DB) are counted as skipped; the next
  daily-sync picks them up and the stats arrive on the following post-match
  re-run or admin correction.

## Running

```sh
DATABASE_URL=postgres://... API_FOOTBALL_KEY=... pnpm --filter @bolivia-fantasy/worker dev
```

Tests run against the local docker-compose Postgres with recorded API
fixtures (`src/test/fixtures/`) — no real network access needed:

```sh
pnpm --filter @bolivia-fantasy/worker test
```
