/**
 * post-match job: runs once per fixture when it reaches full time.
 *
 * 1. Pulls /fixtures/players (full stat lines) + /fixtures/events and
 *    upserts AUTHORITATIVE player_fixture_stats, overwriting any
 *    provisional live rows (rows flagged isCorrection are preserved).
 * 2. When every fixture of the round is finished, finalizes the round:
 *    marks it `finalized`, scores every squad with
 *    @bolivia-fantasy/scoring, writes round_scores and updates
 *    fantasy_squads.totalPoints (delta-based, so re-runs are idempotent).
 */

import { and, eq, sql } from "drizzle-orm";
import {
  clubs,
  fantasySquads,
  fixtures,
  playerFixtureStats,
  players,
  roundScores,
  rounds,
  squadPicks,
  transfers,
  type Database,
  type Fixture,
  type NewPlayerFixtureStat,
} from "@bolivia-fantasy/db";
import {
  scoreSquadRound,
  type PlayerStatLine,
  type SquadPick as ScoringPick,
} from "@bolivia-fantasy/scoring";
import type { ApiFootballClient } from "../client.js";
import type {
  ApiEventEntry,
  ApiFixturePlayersTeam,
} from "../lib/api-types.js";
import { deriveStatsFromEvents, scoreFromEvents } from "../lib/events.js";
import { FINISHED_STATUSES, PLAYED_STATUSES, nameSimilarity } from "../lib/mapping.js";

export interface PostMatchContext {
  db: Database;
  client: ApiFootballClient;
  log?: (message: string) => void;
}

export interface PostMatchSummary {
  fixtureId: number;
  statLinesUpserted: number;
  statLinesSkipped: number;
  homeGoals: number;
  awayGoals: number;
  roundFinalized: boolean;
  squadsScored: number;
}

