import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";

export const clubs = pgTable("clubs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  /**
   * API-Football team id (league 344). Nullable so clubs can be seeded before
   * the ingestion worker backfills the id by name match; unique when present
   * (Postgres allows multiple NULLs in a unique column).
   */
  apiFootballId: integer("api_football_id").unique(),
  /** Unique so the seed can upsert idempotently by name. */
  name: text("name").notNull().unique(),
  shortName: text("short_name"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
