import type { AddressInfo } from "node:net";

import {
  clubs,
  fantasySquads,
  fixtures,
  playerFixtureStats,
  players,
  rounds,
  users,
  type Club,
  type Database,
  type Fixture,
  type Player,
  type Round,
} from "@bolivia-fantasy/db";
import { eq, like } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";
import { AUTH_SECRET, DATABASE_URL, bearer, cookie, sessionToken } from "./helpers.js";

const TEST_SEASON = 9099;
const NAME_PREFIX = "TESTAPI ";
const EMAIL_DOMAIN = "@apitest.local";

const ALICE = `alice${EMAIL_DOMAIN}`;
const BOB = `bob${EMAIL_DOMAIN}`;
const CAROL = `carol${EMAIL_DOMAIN}`;
const ADMIN = `admin${EMAIL_DOMAIN}`;

let app: FastifyInstance;
let db: Database;

let clubRows: Club[];
let openRound: Round;
let lockedRound: Round;
let pastLockRound: Round;
let fixture: Fixture;

// Squad building blocks (composition 2 GK / 5 DEF / 5 MID / 3 FWD, 86.0M total).
let gk: Player[];
let def: Player[];
let mid: Player[];
let fwd: Player[];
let extraDefsClub0: Player[]; // same club as gk[0]/def[0] -> force 4-per-club
let expensiveFwd: Player; // 90.0M -> force over-budget
let spareFwd: Player; // 8.0M -> transfer target

let aliceToken: string;
let bobToken: string;
let carolToken: string;
let adminToken: string;

interface PickInput {
  playerId: number;
  position: number;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
}

function validPicks(): PickInput[] {
  return [
    { playerId: gk[0]!.id, position: 1 },
    { playerId: def[0]!.id, position: 2 },
    { playerId: def[1]!.id, position: 3 },
    { playerId: def[2]!.id, position: 4 },
    { playerId: def[3]!.id, position: 5 },
    { playerId: mid[0]!.id, position: 6, isViceCaptain: true },
    { playerId: mid[1]!.id, position: 7 },
    { playerId: mid[2]!.id, position: 8 },
    { playerId: mid[3]!.id, position: 9 },
    { playerId: fwd[0]!.id, position: 10, isCaptain: true },
    { playerId: fwd[1]!.id, position: 11 },
    { playerId: gk[1]!.id, position: 12 },
    { playerId: def[4]!.id, position: 13 },
    { playerId: mid[4]!.id, position: 14 },
    { playerId: fwd[2]!.id, position: 15 },
  ];
}

async function cleanupTestRows(database: Database): Promise<void> {
  // FK-safe order: users cascade squads/picks/transfers/leagues; rounds
  // cascade fixtures/stats/picks; players go last once nothing refers to them.
  await database.delete(users).where(like(users.email, `%${EMAIL_DOMAIN}`));
  await database.delete(rounds).where(eq(rounds.season, TEST_SEASON));
  await database.delete(players).where(like(players.name, `${NAME_PREFIX}%`));
}

