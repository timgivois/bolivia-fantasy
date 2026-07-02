import { describe, expect, it } from "vitest";

import {
  FORMATION_BOUNDS,
  MAX_PLAYERS_PER_CLUB,
  SCORING_RULES,
  SQUAD_COMPOSITION,
  hasPlayed,
  scorePlayer,
  scoreSquadRound,
  validateSquad,
  type PlayerStatLine,
  type Position,
  type ScoringRules,
  type SquadPick,
} from "./index.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function stat(overrides: Partial<PlayerStatLine> = {}): PlayerStatLine {
  return {
    playerId: "p1",
    position: "MID",
    minutes: 90,
    goals: 0,
    assists: 0,
    cleanSheet: false,
    goalsConceded: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    ownGoals: 0,
    ...overrides,
  };
}

function pick(
  playerId: string,
  position: number,
  fieldPosition: Position,
  flags: { isCaptain?: boolean; isViceCaptain?: boolean } = {},
): SquadPick {
  return {
    playerId,
    position,
    fieldPosition,
    isCaptain: flags.isCaptain ?? false,
    isViceCaptain: flags.isViceCaptain ?? false,
  };
}

function statsMap(lines: PlayerStatLine[]): Map<string, PlayerStatLine> {
  return new Map(lines.map((line) => [line.playerId, line]));
}

function breakdownPoints(result: ReturnType<typeof scorePlayer>, rule: string): number | undefined {
  return result.breakdown.find((entry) => entry.rule === rule)?.points;
}

// ---------------------------------------------------------------------------
// SCORING_RULES
// ---------------------------------------------------------------------------

describe("SCORING_RULES", () => {
  it("is a plain tunable data object with the documented values", () => {
    expect(SCORING_RULES).toEqual({
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
    });
  });
});

// ---------------------------------------------------------------------------
// hasPlayed
// ---------------------------------------------------------------------------

