import { pgTable, integer, text, date, timestamp } from "drizzle-orm/pg-core";

/**
 * Daily API-Football request budget counter.
 *
 * Design choice: ONE ROW PER DAY (`date` is unique) holding the running total,
 * rather than per-call rows or per-(date, endpoint) rows. The ingestion worker
 * increments and reads today's total atomically in a single round trip:
 *
 *   INSERT INTO api_request_log (date, endpoint, request_count)
 *   VALUES (CURRENT_DATE, $1, 1)
 *   ON CONFLICT (date) DO UPDATE
 *     SET request_count = api_request_log.request_count + 1,
 *         endpoint = EXCLUDED.endpoint,
 *         updated_at = now()
 *   RETURNING request_count;
 *
 * The returned `request_count` is compared against the daily quota before the
 * next call. Reading today's total is a single unique-index lookup. `endpoint`
 * only records the most recent endpoint called (debugging aid); per-endpoint
 * breakdowns were deliberately traded away for the cheap atomic counter.
 */
export const apiRequestLog = pgTable("api_request_log", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  date: date("date").notNull().unique(),
  /** Last endpoint called that day (informational only). */
  endpoint: text("endpoint"),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