beforeAll(async () => {
  app = await buildServer({
    databaseUrl: DATABASE_URL,
    authSecret: AUTH_SECRET,
    logger: false,
  });
  await app.ready();
  db = app.db;

  await cleanupTestRows(db); // re-runnable even after a crashed previous run

  clubRows = await db.select().from(clubs).orderBy(clubs.id);
  expect(clubRows.length).toBeGreaterThanOrEqual(15);

  const [r1, r2, r3] = await db
    .insert(rounds)
    .values([
      {
        season: TEST_SEASON,
        name: `${NAME_PREFIX}Fecha 1`,
        roundNumber: 1,
        phase: "apertura",
        lockAt: new Date(Date.now() + 48 * 3600_000),
        status: "upcoming",
      },
      {
        season: TEST_SEASON,
        name: `${NAME_PREFIX}Fecha 2`,
        roundNumber: 2,
        phase: "apertura",
        lockAt: new Date(Date.now() + 96 * 3600_000),
        status: "locked",
      },
      {
        season: TEST_SEASON,
        name: `${NAME_PREFIX}Fecha 3`,
        roundNumber: 3,
        phase: "apertura",
        lockAt: new Date(Date.now() - 3600_000), // lockAt already passed
        status: "upcoming",
      },
    ])
    .returning();
  openRound = r1!;
  lockedRound = r2!;
  pastLockRound = r3!;

  let n = 0;
  const mk = (
    position: Player["position"],
    clubIdx: number,
    price: number,
  ): { name: string; position: Player["position"]; clubId: number; price: number } => ({
    name: `${NAME_PREFIX}P${String(++n).padStart(2, "0")}`,
    position,
    clubId: clubRows[clubIdx]!.id,
    price,
  });

  const inserted = await db
    .insert(players)
    .values([
      mk("GK", 0, 5.0),
      mk("GK", 1, 5.0),
      mk("DEF", 0, 5.0),
      mk("DEF", 1, 5.0),
      mk("DEF", 2, 5.0),
      mk("DEF", 3, 5.0),
      mk("DEF", 4, 5.0),
      mk("MID", 5, 6.0),
      mk("MID", 6, 6.0),
      mk("MID", 7, 6.0),
      mk("MID", 8, 6.0),
      mk("MID", 9, 6.0),
      mk("FWD", 10, 7.0),
      mk("FWD", 11, 7.0),
      mk("FWD", 12, 7.0),
      mk("DEF", 0, 5.0), // extraDefsClub0[0]
      mk("DEF", 0, 5.0), // extraDefsClub0[1]
      mk("FWD", 13, 90.0), // expensiveFwd
      mk("FWD", 14, 8.0), // spareFwd
    ])
    .returning();
  gk = inserted.slice(0, 2);
  def = inserted.slice(2, 7);
  mid = inserted.slice(7, 12);
  fwd = inserted.slice(12, 15);
  extraDefsClub0 = inserted.slice(15, 17);
  expensiveFwd = inserted[17]!;
  spareFwd = inserted[18]!;

  const [fixtureRow] = await db
    .insert(fixtures)
    .values({
      apiFootballId: 987_654_301,
      roundId: openRound.id,
      homeClubId: clubRows[0]!.id,
      awayClubId: clubRows[1]!.id,
      kickoffAt: new Date(Date.now() + 48 * 3600_000),
    })
    .returning();
  fixture = fixtureRow!;

  // Admin user pre-provisioned with the admin role; the auth plugin will
  // find (not create) this row when the admin token comes in.
  await db.insert(users).values({ email: ADMIN, name: "Test Admin", role: "admin" });

  [aliceToken, bobToken, carolToken, adminToken] = await Promise.all([
    sessionToken(ALICE, "Alice Test"),
    sessionToken(BOB, "Bob Test"),
    sessionToken(CAROL, "Carol Test"),
    sessionToken(ADMIN, "Test Admin"),
  ]);
});

afterAll(async () => {
  if (db) await cleanupTestRows(db);
  if (app) await app.close();
});

describe("auth", () => {
  it("rejects requests without a token", async () => {
    const res = await app.inject({ method: "GET", url: "/me/squad" });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("auth.missingToken");
  });

  it("rejects a garbage bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me/squad",
      headers: bearer("not-a-jwt"),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("auth.invalidToken");
  });

  it("decodes an @auth/core-encoded token via Authorization header and creates the user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me/squad",
      headers: bearer(aliceToken),
    });
    // Authenticated but no squad yet.
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("squad.notFound");

    const user = await db.query.users.findFirst({ where: eq(users.email, ALICE) });
    expect(user).toBeDefined();
    expect(user!.role).toBe("user");
    expect(user!.name).toBe("Alice Test");
  });

  it("accepts the session token via the authjs.session-token cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me/squad",
      headers: cookie(bobToken),
    });
    expect(res.statusCode).toBe(404); // authenticated, squad missing
    const user = await db.query.users.findFirst({ where: eq(users.email, BOB) });
    expect(user).toBeDefined();
  });

  it("does not duplicate the user on repeated requests", async () => {
    await app.inject({ method: "GET", url: "/me/squad", headers: bearer(aliceToken) });
    const rows = await db.select().from(users).where(eq(users.email, ALICE));
    expect(rows).toHaveLength(1);
  });
});