describe("hasPlayed", () => {
  it("derives played from minutes", () => {
    expect(hasPlayed(stat({ minutes: 1 }))).toBe(true);
    expect(hasPlayed(stat({ minutes: 0 }))).toBe(false);
  });

  it("treats a missing stat line as did-not-play", () => {
    expect(hasPlayed(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// scorePlayer
// ---------------------------------------------------------------------------

describe("scorePlayer", () => {
  describe("appearance points", () => {
    it("scores 0 with an empty breakdown for 0 minutes", () => {
      const result = scorePlayer(stat({ minutes: 0, goals: 3, yellowCards: 2 }));
      expect(result.total).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it("gives 1 point for 1 minute", () => {
      expect(scorePlayer(stat({ minutes: 1 })).total).toBe(1);
    });

    it("gives 1 point for 59 minutes (boundary)", () => {
      expect(scorePlayer(stat({ minutes: 59 })).total).toBe(1);
    });

    it("gives 2 points for 60 minutes (boundary)", () => {
      expect(scorePlayer(stat({ minutes: 60 })).total).toBe(2);
    });

    it("gives 2 points for 90 minutes", () => {
      expect(scorePlayer(stat({ minutes: 90 })).total).toBe(2);
    });
  });

  describe("goals", () => {
    it.each([
      ["GK", 6],
      ["DEF", 6],
      ["MID", 5],
      ["FWD", 4],
    ] as Array<[Position, number]>)("a %s goal is worth %i points", (position, points) => {
      const result = scorePlayer(stat({ position, minutes: 90, goals: 1 }));
      expect(breakdownPoints(result, "goals")).toBe(points);
      expect(result.total).toBe(2 + points);
    });

    it("multiplies by goal count (FWD hat-trick = 12)", () => {
      const result = scorePlayer(stat({ position: "FWD", goals: 3 }));
      expect(breakdownPoints(result, "goals")).toBe(12);
    });
  });

  describe("assists", () => {
    it("gives 3 points per assist", () => {
      const result = scorePlayer(stat({ assists: 2 }));
      expect(breakdownPoints(result, "assists")).toBe(6);
      expect(result.total).toBe(8);
    });
  });

  describe("clean sheets", () => {
    it.each([
      ["GK", 4],
      ["DEF", 4],
      ["MID", 1],
    ] as Array<[Position, number]>)("%s clean sheet with 60+ minutes = %i", (position, points) => {
      const result = scorePlayer(stat({ position, minutes: 60, cleanSheet: true }));
      expect(breakdownPoints(result, "cleanSheet")).toBe(points);
    });

    it("gives a FWD nothing for a clean sheet (no breakdown entry)", () => {
      const result = scorePlayer(stat({ position: "FWD", minutes: 90, cleanSheet: true }));
      expect(breakdownPoints(result, "cleanSheet")).toBeUndefined();
      expect(result.total).toBe(2);
    });

    it("requires 60+ minutes: 59 minutes gets no clean sheet points", () => {
      const result = scorePlayer(stat({ position: "DEF", minutes: 59, cleanSheet: true }));
      expect(breakdownPoints(result, "cleanSheet")).toBeUndefined();
      expect(result.total).toBe(1);
    });

    it("awards the clean sheet at exactly 60 minutes", () => {
      const result = scorePlayer(stat({ position: "DEF", minutes: 60, cleanSheet: true }));
      expect(result.total).toBe(6);
    });
  });

  describe("goals conceded (every 2 = -1, GK/DEF only, only if played)", () => {
    it.each([
      [0, 0],
      [1, 0],
      [2, -1],
      [3, -1],
      [4, -2],
      [5, -2],
      [6, -3],
    ])("a DEF conceding %i is docked %i", (conceded, points) => {
      const result = scorePlayer(stat({ position: "DEF", goalsConceded: conceded }));
      expect(breakdownPoints(result, "goalsConceded") ?? 0).toBe(points);
    });

    it("docks a GK for goals conceded", () => {
      const result = scorePlayer(stat({ position: "GK", goalsConceded: 4 }));
      expect(breakdownPoints(result, "goalsConceded")).toBe(-2);
    });

    it("never docks MID or FWD for goals conceded", () => {
      expect(scorePlayer(stat({ position: "MID", goalsConceded: 6 })).total).toBe(2);
      expect(scorePlayer(stat({ position: "FWD", goalsConceded: 6 })).total).toBe(2);
    });
  });

  describe("penalties", () => {
    it("gives a GK 5 points per penalty saved", () => {
      const result = scorePlayer(stat({ position: "GK", penaltiesSaved: 2 }));
      expect(breakdownPoints(result, "penaltiesSaved")).toBe(10);
    });

    it("ignores penaltiesSaved for non-goalkeepers", () => {
      const result = scorePlayer(stat({ position: "DEF", penaltiesSaved: 1 }));
      expect(breakdownPoints(result, "penaltiesSaved")).toBeUndefined();
      expect(result.total).toBe(2);
    });

    it("docks 2 points per penalty missed, any position", () => {
      expect(breakdownPoints(scorePlayer(stat({ position: "FWD", penaltiesMissed: 1 })), "penaltiesMissed")).toBe(-2);
      expect(breakdownPoints(scorePlayer(stat({ position: "GK", penaltiesMissed: 2 })), "penaltiesMissed")).toBe(-4);
    });
  });

  describe("cards (final counts; red supersedes second yellow)", () => {
    it("docks 1 per yellow card", () => {
      expect(scorePlayer(stat({ yellowCards: 1 })).total).toBe(1);
      expect(scorePlayer(stat({ yellowCards: 2 })).total).toBe(0);
    });

    it("docks 3 for a straight red card", () => {
      const result = scorePlayer(stat({ redCards: 1 }));
      expect(breakdownPoints(result, "redCards")).toBe(-3);
      expect(result.total).toBe(-1);
    });

    it("scores a second-yellow red as reported by the provider: yellow=1, red=1 => -4", () => {
      // Assumption: the data provider passes FINAL counts where the second
      // yellow is folded into the red (yellowCards: 1 for the first booking,
      // redCards: 1). The engine does not re-derive or double-count it.
      const result = scorePlayer(stat({ yellowCards: 1, redCards: 1 }));
      expect(breakdownPoints(result, "yellowCards")).toBe(-1);
      expect(breakdownPoints(result, "redCards")).toBe(-3);
      expect(result.total).toBe(2 - 1 - 3);
    });
  });

  describe("own goals", () => {
    it("docks 2 per own goal", () => {
      const result = scorePlayer(stat({ position: "DEF", ownGoals: 2 }));
      expect(breakdownPoints(result, "ownGoals")).toBe(-4);
    });
  });

  describe("saves (every 3 = 1, GK only)", () => {
    it.each([
      [0, 0],
      [2, 0],
      [3, 1],
      [5, 1],
      [6, 2],
      [9, 3],
    ])("a GK with %i saves earns %i", (saves, points) => {
      const result = scorePlayer(stat({ position: "GK", saves }));
      expect(breakdownPoints(result, "saves") ?? 0).toBe(points);
    });

    it("treats a missing saves field as 0", () => {
      const line = stat({ position: "GK" });
      delete line.saves;
      expect(scorePlayer(line).total).toBe(2);
    });

    it("ignores saves for non-goalkeepers", () => {
      const result = scorePlayer(stat({ position: "DEF", saves: 9 }));
      expect(breakdownPoints(result, "saves")).toBeUndefined();
    });
  });

  describe("breakdown shape", () => {
    it("always includes the minutes entry for a player who played", () => {
      const result = scorePlayer(stat({ minutes: 45 }));
      expect(result.breakdown).toEqual([{ rule: "minutes", value: 45, points: 1 }]);
    });

    it("emits renderable {rule, value, points} entries and total = sum(points)", () => {
      const result = scorePlayer(
        stat({ position: "GK", minutes: 90, cleanSheet: true, saves: 4, penaltiesSaved: 1, yellowCards: 1 }),
      );
      expect(result.breakdown).toEqual([
        { rule: "minutes", value: 90, points: 2 },
        { rule: "cleanSheet", value: 1, points: 4 },
        { rule: "penaltiesSaved", value: 1, points: 5 },
        { rule: "yellowCards", value: 1, points: -1 },
        { rule: "saves", value: 4, points: 1 },
      ]);
      expect(result.total).toBe(11);
    });
  });

  describe("custom rules parameter", () => {
    it("defaults to SCORING_RULES but honours overrides", () => {
      const custom: ScoringRules = {
        ...SCORING_RULES,
        goal: { ...SCORING_RULES.goal, FWD: 5 },
        savesPerThree: 0,
      };
      const forward = stat({ position: "FWD", goals: 1 });
      expect(scorePlayer(forward).total).toBe(6);
      expect(scorePlayer(forward, custom).total).toBe(7);

      // Callers can zero out save points if the data feed is unreliable.
      const keeper = stat({ position: "GK", saves: 6 });
      expect(scorePlayer(keeper).total).toBe(4);
      expect(scorePlayer(keeper, custom).total).toBe(2);
    });
  });

  it("computes a combined stat line correctly", () => {
    // DEF, 90' (2) + 1 goal (6) + 1 assist (3) + CS (4) + yellow (-1) = 14
    const result = scorePlayer(
      stat({ position: "DEF", minutes: 90, goals: 1, assists: 1, cleanSheet: true, yellowCards: 1 }),
    );
    expect(result.total).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// scoreSquadRound
// ---------------------------------------------------------------------------

/**
 * Standard 1-4-4-2 squad used across scoreSquadRound tests:
 *   XI:    gk1 | d1 d2 d3 d4 | m1 m2 m3 m4 | f1 f2   (m1 captain, f1 vice)
 *   Bench: 12 gk2, 13 d5, 14 m5, 15 f3
 */
function standardSquad(): SquadPick[] {
  return [
    pick("gk1", 1, "GK"),
    pick("d1", 2, "DEF"),
    pick("d2", 3, "DEF"),
    pick("d3", 4, "DEF"),
    pick("d4", 5, "DEF"),
    pick("m1", 6, "MID", { isCaptain: true }),
    pick("m2", 7, "MID"),
    pick("m3", 8, "MID"),
    pick("m4", 9, "MID"),
    pick("f1", 10, "FWD", { isViceCaptain: true }),
    pick("f2", 11, "FWD"),
    pick("gk2", 12, "GK"),
    pick("d5", 13, "DEF"),
    pick("m5", 14, "MID"),
    pick("f3", 15, "FWD"),
  ];
}

/** 90-minute, no-event stat lines for the given ids (2 points each). */
function plainStats(ids: string[], positionOf: (id: string) => Position): PlayerStatLine[] {
  return ids.map((id) => stat({ playerId: id, position: positionOf(id), minutes: 90 }));
}

const positionFromId = (id: string): Position =>
  id.startsWith("gk") ? "GK" : id.startsWith("d") ? "DEF" : id.startsWith("m") ? "MID" : "FWD";

const allIds = ["gk1", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "f1", "f2", "gk2", "d5", "m5", "f3"];

describe("scoreSquadRound", () => {
  describe("basic totals and captaincy", () => {
    it("sums the XI with the captain doubled; bench excluded from total", () => {
      const stats = statsMap(plainStats(allIds, positionFromId));
      const result = scoreSquadRound(standardSquad(), stats);
      // 11 starters x 2pts + captain m1 doubled (+2) = 24
      expect(result.totalPoints).toBe(24);
      expect(result.captainPlayerId).toBe("m1");
      expect(result.autoSubs).toEqual([]);
      // 4 bench players x 2pts
      expect(result.benchPoints).toBe(8);
      expect(result.transferPenalty).toBe(0);
    });

    it("falls back to the vice-captain when the captain played 0 minutes", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "m1" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.captainPlayerId).toBe("f1");
      const vicePoints = result.playerPoints.find((p) => p.playerId === "f1");
      expect(vicePoints?.multiplier).toBe(2);
      expect(vicePoints?.points).toBe(4);
      // m1 (0 min) auto-subbed for m5; XI = 11 x 2 + vice bonus 2 = 24
      expect(result.totalPoints).toBe(24);
    });

    it("keeps the captain when the vice did not play", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "f1" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.captainPlayerId).toBe("m1");
      expect(result.playerPoints.find((p) => p.playerId === "m1")?.multiplier).toBe(2);
    });

    it("applies no multiplier when neither captain nor vice played", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "m1" || line.playerId === "f1" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.captainPlayerId).toBeNull();
      expect(result.playerPoints.every((p) => p.multiplier === 1)).toBe(true);
    });

    it("doubles the vice when the captain has no stat line at all", () => {
      const lines = plainStats(
        allIds.filter((id) => id !== "m1"),
        positionFromId,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.captainPlayerId).toBe("f1");
    });
  });

  describe("transfer penalty", () => {
    it("defaults to 0 when options are omitted", () => {
      const result = scoreSquadRound(standardSquad(), statsMap(plainStats(allIds, positionFromId)));
      expect(result.transferPenalty).toBe(0);
    });

    it("subtracts the penalty from totalPoints and reports it", () => {
      const stats = statsMap(plainStats(allIds, positionFromId));
      const result = scoreSquadRound(standardSquad(), stats, { transferPenalty: 8 });
      expect(result.transferPenalty).toBe(8);
      expect(result.totalPoints).toBe(24 - 8);
    });
  });

  describe("auto-subs", () => {
    it("treats a missing stat line as 0 minutes and subs the starter out", () => {
      const lines = plainStats(
        allIds.filter((id) => id !== "d3"),
        positionFromId,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      // Bench order: gk2 cannot replace a DEF (XI would have 2 GK); d5 can.
      expect(result.autoSubs).toEqual([{ out: "d3", in: "d5" }]);
      expect(result.playerPoints.find((p) => p.playerId === "d3")?.isStarter).toBe(false);
      expect(result.playerPoints.find((p) => p.playerId === "d5")?.isStarter).toBe(true);
    });

    it("uses bench priority order: earliest eligible bench slot comes in first", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "m2" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      // Both d5 (13) and m5 (14) played; d5 is earlier and 1-5-3-2 is valid.
      expect(result.autoSubs).toEqual([{ out: "m2", in: "d5" }]);
    });

    it("skips bench players who did not play", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "m2" || line.playerId === "d5" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.autoSubs).toEqual([{ out: "m2", in: "m5" }]);
    });

    it("makes multiple subs for multiple non-playing starters", () => {
      const dnp = new Set(["d3", "m2"]);
      const lines = plainStats(allIds, positionFromId).map((line) =>
        dnp.has(line.playerId) ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      // d5 (bench 13) covers the earliest slot (d3, slot 4); m5 covers m2.
      expect(result.autoSubs).toEqual([
        { out: "d3", in: "d5" },
        { out: "m2", in: "m5" },
      ]);
      expect(result.totalPoints).toBe(24);
      expect(result.benchPoints).toBe(4); // gk2 + f3 remain on the bench
    });

    it("only ever replaces the GK with the bench GK, even from a later bench slot", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "gk1" ? { ...line, minutes: 0 } : line,
      );
      // Move the bench GK to the LAST bench slot to prove outfielders are skipped.
      const squad = standardSquad().map((p) => {
        if (p.playerId === "gk2") return { ...p, position: 15 };
        if (p.playerId === "d5") return { ...p, position: 12 };
        if (p.playerId === "m5") return { ...p, position: 13 };
        if (p.playerId === "f3") return { ...p, position: 14 };
        return p;
      });
      const result = scoreSquadRound(squad, statsMap(lines));
      expect(result.autoSubs).toEqual([{ out: "gk1", in: "gk2" }]);
    });

    it("never brings the bench GK in for an outfield starter", () => {
      const dnpOrBenched = new Set(["d3", "d5", "m5", "f3"]);
      const lines = plainStats(allIds, positionFromId).map((line) =>
        dnpOrBenched.has(line.playerId) ? { ...line, minutes: 0 } : line,
      );
      // Only gk2 available on the bench, but it cannot replace DEF d3.
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.autoSubs).toEqual([]);
      expect(result.playerPoints.find((p) => p.playerId === "d3")?.isStarter).toBe(true);
    });

    it("blocks a sub that would drop the XI below 3 DEF", () => {
      // XI 1-3-4-3, DEF d3 did not play; only bench player who played is FWD f4.
      // Swapping DEF -> FWD would leave 2 DEF, so no sub happens.
      const squad: SquadPick[] = [
        pick("gk1", 1, "GK"),
        pick("d1", 2, "DEF"),
        pick("d2", 3, "DEF"),
        pick("d3", 4, "DEF"),
        pick("m1", 5, "MID", { isCaptain: true }),
        pick("m2", 6, "MID"),
        pick("m3", 7, "MID"),
        pick("m4", 8, "MID"),
        pick("f1", 9, "FWD", { isViceCaptain: true }),
        pick("f2", 10, "FWD"),
        pick("f3", 11, "FWD"),
        pick("f4", 12, "FWD"),
        pick("m5", 13, "MID"),
        pick("d4", 14, "DEF"),
        pick("gk2", 15, "GK"),
      ];
      const ids = squad.map((p) => p.playerId);
      const dnp = new Set(["d3", "m5", "d4", "gk2"]);
      const lines = plainStats(ids, positionFromId).map((line) =>
        dnp.has(line.playerId) ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(squad, statsMap(lines));
      expect(result.autoSubs).toEqual([]);
      // d3 stays in the XI on 0 points; f4's 2 points stay on the bench.
      expect(result.playerPoints.find((p) => p.playerId === "d3")?.isStarter).toBe(true);
      expect(result.benchPoints).toBe(2);
      expect(result.totalPoints).toBe(10 * 2 + 2); // 10 playing starters + captain bonus
    });

    it("skips an ineligible earlier bench player but uses a later one that fits", () => {
      // XI 1-4-5-1 with the lone FWD f1 not playing. Bench: m6 (12, played)
      // cannot come in (FWD would drop to 0); f2 (13, played) can.
      const squad: SquadPick[] = [
        pick("gk1", 1, "GK"),
        pick("d1", 2, "DEF"),
        pick("d2", 3, "DEF"),
        pick("d3", 4, "DEF"),
        pick("d4", 5, "DEF"),
        pick("m1", 6, "MID", { isCaptain: true }),
        pick("m2", 7, "MID", { isViceCaptain: true }),
        pick("m3", 8, "MID"),
        pick("m4", 9, "MID"),
        pick("m5", 10, "MID"),
        pick("f1", 11, "FWD"),
        pick("m6", 12, "MID"),
        pick("f2", 13, "FWD"),
        pick("d5", 14, "DEF"),
        pick("gk2", 15, "GK"),
      ];
      const ids = squad.map((p) => p.playerId);
      const dnp = new Set(["f1", "d5", "gk2"]);
      const lines = plainStats(ids, positionFromId).map((line) =>
        dnp.has(line.playerId) ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(squad, statsMap(lines));
      expect(result.autoSubs).toEqual([{ out: "f1", in: "f2" }]);
      // m6 played but stays on the bench.
      expect(result.playerPoints.find((p) => p.playerId === "m6")?.isStarter).toBe(false);
      expect(result.benchPoints).toBe(2);
    });

    it("allows an out-of-position sub when the formation stays valid", () => {
      // XI 1-4-4-2, FWD f2 did not play, first eligible bench player is DEF d5:
      // 1-5-4-1 is a valid formation, so the DEF comes in for the FWD.
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "f2" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.autoSubs).toEqual([{ out: "f2", in: "d5" }]);
    });

    it("gives the vice the armband when the captain is auto-subbed out", () => {
      const lines = plainStats(allIds, positionFromId).map((line) =>
        line.playerId === "m1" ? { ...line, minutes: 0 } : line,
      );
      const result = scoreSquadRound(standardSquad(), statsMap(lines));
      expect(result.autoSubs).toEqual([{ out: "m1", in: "d5" }]);
      expect(result.captainPlayerId).toBe("f1");
    });
  });

  describe("playerPoints bookkeeping", () => {
    it("returns one entry per pick with base points, multiplier and starter flag", () => {
      const stats = statsMap(plainStats(allIds, positionFromId));
      const result = scoreSquadRound(standardSquad(), stats);
      expect(result.playerPoints).toHaveLength(15);
      const captainEntry = result.playerPoints.find((p) => p.playerId === "m1");
      expect(captainEntry).toMatchObject({ basePoints: 2, multiplier: 2, points: 4, isStarter: true });
      const benchEntry = result.playerPoints.find((p) => p.playerId === "f3");
      expect(benchEntry).toMatchObject({ basePoints: 2, multiplier: 1, points: 2, isStarter: false });
    });

    it("honours a custom rules object via options", () => {
      const rules: ScoringRules = { ...SCORING_RULES, captainMultiplier: 3 };
      const stats = statsMap(plainStats(allIds, positionFromId));
      const result = scoreSquadRound(standardSquad(), stats, { rules });
      expect(result.playerPoints.find((p) => p.playerId === "m1")?.points).toBe(6);
      expect(result.totalPoints).toBe(26);
    });
  });
});

// ---------------------------------------------------------------------------
// validateSquad
// ---------------------------------------------------------------------------

/** A fully valid squad: 1-4-4-2, clubs spread 3/3/3/3/3, price 6 each. */
function validSquadFixture(): {
  picks: SquadPick[];
  prices: Map<string, number>;
  clubs: Map<string, string>;
  budget: number;
} {
  const picks = standardSquad();
  const clubsList = ["Bolívar", "The Strongest", "Always Ready", "Blooming", "Oriente Petrolero"];
  const clubs = new Map(picks.map((p, i) => [p.playerId, clubsList[i % 5] as string]));
  const prices = new Map(picks.map((p) => [p.playerId, 6]));
  return { picks, prices, clubs, budget: 100 };
}

describe("validateSquad", () => {
  it("accepts a fully valid squad", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const result = validateSquad(picks, prices, clubs, budget);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("exports the composition, club limit and formation bounds as data", () => {
    expect(SQUAD_COMPOSITION).toEqual({ GK: 2, DEF: 5, MID: 5, FWD: 3 });
    expect(MAX_PLAYERS_PER_CLUB).toBe(3);
    expect(FORMATION_BOUNDS.DEF).toEqual({ min: 3, max: 5 });
  });

  it("flags a squad that is not exactly 15 players", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const result = validateSquad(picks.slice(0, 14), prices, clubs, budget);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "squad.invalidSize",
      context: { expected: 15, actual: 14 },
    });
  });

  it("flags duplicate players", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const withDup = picks.map((p) => (p.playerId === "f3" ? { ...p, playerId: "f2" } : p));
    const result = validateSquad(withDup, prices, clubs, budget);
    expect(result.errors.some((e) => e.code === "squad.duplicatePlayer")).toBe(true);
  });

  it("flags invalid or repeated slot numbers", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const badSlots = picks.map((p) => (p.playerId === "f3" ? { ...p, position: 16 } : p));
    expect(validateSquad(badSlots, prices, clubs, budget).errors.some((e) => e.code === "squad.invalidSlots")).toBe(true);
    const dupSlots = picks.map((p) => (p.playerId === "f3" ? { ...p, position: 14 } : p));
    expect(validateSquad(dupSlots, prices, clubs, budget).errors.some((e) => e.code === "squad.invalidSlots")).toBe(true);
  });

  it("flags wrong composition (needs 2 GK / 5 DEF / 5 MID / 3 FWD)", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    // Turn bench DEF d5 into a third GK: 3 GK and 4 DEF are both wrong.
    const mutated = picks.map((p) => (p.playerId === "d5" ? { ...p, fieldPosition: "GK" as const } : p));
    const result = validateSquad(mutated, prices, clubs, budget);
    expect(result.errors).toContainEqual({
      code: "squad.invalidPositionCount",
      context: { position: "GK", expected: 2, actual: 3 },
    });
    expect(result.errors).toContainEqual({
      code: "squad.invalidPositionCount",
      context: { position: "DEF", expected: 5, actual: 4 },
    });
  });

  it("flags more than 3 players from one club", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    clubs.set("gk1", "Bolívar");
    clubs.set("d1", "Bolívar");
    clubs.set("d2", "Bolívar");
    clubs.set("d3", "Bolívar");
    const result = validateSquad(picks, prices, clubs, budget);
    const error = result.errors.find((e) => e.code === "squad.tooManyFromClub");
    expect(error?.context).toMatchObject({ club: "Bolívar", max: 3 });
  });

  it("flags a squad over budget", () => {
    const { picks, prices, clubs } = validSquadFixture();
    const result = validateSquad(picks, prices, clubs, 89); // total price is 90
    expect(result.errors).toContainEqual({
      code: "squad.overBudget",
      context: { totalPrice: 90, budget: 89 },
    });
  });

  it("accepts a squad exactly at budget", () => {
    const { picks, prices, clubs } = validSquadFixture();
    expect(validateSquad(picks, prices, clubs, 90).valid).toBe(true);
  });

  it("flags missing price or club data per player", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    prices.delete("m3");
    clubs.delete("f1");
    const result = validateSquad(picks, prices, clubs, budget);
    expect(result.errors).toContainEqual({ code: "squad.missingPrice", context: { playerId: "m3" } });
    expect(result.errors).toContainEqual({ code: "squad.missingClub", context: { playerId: "f1" } });
  });

  it("flags an invalid starting formation (e.g. 2 GK in the XI)", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    // Swap slots of gk2 (bench 12) and f2 (starter 11): XI becomes 2-4-4-1.
    const mutated = picks.map((p) => {
      if (p.playerId === "gk2") return { ...p, position: 11 };
      if (p.playerId === "f2") return { ...p, position: 12 };
      return p;
    });
    const result = validateSquad(mutated, prices, clubs, budget);
    expect(result.errors).toContainEqual({
      code: "squad.invalidFormation",
      context: { GK: 2, DEF: 4, MID: 4, FWD: 1 },
    });
  });

  it("flags a formation with too many forwards (max 3)", () => {
    // 1-3-3-4 XI: composition still 2/5/5/3 is impossible with 4 FWD in XI,
    // so build composition errors aside — use a squad with FWD-heavy XI.
    const picks: SquadPick[] = [
      pick("gk1", 1, "GK"),
      pick("d1", 2, "DEF"),
      pick("d2", 3, "DEF"),
      pick("d3", 4, "DEF"),
      pick("m1", 5, "MID", { isCaptain: true }),
      pick("m2", 6, "MID"),
      pick("m3", 7, "MID"),
      pick("f1", 8, "FWD", { isViceCaptain: true }),
      pick("f2", 9, "FWD"),
      pick("f3", 10, "FWD"),
      pick("f4", 11, "FWD"),
      pick("gk2", 12, "GK"),
      pick("d4", 13, "DEF"),
      pick("d5", 14, "DEF"),
      pick("m4", 15, "MID"),
    ];
    const prices = new Map(picks.map((p) => [p.playerId, 5]));
    const clubs = new Map(picks.map((p, i) => [p.playerId, `club${i % 5}`]));
    const result = validateSquad(picks, prices, clubs, 100);
    expect(result.errors.some((e) => e.code === "squad.invalidFormation")).toBe(true);
  });

  it("flags missing and duplicate captains", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const none = picks.map((p) => ({ ...p, isCaptain: false }));
    expect(validateSquad(none, prices, clubs, budget).errors).toContainEqual({
      code: "squad.invalidCaptainCount",
      context: { count: 0 },
    });
    const two = picks.map((p) => (p.playerId === "m2" ? { ...p, isCaptain: true } : p));
    expect(validateSquad(two, prices, clubs, budget).errors).toContainEqual({
      code: "squad.invalidCaptainCount",
      context: { count: 2 },
    });
  });

  it("flags missing and duplicate vice-captains", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const none = picks.map((p) => ({ ...p, isViceCaptain: false }));
    expect(validateSquad(none, prices, clubs, budget).errors).toContainEqual({
      code: "squad.invalidViceCaptainCount",
      context: { count: 0 },
    });
    const two = picks.map((p) => (p.playerId === "m2" ? { ...p, isViceCaptain: true } : p));
    expect(validateSquad(two, prices, clubs, budget).errors).toContainEqual({
      code: "squad.invalidViceCaptainCount",
      context: { count: 2 },
    });
  });

  it("requires captain and vice to be in the starting XI", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const benchCaptain = picks.map((p) => {
      if (p.playerId === "m1") return { ...p, isCaptain: false };
      if (p.playerId === "m5") return { ...p, isCaptain: true };
      return p;
    });
    expect(validateSquad(benchCaptain, prices, clubs, budget).errors).toContainEqual({
      code: "squad.captainNotStarter",
      context: { playerId: "m5" },
    });
    const benchVice = picks.map((p) => {
      if (p.playerId === "f1") return { ...p, isViceCaptain: false };
      if (p.playerId === "f3") return { ...p, isViceCaptain: true };
      return p;
    });
    expect(validateSquad(benchVice, prices, clubs, budget).errors).toContainEqual({
      code: "squad.viceCaptainNotStarter",
      context: { playerId: "f3" },
    });
  });

  it("rejects the same player as captain and vice-captain", () => {
    const { picks, prices, clubs, budget } = validSquadFixture();
    const same = picks.map((p) => {
      if (p.playerId === "f1") return { ...p, isViceCaptain: false };
      if (p.playerId === "m1") return { ...p, isViceCaptain: true };
      return p;
    });
    expect(validateSquad(same, prices, clubs, budget).errors).toContainEqual({
      code: "squad.captainIsViceCaptain",
      context: { playerId: "m1" },
    });
  });

  it("reports every violation, not just the first", () => {
    const { picks, prices, clubs } = validSquadFixture();
    const broken = picks
      .slice(0, 14)
      .map((p) => ({ ...p, isCaptain: false, isViceCaptain: false }));
    const result = validateSquad(broken, prices, clubs, 10);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("squad.invalidSize");
    expect(codes).toContain("squad.overBudget");
    expect(codes).toContain("squad.invalidCaptainCount");
    expect(codes).toContain("squad.invalidViceCaptainCount");
  });
});

