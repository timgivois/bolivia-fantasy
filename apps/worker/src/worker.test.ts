/**
 * Integration tests: real local Postgres (migrated + seeded, see
 * docker-compose.yml) + fake fetch serving the recorded API-Football
 * samples in src/test/fixtures. No real network calls are ever made.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  clubs,
  fantasySquads,
  fixtures,
  playerFixtureStats,
  players,
  roundScores,
  rounds,
} from "@bolivia-fantasy/db";
import { BudgetExceededError, RequestBudget } from "./budget.js";
import { ApiFootballClient, ApiFootballError } from "./client.js";
import { runDailySync } from "./jobs/daily-sync.js";
import {
  runMatchWindowPoll,
  type LiveScorePayload,
} from "./jobs/match-window.js";
import { runPostMatch } from "./jobs/post-match.js";
import {
  envelope,
  fakeFetch,
  forbiddenFetch,
  loadFixture,
  resetDb,
  seedMatchScenario,
  testDb,
  type MatchScenario,
} from "./test/helpers.js";

const db = testDb();

afterAll(async () => {
  await resetDb(db);
  await db.$client.end();
});

function testClient(fetchImpl: typeof fetch): ApiFootballClient {
  // No sleeping in tests: fake clock jumps past the sliding window.
  let clock = 0;
  return new ApiFootballClient({
    apiKey: "test-key",
    fetchImpl,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
}

/** Routes shared by the post-match tests. */
function postMatchRoutes() {
  return {
    "/fixtures/players": (url: URL) =>
      loadFixture(`fixture-players-${url.searchParams.get("fixture")}.json`),
    "/fixtures/events": (url: URL) =>
      loadFixture(`events-${url.searchParams.get("fixture")}.json`),
  };
}

describe("RequestBudget", () => {
  beforeEach(async () => {
    await resetDb(db);
  });

  it("increments a persistent daily counter", async () => {
    const budget = new RequestBudget(db);
    expect(await budget.consume("/status")).toBe(1);
    expect(await budget.consume("/leagues")).toBe(2);
    // A second instance sees the same persisted counter.
    const other = new RequestBudget(db);
    expect(await other.used()).toBe(2);
    expect(await other.remaining()).toBe(budget.dailyLimit - 2);
  });

  it("hard-stops at the limit without incrementing further", async () => {
    const budget = new RequestBudget(db, 3);
    await budget.consume("/a");
    await budget.consume("/b");
    await budget.consume("/c");
    await expect(budget.consume("/d")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(await budget.used()).toBe(3);
    expect(await budget.remaining()).toBe(0);
  });
});

describe("ApiFootballClient", () => {
  it("charges the budget before fetching and stops when exhausted", async () => {
    const order: string[] = [];
    let allowed = 1;
    const budget = {
      consume: async (endpoint: string) => {
        if (allowed === 0) throw new BudgetExceededError(1, endpoint);
        allowed -= 1;
        order.push(`budget:${endpoint}`);
        return 1;
      },
    };
    const fetchImpl = fakeFetch({
      "/status": () => {
        order.push("fetch:/status");
        return envelope("status", [{ ok: true }]);
      },
    });
    const client = new ApiFootballClient({
      apiKey: "test-key",
      fetchImpl,
      budget,
      sleep: async () => {},
    });

    await client.get("/status");
    expect(order).toEqual(["budget:/status", "fetch:/status"]);
    // Budget exhausted: the request never reaches fetch.
    await expect(client.get("/status")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(order).toHaveLength(2);
  });

  it("throws ApiFootballError on the 200-with-errors convention", async () => {
    const fetchImpl = fakeFetch({
      "/leagues": () => ({
        get: "leagues",
        parameters: {},
        errors: { token: "Error/Missing application key." },
        results: 0,
        paging: { current: 1, total: 1 },
        response: [],
      }),
    });
    const client = testClient(fetchImpl);
    await expect(client.get("/leagues")).rejects.toBeInstanceOf(
      ApiFootballError,
    );
  });

  it("throttles to the per-minute sliding window", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const fetchImpl = fakeFetch({
      "/status": () => envelope("status", [{ ok: true }]),
    });
    const client = new ApiFootballClient({
      apiKey: "test-key",
      fetchImpl,
      maxRequestsPerMinute: 3,
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });

    for (let i = 0; i < 3; i += 1) await client.get("/status");
    expect(sleeps).toHaveLength(0); // window not yet full
    await client.get("/status"); // 4th must wait for the window to slide
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps[0]).toBeGreaterThan(0);
    expect(sleeps[0]).toBeLessThanOrEqual(60_000);
  });
});

