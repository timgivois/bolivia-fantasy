import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export * from "./schema/index.js";
export { schema };

export type Database = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export const DEFAULT_DATABASE_URL =
  "postgres://bolivia_fantasy:bolivia_fantasy@localhost:5432/bolivia_fantasy";

/**
 * Creates a Drizzle database client backed by a node-postgres Pool.
 * The pool is exposed as `db.$client` (e.g. for graceful shutdown via
 * `db.$client.end()`).
 */
export function createDb(connectionString: string): Database {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}

// Inferred row types (select) and insert types.
export type User = typeof schema.users.$inferSelect;
export type NewUser = typeof schema.users.$inferInsert;

export type Club = typeof schema.clubs.$inferSelect;
export type NewClub = typeof schema.clubs.$inferInsert;

export type Player = typeof schema.players.$inferSelect;
export type NewPlayer = typeof schema.players.$inferInsert;

export type Round = typeof schema.rounds.$inferSelect;
export type NewRound = typeof schema.rounds.$inferInsert;

export type Fixture = typeof schema.fixtures.$inferSelect;
export type NewFixture = typeof schema.fixtures.$inferInsert;

export type PlayerFixtureStat = typeof schema.playerFixtureStats.$inferSelect;
export type NewPlayerFixtureStat =
  typeof schema.playerFixtureStats.$inferInsert;

export type FantasySquad = typeof schema.fantasySquads.$inferSelect;
export type NewFantasySquad = typeof schema.fantasySquads.$inferInsert;

export type SquadPick = typeof schema.squadPicks.$inferSelect;
export type NewSquadPick = typeof schema.squadPicks.$inferInsert;

export type Transfer = typeof schema.transfers.$inferSelect;
export type NewTransfer = typeof schema.transfers.$inferInsert;

export type MiniLeague = typeof schema.miniLeagues.$inferSelect;
export type NewMiniLeague = typeof schema.miniLeagues.$inferInsert;

export type MiniLeagueMember = typeof schema.miniLeagueMembers.$inferSelect;
export type NewMiniLeagueMember = typeof schema.miniLeagueMembers.$inferInsert;

export type RoundScore = typeof schema.roundScores.$inferSelect;
export type NewRoundScore = typeof schema.roundScores.$inferInsert;

export type ApiRequestLogEntry = typeof schema.apiRequestLog.$inferSelect;
export type NewApiRequestLogEntry = typeof schema.apiRequestLog.$inferInsert;

// Enum value union types.
export type UserRole = (typeof schema.userRoleEnum.enumValues)[number];
export type PlayerPosition = (typeof schema.playerPositionEnum.enumValues)[number];
export type RoundPhase = (typeof schema.roundPhaseEnum.enumValues)[number];
export type RoundStatus = (typeof schema.roundStatusEnum.enumValues)[number];
