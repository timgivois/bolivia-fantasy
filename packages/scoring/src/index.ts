/**
 * @bolivia-fantasy/scoring
 *
 * Pure, deterministic FPL-style scoring engine for the Bolivian
 * División Profesional fantasy game. Zero I/O, zero DB imports:
 * the API server and worker feed plain data objects in and read
 * plain data objects out.
 *
 * Rule assumptions (documented, see also SCORING_RULES):
 * - Cards are passed as FINAL counts. A red card carries its own -3 and
 *   supersedes a second yellow: for a second-yellow sending off the data
 *   provider must report yellowCards: 1 (the first booking) and
 *   redCards: 1 — the engine never double-counts the second yellow.
 * - A missing stat line, or minutes === 0, means "did not play": the
 *   player scores 0 and no negative events are counted either.
 * - Penalty saves and save points only ever apply to goalkeepers.
 * - Save points are included in the rules (1pt per 3 saves); callers may
 *   set `savesPerThree: 0` in a custom rules object if save data is
 *   unreliable for a given round.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Position = "GK" | "DEF" | "MID" | "FWD";

/** Per-fixture stat line for a single player. "Played" is derived from minutes. */
export interface PlayerStatLine {
  playerId: string;
  position: Position;
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
  /** Goalkeeper saves. Optional because some data feeds omit it. */
  saves?: number;
}

/**
 * A single pick in a 15-player squad.
 * `position` is the squad slot: 1-11 are starters, 12-15 are the bench in
 * auto-sub priority order. `fieldPosition` is the player's real position.
 */
export interface SquadPick {
  playerId: string;
  position: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  fieldPosition: Position;
}

/** Tunable scoring rules. Plain data: persist/override without code changes. */
export interface ScoringRules {
  /** Appearance points: 1-59 minutes vs 60+ minutes. */
  appearance: { upTo59: number; from60: number };
  /** Points per goal scored, by position. */
  goal: Record<Position, number>;
  /** Points per assist. */
  assist: number;
  /** Clean sheet points by position (requires `cleanSheetMinMinutes`). */
  cleanSheet: Record<Position, number>;
  /** Minimum minutes played for a clean sheet to count. */
  cleanSheetMinMinutes: number;
  /** Points per every 2 goals conceded, by position (only if played). */
  goalsConcededPerTwo: Record<Position, number>;
  /** Points per penalty saved (goalkeepers only). */
  penaltySave: number;
  /** Points per penalty missed. */
  penaltyMiss: number;
  /** Points per yellow card. */
  yellowCard: number;
  /** Points per red card (supersedes a second yellow — see module docs). */
  redCard: number;
  /** Points per own goal. */
  ownGoal: number;
  /** Points per every 3 saves (goalkeepers only). Set 0 to disable. */
  savesPerThree: number;
  /** Multiplier applied to the effective captain's points. */
  captainMultiplier: number;
}

export const SCORING_RULES: ScoringRules = {
  appearance: { upTo59: 1, from60: 2 },
  goal: { GK: 6, DEF: 6, MID: 5, FWD: 4 },
  assist: 3,
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  cleanSheetMinMinutes: 60,
  goalsConcededPerTwo: { GK: -1, DEF: -1, MID: 0, FWD: 0 },
  penaltySave: 5,
  penaltyMiss: -2,
  yellowCard: -1,
  redCard: -3,
  ownGoal: -2,
  savesPerThree: 1,
  captainMultiplier: 2,
};

/** One line of a player's score, renderable directly in the UI. */
export interface ScoreBreakdownEntry {
  /** Stable rule key (also usable as an i18n key), e.g. "goals". */
  rule:
    | "minutes"
    | "goals"
    | "assists"
    | "cleanSheet"
    | "goalsConceded"
    | "penaltiesSaved"
    | "penaltiesMissed"
    | "yellowCards"
    | "redCards"
    | "ownGoals"
    | "saves";
  /** The raw stat value the points were derived from (e.g. 2 goals). */
  value: number;
  /** Points awarded for this rule. */
  points: number;
}

