/**
 * daily-sync job (cron 06:00 America/La_Paz).
 *
 * One batch per day, 3 + ceil(playerPages) API requests:
 *   1. GET /teams            -> backfill clubs.apiFootballId (fuzzy name match)
 *   2. GET /players (paged)  -> upsert players with position mapping
 *   3. GET /fixtures/rounds  -> upsert rounds (phase + number parsed)
 *   4. GET /fixtures         -> upsert fixtures (kickoff, status, round)
 *   5. rounds.lockAt = earliest kickoff of the round; promote
 *      upcoming -> locked when lockAt has passed.
 */

import { eq, sql } from "drizzle-orm";
import {
  clubs,
  fixtures,
  players,
  rounds,
  type Database,
  type NewPlayer,
} from "@bolivia-fantasy/db";
import { BOLIVIA_LEAGUE_ID, type ApiFootballClient } from "../client.js";
import type {
  ApiFixtureEntry,
  ApiPlayerEntry,
  ApiTeamEntry,
} from "../lib/api-types.js";
import {
  DEFAULT_PRICE_BY_POSITION,
  bestNameMatch,
  mapPosition,
  parseRoundName,
} from "../lib/mapping.js";

export interface DailySyncContext {
  db: Database;
  client: ApiFootballClient;
  /** Season year, e.g. 2026. */
  season: number;
  leagueId?: number;
  log?: (message: string) => void;
}

export interface DailySyncSummary {
  clubsBackfilled: number;
  clubsUnmatched: string[];
  playersUpserted: number;
  playersSkipped: number;
  roundsUpserted: number;
  fixturesUpserted: number;
  fixturesSkipped: number;
}