describe("public routes", () => {
  it("GET /health", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /clubs returns the seeded clubs", async () => {
    const res = await app.inject({ method: "GET", url: "/clubs" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(15);
  });

  it("GET /players filters, sorts and paginates", async () => {
    const all = await app.inject({
      method: "GET",
      url: `/players?search=${encodeURIComponent(NAME_PREFIX.trim())}&perPage=5&sort=price&order=desc`,
    });
    expect(all.statusCode).toBe(200);
    const body = all.json();
    expect(body.total).toBe(19);
    expect(body.items).toHaveLength(5);
    expect(body.items[0].price).toBe(90); // expensive forward first

    const gks = await app.inject({
      method: "GET",
      url: `/players?search=${encodeURIComponent(NAME_PREFIX.trim())}&position=GK`,
    });
    expect(gks.json().total).toBe(2);

    const byClub = await app.inject({
      method: "GET",
      url: `/players?search=${encodeURIComponent(NAME_PREFIX.trim())}&clubId=${clubRows[0]!.id}`,
    });
    expect(byClub.json().total).toBe(4); // gk[0], def[0], 2 extra DEFs

    const bad = await app.inject({ method: "GET", url: "/players?position=NOPE" });
    expect(bad.statusCode).toBe(400);
  });

  it("GET /rounds and /rounds/current", async () => {
    const res = await app.inject({ method: "GET", url: "/rounds" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.length).toBeGreaterThanOrEqual(3);

    const current = await app.inject({ method: "GET", url: "/rounds/current" });
    expect(current.statusCode).toBe(200);
    expect(current.json().id).toBe(openRound.id); // next non-finalized round
  });

  it("GET /fixtures?roundId returns fixtures with club info", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/fixtures?roundId=${openRound.id}`,
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(fixture.id);
    expect(items[0].homeClub.name).toBe(clubRows[0]!.name);

    const missing = await app.inject({ method: "GET", url: "/fixtures" });
    expect(missing.statusCode).toBe(400);
  });
});

describe("squad lifecycle", () => {
  it("creates a squad (and rejects a second one)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/me/squad",
      headers: bearer(aliceToken),
      payload: { name: "Alice XI" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().budget).toBe(100);

    const again = await app.inject({
      method: "POST",
      url: "/me/squad",
      headers: bearer(aliceToken),
      payload: { name: "Alice XI 2" },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("squad.alreadyExists");
  });

  it("saves a valid 15-player squad and updates the remaining budget", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/me/squad/picks",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, picks: validPicks() },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.picks).toHaveLength(15);
    expect(body.budget).toBe(14); // 100 - 86

    const get = await app.inject({
      method: "GET",
      url: `/me/squad?roundId=${openRound.id}`,
      headers: bearer(aliceToken),
    });
    expect(get.statusCode).toBe(200);
    const squadBody = get.json();
    expect(squadBody.picks).toHaveLength(15);
    expect(squadBody.squad.budget).toBe(14);
    expect(squadBody.picks[0].player.name).toBe(gk[0]!.name);
  });

  it("rejects an over-budget squad via the scoring validator", async () => {
    const picks = validPicks().map((p) =>
      p.playerId === fwd[0]!.id
        ? { ...p, playerId: expensiveFwd.id } // 7.0 -> 90.0 = 169 total
        : p,
    );
    const res = await app.inject({
      method: "PUT",
      url: "/me/squad/picks",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, picks },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe("squad.invalid");
    const codes = body.error.details.map((e: { code: string }) => e.code);
    expect(codes).toContain("squad.overBudget");
  });

  it("rejects more than 3 players from the same club", async () => {
    const swapOut = new Set([def[2]!.id, def[3]!.id]);
    let extraIdx = 0;
    const picks = validPicks().map((p) =>
      swapOut.has(p.playerId)
        ? { ...p, playerId: extraDefsClub0[extraIdx++]!.id }
        : p,
    );
    const res = await app.inject({
      method: "PUT",
      url: "/me/squad/picks",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, picks },
    });
    expect(res.statusCode).toBe(400);
    const codes = res.json().error.details.map((e: { code: string }) => e.code);
    expect(codes).toContain("squad.tooManyFromClub");
  });

  it("rejects picks for a locked round (status = locked)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/me/squad/picks",
      headers: bearer(aliceToken),
      payload: { roundId: lockedRound.id, picks: validPicks() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("round.locked");
  });

  it("rejects picks once lockAt has passed even if status is upcoming", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/me/squad/picks",
      headers: bearer(aliceToken),
      payload: { roundId: pastLockRound.id, picks: validPicks() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("round.locked");
  });
});

describe("transfers", () => {
  it("executes a valid transfer and adjusts the budget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/me/transfers",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, out: fwd[1]!.id, in: spareFwd.id },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.budget).toBe(13); // 14 + 7.0 out - 8.0 in
    expect(body.transfer.playerOutId).toBe(fwd[1]!.id);
    expect(body.transfer.playerInId).toBe(spareFwd.id);

    const get = await app.inject({
      method: "GET",
      url: `/me/squad?roundId=${openRound.id}`,
      headers: bearer(aliceToken),
    });
    const playerIds = get
      .json()
      .picks.map((p: { playerId: number }) => p.playerId);
    expect(playerIds).toContain(spareFwd.id);
    expect(playerIds).not.toContain(fwd[1]!.id);
  });

  it("rejects a transfer that would blow the budget", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/me/transfers",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, out: spareFwd.id, in: expensiveFwd.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("transfer.invalidSquad");
    const codes = res.json().error.details.map((e: { code: string }) => e.code);
    expect(codes).toContain("squad.overBudget");
  });

  it("rejects transfers on a locked round", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/me/transfers",
      headers: bearer(aliceToken),
      payload: { roundId: lockedRound.id, out: fwd[0]!.id, in: spareFwd.id },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("round.locked");
  });

  it("rejects transferring out a player not in the squad", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/me/transfers",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, out: fwd[1]!.id, in: expensiveFwd.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("transfer.playerNotInSquad");
  });
});

describe("leaderboard", () => {
  it("ranks squads by totalPoints", async () => {
    const alice = await db.query.users.findFirst({ where: eq(users.email, ALICE) });
    await db
      .update(fantasySquads)
      .set({ totalPoints: 42 })
      .where(eq(fantasySquads.userId, alice!.id));

    const res = await app.inject({ method: "GET", url: "/leaderboard/global" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].rank).toBe(1);
    expect(body.items[0].points).toBe(42);
    expect(body.items[0].squadName).toBe("Alice XI");
  });
});

describe("mini-leagues", () => {
  let inviteCode: string;
  let leagueId: number;

  it("creates a league with an 8-char invite code", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/leagues",
      headers: bearer(aliceToken),
      payload: { name: "Liga de Prueba" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    inviteCode = body.inviteCode;
    leagueId = body.id;
  });

  it("lets another user join by code (once)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/leagues/join",
      headers: bearer(bobToken),
      payload: { code: inviteCode.toLowerCase() }, // case-insensitive
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe(leagueId);

    const again = await app.inject({
      method: "POST",
      url: "/leagues/join",
      headers: bearer(bobToken),
      payload: { code: inviteCode },
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("league.alreadyMember");

    const unknown = await app.inject({
      method: "POST",
      url: "/leagues/join",
      headers: bearer(bobToken),
      payload: { code: "ZZZZZZZZ" },
    });
    expect(unknown.statusCode).toBe(404);
  });

  it("lists my leagues with member counts", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/leagues/mine",
      headers: bearer(bobToken),
    });
    expect(res.statusCode).toBe(200);
    const items = res.json().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(leagueId);
    expect(items[0].memberCount).toBe(2);
  });

  it("returns standings ranked by totalPoints, members only", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/leagues/${leagueId}/standings`,
      headers: bearer(bobToken),
    });
    expect(res.statusCode).toBe(200);
    const { standings } = res.json();
    expect(standings).toHaveLength(2);
    expect(standings[0].rank).toBe(1);
    expect(standings[0].totalPoints).toBe(42); // Alice
    expect(standings[1].totalPoints).toBe(0); // Bob has no squad -> 0

    const outsider = await app.inject({
      method: "GET",
      url: `/leagues/${leagueId}/standings`,
      headers: bearer(carolToken),
    });
    expect(outsider.statusCode).toBe(403);
    expect(outsider.json().error.code).toBe("league.notMember");
  });
});

