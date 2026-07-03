import { randomInt } from "node:crypto";

import {
  fantasySquads,
  miniLeagueMembers,
  miniLeagues,
  users,
} from "@bolivia-fantasy/db";
import { z } from "@bolivia-fantasy/shared";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { parseOr400, sendError } from "../lib/http.js";

/** Unambiguous alphabet (no 0/O/1/I) for 8-char invite codes. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

const createLeagueSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

const joinLeagueSchema = z.object({
  code: z
    .string()
    .trim()
    .length(CODE_LENGTH)
    .transform((value) => value.toUpperCase()),
});

const leagueIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export function registerLeagueRoutes(app: FastifyInstance): void {
  app.addHook("preHandler", app.authenticate);

  app.post("/", async (request, reply) => {
    const body = parseOr400(createLeagueSchema, request.body, reply);
    if (!body) return;
    const userId = request.user!.id;

    // Retry on the (astronomically unlikely) invite-code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const inviteCode = generateInviteCode();
      try {
        const league = await app.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(miniLeagues)
            .values({ name: body.name, inviteCode, ownerId: userId })
            .returning();
          await tx
            .insert(miniLeagueMembers)
            .values({ leagueId: row!.id, userId });
          return row!;
        });
        return reply.code(201).send(league);
      } catch (error) {
        const pgCode = (error as { code?: string }).code;
        if (pgCode !== "23505") throw error; // not a unique violation
      }
    }
    return sendError(reply, 500, "league.codeCollision", "Could not generate an invite code");
  });

  app.post("/join", async (request, reply) => {
    const body = parseOr400(joinLeagueSchema, request.body, reply);
    if (!body) return;

    const league = await app.db.query.miniLeagues.findFirst({
      where: eq(miniLeagues.inviteCode, body.code),
    });
    if (!league) {
      return sendError(reply, 404, "league.notFound", "No league with that invite code");
    }

    const inserted = await app.db
      .insert(miniLeagueMembers)
      .values({ leagueId: league.id, userId: request.user!.id })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      return sendError(reply, 409, "league.alreadyMember", "You are already in this league");
    }
    return reply.code(201).send(league);
  });

  app.get("/mine", async (request) => {
    const memberCounts = app.db
      .select({
        leagueId: miniLeagueMembers.leagueId,
        memberCount: count().as("member_count"),
      })
      .from(miniLeagueMembers)
      .groupBy(miniLeagueMembers.leagueId)
      .as("member_counts");

    const rows = await app.db
      .select({
        league: miniLeagues,
        memberCount: memberCounts.memberCount,
      })
      .from(miniLeagueMembers)
      .innerJoin(miniLeagues, eq(miniLeagueMembers.leagueId, miniLeagues.id))
      .innerJoin(memberCounts, eq(memberCounts.leagueId, miniLeagues.id))
      .where(eq(miniLeagueMembers.userId, request.user!.id))
      .orderBy(asc(miniLeagues.createdAt), asc(miniLeagues.id));

    return {
      items: rows.map(({ league, memberCount }) => ({
        ...league,
        memberCount: Number(memberCount),
      })),
    };
  });

  app.get("/:id/standings", async (request, reply) => {
    const params = parseOr400(leagueIdSchema, request.params, reply);
    if (!params) return;

    const league = await app.db.query.miniLeagues.findFirst({
      where: eq(miniLeagues.id, params.id),
    });
    if (!league) {
      return sendError(reply, 404, "league.notFound", "League not found");
    }

    const membership = await app.db.query.miniLeagueMembers.findFirst({
      where: and(
        eq(miniLeagueMembers.leagueId, league.id),
        eq(miniLeagueMembers.userId, request.user!.id),
      ),
    });
    if (!membership) {
      return sendError(reply, 403, "league.notMember", "Join this league to see its standings");
    }

    const totalPoints = sql<number>`coalesce(${fantasySquads.totalPoints}, 0)`;
    const rows = await app.db
      .select({
        userId: users.id,
        userName: users.name,
        /** Null while the member has not created a squad yet. */
        squadId: fantasySquads.id,
        squadName: fantasySquads.name,
        totalPoints,
        joinedAt: miniLeagueMembers.joinedAt,
      })
      .from(miniLeagueMembers)
      .innerJoin(users, eq(miniLeagueMembers.userId, users.id))
      .leftJoin(fantasySquads, eq(fantasySquads.userId, users.id))
      .where(eq(miniLeagueMembers.leagueId, league.id))
      .orderBy(desc(totalPoints), asc(miniLeagueMembers.joinedAt));

    return {
      league,
      standings: rows.map((row, i) => ({
        rank: i + 1,
        ...row,
        totalPoints: Number(row.totalPoints),
      })),
    };
  });
}