describe("runDailySync", () => {
  beforeEach(async () => {
    await resetDb(db);
  });

  function dailyRoutes() {
    return {
      "/teams": () => loadFixture("teams.json"),
      "/players": (url: URL) =>
        loadFixture(`players-page-${url.searchParams.get("page") ?? "1"}.json`),
      "/fixtures/rounds": () => loadFixture("fixtures-rounds.json"),
      "/fixtures": () => loadFixture("fixtures-list.json"),
    };
  }

  it("backfills club ids, upserts players, rounds and fixtures", async () => {
    const calls: string[] = [];
    const client = testClient(fakeFetch(dailyRoutes(), calls));
    const summary = await runDailySync({
      db,
      client,
      season: 2026,
      log: () => {},
    });

    // Bolívar..Aurora matched by (fuzzy) name; "Deportivo Fantasma" has no
    // counterpart among the 16 seeded clubs.
    expect(summary.clubsBackfilled).toBe(6);
    const [bolivar] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.name, "Bolívar"));
    expect(bolivar?.apiFootballId).toBe(5001);
    const [alwaysReady] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.name, "Always Ready"));
    expect(alwaysReady?.apiFootballId).toBe(5003); // "Club Always Ready"

    // 8 real players over 2 pages; "Joven Promesa" has no position -> skipped.
    expect(summary.playersUpserted).toBe(8);
    expect(summary.playersSkipped).toBe(1);
    const playerRows = await db.select().from(players);
    expect(playerRows).toHaveLength(8);
    const vaca = playerRows.find((p) => p.name === "Ramiro Vaca");
    expect(vaca?.position).toBe("MID");

    // 3 API rounds -> Apertura 1/2, Clausura 1; 3 fixtures, none skipped.
    expect(summary.roundsUpserted).toBe(3);
    expect(summary.fixturesUpserted).toBe(3);
    expect(summary.fixturesSkipped).toBe(0);
    const roundRows = await db.select().from(rounds);
    expect(roundRows).toHaveLength(3);
    const apertura1 = roundRows.find(
      (r) => r.phase === "apertura" && r.roundNumber === 1,
    );
    // lockAt = earliest kickoff of the round (fixture 9101).
    expect(apertura1?.lockAt?.toISOString()).toBe("2026-07-04T20:00:00.000Z");
  });

  it("is idempotent across reruns", async () => {
    const client = () => testClient(fakeFetch(dailyRoutes()));
    await runDailySync({ db, client: client(), season: 2026, log: () => {} });
    await runDailySync({ db, client: client(), season: 2026, log: () => {} });
    expect(await db.select().from(players)).toHaveLength(8);
    expect(await db.select().from(rounds)).toHaveLength(3);
    expect(await db.select().from(fixtures)).toHaveLength(3);
  });
});

