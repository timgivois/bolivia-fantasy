/**
 * Client-safe shapes mirroring the Fastify admin API responses
 * (apps/api/src/routes/admin.ts). Kept in components/admin so both the
 * server-only API client (lib/api.ts) and the client components can import
 * them without pulling server code into the browser bundle.
 */

/** Response of GET /admin/sync-health. */
export interface SyncHealth {
  apiRequestsToday: number;
  lastEndpoint: string | null;
  /** ISO timestamps; null when nothing was ever synced. */
  lastFixtureSyncAt: string | null;
  lastFixtureUpdateAt: string | null;
  lastStatUpdateAt: string | null;
}

/** API-Football free-tier daily request budget the sync worker respects. */
export const API_REQUEST_DAILY_LIMIT = 95;
/** Above this many requests the dashboard shows the warning state. */
export const API_REQUEST_WARN_THRESHOLD = 80;

/** Editable fields of PUT /admin/stats/:fixtureId/:playerId. */
export interface StatFields {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  goalsConceded: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  saves: number;
  rating: number | null;
}

/** One player_fixture_stats row (GET/PUT /admin/stats/:fixtureId/:playerId). */
export interface StatLine extends StatFields {
  id: number;
  playerId: number;
  fixtureId: number;
  isCorrection: boolean;
}

export const EMPTY_STAT_FIELDS: StatFields = {
  minutes: 0,
  goals: 0,
  assists: 0,
  cleanSheet: false,
  goalsConceded: 0,
  penaltiesSaved: 0,
  penaltiesMissed: 0,
  yellowCards: 0,
  redCards: 0,
  ownGoals: 0,
  saves: 0,
  rating: null,
};
