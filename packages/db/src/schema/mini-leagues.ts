import {
  pgTable,
  integer,
  uuid,
  text,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const miniLeagues = pgTable("mini_leagues", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  inviteCode: varchar("invite_code", { length: 8 }).notNull().unique(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const miniLeagueMembers = pgTable(
  "mini_league_members",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    leagueId: integer("league_id")
      .notNull()
      .references(() => miniLeagues.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("mini_league_members_league_user_unique").on(
      table.leagueId,
      table.userId,
    ),
    index("mini_league_members_user_id_idx").on(table.userId),
  ],
);
