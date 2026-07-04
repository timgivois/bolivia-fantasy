/**
 * Mapping helpers: API-Football values -> our domain values.
 * See apps/worker/README.md for the documented decisions.
 */

import type { PlayerPosition, RoundPhase } from "@bolivia-fantasy/db";

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

/**
 * API-Football long positions (from /players) -> our enum.
 * Unknown/missing positions return null; those players are skipped.
 */
export function mapPosition(
  apiPosition: string | null | undefined,
): PlayerPosition | null {
  switch ((apiPosition ?? "").trim().toLowerCase()) {
    case "goalkeeper":
      return "GK";
    case "defender":
      return "DEF";
    case "midfielder":
      return "MID";
    case "attacker":
      return "FWD";
    default:
      return null;
  }
}

/** Default fantasy price (millions of Bs) for newly discovered players. */
export const DEFAULT_PRICE_BY_POSITION: Record<PlayerPosition, number> = {
  GK: 4.5,
  DEF: 5.0,
  MID: 5.5,
  FWD: 6.0,
};

// ---------------------------------------------------------------------------
// Fixture statuses
// ---------------------------------------------------------------------------

/** Statuses where the match is over and produced (or never will produce) stats. */
export const FINISHED_STATUSES = new Set([
  "FT",
  "AET",
  "PEN",
  "AWD",
  "WO",
  "CANC",
  "ABD",
]);

/** Statuses with full stat lines available from /fixtures/players. */
export const PLAYED_STATUSES = new Set(["FT", "AET", "PEN"]);

/** In-play statuses worth polling /fixtures/events for. */
export const LIVE_STATUSES = new Set([
  "1H",
  "HT",
  "2H",
  "ET",
  "BT",
  "P",
  "SUSP",
  "INT",
  "LIVE",
]);

// ---------------------------------------------------------------------------
// Round names
// ---------------------------------------------------------------------------

export interface ParsedRound {
  phase: RoundPhase;
  roundNumber: number;
  /** Display name, e.g. "Fecha 5 — Apertura". */
  name: string;
}

/**
 * Parse an API-Football round string like "Apertura - 5",
 * "Clausura - 12" or "Regular Season - 3" into (phase, roundNumber).
 * Phase defaults to "apertura" when the string names neither tournament.
 * Returns null when no round number can be found.
 */
export function parseRoundName(apiRound: string): ParsedRound | null {
  const numberMatch = apiRound.match(/(\d+)\s*$/);
  if (!numberMatch) return null;
  const roundNumber = Number(numberMatch[1]);
  if (!Number.isInteger(roundNumber) || roundNumber < 1) return null;
  const phase: RoundPhase = /clausura/i.test(apiRound) ? "clausura" : "apertura";
  const phaseLabel = phase === "clausura" ? "Clausura" : "Apertura";
  return { phase, roundNumber, name: `Fecha ${roundNumber} — ${phaseLabel}` };
}

// ---------------------------------------------------------------------------
// Fuzzy club-name matching
// ---------------------------------------------------------------------------

const NAME_STOPWORDS = new Set([
  "club",
  "deportivo",
  "cd",
  "fc",
  "sc",
  "de",
  "del",
  "futbol",
  "atletico",
]);

/** Lowercase, strip diacritics/punctuation, drop filler words. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NAME_STOPWORDS.has(token));
}

/** Jaccard similarity of the two names' token sets (0..1). */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const token of ta) if (tb.has(token)) intersection += 1;
  const union = ta.size + tb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Find the best fuzzy match for `apiName` among `candidates`.
 * Requires similarity >= 0.5 and a unique winner (no tie), otherwise null.
 */
export function bestNameMatch<T extends { name: string }>(
  apiName: string,
  candidates: readonly T[],
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  let tied = false;
  for (const candidate of candidates) {
    const score = nameSimilarity(apiName, candidate.name);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  if (!best || bestScore < 0.5 || tied) return null;
  return best;
}
