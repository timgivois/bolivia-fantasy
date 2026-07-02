import {
  pgTable,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { rounds } from "./rounds.js";
import { clubs } from "./clubs.js";

export const fixtures = pgTable(
  "fixtures",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    apiFootballId: integer("api_football_id").notNull().unique(),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    homeClubId: integer("home_club_id")
      .notNull()
      .references(() => clubs.id),
    awayClubId: integer("away_club_id")
      .notNull()
      .references(() => clubs.id),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }).notNull(),
    /** API-Football short status: NS/1H/HT/2H/FT/AET/PEN/PST/CANC/... */
    status: text("status").notNull().default("NS"),
    homeGoals: integer("home_goals"),
    awayGoals: integer("away_goals"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("fixtures_round_id_idx").on(table.roundId),
    index("fixtures_home_club_id_idx").on(table.homeClubId),
    index("fixtures_away_club_id_idx").on(table.awayClubId),
    index("fixtures_kickoff_at_idx").on(table.kickoffAt),
  ],
);