export async function runPostMatch(
  ctx: PostMatchContext,
  fixtureId: number,
): Promise<PostMatchSummary> {
  const { db, client } = ctx;
  const log = ctx.log ?? ((message: string) => console.log(message));

  const fixture = (
    await db.select().from(fixtures).where(eq(fixtures.id, fixtureId))
  )[0];
  if (!fixture) throw new Error(`post-match: fixture ${fixtureId} not found`);

  const [homeClub] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.id, fixture.homeClubId));
  const [awayClub] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.id, fixture.awayClubId));
  if (!homeClub || !awayClub) {
    throw new Error(`post-match: clubs missing for fixture ${fixtureId}`);
  }

  const playersEnvelope = await client.get<ApiFixturePlayersTeam>(
    "/fixtures/players",
    { fixture: fixture.apiFootballId },
  );
  const eventsEnvelope = await client.get<ApiEventEntry>("/fixtures/events", {
    fixture: fixture.apiFootballId,
  });

  const teamsStats = playersEnvelope.response;
  const eventStats = deriveStatsFromEvents(eventsEnvelope.response);

  // ------------------------------------------------------------ final score
  // Prefer the event stream (own goals already attributed to the benefiting
  // team); fall back to the score stored by the live poller.
  const homeApiId = resolveTeamApiId(teamsStats, homeClub, 0);
  const awayApiId = resolveTeamApiId(teamsStats, awayClub, 1);
  const eventScore = scoreFromEvents(
    eventsEnvelope.response,
    homeApiId,
    awayApiId,
  );
  const homeGoals = eventScore?.home ?? fixture.homeGoals ?? 0;
  const awayGoals = eventScore?.away ?? fixture.awayGoals ?? 0;

  // -------------------------------------------------- authoritative stats
  const playerRows = await db
    .select({ id: players.id, apiFootballId: players.apiFootballId })
    .from(players);
  const playerIdByApiId = new Map<number, number>();
  for (const row of playerRows) {
    if (row.apiFootballId != null) {
      playerIdByApiId.set(row.apiFootballId, row.id);
    }
  }

  let upserted = 0;
  let skipped = 0;
  for (const teamEntry of teamsStats) {
    const isHome = teamEntry.team.id === homeApiId;
    const concededByTeam = isHome ? awayGoals : homeGoals;

    const rows: NewPlayerFixtureStat[] = [];
    for (const playerEntry of teamEntry.players) {
      const internalId = playerIdByApiId.get(playerEntry.player.id);
      const stat = playerEntry.statistics[0];
      if (!internalId || !stat) {
        skipped += 1;
        continue;
      }
      const minutes = stat.games.minutes ?? 0;
      const played = minutes > 0;
      // Second yellow: API reports yellow=2 & red=1; the scoring engine
      // expects yellow=1 (first booking) + red=1 (see packages/scoring).
      let yellowCards = stat.cards.yellow ?? 0;
      const redCards = stat.cards.red ?? 0;
      if (redCards > 0 && yellowCards >= 2) yellowCards -= 1;

      const rawRating = stat.games.rating ? Number(stat.games.rating) : null;
      rows.push({
        playerId: internalId,
        fixtureId: fixture.id,
        minutes,
        goals: stat.goals.total ?? 0,
        assists: stat.goals.assists ?? 0,
        saves: stat.goals.saves ?? 0,
        goalsConceded: played ? concededByTeam : 0,
        cleanSheet: played && concededByTeam === 0,
        penaltiesSaved: stat.penalty.saved ?? 0,
        penaltiesMissed: stat.penalty.missed ?? 0,
        yellowCards,
        redCards,
        // Own goals only exist in the event stream.
        ownGoals: eventStats.get(playerEntry.player.id)?.ownGoals ?? 0,
        rating:
          rawRating != null && Number.isFinite(rawRating)
            ? Math.round(rawRating * 10) / 10
            : null,
      });
    }

    for (const row of rows) {
      await db
        .insert(playerFixtureStats)
        .values(row)
        .onConflictDoUpdate({
          target: [playerFixtureStats.playerId, playerFixtureStats.fixtureId],
          set: {
            minutes: sql`excluded.minutes`,
            goals: sql`excluded.goals`,
            assists: sql`excluded.assists`,
            saves: sql`excluded.saves`,
            goalsConceded: sql`excluded.goals_conceded`,
            cleanSheet: sql`excluded.clean_sheet`,
            penaltiesSaved: sql`excluded.penalties_saved`,
            penaltiesMissed: sql`excluded.penalties_missed`,
            yellowCards: sql`excluded.yellow_cards`,
            redCards: sql`excluded.red_cards`,
            ownGoals: sql`excluded.own_goals`,
            rating: sql`excluded.rating`,
            updatedAt: sql`now()`,
          },
          setWhere: sql`${playerFixtureStats.isCorrection} = false`,
        });
      upserted += 1;
    }
  }

  await db
    .update(fixtures)
    .set({
      status: PLAYED_STATUSES.has(fixture.status) ? fixture.status : "FT",
      homeGoals,
      awayGoals,
      lastSyncedAt: new Date(),
    })
    .where(eq(fixtures.id, fixture.id));

  log(
    `[post-match] fixture ${fixture.id}: ${homeGoals}-${awayGoals}, ` +
      `${upserted} stat line(s) upserted, ${skipped} unknown player(s) skipped`,
  );

  // -------------------------------------------------- round finalization
  const roundFixtures = await db
    .select()
    .from(fixtures)
    .where(eq(fixtures.roundId, fixture.roundId));
  const allFinished = roundFixtures.every(
    (f: Fixture) => FINISHED_STATUSES.has(f.status) || f.id === fixture.id,
  );

  let squadsScored = 0;
  if (allFinished) {
    squadsScored = await finalizeRound(db, fixture.roundId, log);
  }

  return {
    fixtureId: fixture.id,
    statLinesUpserted: upserted,
    statLinesSkipped: skipped,
    homeGoals,
    awayGoals,
    roundFinalized: allFinished,
    squadsScored,
  };
}

/**
 * Map a /fixtures/players team entry to our club: by apiFootballId first,
 * then by fuzzy name, finally by response order (API lists home first).
 */
function resolveTeamApiId(
  teams: readonly ApiFixturePlayersTeam[],
  club: { apiFootballId: number | null; name: string },
  fallbackIndex: number,
): number {
  if (club.apiFootballId != null) return club.apiFootballId;
  let best: number | null = null;
  let bestScore = 0;
  for (const entry of teams) {
    const score = nameSimilarity(entry.team.name, club.name);
    if (score > bestScore) {
      best = entry.team.id;
      bestScore = score;
    }
  }
  if (best != null && bestScore >= 0.5) return best;
  return teams[fallbackIndex]?.team.id ?? -1;
}

/**
 * Finalize a round: mark it `finalized`, score every squad that has picks
 * for it, upsert round_scores and apply the DELTA to
 * fantasy_squads.totalPoints (safe to re-run). Runs in one transaction.
 */
