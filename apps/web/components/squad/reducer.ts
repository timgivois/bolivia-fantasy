import {
  FORMATION_BOUNDS,
  MAX_PLAYERS_PER_CLUB,
  SQUAD_COMPOSITION,
} from "@bolivia-fantasy/scoring";

import type { PlayerLite, Position, SavedPick } from "./types";

/** Total game budget in millions (mirrors apps/api INITIAL_BUDGET). */
export const BUDGET = 100;
export const SQUAD_SIZE = 15;
export const BENCH_SIZE = 4;
export const POSITIONS: Position[] = ["GK", "DEF", "MID", "FWD"];

export interface FeedbackMessage {
  /** Key relative to the "squad" i18n namespace, e.g. "errors.round_locked". */
  key: string;
  values?: Record<string, string | number>;
}

export interface Feedback extends FeedbackMessage {
  kind: "success" | "error" | "info";
  /** Extra lines (e.g. the list of squad-rule violations). */
  extra?: FeedbackMessage[];
}

export interface BuilderState {
  /** Starting XI (unordered across positions; rows derive from `position`). */
  starters: PlayerLite[];
  /** Bench, in auto-sub priority order (slots 12-15). */
  bench: PlayerLite[];
  captainId: number | null;
  viceId: number | null;
  /** playerId -> price paid, for picks already persisted by the API. */
  purchasePrices: Record<number, number>;
  /** Whether picks for this round exist server-side (enables transfers mode). */
  hasSavedPicks: boolean;
  /** Unsaved local changes. */
  dirty: boolean;
  locked: boolean;
  /** Player whose action menu (bottom sheet) is open. */
  menuId: number | null;
  /** First half of an XI <-> bench swap. */
  swapId: number | null;
  /** Player being transferred out (transfers mode). */
  transferOutId: number | null;
  feedback: Feedback | null;
}

export type BuilderAction =
  | { type: "ADD_PLAYER"; player: PlayerLite; target: "starters" | "bench" }
  | { type: "REMOVE_PLAYER"; id: number }
  | { type: "SET_CAPTAIN"; id: number }
  | { type: "SET_VICE"; id: number }
  | { type: "OPEN_MENU"; id: number }
  | { type: "CLOSE_MENU" }
  | { type: "START_SWAP"; id: number }
  | { type: "APPLY_SWAP"; starterId: number; benchId: number }
  | { type: "CANCEL_SWAP" }
  | { type: "START_TRANSFER"; id: number }
  | { type: "CANCEL_TRANSFER" }
  | {
      type: "TRANSFER_DONE";
      outId: number;
      player: PlayerLite;
      budget: number;
      feedback: Feedback;
    }
  | { type: "SAVED"; purchasePrices: Record<number, number>; feedback: Feedback }
  | { type: "LOCK" }
  | { type: "FEEDBACK"; feedback: Feedback }
  | { type: "CLEAR_FEEDBACK" };

// ---------------------------------------------------------------------------
// Selectors (pure helpers shared with the components)
// ---------------------------------------------------------------------------

export function allPlayers(state: BuilderState): PlayerLite[] {
  return [...state.starters, ...state.bench];
}

export function countByPosition(list: PlayerLite[]): Record<Position, number> {
  const counts: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const player of list) counts[player.position] += 1;
  return counts;
}

