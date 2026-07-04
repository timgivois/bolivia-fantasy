import {
  pgTable,
  pgEnum,
  integer,
  text,
  numeric,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { clubs } from "./clubs.js";

export const playerPositionEnum = pgEnum("player_position", [
  "GK",
  "DEF",
  "MID",
  "FWD",
]);

export const players = pgTable(
  "players",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    apiFootballId: integer("api_football_id").unique(),
    /** Nullable: a player can be temporarily without a club (free agent). */
    clubId: integer("club_id").references(() => clubs.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    position: playerPositionEnum("position").notNull(),
    /** Fantasy price in millions of Bs, e.g. 5.5 = 5.5M Bs. */
    price: numeric("price", { precision: 5, scale: 1, mode: "number" }).notNull(),
    photoUrl: text("photo_url"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("players_club_id_idx").on(table.clubId)],
);
