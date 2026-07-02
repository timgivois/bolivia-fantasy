import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  uuid,
  text,
  numeric,
  boolean,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";
import { rounds } from "./rounds.js";
import { players } from "./players.js";

/** One fantasy squad per user (userId is unique). */
export const fantasySquads = pgTable("fantasy_squads", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Remaining budget in millions of Bs. */
  budget: numeric("budget", { precision: 6, scale: 1, mode: "number" })
    .notNull()
    .default(100.0),
  totalPoints: integer("total_points").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const squadPicks = pgTable(
  "squad_picks",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    squadId: integer("squad_id")
      .notNull()
      .references(() => fantasySquads.id, { onDelete: "cascade" }),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id),
    /** 1-11 = starting XI slot, 12-15 = bench order. */
    position: integer("position").notNull(),
    isCaptain: boolean("is_captain").notNull().default(false),
    isViceCaptain: boolean("is_vice_captain").notNull().default(false),
    /** Price paid when the player was bought, in millions of Bs. */
    purchasePrice: numeric("purchase_price", {
      precision: 5,
      scale: 1,
      mode: "number",
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("squad_picks_squad_round_player_unique").on(
      table.squadId,
      table.roundId,
      table.playerId,
    ),
    index("squad_picks_squad_round_idx").on(table.squadId, table.roundId),
    index("squad_picks_round_id_idx").on(table.roundId),
    index("squad_picks_player_id_idx").on(table.playerId),
    check(
      "squad_picks_position_range",
      sql`${table.position} BETWEEN 1 AND 15`,
    ),
  ],
);

export const transfers = pgTable(
  "transfers",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    squadId: integer("squad_id")
      .notNull()
      .references(() => fantasySquads.id, { onDelete: "cascade" }),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    playerOutId: integer("player_out_id")
      .notNull()
      .references(() => players.id),
    playerInId: integer("player_in_id")
      .notNull()
      .references(() => players.id),
    /** Points deducted for this transfer (0 when a free transfer is used). */
    pointsCost: integer("points_cost").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("transfers_squad_round_idx").on(table.squadId, table.roundId),
    index("transfers_round_id_idx").on(table.roundId),
  ],
);

export const roundScores = pgTable(
  "round_scores",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    squadId: integer("squad_id")
      .notNull()
      .references(() => fantasySquads.id, { onDelete: "cascade" }),
    roundId: integer("round_id")
      .notNull()
      .references(() => rounds.id, { onDelete: "cascade" }),
    points: integer("points").notNull().default(0),
    transferPenalty: integer("transfer_penalty").notNull().default(0),
    benchPoints: integer("bench_points").notNull().default(0),
    finalized: boolean("finalized").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("round_scores_squad_round_unique").on(
      table.squadId,
      table.roundId,
    ),
    index("round_scores_round_id_idx").on(table.roundId),
  ],
);
