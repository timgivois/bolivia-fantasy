# API-Football coverage report — Bolivia Primera División (league 344)

- **Run dates:** 2026-07-03 (season 2026 attempt + season 2024 sample)
- **Run by:** repo owner (free plan)
- **API requests consumed:** 12 total across both runs

## Verdict: PLAYER_STATS_OK ✅ (with a paid-plan gate for launch)

Full FPL-style scoring is viable. Per-fixture player statistics are real,
populated, and accurate for the Bolivian league.

## Coverage flags by season

| Season | events | lineups | stats (fixtures) | **stats (players)** | standings | players | top scorers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2018–2022 | YES | YES | no | no | YES | YES | YES |
| 2023–2025 | YES | YES | YES | **YES** | YES | YES | YES |
| **2026 (current)** | YES | YES | YES | **YES** | YES | YES | YES |

Injuries and odds: not covered. Current season window: 2026-04-03 → 2026-08-09.

## Fixture stat samples (season 2024, free plan)

- Fixture 1327510 — San Antonio Bulo Bulo 0-2 Bolívar (2024-12-22): 46
  player rows, 31 with minutes and ratings. Sample: Ramiro Vaca 83', rating
  8.2, 1 goal; Fábio Gomes 90', 1 goal; cards present.
- Fixture 1323427 — Wilstermann 3-2 Independiente Petrolero: 41 rows, 31
  with minutes, ratings 7.2–9.7, goals/assists/shots populated.
- Fixture 1327512 — Real Oruro 3-0 Royal Pari: **empty /fixtures/players
  response** (gap), but /fixtures/events fully populated (3 goals incl. an
  own goal, 7 cards, 7 subs, assists attributed).
- /players season aggregates: 46 pages (~920 player-season rows).

## Cross-check vs independent sources

Fixture 1327510 was the 2024 Grand Final. Press coverage (EFE/swissinfo,
El Comercio) confirms: Bolívar beat San Antonio Bulo Bulo 0-2 in Cochabamba
on 2024-12-22, goals by **Ramiro Vaca** (45+1') and **Fábio Gomes** (87') —
exactly matching the API's stat lines (1 goal each, both played). ✅

## Known gap and mitigations (already built)

Occasionally a fixture's /fixtures/players response is empty (1 of 3
sampled). Mitigations in the codebase:

1. Live poller derives provisional stats from /fixtures/events (which was
   populated even for the gap fixture) — goals/assists/cards still score.
2. Post-match job can be re-run (idempotent) once stats appear later.
3. Admin panel supports manual stat corrections that syncs never overwrite.

## Plan gate

The free plan only serves seasons 2022–2024; the current season requires a
paid plan (entry tier ~US$29/mo). Coverage flags show player stats are on
for 2026, so upgrading unlocks the live game with no code changes
(`API_FOOTBALL_KEY` stays, optionally lower `POLL_INTERVAL_MIN`).

**Decision: keep full FPL-style scoring as designed. Develop/demo against
2022–2024 data on the free plan; upgrade the API plan at launch.**
