import {
  apiRequestLog,
  fixtures,
  playerFixtureStats,
  players,
  rounds,
} from "@bolivia-fantasy/db";
import { z } from "@bolivia-fantasy/shared";
import { eq, max, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { parseOr400, sendError } from "../lib/http.js";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const statsParamsSchema = z.object({
  fixtureId: z.coerce.number().int().positive(),
  playerId: z.coerce.number().int().positive(),
});

const patchPlayerSchema = z.object({
  price: z.number().min(0).max(1000).multipleOf(0.1),
});

const statCorrectionSchema = z.object({
  minutes: z.number().int().min(0).max(120).default(0),
  goals: z.number().int().min(0).default(0),
  assists: z.number().int().min(0).default(0),
  cleanSheet: z.boolean().default(false),
  goalsConceded: z.number().int().min(0).default(0),
  penaltiesSaved: z.number().int().min(0).default(0),
  penaltiesMissed: z.number().int().min(0).default(0),
  yellowCards: z.number().int().min(0).max(2).default(0),
  redCards: z.number().int().min(0).max(1).default(0),
  ownGoals: z.number().int().min(0).default(0),
  saves: z.number().int().min(0).default(0),
  rating: z.number().min(0).max(10).nullable().default(null),
});

export function registerAdminRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", app.authenticate);
  app.addHook("preHandler", app.requireAdmin);

  app.patch("/players/:id", async (request, reply) => {
    const params = parseOr400(idParamSchema, request.params, reply);
    if (!params) return;
    const body = parseOr400(patchPlayerSchema, request.body, reply);
    if (!body) return;

    const [updated] = await app.db
      .update(players)
      .set({ price: body.price })
      .where(eq(players.id, params.id))
      .returning();
    if (!updated) {
      return sendError(reply, 404, "player.notFound", "Player not found");
    }
    return updated;
  });

  app.put("/stats/:fixtureId/:playerId", async (request, reply) => {
    const params = parseOr400(statsParamsSchema, request.params, reply);
    if (!params) return;
    const body = parseOr400(statCorrectionSchema, request.body, reply);
    if (!body) return;

    const [fixture, player] = await Promise.all([
      app.db.query.fixtures.findFirst({ where: eq(fixtures.id, params.fixtureId) }),
      app.db.query.players.findFirst({ where: eq(players.id, params.playerId) }),
    ]);
    if (!fixture) return sendError(reply, 404, "fixture.notFound", "Fixture not found");
    if (!player) return sendError(reply, 404, "player.notFound", "Player not found");

    const values = { ...body, isCorrection: true };
    const [row] = await app.db
      .insert(playerFixtureStats)
      .values({ playerId: params.playerId, fixtureId: params.fixtureId, ...values })
      .onConflictDoUpdate({
        target: [playerFixtureStats.playerId, playerFixtureStats.fixtureId],
        set: values,
      })
      .returning();
    return row;
  });

  app.post("/rounds/:id/lock", async (request, reply) => {
    const params = parseOr400(idParamSchema, request.params, reply);
    if (!params) return;
    const [updated] = await app.db
      .update(rounds)
      .set({ status: "locked" })
      .where(eq(rounds.id, params.id))
      .returning();
    if (!updated) return sendError(reply, 404, "round.notFound", "Round not found");
    return updated;
  });

  app.post("/rounds/:id/unlock", async (request, reply) => {
    const params = parseOr400(idParamSchema, request.params, reply);
    if (!params) return;
    const [updated] = await app.db
      .update(rounds)
      .set({ status: "upcoming" })
      .where(eq(rounds.id, params.id))
      .returning();
    if (!updated) return sendError(reply, 404, "round.notFound", "Round not found");
    return updated;
  });

  app.get("/sync-health", async () => {
    const [todayLog] = await app.db
      .select({
        date: apiRequestLog.date,
        requestCount: apiRequestLog.requestCount,
        lastEndpoint: apiRequestLog.endpoint,
      })
      .from(apiRequestLog)
      .where(eq(apiRequestLog.date, sql`CURRENT_DATE`))
      .limit(1);

    const [fixtureAgg] = await app.db
      .select({
        lastSyncedAt: max(fixtures.lastSyncedAt),
        lastUpdatedAt: max(fixtures.updatedAt),
      })
      .from(fixtures);
    const [statAgg] = await app.db
      .select({ lastUpdatedAt: max(playerFixtureStats.updatedAt) })
      .from(playerFixtureStats);

    return {
      apiRequestsToday: todayLog?.requestCount ?? 0,
      lastEndpoint: todayLog?.lastEndpoint ?? null,
      lastFixtureSyncAt: fixtureAgg?.lastSyncedAt ?? null,
      lastFixtureUpdateAt: fixtureAgg?.lastUpdatedAt ?? null,
      lastStatUpdateAt: statAgg?.lastUpdatedAt ?? null,
    };
  });
}