export async function runDailySync(
  ctx: DailySyncContext,
): Promise<DailySyncSummary> {
  const { db, client, season } = ctx;
  const leagueId = ctx.leagueId ?? BOLIVIA_LEAGUE_ID;
  const log = ctx.log ?? ((message: string) => console.log(message));
  const summary: DailySyncSummary = {
    clubsBackfilled: 0,
    clubsUnmatched: [],
    playersUpserted: 0,
    playersSkipped: 0,
    roundsUpserted: 0,
    fixturesUpserted: 0,
    fixturesSkipped: 0,
  };

  // ------------------------------------------------- 1. clubs.apiFootballId
  const teams = await client.get<ApiTeamEntry>("/teams", {
    league: leagueId,
    season,
  });
  const dbClubs = await db.select().from(clubs);
  const mappedApiIds = new Set(
    dbClubs.map((c) => c.apiFootballId).filter((id) => id != null),
  );
  const unmatchedClubs = dbClubs.filter((c) => c.apiFootballId == null);

  for (const entry of teams.response) {
    if (mappedApiIds.has(entry.team.id)) continue;
    const match = bestNameMatch(entry.team.name, unmatchedClubs);
    if (!match) {
      summary.clubsUnmatched.push(entry.team.name);
      log(`[daily-sync] no club match for API team "${entry.team.name}"`);
      continue;
    }
    await db
      .update(clubs)
      .set({
        apiFootballId: entry.team.id,
        logoUrl: match.logoUrl ?? entry.team.logo,
      })
      .where(eq(clubs.id, match.id));
    unmatchedClubs.splice(unmatchedClubs.indexOf(match), 1);
    summary.clubsBackfilled += 1;
    log(
      `[daily-sync] matched API team "${entry.team.name}" -> club "${match.name}" (#${match.id})`,
    );
  }

  const clubIdByApiId = new Map<number, number>();
  for (const club of await db.select().from(clubs)) {
    if (club.apiFootballId != null) {
      clubIdByApiId.set(club.apiFootballId, club.id);
    }
  }

  // --------------------------------------------------------------- 2. players
  const playerEntries = await client.getPaged<ApiPlayerEntry>("/players", {
    league: leagueId,
    season,
  });
  const newPlayers: NewPlayer[] = [];
  const seenPlayerIds = new Set<number>();
  for (const entry of playerEntries) {
    const stat = entry.statistics[0];
    const position = mapPosition(stat?.games.position);
    if (!stat || !position || seenPlayerIds.has(entry.player.id)) {
      summary.playersSkipped += 1;
      continue;
    }
    seenPlayerIds.add(entry.player.id);
    newPlayers.push({
      apiFootballId: entry.player.id,
      name: entry.player.name,
      position,
      price: DEFAULT_PRICE_BY_POSITION[position],
      clubId: clubIdByApiId.get(stat.team.id) ?? null,
      photoUrl: entry.player.photo,
      isActive: true,
    });
  }
  for (const chunk of chunks(newPlayers, 200)) {
    await db
      .insert(players)
      .values(chunk)
      .onConflictDoUpdate({
        target: players.apiFootballId,
        set: {
          // Refresh identity/club/position; NEVER touch the fantasy price.
          name: sql`excluded.name`,
          position: sql`excluded.position`,
          clubId: sql`excluded.club_id`,
          photoUrl: sql`excluded.photo_url`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });
    summary.playersUpserted += chunk.length;
  }

  // ---------------------------------------------------------------- 3. rounds
  const roundStrings = await client.get<string>("/fixtures/rounds", {
    league: leagueId,
    season,
  });
  for (const apiRound of roundStrings.response) {
    const parsed = parseRoundName(apiRound);
    if (!parsed) {
      log(`[daily-sync] unparseable round name "${apiRound}" — skipped`);
      continue;
    }
    await db
      .insert(rounds)
      .values({
        season,
        phase: parsed.phase,
        roundNumber: parsed.roundNumber,
        name: parsed.name,
      })
      .onConflictDoNothing();
    summary.roundsUpserted += 1;
  }

  const roundIdByKey = new Map<string, number>();
  for (const round of await db
    .select()
    .from(rounds)
    .where(eq(rounds.season, season))) {
    roundIdByKey.set(`${round.phase}:${round.roundNumber}`, round.id);
  }

  // -------------------------------------------------------------- 4. fixtures
  const fixtureEntries = await client.get<ApiFixtureEntry>("/fixtures", {
    league: leagueId,
    season,
  });
  for (const entry of fixtureEntries.response) {
    const parsed = parseRoundName(entry.league.round);
    const roundId = parsed
      ? roundIdByKey.get(`${parsed.phase}:${parsed.roundNumber}`)
      : undefined;
    const homeClubId = clubIdByApiId.get(entry.teams.home.id);
    const awayClubId = clubIdByApiId.get(entry.teams.away.id);
    if (roundId === undefined || !homeClubId || !awayClubId) {
      summary.fixturesSkipped += 1;
      log(
        `[daily-sync] fixture ${entry.fixture.id} skipped (round or club unmapped)`,
      );
      continue;
    }
    await db
      .insert(fixtures)
      .values({
        apiFootballId: entry.fixture.id,
        roundId,
        homeClubId,
        awayClubId,
        kickoffAt: new Date(entry.fixture.date),
        status: entry.fixture.status.short,
        homeGoals: entry.goals.home,
        awayGoals: entry.goals.away,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: fixtures.apiFootballId,
        set: {
          roundId: sql`excluded.round_id`,
          kickoffAt: sql`excluded.kickoff_at`,
          status: sql`excluded.status`,
          homeGoals: sql`excluded.home_goals`,
          awayGoals: sql`excluded.away_goals`,
          lastSyncedAt: sql`excluded.last_synced_at`,
          updatedAt: sql`now()`,
        },
      });
    summary.fixturesUpserted += 1;
  }

  // -------------------------------------- 5. lockAt = earliest kickoff/round
  await db.execute(sql`
    UPDATE rounds
    SET lock_at = agg.min_kickoff, updated_at = now()
    FROM (
      SELECT round_id, MIN(kickoff_at) AS min_kickoff
      FROM fixtures
      GROUP BY round_id
    ) agg
    WHERE rounds.id = agg.round_id
      AND rounds.lock_at IS DISTINCT FROM agg.min_kickoff
  `);
  await db.execute(sql`
    UPDATE rounds
    SET status = 'locked', updated_at = now()
    WHERE status = 'upcoming' AND lock_at IS NOT NULL AND lock_at <= now()
  `);

  log(
    `[daily-sync] done: clubs+${summary.clubsBackfilled}, players ${summary.playersUpserted} ` +
      `(skipped ${summary.playersSkipped}), rounds ${summary.roundsUpserted}, ` +
      `fixtures ${summary.fixturesUpserted} (skipped ${summary.fixturesSkipped})`,
  );
  return summary;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
