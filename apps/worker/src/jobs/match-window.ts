/**
 * match-window-poller (cron every POLL_INTERVAL_MIN minutes).
 *
 * Cheap DB query first: find fixtures whose kickoff falls in
 * [now - 3h, now + 15min] and that are not finished yet. When the window
 * is empty the job returns immediately — ZERO API calls on idle days.
 *
 * Otherwise it refreshes those fixtures with GET /fixtures?ids=... (20 ids
 * per request), and for every in-play fixture pulls /fixtures/events to
 * upsert PROVISIONAL player_fixture_stats (goals/assists/cards/minutes
 * derived from the event stream). After each update it fires
 * `NOTIFY live_scores` so the API server can stream SSE.
 *
 * Fixtures that just reached full time are handed to the post-match queue.
 */

import { and, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import {
  fixtures,
  playerFixtureStats,
  players,
  rounds,
  type Database,
  type Fixture,
} from "@bolivia-fantasy/db";
import type { ApiFootballClient } from "../client.js";
import type { ApiEventEntry, ApiFixtureEntry } from "../lib/api-types.js";
import {
  deriveStatsFromEvents,
  provisionalMinutes,
} from "../lib/events.js";
import { FINISHED_STATUSES, LIVE_STATUSES, PLAYED_STATUSES } from "../lib/mapping.js";

export const LIVE_SCORES_CHANNEL = "live_scores";
/** Poll fixtures that kicked off up to 3h ago... */
export const WINDOW_BEFORE_MS = 3 * 60 * 60 * 1000;
/** ...or kick off within the next 15 minutes. */
export const WINDOW_AFTER_MS = 15 * 60 * 1000;
/** API-Football allows up to 20 ids per /fixtures?ids= request. */
const IDS_PER_REQUEST = 20;

export interface LiveScorePayload {
  fixtureId: number;
  apiFootballId: number;
  status: string;
  elapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
}

export type LiveNotifier = (payload: LiveScorePayload) => Promise<void>;

/** Default notifier: Postgres NOTIFY on the shared pool. */
export function createPgNotifier(db: Database): LiveNotifier {
  return async (payload) => {
    await db.$client.query("SELECT pg_notify($1, $2)", [
      LIVE_SCORES_CHANNEL,
      JSON.stringify(payload),
    ]);
  };
}

export interface MatchWindowContext {
  db: Database;
  client: ApiFootballClient;
  /** Enqueue a post-match job for an internal fixture id. */
  enqueuePostMatch: (fixtureId: number) => Promise<unknown>;
  /** Defaults to Postgres NOTIFY 'live_scores'. */
  notify?: LiveNotifier;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface MatchWindowSummary {
  /** False when no fixture was near the window (no API calls made). */
  polled: boolean;
  candidates: number;
  liveFixtures: number;
  /** Internal fixture ids that just reached full time (post-match queued). */
  finishedFixtures: number[];
}

export async function runMatchWindowPoll(
  ctx: MatchWindowContext,
): Promise<MatchWindowSummary> {
  const { db, client } = ctx;
  const log = ctx.log ?? ((message: string) => console.log(message));
  const notify = ctx.notify ?? createPgNotifier(db);
  const now = (ctx.now ?? (() => new Date()))();

  const windowStart = new Date(now.getTime() - WINDOW_BEFORE_MS);
  const windowEnd = new Date(now.getTime() + WINDOW_AFTER_MS);

  const candidates = await db
    .select()
    .from(fixtures)
    .where(
      and(
        gte(fixtures.kickoffAt, windowStart),
        lte(fixtures.kickoffAt, windowEnd),
        notInArray(fixtures.status, [...FINISHED_STATUSES]),
      ),
    );

  if (candidates.length === 0) {
    return { polled: false, candidates: 0, liveFixtures: 0, finishedFixtures: [] };
  }
  log(`[match-window] ${candidates.length} fixture(s) in the polling window`);

  const byApiId = new Map<number, Fixture>(
    candidates.map((f) => [f.apiFootballId, f]),
  );
  const refreshed: ApiFixtureEntry[] = [];
  const apiIds = [...byApiId.keys()];
  for (let i = 0; i < apiIds.length; i += IDS_PER_REQUEST) {
    const chunk = apiIds.slice(i, i + IDS_PER_REQUEST);
    const envelope = await client.get<ApiFixtureEntry>("/fixtures", {
      ids: chunk.join("-"),
    });
    refreshed.push(...envelope.response);
  }

  const summary: MatchWindowSummary = {
    polled: true,
    candidates: candidates.length,
    liveFixtures: 0,
    finishedFixtures: [],
  };

  for (const entry of refreshed) {
    const fixture = byApiId.get(entry.fixture.id);
    if (!fixture) continue;
    const status = entry.fixture.status.short;
    const elapsed = entry.fixture.status.elapsed;

    await db
      .update(fixtures)
      .set({
        status,
        homeGoals: entry.goals.home,
        awayGoals: entry.goals.away,
        lastSyncedAt: now,
      })
      .where(eq(fixtures.id, fixture.id));

    if (LIVE_STATUSES.has(status)) {
      summary.liveFixtures += 1;
      // First whistle of the round: upcoming/locked -> live.
      await db
        .update(rounds)
        .set({ status: "live" })
        .where(
          and(
            eq(rounds.id, fixture.roundId),
            inArray(rounds.status, ["upcoming", "locked"]),
          ),
        );
      const events = await client.get<ApiEventEntry>("/fixtures/events", {
        fixture: entry.fixture.id,
      });
      const written = await applyProvisionalStats(
        db,
        fixture.id,
        events.response,
        elapsed ?? 0,
      );
      log(
        `[match-window] fixture ${fixture.id} live (${status} ${elapsed}') — ` +
          `${written} provisional stat line(s)`,
      );
    }

    if (PLAYED_STATUSES.has(status) && !PLAYED_STATUSES.has(fixture.status)) {
      summary.finishedFixtures.push(fixture.id);
      await ctx.enqueuePostMatch(fixture.id);
      log(`[match-window] fixture ${fixture.id} reached ${status} — post-match queued`);
    }

    await notify({
      fixtureId: fixture.id,
      apiFootballId: entry.fixture.id,
      status,
      elapsed,
      homeGoals: entry.goals.home,
      awayGoals: entry.goals.away,
    });
  }

  return summary;
}

/**
 * Upsert provisional player_fixture_stats derived from the live event
 * stream. Only players present in our DB (matched by apiFootballId) get a
 * row; rows flagged isCorrection are never overwritten. Clean sheets and
 * goals conceded are NOT set provisionally — they need the final score
 * and arrive with the authoritative post-match pass.
 */
export async function applyProvisionalStats(
  db: Database,
  fixtureId: number,
  events: readonly ApiEventEntry[],
  elapsed: number,
): Promise<number> {
  const derived = deriveStatsFromEvents(events);
  if (derived.size === 0) return 0;

  const knownPlayers = await db
    .select({ id: players.id, apiFootballId: players.apiFootballId })
    .from(players)
    .where(inArray(players.apiFootballId, [...derived.keys()]));

  let written = 0;
  for (const player of knownPlayers) {
    const stats = derived.get(player.apiFootballId as number);
    if (!stats) continue;
    await db
      .insert(playerFixtureStats)
      .values({
        playerId: player.id,
        fixtureId,
        minutes: provisionalMinutes(stats, elapsed),
        goals: stats.goals,
        assists: stats.assists,
        ownGoals: stats.ownGoals,
        penaltiesMissed: stats.penaltiesMissed,
        yellowCards: stats.yellowCards,
        redCards: stats.redCards,
      })
      .onConflictDoUpdate({
        target: [playerFixtureStats.playerId, playerFixtureStats.fixtureId],
        set: {
          minutes: sql`excluded.minutes`,
          goals: sql`excluded.goals`,
          assists: sql`excluded.assists`,
          ownGoals: sql`excluded.own_goals`,
          penaltiesMissed: sql`excluded.penalties_missed`,
          yellowCards: sql`excluded.yellow_cards`,
          redCards: sql`excluded.red_cards`,
          updatedAt: sql`now()`,
        },
        setWhere: sql`${playerFixtureStats.isCorrection} = false`,
      });
    written += 1;
  }
  return written;
}