describe("runMatchWindowPoll", () => {
  let scenario: MatchScenario;

  beforeEach(async () => {
    await resetDb(db);
    scenario = await seedMatchScenario(db);
  });

  it("makes zero API calls when no fixture is near the window", async () => {
    // Push both fixtures far outside [now-3h, now+15min].
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.update(fixtures).set({ kickoffAt: nextWeek });
    const summary = await runMatchWindowPoll({
      db,
      client: testClient(forbiddenFetch()),
      enqueuePostMatch: async () => {
        throw new Error("must not enqueue");
      },
      notify: async () => {},
      log: () => {},
    });
    expect(summary).toEqual({
      polled: false,
      candidates: 0,
      liveFixtures: 0,
      finishedFixtures: [],
    });
  });

  it("writes provisional stats and notifies while fixtures are live", async () => {
    const notifications: LiveScorePayload[] = [];
    const enqueued: number[] = [];
    const client = testClient(
      fakeFetch({
        "/fixtures": () => loadFixture("fixtures-live.json"),
        "/fixtures/events": (url) =>
          loadFixture(`events-${url.searchParams.get("fixture")}-live.json`),
      }),
    );

    const summary = await runMatchWindowPoll({
      db,
      client,
      enqueuePostMatch: async (id) => {
        enqueued.push(id);
      },
      notify: async (payload) => {
        notifications.push(payload);
      },
      log: () => {},
    });

    expect(summary.polled).toBe(true);
    expect(summary.candidates).toBe(2);
    expect(summary.liveFixtures).toBe(2);
    expect(summary.finishedFixtures).toEqual([]);
    expect(enqueued).toEqual([]);
    expect(notifications).toHaveLength(2);
    const forA = notifications.find(
      (n) => n.fixtureId === scenario.fixtureAId,
    );
    expect(forA).toMatchObject({ status: "2H", homeGoals: 2, awayGoals: 0 });

    // First live poll flips the round to `live`.
    const [round] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, scenario.roundId));
    expect(round?.status).toBe("live");

    // Haquin (60002): live goal + yellow from the event stream.
    const haquinId = scenario.playerIdsByApi.get(60002) as number;
    const [haquin] = await db
      .select()
      .from(playerFixtureStats)
      .where(
        and(
          eq(playerFixtureStats.playerId, haquinId),
          eq(playerFixtureStats.fixtureId, scenario.fixtureAId),
        ),
      );
    expect(haquin).toMatchObject({ goals: 1, yellowCards: 1 });
  });

  it("queues post-match exactly once when fixtures reach full time", async () => {
    const enqueued: number[] = [];
    const ctx = {
      db,
      client: testClient(
        fakeFetch({
          "/fixtures": () => loadFixture("fixtures-ft.json"),
          "/fixtures/events": (url: URL) =>
            loadFixture(`events-${url.searchParams.get("fixture")}-live.json`),
        }),
      ),
      enqueuePostMatch: async (id: number) => {
        enqueued.push(id);
      },
      notify: async () => {},
      log: () => {},
    };

    const summary = await runMatchWindowPoll(ctx);
    expect(summary.finishedFixtures.sort()).toEqual(
      [scenario.fixtureAId, scenario.fixtureBId].sort(),
    );
    expect(enqueued).toHaveLength(2);

    const [fixtureA] = await db
      .select()
      .from(fixtures)
      .where(eq(fixtures.id, scenario.fixtureAId));
    expect(fixtureA).toMatchObject({ status: "FT", homeGoals: 2, awayGoals: 0 });

    // Second poll: fixtures already FT -> excluded from the window query.
    const again = await runMatchWindowPoll({
      ...ctx,
      client: testClient(forbiddenFetch()),
    });
    expect(again.polled).toBe(false);
    expect(enqueued).toHaveLength(2);
  });
});