export interface PlayerScore {
  total: number;
  breakdown: ScoreBreakdownEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** "Played" is derived from minutes; a missing stat line means did-not-play. */
export function hasPlayed(stat: Pick<PlayerStatLine, "minutes"> | undefined): boolean {
  return (stat?.minutes ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// scorePlayer
// ---------------------------------------------------------------------------

/**
 * Score a single player's fixture stat line.
 *
 * A player with 0 minutes scores 0 with an empty breakdown. The breakdown
 * always contains the appearance ("minutes") entry for players who played,
 * plus one entry per rule that awarded a non-zero number of points.
 */
export function scorePlayer(
  stat: PlayerStatLine,
  rules: ScoringRules = SCORING_RULES,
): PlayerScore {
  const breakdown: ScoreBreakdownEntry[] = [];
  if (stat.minutes <= 0) {
    return { total: 0, breakdown };
  }

  const push = (rule: ScoreBreakdownEntry["rule"], value: number, points: number): void => {
    if (points !== 0 || rule === "minutes") {
      breakdown.push({ rule, value, points });
    }
  };

  // Appearance
  push(
    "minutes",
    stat.minutes,
    stat.minutes >= 60 ? rules.appearance.from60 : rules.appearance.upTo59,
  );

  // Goals & assists
  push("goals", stat.goals, stat.goals * rules.goal[stat.position]);
  push("assists", stat.assists, stat.assists * rules.assist);

  // Clean sheet (requires the minimum minutes, typically 60)
  if (stat.cleanSheet && stat.minutes >= rules.cleanSheetMinMinutes) {
    push("cleanSheet", 1, rules.cleanSheet[stat.position]);
  }

  // Goals conceded: -1 per every 2, GK/DEF only (encoded in the rules table)
  push(
    "goalsConceded",
    stat.goalsConceded,
    Math.floor(stat.goalsConceded / 2) * rules.goalsConcededPerTwo[stat.position],
  );

  // Penalties
  if (stat.position === "GK") {
    push("penaltiesSaved", stat.penaltiesSaved, stat.penaltiesSaved * rules.penaltySave);
  }
  push("penaltiesMissed", stat.penaltiesMissed, stat.penaltiesMissed * rules.penaltyMiss);

  // Cards (final counts; red supersedes a second yellow — see module docs)
  push("yellowCards", stat.yellowCards, stat.yellowCards * rules.yellowCard);
  push("redCards", stat.redCards, stat.redCards * rules.redCard);

  // Own goals
  push("ownGoals", stat.ownGoals, stat.ownGoals * rules.ownGoal);

  // Saves: 1pt per every 3, GK only
  if (stat.position === "GK") {
    const saves = stat.saves ?? 0;
    push("saves", saves, Math.floor(saves / 3) * rules.savesPerThree);
  }

  const total = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  return { total, breakdown };
}

// ---------------------------------------------------------------------------
// scoreSquadRound
// ---------------------------------------------------------------------------

export interface AutoSub {
  /** playerId of the starter who is subbed out. */
  out: string;
  /** playerId of the bench player who comes in. */
  in: string;
}

/** Per-pick result after auto-subs and captaincy have been applied. */
export interface PickPoints {
  playerId: string;
  /** The original squad slot (1-15) of the pick. */
  position: number;
  fieldPosition: Position;
  /** Raw scorePlayer total for the player's stat line (0 if did not play). */
  basePoints: number;
  /** Captain multiplier applied to this pick (1 for everyone else). */
  multiplier: number;
  /** basePoints x multiplier. Counts toward totalPoints only if isStarter. */
  points: number;
  /** Whether the pick is in the final XI after auto-subs. */
  isStarter: boolean;
}

export interface SquadRoundOptions {
  /** Points deducted for extra transfers this round (positive number). */
  transferPenalty?: number;
  /** Scoring rules override; defaults to SCORING_RULES. */
  rules?: ScoringRules;
}

export interface SquadRoundResult {
  /** Final XI points (with captaincy) minus the transfer penalty. */
  totalPoints: number;
  playerPoints: PickPoints[];
  /** Sum of basePoints of players left on the bench after auto-subs. */
  benchPoints: number;
  /** Effective captain (vice if the captain did not play; null if neither). */
  captainPlayerId: string | null;
  autoSubs: AutoSub[];
  transferPenalty: number;
}

interface FormationCounts {
  GK: number;
  DEF: number;
  MID: number;
  FWD: number;
}

/** Auto-sub formation validity: exactly 1 GK, >=3 DEF, >=2 MID, >=1 FWD. */
function isValidAutoSubFormation(c: FormationCounts): boolean {
  return c.GK === 1 && c.DEF >= 3 && c.MID >= 2 && c.FWD >= 1;
}

/**
 * Score a full squad for one round: raw player points, FPL-style auto-subs,
 * captain / vice-captain multiplier and the optional transfer penalty.
 *
 * Auto-subs: bench players (slots 12-15, in priority order) who played
 * replace starters with 0 minutes, as long as the resulting XI keeps exactly
 * 1 GK, at least 3 DEF, at least 2 MID and at least 1 FWD. Because the XI
 * must keep exactly one GK, a goalkeeper can only ever be replaced by the
 * bench goalkeeper (and the bench GK can only come in for a GK).
 *
 * Captaincy: the captain scores x2. If the captain played 0 minutes the
 * vice-captain becomes the effective captain (x2). If neither played, no
 * multiplier is applied and captainPlayerId is null.
 */
export function scoreSquadRound(
  picks: SquadPick[],
  stats: Map<string, PlayerStatLine>,
  options: SquadRoundOptions = {},
): SquadRoundResult {
  const rules = options.rules ?? SCORING_RULES;
  const transferPenalty = options.transferPenalty ?? 0;

  const played = (playerId: string): boolean => hasPlayed(stats.get(playerId));

  const starters = picks
    .filter((p) => p.position >= 1 && p.position <= 11)
    .sort((a, b) => a.position - b.position);
  const bench = picks
    .filter((p) => p.position >= 12 && p.position <= 15)
    .sort((a, b) => a.position - b.position);

  // --- Auto-subs -----------------------------------------------------------
  const finalXI = new Map<string, SquadPick>(starters.map((p) => [p.playerId, p]));
  const counts: FormationCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const p of starters) {
    counts[p.fieldPosition] += 1;
  }

  const autoSubs: AutoSub[] = [];
  for (const candidate of bench) {
    if (!played(candidate.playerId)) continue;
    // Non-playing starters still in the XI, in slot order.
    const replaceable = [...finalXI.values()]
      .filter((p) => !played(p.playerId))
      .sort((a, b) => a.position - b.position);
    for (const out of replaceable) {
      const next: FormationCounts = { ...counts };
      next[out.fieldPosition] -= 1;
      next[candidate.fieldPosition] += 1;
      if (!isValidAutoSubFormation(next)) continue;
      finalXI.delete(out.playerId);
      finalXI.set(candidate.playerId, candidate);
      counts.GK = next.GK;
      counts.DEF = next.DEF;
      counts.MID = next.MID;
      counts.FWD = next.FWD;
      autoSubs.push({ out: out.playerId, in: candidate.playerId });
      break;
    }
  }

  // --- Effective captain ---------------------------------------------------
  const captain = picks.find((p) => p.isCaptain);
  const vice = picks.find((p) => p.isViceCaptain);
  let effectiveCaptainId: string | null = null;
  if (captain && played(captain.playerId)) {
    effectiveCaptainId = captain.playerId;
  } else if (vice && played(vice.playerId)) {
    effectiveCaptainId = vice.playerId;
  }

  // --- Points --------------------------------------------------------------
  const playerPoints: PickPoints[] = picks.map((pick) => {
    const stat = stats.get(pick.playerId);
    const basePoints = stat ? scorePlayer(stat, rules).total : 0;
    const isStarter = finalXI.has(pick.playerId);
    const multiplier =
      isStarter && effectiveCaptainId === pick.playerId ? rules.captainMultiplier : 1;
    return {
      playerId: pick.playerId,
      position: pick.position,
      fieldPosition: pick.fieldPosition,
      basePoints,
      multiplier,
      points: basePoints * multiplier,
      isStarter,
    };
  });

  const xiPoints = playerPoints
    .filter((p) => p.isStarter)
    .reduce((sum, p) => sum + p.points, 0);
  const benchPoints = playerPoints
    .filter((p) => !p.isStarter)
    .reduce((sum, p) => sum + p.basePoints, 0);

  return {
    totalPoints: xiPoints - transferPenalty,
    playerPoints,
    benchPoints,
    captainPlayerId: effectiveCaptainId,
    autoSubs,
    transferPenalty,
  };
}

// ---------------------------------------------------------------------------
// validateSquad
// ---------------------------------------------------------------------------

/**
 * Structured validation error. `code` is a message key (the UI resolves it
 * to Spanish prose); `context` carries the values for interpolation.
 */
export interface ValidationError {
  code:
    | "squad.invalidSize"
    | "squad.duplicatePlayer"
    | "squad.invalidSlots"
    | "squad.invalidPositionCount"
    | "squad.tooManyFromClub"
    | "squad.missingClub"
    | "squad.missingPrice"
    | "squad.overBudget"
    | "squad.invalidFormation"
    | "squad.invalidCaptainCount"
    | "squad.invalidViceCaptainCount"
    | "squad.captainNotStarter"
    | "squad.viceCaptainNotStarter"
    | "squad.captainIsViceCaptain";
  context?: Record<string, unknown>;
}

export interface SquadValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Required 15-player squad composition. */
export const SQUAD_COMPOSITION: Record<Position, number> = {
  GK: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export const MAX_PLAYERS_PER_CLUB = 3;

/** Valid starting-XI formation bounds. */
export const FORMATION_BOUNDS: Record<Position, { min: number; max: number }> = {
  GK: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
};

/**
 * Validate a full 15-player squad: size, slot numbering, composition
 * (2 GK / 5 DEF / 5 MID / 3 FWD), max 3 per club, budget, starting-XI
 * formation and captaincy. Returns every violation, not just the first.
 */
export function validateSquad(
  picks: SquadPick[],
  playerPrices: Map<string, number>,
  playerClubs: Map<string, string>,
  budget: number,
): SquadValidationResult {
  const errors: ValidationError[] = [];

  // Exactly 15 players
  if (picks.length !== 15) {
    errors.push({ code: "squad.invalidSize", context: { expected: 15, actual: picks.length } });
  }

  // No duplicate players
  const seen = new Set<string>();
  for (const pick of picks) {
    if (seen.has(pick.playerId)) {
      errors.push({ code: "squad.duplicatePlayer", context: { playerId: pick.playerId } });
    }
    seen.add(pick.playerId);
  }

  // Slots must be unique and within 1-15
  const slots = picks.map((p) => p.position);
  const slotsValid =
    slots.every((s) => Number.isInteger(s) && s >= 1 && s <= 15) &&
    new Set(slots).size === slots.length;
  if (!slotsValid) {
    errors.push({ code: "squad.invalidSlots", context: { slots } });
  }

  // Composition: 2 GK, 5 DEF, 5 MID, 3 FWD
  const composition: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pick of picks) {
    composition[pick.fieldPosition] += 1;
  }
  for (const position of ["GK", "DEF", "MID", "FWD"] as const) {
    if (composition[position] !== SQUAD_COMPOSITION[position]) {
      errors.push({
        code: "squad.invalidPositionCount",
        context: {
          position,
          expected: SQUAD_COMPOSITION[position],
          actual: composition[position],
        },
      });
    }
  }

  // Max 3 per club
  const clubCounts = new Map<string, number>();
  for (const pick of picks) {
    const club = playerClubs.get(pick.playerId);
    if (club === undefined) {
      errors.push({ code: "squad.missingClub", context: { playerId: pick.playerId } });
      continue;
    }
    clubCounts.set(club, (clubCounts.get(club) ?? 0) + 1);
  }
  for (const [club, count] of clubCounts) {
    if (count > MAX_PLAYERS_PER_CLUB) {
      errors.push({
        code: "squad.tooManyFromClub",
        context: { club, max: MAX_PLAYERS_PER_CLUB, count },
      });
    }
  }

  // Budget
  let totalPrice = 0;
  for (const pick of picks) {
    const price = playerPrices.get(pick.playerId);
    if (price === undefined) {
      errors.push({ code: "squad.missingPrice", context: { playerId: pick.playerId } });
      continue;
    }
    totalPrice += price;
  }
  if (totalPrice > budget) {
    errors.push({ code: "squad.overBudget", context: { totalPrice, budget } });
  }

  // Starting XI formation
  const starters = picks.filter((p) => p.position >= 1 && p.position <= 11);
  const formation: Record<Position, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const pick of starters) {
    formation[pick.fieldPosition] += 1;
  }
  const formationValid =
    starters.length === 11 &&
    (["GK", "DEF", "MID", "FWD"] as const).every(
      (pos) =>
        formation[pos] >= FORMATION_BOUNDS[pos].min &&
        formation[pos] <= FORMATION_BOUNDS[pos].max,
    );
  if (!formationValid) {
    errors.push({ code: "squad.invalidFormation", context: { ...formation } });
  }

  // Captaincy: exactly 1 captain + 1 vice, both starters, not the same player
  const captains = picks.filter((p) => p.isCaptain);
  const vices = picks.filter((p) => p.isViceCaptain);
  if (captains.length !== 1) {
    errors.push({ code: "squad.invalidCaptainCount", context: { count: captains.length } });
  }
  if (vices.length !== 1) {
    errors.push({ code: "squad.invalidViceCaptainCount", context: { count: vices.length } });
  }
  const captain = captains.length === 1 ? captains[0] : undefined;
  const vice = vices.length === 1 ? vices[0] : undefined;
  if (captain && (captain.position < 1 || captain.position > 11)) {
    errors.push({ code: "squad.captainNotStarter", context: { playerId: captain.playerId } });
  }
  if (vice && (vice.position < 1 || vice.position > 11)) {
    errors.push({ code: "squad.viceCaptainNotStarter", context: { playerId: vice.playerId } });
  }
  if (captain && vice && captain.playerId === vice.playerId) {
    errors.push({ code: "squad.captainIsViceCaptain", context: { playerId: captain.playerId } });
  }

  return { valid: errors.length === 0, errors };
}
