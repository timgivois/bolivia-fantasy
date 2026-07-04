import {
  fantasySquads,
  fixtures,
  playerFixtureStats,
  players,
  rounds,
  roundScores,
  squadPicks,
  transfers,
  type Database,
  type FantasySquad,
  type Player,
  type Round,
} from "@bolivia-fantasy/db";
import {
  scorePlayer,
  scoreSquadRound,
  validateSquad,
  type PlayerStatLine,
  type SquadPick as ScoringPick,
} from "@bolivia-fantasy/scoring";
import { z } from "@bolivia-fantasy/shared";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";

import { parseOr400, sendError } from "../lib/http.js";

/** Total squad budget in millions of Bs; fantasy_squads.budget stores what remains. */
export const INITIAL_BUDGET = 100;

const createSquadSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const pickSchema = z.object({
  playerId: z.number().int().positive(),
  position: z.number().int().min(1).max(15),
  isCaptain: z.boolean().default(false),
  isViceCaptain: z.boolean().default(false),
});

const putPicksSchema = z.object({
  roundId: z.number().int().positive(),
  picks: z.array(pickSchema).length(15),
});

const transferSchema = z.object({
  roundId: z.number().int().positive(),
  out: z.number().int().positive(),
  in: z.number().int().positive(),
});

const squadQuerySchema = z.object({
  roundId: z.coerce.number().int().positive().optional(),
});

export function isRoundLocked(round: Round): boolean {
  if (round.status !== "upcoming") return true;
  return round.lockAt !== null && round.lockAt.getTime() <= Date.now();
}

async function getSquadOr404(
  db: Database,
  userId: string,
  reply: FastifyReply,
): Promise<FantasySquad | null> {
  const squad = await db.query.fantasySquads.findFirst({
    where: eq(fantasySquads.userId, userId),
  });
  if (!squad) {
    await sendError(reply, 404, "squad.notFound", "You have not created a squad yet");
    return null;
  }
  return squad;
}

async function getUnlockedRound(
  db: Database,
  roundId: number,
  reply: FastifyReply,
): Promise<Round | null> {
  const round = await db.query.rounds.findFirst({ where: eq(rounds.id, roundId) });
  if (!round) {
    await sendError(reply, 404, "round.notFound", "Round not found");
    return null;
  }
  if (isRoundLocked(round)) {
    await sendError(reply, 409, "round.locked", "This round is locked; squads can no longer change");
    return null;
  }
  return round;
}

function toScoringPick(
  pick: { playerId: number; position: number; isCaptain: boolean; isViceCaptain: boolean },
  fieldPosition: Player["position"],
): ScoringPick {
  return {
    playerId: String(pick.playerId),
    position: pick.position,
    isCaptain: pick.isCaptain,
    isViceCaptain: pick.isViceCaptain,
    fieldPosition,
  };
}

