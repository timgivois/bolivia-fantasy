import type { Position } from "@bolivia-fantasy/scoring";

/**
 * Client-safe data shapes mirroring the Fastify API responses
 * (apps/api/src/routes/public.ts and me.ts). Kept in components/squad so
 * both the server-only API client (lib/api.ts) and the client components
 * can import them without pulling server code into the browser bundle.
 */

export type { Position };

export interface Club {
  id: number;
  name: string;
  shortName: string | null;
}

export interface PlayerLite {
  id: number;
  name: string;
  position: Position;
  price: number;
  clubId: number | null;
  totalPoints: number;
}

export interface RoundInfo {
  id: number;
  name: string;
  status: "upcoming" | "locked" | "live" | "finalized";
  /** ISO timestamp; squads lock at this instant. */
  lockAt: string | null;
}

export interface SquadInfo {
  id: number;
  name: string;
  /** Remaining budget in millions. */
  budget: number;
  totalPoints: number;
}

/** One saved pick as returned by GET /me/squad. */
export interface SavedPick {
  playerId: number;
  /** Squad slot: 1-11 starters, 12-15 bench. */
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  purchasePrice: number;
  player: {
    name: string;
    fieldPosition: Position;
    clubId: number | null;
    price: number;
  };
}

/** Pick payload for PUT /me/squad/picks. */
export interface PickInput {
  playerId: number;
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
}

/** Structured validation error from @bolivia-fantasy/scoring, as JSON. */
export interface ValidationErrorLike {
  code: string;
  context?: Record<string, unknown>;
}
