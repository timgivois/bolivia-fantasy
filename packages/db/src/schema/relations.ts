import { relations } from "drizzle-orm";
import { users } from "./users.js";
import { clubs } from "./clubs.js";
import { players } from "./players.js";
import { rounds } from "./rounds.js";
import { fixtures } from "./fixtures.js";
import { playerFixtureStats } from "./player-fixture-stats.js";
import {
  fantasySquads,
  squadPicks,
  transfers,
  roundScores,
} from "./fantasy.js";
import { miniLeagues, miniLeagueMembers } from "./mini-leagues.js";

export const usersRelations = relations(users, ({ one, many }) => ({
  squad: one(fantasySquads, {
    fields: [users.id],
    references: [fantasySquads.userId],
  }),
  ownedMiniLeagues: many(miniLeagues),
  miniLeagueMemberships: many(miniLeagueMembers),
}));

export const clubsRelations = relations(clubs, ({ many }) => ({
  players: many(players),
  homeFixtures: many(fixtures, { relationName: "homeClub" }),
  awayFixtures: many(fixtures, { relationName: "awayClub" }),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  club: one(clubs, {
    fields: [players.clubId],
    references: [clubs.id],
  }),
  fixtureStats: many(playerFixtureStats),
  picks: many(squadPicks),
  transfersOut: many(transfers, { relationName: "playerOut" }),
  transfersIn: many(transfers, { relationName: "playerIn" }),
}));

export const roundsRelations = relations(rounds, ({ many }) => ({
  fixtures: many(fixtures),
  picks: many(squadPicks),
  transfers: many(transfers),
  scores: many(roundScores),
}));

export const fixturesRelations = relations(fixtures, ({ one, many }) => ({
  round: one(rounds, {
    fields: [fixtures.roundId],
    references: [rounds.id],
  }),
  homeClub: one(clubs, {
    fields: [fixtures.homeClubId],
    references: [clubs.id],
    relationName: "homeClub",
  }),
  awayClub: one(clubs, {
    fields: [fixtures.awayClubId],
    references: [clubs.id],
    relationName: "awayClub",
  }),
  playerStats: many(playerFixtureStats),
}));

export const playerFixtureStatsRelations = relations(
  playerFixtureStats,
  ({ one }) => ({
    player: one(players, {
      fields: [playerFixtureStats.playerId],
      references: [players.id],
    }),
    fixture: one(fixtures, {
      fields: [playerFixtureStats.fixtureId],
      references: [fixtures.id],
    }),
  }),
);

export const fantasySquadsRelations = relations(
  fantasySquads,
  ({ one, many }) => ({
    user: one(users, {
      fields: [fantasySquads.userId],
      references: [users.id],
    }),
    picks: many(squadPicks),
    transfers: many(transfers),
    roundScores: many(roundScores),
  }),
);

export const squadPicksRelations = relations(squadPicks, ({ one }) => ({
  squad: one(fantasySquads, {
    fields: [squadPicks.squadId],
    references: [fantasySquads.id],
  }),
  round: one(rounds, {
    fields: [squadPicks.roundId],
    references: [rounds.id],
  }),
  player: one(players, {
    fields: [squadPicks.playerId],
    references: [players.id],
  }),
}));

export const transfersRelations = relations(transfers, ({ one }) => ({
  squad: one(fantasySquads, {
    fields: [transfers.squadId],
    references: [fantasySquads.id],
  }),
  round: one(rounds, {
    fields: [transfers.roundId],
    references: [rounds.id],
  }),
  playerOut: one(players, {
    fields: [transfers.playerOutId],
    references: [players.id],
    relationName: "playerOut",
  }),
  playerIn: one(players, {
    fields: [transfers.playerInId],
    references: [players.id],
    relationName: "playerIn",
  }),
}));

export const roundScoresRelations = relations(roundScores, ({ one }) => ({
  squad: one(fantasySquads, {
    fields: [roundScores.squadId],
    references: [fantasySquads.id],
  }),
  round: one(rounds, {
    fields: [roundScores.roundId],
    references: [rounds.id],
  }),
}));

export const miniLeaguesRelations = relations(miniLeagues, ({ one, many }) => ({
  owner: one(users, {
    fields: [miniLeagues.ownerId],
    references: [users.id],
  }),
  members: many(miniLeagueMembers),
}));

export const miniLeagueMembersRelations = relations(
  miniLeagueMembers,
  ({ one }) => ({
    league: one(miniLeagues, {
      fields: [miniLeagueMembers.leagueId],
      references: [miniLeagues.id],
    }),
    user: one(users, {
      fields: [miniLeagueMembers.userId],
      references: [users.id],
    }),
  }),
);