describe("admin", () => {
  it("blocks non-admin users with 403 and anonymous with 401", async () => {
    const asUser = await app.inject({
      method: "PATCH",
      url: `/admin/players/${extraDefsClub0[0]!.id}`,
      headers: bearer(aliceToken),
      payload: { price: 9.9 },
    });
    expect(asUser.statusCode).toBe(403);
    expect(asUser.json().error.code).toBe("auth.forbidden");

    const anon = await app.inject({ method: "GET", url: "/admin/sync-health" });
    expect(anon.statusCode).toBe(401);
  });

  it("updates a player price", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/admin/players/${extraDefsClub0[0]!.id}`,
      headers: bearer(adminToken),
      payload: { price: 9.9 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().price).toBe(9.9);

    const missing = await app.inject({
      method: "PATCH",
      url: "/admin/players/999999999",
      headers: bearer(adminToken),
      payload: { price: 5 },
    });
    expect(missing.statusCode).toBe(404);
  });

  it("upserts a manual stat correction", async () => {
    const created = await app.inject({
      method: "PUT",
      url: `/admin/stats/${fixture.id}/${def[0]!.id}`,
      headers: bearer(adminToken),
      payload: { minutes: 90, goals: 2 },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().goals).toBe(2);
    expect(created.json().isCorrection).toBe(true);

    // Idempotent upsert on (playerId, fixtureId).
    const updated = await app.inject({
      method: "PUT",
      url: `/admin/stats/${fixture.id}/${def[0]!.id}`,
      headers: bearer(adminToken),
      payload: { minutes: 90, goals: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().id).toBe(created.json().id);
    expect(updated.json().goals).toBe(1);

    // The stat now feeds player points via the scoring engine:
    // 90 min (2) + 1 goal as DEF (6) = 8.
    const sorted = await app.inject({
      method: "GET",
      url: `/players?search=${encodeURIComponent(NAME_PREFIX.trim())}&sort=points&order=desc`,
    });
    expect(sorted.json().items[0].id).toBe(def[0]!.id);
    expect(sorted.json().items[0].totalPoints).toBe(8);
  });

  it("locks and unlocks a round", async () => {
    const lock = await app.inject({
      method: "POST",
      url: `/admin/rounds/${openRound.id}/lock`,
      headers: bearer(adminToken),
    });
    expect(lock.statusCode).toBe(200);
    expect(lock.json().status).toBe("locked");

    const put = await app.inject({
      method: "PUT",
      url: "/me/squad/picks",
      headers: bearer(aliceToken),
      payload: { roundId: openRound.id, picks: validPicks() },
    });
    expect(put.statusCode).toBe(409);

    const unlock = await app.inject({
      method: "POST",
      url: `/admin/rounds/${openRound.id}/unlock`,
      headers: bearer(adminToken),
    });
    expect(unlock.statusCode).toBe(200);
    expect(unlock.json().status).toBe("upcoming");
  });

  it("reports sync health", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/sync-health",
      headers: bearer(adminToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.apiRequestsToday).toBe("number");
    expect(body.lastStatUpdateAt).not.toBeNull(); // stat correction above
    expect(body.lastFixtureUpdateAt).not.toBeNull();
  });
});

describe("my round points (GET /me/squad/points)", () => {
  it("computes per-pick breakdowns, captain doubling and totals", async () => {
    // The admin stat-correction test above left def[0] with 90 min + 1 goal
    // (DEF: 2 + 6 = 8). Give the captain (fwd[0]) a stat line too:
    // FWD 90 min + 1 goal = 2 + 4 = 6, doubled to 12 as captain.
    await db.insert(playerFixtureStats).values({
      playerId: fwd[0]!.id,
      fixtureId: fixture.id,
      minutes: 90,
      goals: 1,
    });

    const res = await app.inject({
      method: "GET",
      url: `/me/squad/points?roundId=${openRound.id}`,
      headers: bearer(aliceToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.roundId).toBe(openRound.id);
    expect(body.finalized).toBe(false);
    expect(body.picks).toHaveLength(15);
    expect(body.transferPenalty).toBe(0); // Alice's transfer was free
    expect(body.captainPlayerId).toBe(fwd[0]!.id);
    expect(body.totalPoints).toBe(20); // def[0] 8 + captain 6x2

    const captain = body.picks.find(
      (p: { playerId: number }) => p.playerId === fwd[0]!.id,
    );
    expect(captain.isCaptain).toBe(true);
    expect(captain.basePoints).toBe(6);
    expect(captain.multiplier).toBe(2);
    expect(captain.points).toBe(12);
    expect(captain.isStarter).toBe(true);
    expect(captain.stats.minutes).toBe(90);
    expect(captain.stats.goals).toBe(1);

    const defender = body.picks.find(
      (p: { playerId: number }) => p.playerId === def[0]!.id,
    );
    expect(defender.points).toBe(8);
    expect(defender.multiplier).toBe(1);
    expect(defender.breakdown).toEqual([
      { rule: "minutes", value: 90, points: 2 },
      { rule: "goals", value: 1, points: 6 },
    ]);

    // A pick with no stat line reports "did not play".
    const benchGk = body.picks.find(
      (p: { playerId: number }) => p.playerId === gk[1]!.id,
    );
    expect(benchGk.stats).toBeNull();
    expect(benchGk.points).toBe(0);
    expect(benchGk.isStarter).toBe(false);
  });

  it("defaults to the current round when roundId is omitted", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/me/squad/points",
      headers: bearer(aliceToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().roundId).toBe(openRound.id);
  });

  it("404s for an unknown round and for users without a squad", async () => {
    const badRound = await app.inject({
      method: "GET",
      url: "/me/squad/points?roundId=999999999",
      headers: bearer(aliceToken),
    });
    expect(badRound.statusCode).toBe(404);
    expect(badRound.json().error.code).toBe("round.notFound");

    const noSquad = await app.inject({
      method: "GET",
      url: `/me/squad/points?roundId=${openRound.id}`,
      headers: bearer(carolToken),
    });
    expect(noSquad.statusCode).toBe(404);
    expect(noSquad.json().error.code).toBe("squad.notFound");
  });
});

describe("SSE /live", () => {
  it("forwards Postgres NOTIFY live_scores payloads and heartbeats", async () => {
    await app.listen({ port: 0, host: "127.0.0.1" });
    const { port } = app.server.address() as AddressInfo;

    const controller = new AbortController();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/live`, {
        signal: controller.signal,
        headers: { accept: "text/event-stream" },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const readUntil = async (marker: string): Promise<void> => {
        while (!buffer.includes(marker)) {
          const { value, done } = await reader.read();
          if (done) throw new Error(`stream ended before "${marker}"`);
          buffer += decoder.decode(value, { stream: true });
        }
      };

      // ": connected" is only sent after LISTEN is active — safe to NOTIFY.
      await readUntil(": connected");
      await app.db.$client.query(
        `select pg_notify('live_scores', '{"fixtureId":123,"homeGoals":1}')`,
      );
      await readUntil("event: live_scores");
      expect(buffer).toContain('data: {"fixtureId":123,"homeGoals":1}');
    } finally {
      controller.abort();
    }
  });
});
