import {
  pgTable,
  pgEnum,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roundPhaseEnum = pgEnum("round_phase", ["apertura", "clausura"]);

export const roundStatusEnum = pgEnum("round_status", [
  "upcoming",
  "locked",
  "live",
  "finalized",
]);

export const rounds = pgTable(
  "rounds",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    /** Season year, e.g. 2026. */
    season: integer("season").notNull(),
    /** Display name, e.g. "Fecha 5 — Apertura". */
    name: text("name").notNull(),
    roundNumber: integer("round_number").notNull(),
    phase: roundPhaseEnum("phase").notNull(),
    /** First kickoff of the round; squads lock at this instant. */
    lockAt: timestamp("lock_at", { withTimezone: true }),
    status: roundStatusEnum("status").notNull().default("upcoming"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("rounds_season_phase_number_unique").on(
      table.season,
      table.phase,
      table.roundNumber,
    ),
  ],
);