export async function finalizeRound(
  db: Database,
  roundId: number,
  log: (message: string) => void = (m) => console.log(m),
): Promise<number> {
  return db.transaction(async (tx) => {
    // Stats of every fixture of the round, keyed by playerId (as string,
    // the scoring engine's key type). Doubleheaders aggregate.
    const statRows = await tx
      .select({
        playerId: playerFixtureStats.playerId,
        position: players.position,
        minutes: playerFixtureStats.minutes,
        goals: playerFixtureStats.goals,
        assists: playerFixtureStats.assists,
        cleanSheet: playerFixtureStats.cleanSheet,
        goalsConceded: playerFixtureStats.goalsConceded,
        penaltiesSaved: playerFixtureStats.penaltiesSaved,
        penaltiesMissed: playerFixtureStats.penaltiesMissed,
        yellowCards: playerFixtureStats.yellowCards,
        redCards: playerFixtureStats.redCards,
        ownGoals: playerFixtureStats.ownGoals,
        saves: playerFixtureStats.saves,
      })
      .from(playerFixtureStats)
      .innerJoin(fixtures, eq(playerFixtureStats.fixtureId, fixtures.id))
      .innerJoin(players, eq(playerFixtureStats.playerId, players.id))
      .where(eq(fixtures.roundId, roundId));

    const statsMap = new Map<string, PlayerStatLine>();
    for (const row of statRows) {
      const key = String(row.playerId);
      const existing = statsMap.get(key);
      if (!existing) {
        statsMap.set(key, {
          playerId: key,
          position: row.position,
          minutes: row.minutes,
          goals: row.goals,
          assists: row.assists,
          cleanSheet: row.cleanSheet,
          goalsConceded: row.goalsConceded,
          penaltiesSaved: row.penaltiesSaved,
          penaltiesMissed: row.penaltiesMissed,
          yellowCards: row.yellowCards,
          redCards: row.redCards,
          ownGoals: row.ownGoals,
          saves: row.saves,
        });
      } else {
        existing.minutes += row.minutes;
        existing.goals += row.goals;
        existing.assists += row.assists;
        existing.cleanSheet = existing.cleanSheet || row.cleanSheet;
        existing.goalsConceded += row.goalsConceded;
        existing.penaltiesSaved += row.penaltiesSaved;
        existing.penaltiesMissed += row.penaltiesMissed;
        existing.yellowCards += row.yellowCards;
        existing.redCards += row.redCards;
        existing.ownGoals += row.ownGoals;
        existing.saves = (existing.saves ?? 0) + (row.saves ?? 0);
      }
    }

    // Picks per squad.
    const pickRows = await tx
      .select({
        squadId: squadPicks.squadId,
        playerId: squadPicks.playerId,
        position: squadPicks.position,
        isCaptain: squadPicks.isCaptain,
        isViceCaptain: squadPicks.isViceCaptain,
        fieldPosition: players.position,
      })
      .from(squadPicks)
      .innerJoin(players, eq(squadPicks.playerId, players.id))
      .where(eq(squadPicks.roundId, roundId));

    const picksBySquad = new Map<number, ScoringPick[]>();
    for (const row of pickRows) {
      const list = picksBySquad.get(row.squadId) ?? [];
      list.push({
        playerId: String(row.playerId),
        position: row.position,
        isCaptain: row.isCaptain,
        isViceCaptain: row.isViceCaptain,
        fieldPosition: row.fieldPosition,
      });
      picksBySquad.set(row.squadId, list);
    }

    // Transfer penalties per squad.
    const penaltyRows = await tx
      .select({
        squadId: transfers.squadId,
        penalty: sql<number>`coalesce(sum(${transfers.pointsCost}), 0)::int`,
      })
      .from(transfers)
      .where(eq(transfers.roundId, roundId))
      .groupBy(transfers.squadId);
    const penaltyBySquad = new Map(
      penaltyRows.map((r) => [r.squadId, r.penalty]),
    );

    for (const [squadId, picks] of picksBySquad) {
      const result = scoreSquadRound(picks, statsMap, {
        transferPenalty: penaltyBySquad.get(squadId) ?? 0,
      });

      const [existing] = await tx
        .select()
        .from(roundScores)
        .where(
          and(eq(roundScores.squadId, squadId), eq(roundScores.roundId, roundId)),
        );
      // Delta vs what was already counted into totalPoints: re-running the
      // finalization never double-counts.
      const previouslyCounted = existing?.finalized ? existing.points : 0;
      const delta = result.totalPoints - previouslyCounted;

      await tx
        .insert(roundScores)
        .values({
          squadId,
          roundId,
          points: result.totalPoints,
          transferPenalty: result.transferPenalty,
          benchPoints: result.benchPoints,
          finalized: true,
        })
        .onConflictDoUpdate({
          target: [roundScores.squadId, roundScores.roundId],
          set: {
            points: result.totalPoints,
            transferPenalty: result.transferPenalty,
            benchPoints: result.benchPoints,
            finalized: true,
            updatedAt: sql`now()`,
          },
        });

      if (delta !== 0) {
        await tx
          .update(fantasySquads)
          .set({ totalPoints: sql`${fantasySquads.totalPoints} + ${delta}` })
          .where(eq(fantasySquads.id, squadId));
      }
    }

    await tx
      .update(rounds)
      .set({ status: "finalized" })
      .where(eq(rounds.id, roundId));

    log(
      `[post-match] round ${roundId} finalized — ${picksBySquad.size} squad(s) scored`,
    );
    return picksBySquad.size;
  });
}
