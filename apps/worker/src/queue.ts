/**
 * pg-boss setup: job queue over the same Postgres database
 * (pg-boss keeps its tables in its own "pgboss" schema).
 */

import { PgBoss } from "pg-boss";

export const QUEUES = {
  dailySync: "daily-sync",
  matchWindowPoll: "match-window-poll",
  postMatch: "post-match",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Payload of the post-match job: our internal fixtures.id. */
export interface PostMatchJobData {
  fixtureId: number;
}

export function createQueue(databaseUrl: string): PgBoss {
  return new PgBoss({ connectionString: databaseUrl });
}

/** Ensure every queue exists (idempotent; required by pg-boss >= 10). */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name);
  }
}