// ---------------------------------------------------------------------------
// Integration: a full realistic round
// ---------------------------------------------------------------------------

describe("integration: full round", () => {
  it("scores a realistic round with auto-subs, captaincy and a transfer hit", () => {
    // Squad (1-3-4-3): XI gk1 | d1 d2 d3 | m1(C) m2 m3 m4 | f1(V) f2 f3
    // Bench: 12 gk2, 13 d4, 14 m5, 15 f4
    const picks: SquadPick[] = [
      pick("gk1", 1, "GK"),
      pick("d1", 2, "DEF"),
      pick("d2", 3, "DEF"),
      pick("d3", 4, "DEF"),
      pick("m1", 5, "MID", { isCaptain: true }),
      pick("m2", 6, "MID"),
      pick("m3", 7, "MID"),
      pick("m4", 8, "MID"),
      pick("f1", 9, "FWD", { isViceCaptain: true }),
      pick("f2", 10, "FWD"),
      pick("f3", 11, "FWD"),
      pick("gk2", 12, "GK"),
      pick("d4", 13, "DEF"),
      pick("m5", 14, "MID"),
      pick("f4", 15, "FWD"),
    ];

    // Hand-computed expected points:
    //   gk1: 90' (2) + clean sheet GK (4) + 3 saves (1)            =  7
    //   d1:  90' (2) + goal DEF (6) + clean sheet (4)              = 12
    //   d2:  90' (2) + clean sheet (4)                             =  6
    //   d3:  DNP -> auto-subbed out for d4 (bench slot 13)
    //   d4:  90' (2) + 2 conceded (-1), no clean sheet             =  1
    //   m1:  85' (2) + goal MID (5) + assist (3) = 10, captain x2  = 20
    //   m2:  60' (2) + yellow (-1)                                 =  1
    //   m3:  55' (1) + assist (3)                                  =  4
    //   m4:  DNP -> auto-subbed out for m5 (bench slot 14)
    //   m5:  20' (1)                                               =  1
    //   f1:  90' (2) + 2 goals FWD (8), vice not needed            = 10
    //   f2:  70' (2) + penalty miss (-2)                           =  0
    //   f3:  30' (1)                                               =  1
    //   XI total = 7+12+6+1+20+1+4+1+10+0+1                        = 63
    //   Bench after subs: gk2 (0), d3 (0), m4 (0), f4 90' + goal   =  6
    //   Transfer penalty                                           = -4
    //   totalPoints = 63 - 4                                       = 59
    const stats = statsMap([
      stat({ playerId: "gk1", position: "GK", minutes: 90, cleanSheet: true, saves: 3 }),
      stat({ playerId: "d1", position: "DEF", minutes: 90, goals: 1, cleanSheet: true }),
      stat({ playerId: "d2", position: "DEF", minutes: 90, cleanSheet: true }),
      stat({ playerId: "d3", position: "DEF", minutes: 0 }),
      stat({ playerId: "m1", position: "MID", minutes: 85, goals: 1, assists: 1 }),
      stat({ playerId: "m2", position: "MID", minutes: 60, yellowCards: 1 }),
      stat({ playerId: "m3", position: "MID", minutes: 55, assists: 1 }),
      // m4 has no stat line at all: did not play.
      stat({ playerId: "f1", position: "FWD", minutes: 90, goals: 2 }),
      stat({ playerId: "f2", position: "FWD", minutes: 70, penaltiesMissed: 1 }),
      stat({ playerId: "f3", position: "FWD", minutes: 30 }),
      stat({ playerId: "gk2", position: "GK", minutes: 0 }),
      stat({ playerId: "d4", position: "DEF", minutes: 90, goalsConceded: 2 }),
      stat({ playerId: "m5", position: "MID", minutes: 20 }),
      stat({ playerId: "f4", position: "FWD", minutes: 90, goals: 1 }),
    ]);

    const result = scoreSquadRound(picks, stats, { transferPenalty: 4 });

    expect(result.autoSubs).toEqual([
      { out: "d3", in: "d4" },
      { out: "m4", in: "m5" },
    ]);
    expect(result.captainPlayerId).toBe("m1");
    expect(result.benchPoints).toBe(6);
    expect(result.transferPenalty).toBe(4);
    expect(result.totalPoints).toBe(59);

    const points = new Map(result.playerPoints.map((p) => [p.playerId, p.points]));
    expect(points.get("gk1")).toBe(7);
    expect(points.get("d1")).toBe(12);
    expect(points.get("d4")).toBe(1);
    expect(points.get("m1")).toBe(20);
    expect(points.get("f1")).toBe(10);
    expect(points.get("f4")).toBe(6);

    // The two subbed-out starters and the unused keeper end on the bench.
    const benchIds = result.playerPoints.filter((p) => !p.isStarter).map((p) => p.playerId);
    expect(benchIds.sort()).toEqual(["d3", "f4", "gk2", "m4"]);
  });
});