describe("runPostMatch", () => {
  let scenario: MatchScenario;

  beforeEach(async () => {
    await resetDb(db);
    scenario = await seedMatchScenario(db);
  });

  function ctx() {
    return {
      db,
      client: testClient(fakeFetch(postMatchRoutes())),
      log: () => {},
    };
  }

  it("upserts authoritative stats; no finalization while the round is unfinished", async () => {
    const summary = await runPostMatch(ctx(), scenario.fixtureAId);

    expect(summary).toMatchObject({
      homeGoals: 2,
      awayGoals: 0,
      statLinesUpserted: 5, // 60010 Bruno Sávio is not in our players table
      statLinesSkipped: 1,
      roundFinalized: false,
      squadsScored: 0,
    });

    const statFor = async (apiId: number) => {
      const playerId = scenario.playerIdsByApi.get(apiId) as number;
      const [row] = await db
        .select()
        .from(playerFixtureStats)
        .where(
          and(
            eq(playerFixtureStats.playerId, playerId),
            eq(playerFixtureStats.fixtureId, scenario.fixtureAId),
          ),
        );
      return row;
    };

    // Lampe: full house GK line.
    expect(await statFor(60001)).toMatchObject({
      minutes: 90,
      saves: 4,
      cleanSheet: true,
      goalsConceded: 0,
    });
    // Vaca: subbed off at 75' with two assists.
    expect(await statFor(60003)).toMatchObject({ minutes: 75, assists: 2 });
    // Ríos: API second-yellow (yellow=2, red=1) is normalized for the
    // scoring engine to yellow=1 + red=1.
    expect(await statFor(60011)).toMatchObject({ yellowCards: 1, redCards: 1 });
  });

  it("finalizes the round after the last fixture and is idempotent", async () => {
    await runPostMatch(ctx(), scenario.fixtureAId);
    const summary = await runPostMatch(ctx(), scenario.fixtureBId);

    expect(summary).toMatchObject({
      homeGoals: 2,
      awayGoals: 1,
      roundFinalized: true,
      squadsScored: 1,
    });

    // Álvarez: own goal only exists in the event stream; conceded 2, no CS.
    const alvarezId = scenario.playerIdsByApi.get(60007) as number;
    const [alvarez] = await db
      .select()
      .from(playerFixtureStats)
      .where(eq(playerFixtureStats.playerId, alvarezId));
    expect(alvarez).toMatchObject({
      ownGoals: 1,
      goalsConceded: 2,
      cleanSheet: false,
    });

    // Hand-computed squad total (see src/test/helpers.ts for the picks):
    //   Lampe   GK (C): 2 app + 4 CS + 1 (4 saves)         =  7 ×2 = 14
    //   Haquin  DEF   : 2 app + 6 goal + 4 CS - 1 yellow   = 11
    //   Vaca    MID   : 2 app + 6 (2 assists) + 1 CS       =  9
    //   Triverio FWD  : 2 app - 1 yellow                    =  1
    //   Riquelme FWD  : 2 app + 4 goal - 2 pen missed       =  4
    //   bench García  : did not play                        =  0
    //   XI 39 - 4 transfer penalty                          = 35
    const [score] = await db
      .select()
      .from(roundScores)
      .where(eq(roundScores.squadId, scenario.squadId));
    expect(score).toMatchObject({
      points: 35,
      transferPenalty: 4,
      benchPoints: 0,
      finalized: true,
    });
    const [squad] = await db
      .select()
      .from(fantasySquads)
      .where(eq(fantasySquads.id, scenario.squadId));
    expect(squad?.totalPoints).toBe(35);
    const [round] = await db
      .select()
      .from(rounds)
      .where(eq(rounds.id, scenario.roundId));
    expect(round?.status).toBe("finalized");

    // Re-running the last fixture must not double-count anything.
    await runPostMatch(ctx(), scenario.fixtureBId);
    const [squadAgain] = await db
      .select()
      .from(fantasySquads)
      .where(eq(fantasySquads.id, scenario.squadId));
    expect(squadAgain?.totalPoints).toBe(35);
    const scores = await db
      .select()
      .from(roundScores)
      .where(eq(roundScores.squadId, scenario.squadId));
    expect(scores).toHaveLength(1);
    expect(scores[0]?.points).toBe(35);
  });
});
