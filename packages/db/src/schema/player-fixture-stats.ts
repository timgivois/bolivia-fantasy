import {
  pgTable,
  integer,
  boolean,
  numeric,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { players } from "./players.js";
import { fixtures } from "./fixtures.js";

export const playerFixtureStats = pgTable(
  "player_fixture_stats",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    fixtureId: integer("fixture_id")
      .notNull()
      .references(() => fixtures.id, { onDelete: "cascade" }),
    minutes: integer("minutes").notNull().default(0),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    cleanSheet: boolean("clean_sheet").notNull().default(false),
    goalsConceded: integer("goals_conceded").notNull().default(0),
    penaltiesSaved: integer("penalties_saved").notNull().default(0),
    penaltiesMissed: integer("penalties_missed").notNull().default(0),
    yellowCards: integer("yellow_cards").notNull().default(0),
    redCards: integer("red_cards").notNull().default(0),
    ownGoals: integer("own_goals").notNull().default(0),
    saves: integer("saves").notNull().default(0),
    /** API-Football match rating, e.g. 7.4; null when not rated. */
    rating: numeric("rating", { precision: 3, scale: 1, mode: "number" }),
    /** True when an admin manually overrode the synced stats. */
    isCorrection: boolean("is_correction").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("player_fixture_stats_player_fixture_unique").on(
      table.playerId,
      table.fixtureId,
    ),
    index("player_fixture_stats_player_id_idx").on(table.playerId),
    index("player_fixture_stats_fixture_id_idx").on(table.fixtureId),
  ],
);
