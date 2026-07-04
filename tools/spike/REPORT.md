# API-Football coverage report — Bolivia Primera División (league 344)

- **Run date:** 2026-07-03
- **Run by:** repo owner (free plan)
- **Season checked:** 2026 (current)
- **API requests consumed:** 4 (of 100/day free tier)

## Coverage flags by season

| Season | events | lineups | stats (fixtures) | **stats (players)** | standings | players | top scorers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2018–2022 | YES | YES | no | no | YES | YES | YES |
| 2023 | YES | YES | YES | **YES** | YES | YES | YES |
| 2024 | YES | YES | YES | **YES** | YES | YES | YES |
| 2025 | YES | YES | YES | **YES** | YES | YES | YES |
| **2026 (current)** | YES | YES | YES | **YES** | YES | YES | YES |

Injuries and odds: not covered in any season. Current season window:
2026-04-03 → 2026-08-09.

## Plan restriction (the operative finding)

`/fixtures` and `/players` for season 2026 fail on the free plan with:

> "Free plans do not have access to this season, try from 2022 to 2024."

So the free tier can develop and validate against **2022–2024** data, but a
live game on the current season **requires a paid plan** (entry paid tier,
~US$29/mo at time of writing). Coverage flags indicate full per-player
fixture statistics are available from 2023 onward once the plan allows it.

## Fixture stat samples

Not yet sampled — requires either a `SPIKE_SEASON=2024` re-run (allowed on
the free plan) or a paid key for 2026. Re-run with:

```sh
SPIKE_SEASON=2024 API_FOOTBALL_KEY=xxx node tools/spike/verify.mjs
```

and paste the per-player tables here.

## Cross-check vs Sofascore

Pending the sample run above.

## Verdict

The script printed `EVENTS_ONLY`, but that is an artifact of the plan
restriction (it could not sample 2026 stats at all). Corrected reading:

- **Data coverage: PLAYER_STATS_OK** per coverage flags for 2023–2026.
- **Plan gate: paid plan required at launch** for current-season data. The
  worker's design already supports this — no code change, just the key/plan.
- **Action:** validate stat *quality* on season 2024 (free) before paying;
  keep full FPL-style scoring as designed.
