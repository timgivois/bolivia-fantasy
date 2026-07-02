/**
 * Daily API-Football request budgeter.
 *
 * Persists a per-day counter in the `api_request_log` table (one row per
 * day, see the schema comment in packages/db). The increment is a single
 * atomic upsert guarded by `request_count < limit`, so concurrent workers
 * can never push the counter past the limit: when the guard fails no row
 * is returned and BudgetExceededError is thrown BEFORE any HTTP request
 * is made.
 *
 * The hard stop is 95/day, leaving 5 requests of the free tier's 100 as
 * headroom for manual debugging.
 */

import { sql } from "drizzle-orm";
import type { Database } from "@bolivia-fantasy/db";

export const DAILY_REQUEST_LIMIT = 95;

export class BudgetExceededError extends Error {
  override readonly name = "BudgetExceededError";
  constructor(
    readonly limit: number,
    readonly endpoint: string,
  ) {
    super(
      `Daily API-Football request budget of ${limit} exhausted (attempted: ${endpoint})`,
    );
  }
}

export class RequestBudget {
  constructor(
    private readonly db: Database,
    private readonly limit: number = DAILY_REQUEST_LIMIT,
  ) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(`Invalid daily request limit: ${limit}`);
    }
  }

  get dailyLimit(): number {
    return this.limit;
  }

  /**
   * Consume one request from today's budget. Returns the new counter value
   * (1-based). Throws BudgetExceededError when the budget is exhausted —
   * in that case the counter is NOT incremented.
   */
  async consume(endpoint: string): Promise<number> {
    const result = await this.db.execute(sql`
      INSERT INTO api_request_log (date, endpoint, request_count)
      VALUES (CURRENT_DATE, ${endpoint}, 1)
      ON CONFLICT (date) DO UPDATE
        SET request_count = api_request_log.request_count + 1,
            endpoint = EXCLUDED.endpoint,
            updated_at = now()
        WHERE api_request_log.request_count < ${this.limit}
      RETURNING request_count
    `);
    const row = result.rows[0] as { request_count: number } | undefined;
    if (!row) throw new BudgetExceededError(this.limit, endpoint);
    return Number(row.request_count);
  }

  /** Requests already consumed today. */
  async used(): Promise<number> {
    const result = await this.db.execute(sql`
      SELECT request_count FROM api_request_log WHERE date = CURRENT_DATE
    `);
    const row = result.rows[0] as { request_count: number } | undefined;
    return row ? Number(row.request_count) : 0;
  }

  /** Requests still available today. */
  async remaining(): Promise<number> {
    return Math.max(this.limit - (await this.used()), 0);
  }
}
