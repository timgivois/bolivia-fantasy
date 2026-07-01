# @bolivia-fantasy/spike

Verification spike for **API-Football (api-sports.io v3)** coverage of Bolivia's
**Primera División (league id 344)**. The outcome of this spike gates the
fantasy-league product's scoring design.

## Getting a key

1. Register for a free account at <https://dashboard.api-football.com/register>.
2. Copy your API key from the dashboard.
3. Free tier limits: **100 requests/day, 10 requests/minute**. This spike uses
   ~9 requests per run and sleeps ~6.5s between calls to stay under the
   per-minute limit (a full run takes about a minute).

## Running

```sh
API_FOOTBALL_KEY=xxx pnpm --filter @bolivia-fantasy/spike verify
```

Or directly:

```sh
API_FOOTBALL_KEY=xxx node tools/spike/verify.mjs
```

## What it checks

Sequentially (rate-limit friendly):

1. `/status` — quota used today
2. `/leagues?id=344` — seasons + coverage flags (events, lineups, fixture
   stats, **player stats**, standings, players, top scorers, injuries,
   predictions, odds)
3. `/fixtures?league=344&season={latest}` — counts by status, recent finished matches
4. `/fixtures/players` for up to 3 finished fixtures — are per-player stats
   (minutes, rating, goals, assists, shots, cards) actually populated?
5. `/fixtures/events` for 1 finished fixture — goal/card/sub events
6. `/players?league=344&season={latest}` — season-aggregate player stats

## Decision gate

The script prints one of three verdicts:

| Verdict | Meaning | Consequence for scoring design |
| --- | --- | --- |
| `PLAYER_STATS_OK` | `fixtures.statistics_players` coverage flag is on **and** per-fixture player stats contain real minutes/goals | Build **full FPL-style scoring** (minutes, goals, assists, cards, bonus from ratings, etc.) |
| `EVENTS_ONLY` | Player stats missing/empty, but match events are available | Build scoring from **events only**: goals, assists, cards, substitutions |
| `INSUFFICIENT` | Neither player stats nor events reliably available | **Re-evaluate provider** (BeSoccer, Sportmonks) |

After a real run, fill in [`REPORT.md`](./REPORT.md) with the observed output
and a cross-check against Sofascore for the same fixtures.