export function registerMeRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", app.authenticate);

  app.post("/squad", async (request, reply) => {
    const body = parseOr400(createSquadSchema, request.body, reply);
    if (!body) return;
    const userId = request.user!.id;

    const existing = await app.db.query.fantasySquads.findFirst({
      where: eq(fantasySquads.userId, userId),
    });
    if (existing) {
      return sendError(reply, 409, "squad.alreadyExists", "You already have a squad");
    }

    const [squad] = await app.db
      .insert(fantasySquads)
      .values({ userId, name: body.name, budget: INITIAL_BUDGET })
      .returning();
    return reply.code(201).send(squad);
  });

  app.get("/squad", async (request, reply) => {
    const query = parseOr400(squadQuerySchema, request.query, reply);
    if (!query) return;
    const squad = await getSquadOr404(app.db, request.user!.id, reply);
    if (!squad) return;

    let roundId = query.roundId;
    if (roundId === undefined) {
      const [current] = await app.db
        .select()
        .from(rounds)
        .where(ne(rounds.status, "finalized"))
        .orderBy(asc(rounds.season), asc(rounds.phase), asc(rounds.roundNumber))
        .limit(1);
      roundId = current?.id;
    }

    const picks =
      roundId === undefined
        ? []
        : await app.db
            .select({
              playerId: squadPicks.playerId,
              position: squadPicks.position,
              isCaptain: squadPicks.isCaptain,
              isViceCaptain: squadPicks.isViceCaptain,
              purchasePrice: squadPicks.purchasePrice,
              player: {
                name: players.name,
                fieldPosition: players.position,
                clubId: players.clubId,
                price: players.price,
              },
            })
            .from(squadPicks)
            .innerJoin(players, eq(squadPicks.playerId, players.id))
            .where(and(eq(squadPicks.squadId, squad.id), eq(squadPicks.roundId, roundId)))
            .orderBy(asc(squadPicks.position));

    return { squad, roundId: roundId ?? null, picks };
  });

  /**
   * Per-pick points breakdown for one round (default: current round).
   * Recomputes from player_fixture_stats via the scoring engine on every call
   * so it works both live (partial stats) and after finalization — the same
   * math the worker persists into round_scores when the round finalizes.
   */
  app.get("/squad/points", async (request, reply) => {
    const query = parseOr400(squadQuerySchema, request.query, reply);
    if (!query) return;
    const squad = await getSquadOr404(app.db, request.user!.id, reply);
    if (!squad) return;

    let round: Round | undefined;
    if (query.roundId !== undefined) {
      round = await app.db.query.rounds.findFirst({ where: eq(rounds.id, query.roundId) });
    } else {
      [round] = await app.db
        .select()
        .from(rounds)
        .where(ne(rounds.status, "finalized"))
        .orderBy(asc(rounds.season), asc(rounds.phase), asc(rounds.roundNumber))
        .limit(1);
    }
    if (!round) {
      return sendError(reply, 404, "round.notFound", "Round not found");
    }

    const pickRows = await app.db
      .select({
        playerId: squadPicks.playerId,
        position: squadPicks.position,
        isCaptain: squadPicks.isCaptain,
        isViceCaptain: squadPicks.isViceCaptain,
        player: {
          name: players.name,
          fieldPosition: players.position,
          clubId: players.clubId,
        },
      })
      .from(squadPicks)
      .innerJoin(players, eq(squadPicks.playerId, players.id))
      .where(and(eq(squadPicks.squadId, squad.id), eq(squadPicks.roundId, round.id)))
      .orderBy(asc(squadPicks.position));

    // Aggregate this round's stat lines per picked player (a player can have
    // more than one fixture in a round), mirroring the worker's finalization.
    const statsMap = new Map<string, PlayerStatLine>();
    if (pickRows.length > 0) {
      const fieldPositions = new Map(pickRows.map((p) => [p.playerId, p.player.fieldPosition]));
      const statRows = await app.db
        .select({ stat: playerFixtureStats })
        .from(playerFixtureStats)
        .innerJoin(fixtures, eq(playerFixtureStats.fixtureId, fixtures.id))
        .where(
          and(
            eq(fixtures.roundId, round.id),
            inArray(
              playerFixtureStats.playerId,
              pickRows.map((p) => p.playerId),
            ),
          ),
        );
      for (const { stat } of statRows) {
        const key = String(stat.playerId);
        const existing = statsMap.get(key);
        if (!existing) {
          statsMap.set(key, {
            playerId: key,
            position: fieldPositions.get(stat.playerId)!,
            minutes: stat.minutes,
            goals: stat.goals,
            assists: stat.assists,
            cleanSheet: stat.cleanSheet,
            goalsConceded: stat.goalsConceded,
            penaltiesSaved: stat.penaltiesSaved,
            penaltiesMissed: stat.penaltiesMissed,
            yellowCards: stat.yellowCards,
            redCards: stat.redCards,
            ownGoals: stat.ownGoals,
            saves: stat.saves,
          });
        } else {
          existing.minutes += stat.minutes;
          existing.goals += stat.goals;
          existing.assists += stat.assists;
          existing.cleanSheet = existing.cleanSheet || stat.cleanSheet;
          existing.goalsConceded += stat.goalsConceded;
          existing.penaltiesSaved += stat.penaltiesSaved;
          existing.penaltiesMissed += stat.penaltiesMissed;
          existing.yellowCards += stat.yellowCards;
          existing.redCards += stat.redCards;
          existing.ownGoals += stat.ownGoals;
          existing.saves = (existing.saves ?? 0) + stat.saves;
        }
      }
    }

    const [penaltyRow] = await app.db
      .select({ penalty: sql<number>`coalesce(sum(${transfers.pointsCost}), 0)::int` })
      .from(transfers)
      .where(and(eq(transfers.squadId, squad.id), eq(transfers.roundId, round.id)));

    const result = scoreSquadRound(
      pickRows.map((pick) => toScoringPick(pick, pick.player.fieldPosition)),
      statsMap,
      { transferPenalty: penaltyRow?.penalty ?? 0 },
    );
    const pointsById = new Map(result.playerPoints.map((p) => [p.playerId, p]));

    const score = await app.db.query.roundScores.findFirst({
      where: and(eq(roundScores.squadId, squad.id), eq(roundScores.roundId, round.id)),
    });

    return {
      squad,
      roundId: round.id,
      finalized: score?.finalized ?? false,
      totalPoints: result.totalPoints,
      benchPoints: result.benchPoints,
      transferPenalty: result.transferPenalty,
      captainPlayerId:
        result.captainPlayerId === null ? null : Number(result.captainPlayerId),
      autoSubs: result.autoSubs.map((s) => ({ out: Number(s.out), in: Number(s.in) })),
      picks: pickRows.map((pick) => {
        const stat = statsMap.get(String(pick.playerId));
        const pickPoints = pointsById.get(String(pick.playerId))!;
        return {
          ...pick,
          stats: stat
            ? {
                minutes: stat.minutes,
                goals: stat.goals,
                assists: stat.assists,
                cleanSheet: stat.cleanSheet,
                goalsConceded: stat.goalsConceded,
                penaltiesSaved: stat.penaltiesSaved,
                penaltiesMissed: stat.penaltiesMissed,
                yellowCards: stat.yellowCards,
                redCards: stat.redCards,
                ownGoals: stat.ownGoals,
                saves: stat.saves ?? 0,
              }
            : null,
          breakdown: stat ? scorePlayer(stat).breakdown : [],
          basePoints: pickPoints.basePoints,
          multiplier: pickPoints.multiplier,
          points: pickPoints.points,
          isStarter: pickPoints.isStarter,
        };
      }),
    };
  });

  app.put("/squad/picks", async (request, reply) => {
    const body = parseOr400(putPicksSchema, request.body, reply);
    if (!body) return;
    const squad = await getSquadOr404(app.db, request.user!.id, reply);
    if (!squad) return;
    const round = await getUnlockedRound(app.db, body.roundId, reply);
    if (!round) return;

    const playerIds = [...new Set(body.picks.map((p) => p.playerId))];
    const playerRows = await app.db
      .select()
      .from(players)
      .where(and(inArray(players.id, playerIds), eq(players.isActive, true)));
    const playersById = new Map(playerRows.map((p) => [p.id, p]));

    const missing = playerIds.filter((id) => !playersById.has(id));
    if (missing.length > 0) {
      return sendError(reply, 400, "squad.unknownPlayers", "Some players do not exist or are inactive", {
        playerIds: missing,
      });
    }

    // Validation is delegated entirely to @bolivia-fantasy/scoring, fed with
    // real prices and clubs from the DB and the fixed 100M game budget.
    const scoringPicks = body.picks.map((pick) =>
      toScoringPick(pick, playersById.get(pick.playerId)!.position),
    );
    const prices = new Map(playerRows.map((p) => [String(p.id), p.price]));
    const playerClubs = new Map(
      playerRows
        .filter((p) => p.clubId !== null)
        .map((p) => [String(p.id), String(p.clubId)]),
    );
    const validation = validateSquad(scoringPicks, prices, playerClubs, INITIAL_BUDGET);
    if (!validation.valid) {
      return sendError(reply, 400, "squad.invalid", "Squad validation failed", validation.errors);
    }

    const totalPrice = body.picks.reduce(
      (sum, pick) => sum + playersById.get(pick.playerId)!.price,
      0,
    );
    const remainingBudget = Math.round((INITIAL_BUDGET - totalPrice) * 10) / 10;

    const inserted = await app.db.transaction(async (tx) => {
      await tx
        .delete(squadPicks)
        .where(and(eq(squadPicks.squadId, squad.id), eq(squadPicks.roundId, round.id)));
      const rows = await tx
        .insert(squadPicks)
        .values(
          body.picks.map((pick) => ({
            squadId: squad.id,
            roundId: round.id,
            playerId: pick.playerId,
            position: pick.position,
            isCaptain: pick.isCaptain,
            isViceCaptain: pick.isViceCaptain,
            purchasePrice: playersById.get(pick.playerId)!.price,
          })),
        )
        .returning();
      await tx
        .update(fantasySquads)
        .set({ budget: remainingBudget })
        .where(eq(fantasySquads.id, squad.id));
      return rows;
    });

    return {
      roundId: round.id,
      budget: remainingBudget,
      picks: inserted.sort((a, b) => a.position - b.position),
    };
  });

  app.post("/transfers", async (request, reply) => {
    const body = parseOr400(transferSchema, request.body, reply);
    if (!body) return;
    if (body.out === body.in) {
      return sendError(reply, 400, "transfer.samePlayer", "out and in must differ");
    }
    const squad = await getSquadOr404(app.db, request.user!.id, reply);
    if (!squad) return;
    const round = await getUnlockedRound(app.db, body.roundId, reply);
    if (!round) return;

    const currentPicks = await app.db
      .select()
      .from(squadPicks)
      .where(and(eq(squadPicks.squadId, squad.id), eq(squadPicks.roundId, round.id)));
    if (currentPicks.length === 0) {
      return sendError(reply, 400, "transfer.noSquad", "No picks saved for this round yet");
    }

    const outPick = currentPicks.find((pick) => pick.playerId === body.out);
    if (!outPick) {
      return sendError(reply, 400, "transfer.playerNotInSquad", "Outgoing player is not in your squad");
    }
    if (currentPicks.some((pick) => pick.playerId === body.in)) {
      return sendError(reply, 400, "transfer.playerAlreadyInSquad", "Incoming player is already in your squad");
    }

    const incoming = await app.db.query.players.findFirst({
      where: and(eq(players.id, body.in), eq(players.isActive, true)),
    });
    if (!incoming) {
      return sendError(reply, 404, "transfer.playerNotFound", "Incoming player not found");
    }

    const involvedIds = currentPicks
      .map((pick) => pick.playerId)
      .filter((id) => id !== body.out)
      .concat(body.in);
    const playerRows = await app.db
      .select()
      .from(players)
      .where(inArray(players.id, involvedIds));
    const playersById = new Map(playerRows.map((p) => [p.id, p]));

    // Resulting squad: the outgoing pick's slot and captaincy flags carry over.
    // Prices: kept players count at their purchase price, the incoming player
    // at today's price — so the budget check against INITIAL_BUDGET is exactly
    // "remaining budget after the swap stays >= 0".
    const nextPicks: ScoringPick[] = [];
    const prices = new Map<string, number>();
    const playerClubs = new Map<string, string>();
    for (const pick of currentPicks) {
      const isSwap = pick.playerId === body.out;
      const playerId = isSwap ? body.in : pick.playerId;
      const player = playersById.get(playerId);
      if (!player) {
        return sendError(reply, 400, "transfer.unknownPlayers", "Squad references unknown players");
      }
      nextPicks.push(
        toScoringPick(
          {
            playerId,
            position: pick.position,
            isCaptain: pick.isCaptain,
            isViceCaptain: pick.isViceCaptain,
          },
          player.position,
        ),
      );
      prices.set(String(playerId), isSwap ? player.price : pick.purchasePrice);
      if (player.clubId !== null) playerClubs.set(String(playerId), String(player.clubId));
    }

    const validation = validateSquad(nextPicks, prices, playerClubs, INITIAL_BUDGET);
    if (!validation.valid) {
      return sendError(reply, 400, "transfer.invalidSquad", "Transfer would break squad rules", validation.errors);
    }

    const newBudget =
      Math.round((squad.budget + outPick.purchasePrice - incoming.price) * 10) / 10;

    const transfer = await app.db.transaction(async (tx) => {
      await tx
        .update(squadPicks)
        .set({ playerId: incoming.id, purchasePrice: incoming.price })
        .where(eq(squadPicks.id, outPick.id));
      await tx
        .update(fantasySquads)
        .set({ budget: newBudget })
        .where(eq(fantasySquads.id, squad.id));
      const [row] = await tx
        .insert(transfers)
        .values({
          squadId: squad.id,
          roundId: round.id,
          playerOutId: body.out,
          playerInId: body.in,
          pointsCost: 0,
        })
        .returning();
      return row;
    });

    return reply.code(201).send({ transfer, budget: newBudget });
  });
}
