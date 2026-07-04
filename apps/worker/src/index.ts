/**
 * Fantasy Fútbol Bolivia — data-ingestion worker.
 *
 * Starts pg-boss over DATABASE_URL and registers:
 *  - daily-sync          cron 06:00 America/La_Paz (clubs/players/rounds/fixtures)
 *  - match-window-poller cron every POLL_INTERVAL_MIN minutes (default 12);
 *                        zero API calls when no fixture is near kickoff
 *  - post-match          queued per fixture at full time (stats + finalization)
 *
 * All API-Football traffic flows through the RequestBudget (hard stop at
 * 95 requests/day) and the client's 10 req/min throttle.
 */

import { createDb, DEFAULT_DATABASE_URL } from "@bolivia-fantasy/db";
import { ApiFootballClient } from "./client.js";
import { BudgetExceededError, RequestBudget } from "./budget.js";
import { createQueue, ensureQueues, QUEUES, type PostMatchJobData } from "./queue.js";
import { runDailySync } from "./jobs/daily-sync.js";
import { createPgNotifier, runMatchWindowPoll } from "./jobs/match-window.js";
import { runPostMatch } from "./jobs/post-match.js";

const TIMEZONE = "America/La_Paz";

function currentSeason(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: TIMEZONE }).format(
      new Date(),
    ),
  );
}

function pollIntervalMinutes(): number {
  const parsed = Number.parseInt(process.env.POLL_INTERVAL_MIN ?? "", 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 59) return parsed;
  return 12;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  if (!process.env.API_FOOTBALL_KEY) {
    console.warn(
      "[worker] API_FOOTBALL_KEY is not set — jobs will fail until it is configured",
    );
  }

  const db = createDb(databaseUrl);
  const budget = new RequestBudget(db);
  const client = new ApiFootballClient({ budget });
  const boss = createQueue(databaseUrl);

  boss.on("error", (error: unknown) =>
    console.error("[worker] pg-boss error:", error),
  );

  await boss.start();
  await ensureQueues(boss);
  console.log("[worker] pg-boss started");

  const logBudget = async (): Promise<void> => {
    console.log(`[worker] API budget remaining today: ${await budget.remaining()}`);
  };

  // --- daily-sync ----------------------------------------------------------
  await boss.schedule(QUEUES.dailySync, "0 6 * * *", {}, { tz: TIMEZONE });
  await boss.work(QUEUES.dailySync, async () => {
    console.log("[daily-sync] starting");
    try {
      await runDailySync({ db, client, season: currentSeason() });
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        console.warn(`[daily-sync] stopped: ${error.message}`);
        return;
      }
      throw error;
    } finally {
      await logBudget();
    }
  });

  // --- match-window-poller -------------------------------------------------
  const interval = pollIntervalMinutes();
  const notify = createPgNotifier(db);
  await boss.schedule(
    QUEUES.matchWindowPoll,
    `*/${interval} * * * *`,
    {},
    { tz: TIMEZONE },
  );
  await boss.work(QUEUES.matchWindowPoll, async () => {
    try {
      const summary = await runMatchWindowPoll({
        db,
        client,
        notify,
        enqueuePostMatch: (fixtureId) =>
          boss.send(QUEUES.postMatch, { fixtureId } satisfies PostMatchJobData),
      });
      if (summary.polled) {
        console.log(
          `[match-window] live=${summary.liveFixtures} finished=${summary.finishedFixtures.length}`,
        );
        await logBudget();
      }
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        console.warn(`[match-window] stopped: ${error.message}`);
        return;
      }
      throw error;
    }
  });
  console.log(`[worker] match-window poller every ${interval} min (${TIMEZONE})`);

  // --- post-match ----------------------------------------------------------
  await boss.work<PostMatchJobData>(QUEUES.postMatch, async (jobs) => {
    for (const job of jobs) {
      console.log(`[post-match] job ${job.id} for fixture ${job.data.fixtureId}`);
      await runPostMatch({ db, client }, job.data.fixtureId);
    }
    await logBudget();
  });

  // --- graceful shutdown ---------------------------------------------------
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] received ${signal}, shutting down gracefully`);
    try {
      await boss.stop({ graceful: true, timeout: 30_000 });
      await db.$client.end();
      console.log("[worker] shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[worker] error during shutdown:", error);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log("[worker] Fantasy Fútbol Bolivia worker started");
}

main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