export function clubCounts(state: BuilderState): Map<number, number> {
  const counts = new Map<number, number>();
  for (const player of allPlayers(state)) {
    if (player.clubId === null) continue;
    counts.set(player.clubId, (counts.get(player.clubId) ?? 0) + 1);
  }
  return counts;
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Draft price of a pick: purchase price when the pick is already persisted,
 * current market price otherwise. Matches the API's transfer budget math.
 */
export function draftPrice(state: BuilderState, player: PlayerLite): number {
  return state.purchasePrices[player.id] ?? player.price;
}

export function squadCost(state: BuilderState): number {
  return round1(allPlayers(state).reduce((sum, p) => sum + draftPrice(state, p), 0));
}

export function budgetRemaining(state: BuilderState): number {
  return round1(BUDGET - squadCost(state));
}

export type AddCheck =
  | { ok: true; target: "starters" | "bench" }
  | {
      ok: false;
      reason:
        | "locked"
        | "alreadyInSquad"
        | "squadFull"
        | "positionFull"
        | "clubLimit"
        | "overBudget"
        | "noSlot";
      context?: Record<string, number>;
    };

/** Live rule check for adding a player, and where they would be placed. */
export function canAddPlayer(state: BuilderState, player: PlayerLite): AddCheck {
  if (state.locked) return { ok: false, reason: "locked" };
  const squad = allPlayers(state);
  if (squad.some((p) => p.id === player.id)) return { ok: false, reason: "alreadyInSquad" };
  if (squad.length >= SQUAD_SIZE) return { ok: false, reason: "squadFull" };

  const positionCount = squad.filter((p) => p.position === player.position).length;
  if (positionCount >= SQUAD_COMPOSITION[player.position]) {
    return { ok: false, reason: "positionFull", context: { max: SQUAD_COMPOSITION[player.position] } };
  }

  if (player.clubId !== null) {
    const clubCount = squad.filter((p) => p.clubId === player.clubId).length;
    if (clubCount >= MAX_PLAYERS_PER_CLUB) {
      return { ok: false, reason: "clubLimit", context: { max: MAX_PLAYERS_PER_CLUB } };
    }
  }

  const remaining = budgetRemaining(state);
  if (player.price > remaining + 1e-9) {
    return { ok: false, reason: "overBudget", context: { remaining } };
  }

  // Placement: prefer the XI when the row has room AND the remaining XI
  // slots can still cover every positional minimum (so a greedy fill never
  // paints the formation into a corner, e.g. 1 GK / 5 DEF / 5 MID with no FWD).
  const starterCounts = countByPosition(state.starters);
  const startersTotal = state.starters.length;
  if (
    startersTotal < 11 &&
    starterCounts[player.position] < FORMATION_BOUNDS[player.position].max
  ) {
    const after = { ...starterCounts, [player.position]: starterCounts[player.position] + 1 };
    const slotsLeft = 11 - (startersTotal + 1);
    const stillNeeded = POSITIONS.reduce(
      (sum, pos) => sum + Math.max(0, FORMATION_BOUNDS[pos].min - after[pos]),
      0,
    );
    if (stillNeeded <= slotsLeft) return { ok: true, target: "starters" };
  }

  if (state.bench.length < BENCH_SIZE) return { ok: true, target: "bench" };
  return { ok: false, reason: "noSlot" };
}

/** Whether swapping an XI player with a bench player keeps the formation legal. */
export function canSwap(state: BuilderState, starterId: number, benchId: number): boolean {
  const starter = state.starters.find((p) => p.id === starterId);
  const benchPlayer = state.bench.find((p) => p.id === benchId);
  if (!starter || !benchPlayer) return false;

  const counts = countByPosition(state.starters);
  counts[starter.position] -= 1;
  counts[benchPlayer.position] += 1;

  // Max bounds always apply; minimums only once the XI is complete
  // (an in-progress XI is naturally below the minimums).
  const checkMin = state.starters.length === 11;
  return POSITIONS.every(
    (pos) =>
      counts[pos] <= FORMATION_BOUNDS[pos].max &&
      (!checkMin || counts[pos] >= FORMATION_BOUNDS[pos].min),
  );
}

/** Valid counterparts for the in-progress swap (highlighted on the pitch). */
export function swapTargets(state: BuilderState): Set<number> {
  const targets = new Set<number>();
  if (state.swapId === null) return targets;
  if (state.starters.some((p) => p.id === state.swapId)) {
    for (const b of state.bench) if (canSwap(state, state.swapId, b.id)) targets.add(b.id);
  } else {
    for (const s of state.starters) if (canSwap(state, s.id, state.swapId)) targets.add(s.id);
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Init + reducer
// ---------------------------------------------------------------------------

export function initBuilderState(input: {
  savedPicks: SavedPick[];
  /** Full player pool, used to enrich saved picks with totalPoints. */
  playersById: Map<number, PlayerLite>;
  locked: boolean;
}): BuilderState {
  const starters: PlayerLite[] = [];
  const bench: PlayerLite[] = [];
  const purchasePrices: Record<number, number> = {};
  let captainId: number | null = null;
  let viceId: number | null = null;

  const sorted = [...input.savedPicks].sort((a, b) => a.position - b.position);
  for (const pick of sorted) {
    const player: PlayerLite = input.playersById.get(pick.playerId) ?? {
      id: pick.playerId,
      name: pick.player.name,
      position: pick.player.fieldPosition,
      price: pick.player.price,
      clubId: pick.player.clubId,
      totalPoints: 0,
    };
    (pick.position <= 11 ? starters : bench).push(player);
    purchasePrices[pick.playerId] = pick.purchasePrice;
    if (pick.isCaptain) captainId = pick.playerId;
    if (pick.isViceCaptain) viceId = pick.playerId;
  }

  return {
    starters,
    bench,
    captainId,
    viceId,
    purchasePrices,
    hasSavedPicks: sorted.length > 0,
    dirty: false,
    locked: input.locked,
    menuId: null,
    swapId: null,
    transferOutId: null,
    feedback: null,
  };
}

function replacePlayer(list: PlayerLite[], outId: number, player: PlayerLite): PlayerLite[] {
  return list.map((p) => (p.id === outId ? player : p));
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "ADD_PLAYER": {
      if (state.locked) return state;
      const next =
        action.target === "starters"
          ? { ...state, starters: [...state.starters, action.player] }
          : { ...state, bench: [...state.bench, action.player] };
      return { ...next, dirty: true, feedback: null };
    }

    case "REMOVE_PLAYER": {
      if (state.locked) return state;
      return {
        ...state,
        starters: state.starters.filter((p) => p.id !== action.id),
        bench: state.bench.filter((p) => p.id !== action.id),
        captainId: state.captainId === action.id ? null : state.captainId,
        viceId: state.viceId === action.id ? null : state.viceId,
        menuId: null,
        dirty: true,
      };
    }

    case "SET_CAPTAIN": {
      if (!state.starters.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        captainId: action.id,
        // FPL-style swap: naming the current vice as captain promotes the
        // old captain to vice instead of leaving the armband duplicated.
        viceId: state.viceId === action.id ? state.captainId : state.viceId,
        menuId: null,
        dirty: true,
      };
    }

    case "SET_VICE": {
      if (!state.starters.some((p) => p.id === action.id)) return state;
      return {
        ...state,
        viceId: action.id,
        captainId: state.captainId === action.id ? state.viceId : state.captainId,
        menuId: null,
        dirty: true,
      };
    }

    case "OPEN_MENU":
      return { ...state, menuId: action.id, swapId: null, feedback: null };

    case "CLOSE_MENU":
      return { ...state, menuId: null };

    case "START_SWAP":
      return { ...state, swapId: action.id, menuId: null, transferOutId: null };

    case "CANCEL_SWAP":
      return { ...state, swapId: null };

    case "APPLY_SWAP": {
      const starter = state.starters.find((p) => p.id === action.starterId);
      const benchPlayer = state.bench.find((p) => p.id === action.benchId);
      if (!starter || !benchPlayer || !canSwap(state, action.starterId, action.benchId)) {
        return { ...state, swapId: null };
      }
      const movedOutHadArmband =
        state.captainId === starter.id || state.viceId === starter.id;
      return {
        ...state,
        starters: replacePlayer(state.starters, starter.id, benchPlayer),
        bench: replacePlayer(state.bench, benchPlayer.id, starter),
        captainId: state.captainId === starter.id ? null : state.captainId,
        viceId: state.viceId === starter.id ? null : state.viceId,
        swapId: null,
        dirty: true,
        feedback: movedOutHadArmband
          ? { kind: "info", key: "feedback.armbandCleared", values: { name: starter.name } }
          : state.feedback,
      };
    }

    case "START_TRANSFER":
      return { ...state, transferOutId: action.id, menuId: null, swapId: null, feedback: null };

    case "CANCEL_TRANSFER":
      return { ...state, transferOutId: null };

    case "TRANSFER_DONE": {
      const purchasePrices = { ...state.purchasePrices };
      delete purchasePrices[action.outId];
      purchasePrices[action.player.id] = action.player.price;
      return {
        ...state,
        starters: replacePlayer(state.starters, action.outId, action.player),
        bench: replacePlayer(state.bench, action.outId, action.player),
        captainId: state.captainId === action.outId ? action.player.id : state.captainId,
        viceId: state.viceId === action.outId ? action.player.id : state.viceId,
        purchasePrices,
        transferOutId: null,
        feedback: action.feedback,
      };
    }

    case "SAVED":
      return {
        ...state,
        purchasePrices: action.purchasePrices,
        hasSavedPicks: true,
        dirty: false,
        feedback: action.feedback,
      };

    case "LOCK":
      return {
        ...state,
        locked: true,
        menuId: null,
        swapId: null,
        transferOutId: null,
      };

    case "FEEDBACK":
      return { ...state, feedback: action.feedback };

    case "CLEAR_FEEDBACK":
      return { ...state, feedback: null };

    default:
      return state;
  }
}
