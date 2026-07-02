import {
  clubs,
  fantasySquads,
  fixtures,
  players,
  playerPositionEnum,
  rounds,
  roundScores,
  users,
} from "@bolivia-fantasy/db";
import { z } from "@bolivia-fantasy/shared";
import { and, asc, count, desc, eq, ilike, ne, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyInstance } from "fastify";

import { paginationSchema, parseOr400, sendError } from "../lib/http.js";
import { computeTotalPoints } from "../lib/points.js";

const playersQuerySchema = paginationSchema.extend({
  clubId: z.coerce.number().int().positive().optional(),
  position: z.enum(playerPositionEnum.enumValues).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z.enum(["price", "points"]).default("price"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const fixturesQuerySchema = z.object({
  roundId: z.coerce.number().int().positive(),
});

const leaderboardQuerySchema = paginationSchema.extend({
  roundId: z.coerce.number().int().positive().optional(),
});

export function registerPublicRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({ status: "ok" as const }));

  app.get("/clubs", async () => {
    const rows = await app.db.select().from(clubs).orderBy(asc(clubs.name));
    return { items: rows };
  });

  app.get("/players", async (request, reply) => {
    const query = parseOr400(playersQuerySchema, request.query, reply);
    if (!query) return;

    const filters: SQL[] = [eq(players.isActive, true)];
    if (query.clubId !== undefined) filters.push(eq(players.clubId, query.clubId));
    if (query.position !== undefined) filters.push(eq(players.position, query.position));
    if (query.search !== undefined) filters.push(ilike(players.name, `%${query.search}%`));
    const where = and(...filters);

    const offset = (query.page - 1) * query.perPage;
    const [{ total }] = await app.db
      .select({ total: count() })
      .from(players)
      .where(where) as [{ total: number }];

    let pageRows;
    if (query.sort === "points") {
      // Points are derived by the scoring engine from raw stat lines, so the
      // sort happens in memory over the filtered set (a few hundred players
      // at most for a 16-club league), then the page is sliced.
      const allRows = await app.db.select().from(players).where(where);
      const totals = await computeTotalPoints(app.db, allRows);
      allRows.sort((a, b) => {
        const diff = (totals.get(a.id) ?? 0) - (totals.get(b.id) ?? 0);
        return (query.order === "asc" ? diff : -diff) || a.id - b.id;
      });
      pageRows = allRows.slice(offset, offset + query.perPage);
    } else {
      const orderBy =
        query.order === "asc" ? asc(players.price) : desc(players.price);
      pageRows = await app.db
        .select()
        .from(players)
        .where(where)
        .orderBy(orderBy, asc(players.id))
        .limit(query.perPage)
        .offset(offset);
    }

    const totals = await computeTotalPoints(app.db, pageRows);
    return {
      items: pageRows.map((row) => ({ ...row, totalPoints: totals.get(row.id) ?? 0 })),
      page: query.page,
      perPage: query.perPage,
      total,
    };
  });

  app.get("/rounds", async () => {
    const rows = await app.db
      .select()
      .from(rounds)
      .orderBy(asc(rounds.season), asc(rounds.phase), asc(rounds.roundNumber));
    return { items: rows };
  });

  app.get("/rounds/current", async (_request, reply) => {
    const [current] = await app.db
      .select()
      .from(rounds)
      .where(ne(rounds.status, "finalized"))
      .orderBy(asc(rounds.season), asc(rounds.phase), asc(rounds.roundNumber))
      .limit(1);
    if (!current) {
      return sendError(reply, 404, "round.noCurrent", "No current round");
    }
    return current;
  });

  app.get("/fixtures", async (request, reply) => {
    const query = parseOr400(fixturesQuerySchema, request.query, reply);
    if (!query) return;

    const homeClub = alias(clubs, "home_club");
    const awayClub = alias(clubs, "away_club");
    const rows = await app.db
      .select({
        fixture: fixtures,
        homeClub: { id: homeClub.id, name: homeClub.name, shortName: homeClub.shortName },
        awayClub: { id: awayClub.id, name: awayClub.name, shortName: awayClub.shortName },
      })
      .from(fixtures)
      .innerJoin(homeClub, eq(fixtures.homeClubId, homeClub.id))
      .innerJoin(awayClub, eq(fixtures.awayClubId, awayClub.id))
      .where(eq(fixtures.roundId, query.roundId))
      .orderBy(asc(fixtures.kickoffAt), asc(fixtures.id));

    return {
      items: rows.map(({ fixture, homeClub: home, awayClub: away }) => ({
        ...fixture,
        homeClub: home,
        awayClub: away,
      })),
    };
  });

  app.get("/leaderboard/global", async (request, reply) => {
    const query = parseOr400(leaderboardQuerySchema, request.query, reply);
    if (!query) return;

    const offset = (query.page - 1) * query.perPage;

    if (query.roundId !== undefined) {
      // Per-round leaderboard from round_scores.
      const [{ total }] = await app.db
        .select({ total: count() })
        .from(roundScores)
        .where(eq(roundScores.roundId, query.roundId)) as [{ total: number }];
      const rows = await app.db
        .select({
          squadId: roundScores.squadId,
          squadName: fantasySquads.name,
          userName: users.name,
          points: roundScores.points,
        })
        .from(roundScores)
        .innerJoin(fantasySquads, eq(roundScores.squadId, fantasySquads.id))
        .innerJoin(users, eq(fantasySquads.userId, users.id))
        .where(eq(roundScores.roundId, query.roundId))
        .orderBy(desc(roundScores.points), asc(roundScores.squadId))
        .limit(query.perPage)
        .offset(offset);
      return {
        items: rows.map((row, i) => ({ rank: offset + i + 1, ...row })),
        page: query.page,
        perPage: query.perPage,
        total,
      };
    }

    // Overall leaderboard from fantasy_squads.totalPoints.
    const [{ total }] = await app.db
      .select({ total: count() })
      .from(fantasySquads) as [{ total: number }];
    const rows = await app.db
      .select({
        squadId: fantasySquads.id,
        squadName: fantasySquads.name,
        userName: users.name,
        points: fantasySquads.totalPoints,
      })
      .from(fantasySquads)
      .innerJoin(users, eq(fantasySquads.userId, users.id))
      .orderBy(desc(fantasySquads.totalPoints), asc(fantasySquads.id))
      .limit(query.perPage)
      .offset(offset);
    return {
      items: rows.map((row, i) => ({ rank: offset + i + 1, ...row })),
      page: query.page,
      perPage: query.perPage,
      total,
    };
  });
}
