/**
 * Test helpers: real local Postgres + fake fetch with recorded
 * API-Football response fixtures (the sandbox blocks the real API).
 */

import { readFileSync } from "node:fs";
import {
  clubs,
  createDb,
  DEFAULT_DATABASE_URL,
  fantasySquads,
  fixtures,
  playerFixtureStats,
  players,
  roundScores,
  rounds,
  squadPicks,
  transfers,
  users,
  type Database,
} from "@bolivia-fantasy/db";
import { eq, sql } from "drizzle-orm";
import type { ApiEnvelope } from "../client.js";

export function testDb(): Database {
  return createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
}

/** Load a recorded API-Football response sample from src/test/fixtures. */
export function loadFixture<T = unknown>(name: string): T {
  const url = new URL(`./fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

export function envelope<T>(
  get: string,
  response: T[],
  paging: { current: number; total: number } = { current: 1, total: 1 },
): ApiEnvelope<T> {
  return {
    get,
    parameters: {},
    errors: [],
    results: response.length,
    paging,
    response,
  };
}

export type FakeRoute = (url: URL) => unknown;

/**
 * Build a fake `fetch` from a pathname -> handler map. Every call is
 * recorded (pathname + search) into `calls` when provided. Unrouted
 * paths throw so tests never silently hit an unexpected endpoint.
 */
export function fakeFetch(
  routes: Record<string, FakeRoute>,
  calls?: string[],
): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL
        ? String(input)
        : input.url,
    );
    calls?.push(url.pathname + url.search);
    const route = routes[url.pathname];
    if (!route) throw new Error(`fakeFetch: no route for ${url.pathname}`);
    return new Response(JSON.stringify(route(url)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

/** A fetch that fails the test if it is ever invoked. */
export function forbiddenFetch(): typeof fetch {
  return (async () => {
    throw new Error("fetch must not be called in this scenario");
  }) as typeof fetch;
}

/**
 * Wipe every worker-touched table (the 16 seeded clubs are kept; only
 * their backfilled api_football_id is reset).
 */
export async function resetDb(db: Database): Promise<void> {
  await db.delete(playerFixtureStats);
  await db.delete(roundScores);
  await db.delete(squadPicks);
  await db.delete(transfers);
  await db.delete(fixtures);
  await db.delete(fantasySquads);
  await db.delete(users);
  await db.delete(rounds);
  await db.delete(players);
  await db.execute(sql`DELETE FROM api_request_log`);
  await db.update(clubs).set({ apiFootballId: null });
}

export interface MatchScenario {
  roundId: number;
  fixtureAId: number;
  fixtureBId: number;
  squadId: number;
  /** players.id keyed by API-Football player id. */
  playerIdsByApi: Map<number, number>;
}

/**
 * Seed the post-match/live-poll scenario against the REAL local Postgres:
 * - clubs 1..4 get API ids 5001..5004
 * - one locked round with two fixtures (api 9101: Bolívar v The Strongest,
 *   api 9102: Always Ready v Blooming), both kicked off 2h ago, in play
 * - 8 players with API ids (see src/test/fixtures/*.json)
 * - one user + squad with 5 starters, 1 bench pick and a 4-point transfer
 */
export async function seedMatchScenario(db: Database): Promise<MatchScenario> {
  const now = Date.now();
  const kickoff = new Date(now - 2 * 60 * 60 * 1000);

  const seededClubs = await db.select().from(clubs).orderBy(clubs.id);
  const [bolivar, strongest, alwaysReady, blooming] = seededClubs;
  if (!bolivar || !strongest || !alwaysReady || !blooming) {
    throw new Error("expected the 16 seeded clubs in the local database");
  }
  const clubApiIds: Array<[number, number]> = [
    [bolivar.id, 5001],
    [strongest.id, 5002],
    [alwaysReady.id, 5003],
    [blooming.id, 5004],
  ];
  for (const [id, apiId] of clubApiIds) {
    await db.update(clubs).set({ apiFootballId: apiId }).where(eq(clubs.id, id));
  }

  const [round] = await db
    .insert(rounds)
    .values({
      season: 2026,
      name: "Fecha 1 — Apertura",
      phase: "apertura",
      roundNumber: 1,
      lockAt: kickoff,
      status: "locked",
    })
    .returning();
  if (!round) throw new Error("failed to insert round");

  const [fixtureA] = await db
    .insert(fixtures)
    .values({
      apiFootballId: 9101,
      roundId: round.id,
      homeClubId: bolivar.id,
      awayClubId: strongest.id,
      kickoffAt: kickoff,
      status: "2H",
    })
    .returning();
  const [fixtureB] = await db
    .insert(fixtures)
    .values({
      apiFootballId: 9102,
      roundId: round.id,
      homeClubId: alwaysReady.id,
      awayClubId: blooming.id,
      kickoffAt: kickoff,
      status: "2H",
    })
    .returning();
  if (!fixtureA || !fixtureB) throw new Error("failed to insert fixtures");

  const playerSeed = [
    { api: 60001, name: "Carlos Lampe", position: "GK", clubId: bolivar.id, price: 5.5 },
    { api: 60002, name: "Luis Haquin", position: "DEF", clubId: bolivar.id, price: 5.0 },
    { api: 60003, name: "Ramiro Vaca", position: "MID", clubId: bolivar.id, price: 6.0 },
    { api: 60004, name: "Enrique Triverio", position: "FWD", clubId: strongest.id, price: 6.5 },
    { api: 60005, name: "Marcos Riquelme", position: "FWD", clubId: alwaysReady.id, price: 6.0 },
    { api: 60006, name: "Jhon García", position: "MID", clubId: blooming.id, price: 4.5 },
    { api: 60007, name: "Pedro Álvarez", position: "DEF", clubId: blooming.id, price: 4.5 },
    { api: 60011, name: "Marcos Ríos", position: "DEF", clubId: strongest.id, price: 4.5 },
  ] as const;

  const playerIdsByApi = new Map<number, number>();
  for (const p of playerSeed) {
    const [row] = await db
      .insert(players)
      .values({
        apiFootballId: p.api,
        name: p.name,
        position: p.position,
        price: p.price,
        clubId: p.clubId,
      })
      .returning();
    if (!row) throw new Error(`failed to insert player ${p.name}`);
    playerIdsByApi.set(p.api, row.id);
  }

  const [user] = await db
    .insert(users)
    .values({ email: "test-worker@example.com", name: "Test Manager" })
    .returning();
  if (!user) throw new Error("failed to insert user");
  const [squad] = await db
    .insert(fantasySquads)
    .values({ userId: user.id, name: "Los Tigres del Sur" })
    .returning();
  if (!squad) throw new Error("failed to insert squad");

  const pick = (api: number, position: number, extra: Partial<{ isCaptain: boolean; isViceCaptain: boolean }> = {}) => ({
    squadId: squad.id,
    roundId: round.id,
    playerId: playerIdsByApi.get(api) as number,
    position,
    purchasePrice: 5.0,
    isCaptain: extra.isCaptain ?? false,
    isViceCaptain: extra.isViceCaptain ?? false,
  });
  await db.insert(squadPicks).values([
    pick(60001, 1, { isCaptain: true }), // Lampe GK (C)
    pick(60002, 2), // Haquin DEF
    pick(60003, 3, { isViceCaptain: true }), // Vaca MID (VC)
    pick(60004, 4), // Triverio FWD
    pick(60005, 5), // Riquelme FWD
    pick(60006, 12), // García MID (bench, does not play)
  ]);

  await db.insert(transfers).values({
    squadId: squad.id,
    roundId: round.id,
    playerOutId: playerIdsByApi.get(60011) as number,
    playerInId: playerIdsByApi.get(60005) as number,
    pointsCost: 4,
  });

  return {
    roundId: round.id,
    fixtureAId: fixtureA.id,
    fixtureBId: fixtureB.id,
    squadId: squad.id,
    playerIdsByApi,
  };
}
