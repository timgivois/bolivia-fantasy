import type { Position, ScoreBreakdownEntry } from "@bolivia-fantasy/scoring";

import type { RoundInfo, SquadInfo } from "@/components/squad/types";

/**
 * Client-safe shapes mirroring the Fastify API responses for the live-points
 * page (apps/api/src/routes/me.ts GET /me/squad/points, public.ts /rounds
 * and /fixtures, and the /live SSE payload emitted by the worker).
 */

export type { ScoreBreakdownEntry };

/** One row of GET /rounds (RoundInfo plus ordering metadata). */
export interface RoundListItem extends RoundInfo {
  season: number;
  phase: "apertura" | "clausura";
  roundNumber: number;
}

export interface FixtureClub {
  id: number;
  name: string;
  shortName: string | null;
}

/** One fixture of GET /fixtures?roundId= with joined club info. */
export interface FixtureItem {
  id: number;
  roundId: number;
  /** ISO timestamp. */
  kickoffAt: string;
  /** API-Football short status: NS/1H/HT/2H/FT/... */
  status: string;
  homeGoals: number | null;
  awayGoals: number | null;
  homeClub: FixtureClub;
  awayClub: FixtureClub;
}

/** Aggregated stat line for a pick within the selected round. */
export interface PickStats {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  goalsConceded: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  ownGoals: number;
  saves: number;
}

/** One pick of GET /me/squad/points with its points already computed. */
export interface PointsPick {
  playerId: number;
  /** Squad slot: 1-11 starters, 12-15 bench (before auto-subs). */
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  player: {
    name: string;
    fieldPosition: Position;
    clubId: number | null;
  };
  /** Null when the player has no stat line yet (did not play). */
  stats: PickStats | null;
  breakdown: ScoreBreakdownEntry[];
  basePoints: number;
  /** Captain multiplier applied to this pick (1 for everyone else). */
  multiplier: number;
  points: number;
  /** Whether the pick is in the final XI after auto-subs. */
  isStarter: boolean;
}

export interface MySquadPointsResponse {
  squad: SquadInfo;
  roundId: number;
  finalized: boolean;
  totalPoints: number;
  benchPoints: number;
  transferPenalty: number;
  captainPlayerId: number | null;
  autoSubs: Array<{ out: number; in: number }>;
  picks: PointsPick[];
}

/** Payload of the `live_scores` SSE event (see apps/api/src/routes/live.ts). */
export interface LiveScoreEvent {
  fixtureId: number;
  apiFootballId?: number;
  status: string;
  elapsed: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
}

/** API-Football short statuses that mean the match is being played now. */
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);

export function isLiveFixtureStatus(status: string): boolean {
  return LIVE_STATUSES.has(status);
}

const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

export function isFinishedFixtureStatus(status: string): boolean {
  return FINISHED_STATUSES.has(status);
}
