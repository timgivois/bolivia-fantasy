/**
 * Event-stream processing shared by the live poller (provisional stats)
 * and the post-match job (own goals + score fallback).
 *
 * API-Football event conventions relied upon (documented in README.md):
 * - type "Goal": detail "Normal Goal" | "Penalty" | "Own Goal" |
 *   "Missed Penalty". The event's `team` is the team the goal COUNTS FOR
 *   (own goals are listed under the benefiting team, with the opponent's
 *   player). "Missed Penalty" is not a goal.
 * - type "Card": detail "Yellow Card" | "Red Card" | "Second Yellow card".
 *   A second yellow is reported as its own detail, so counting raw details
 *   yields the exact shape the scoring engine expects (yellow=1, red=1).
 * - type "subst": `player` is the player leaving the pitch, `assist` is
 *   the player coming on.
 */

import type { ApiEventEntry } from "./api-types.js";

export interface EventDerivedStats {
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  /** Match minute the player came on (undefined = started or unknown). */
  subbedInAt?: number;
  /** Match minute the player went off. */
  subbedOutAt?: number;
}

function blank(): EventDerivedStats {
  return {
    goals: 0,
    assists: 0,
    ownGoals: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
  };
}

/** Per-player (API-Football player id) stat deltas derived from events. */
export function deriveStatsFromEvents(
  events: readonly ApiEventEntry[],
): Map<number, EventDerivedStats> {
  const byPlayer = new Map<number, EventDerivedStats>();
  const ensure = (playerId: number | null): EventDerivedStats | null => {
    if (playerId == null) return null;
    let entry = byPlayer.get(playerId);
    if (!entry) {
      entry = blank();
      byPlayer.set(playerId, entry);
    }
    return entry;
  };

  for (const event of events) {
    const minute = event.time.elapsed + (event.time.extra ?? 0);
    const player = ensure(event.player?.id ?? null);
    switch (event.type) {
      case "Goal": {
        if (!player) break;
        switch (event.detail) {
          case "Own Goal":
            player.ownGoals += 1;
            break;
          case "Missed Penalty":
            player.penaltiesMissed += 1;
            break;
          case "Normal Goal":
          case "Penalty":
          default:
            player.goals += 1;
            if (event.detail === "Normal Goal") {
              const assist = ensure(event.assist?.id ?? null);
              if (assist) assist.assists += 1;
            }
            break;
        }
        break;
      }
      case "Card": {
        if (!player) break;
        if (event.detail === "Yellow Card") player.yellowCards += 1;
        else if (
          event.detail === "Red Card" ||
          /second yellow/i.test(event.detail)
        ) {
          player.redCards += 1;
        }
        break;
      }
      case "subst": {
        if (player) player.subbedOutAt = minute;
        const cameOn = ensure(event.assist?.id ?? null);
        if (cameOn) cameOn.subbedInAt = minute;
        break;
      }
      default:
        break;
    }
  }
  return byPlayer;
}

/**
 * Provisional minutes for a player seen in the event stream: from their
 * sub-in (or kickoff) to their sub-out (or the current elapsed minute).
 * Players with no events at all get no provisional row — full minutes
 * arrive with the post-match /fixtures/players pass.
 */
export function provisionalMinutes(
  stats: EventDerivedStats,
  elapsed: number,
): number {
  const from = stats.subbedInAt ?? 0;
  const to = stats.subbedOutAt ?? elapsed;
  return Math.max(Math.min(to, 120) - from, 0);
}

/**
 * Derive the score from goal events (own goals already count for the
 * benefiting team per the event convention above). Returns null when the
 * stream contains no goal events.
 */
export function scoreFromEvents(
  events: readonly ApiEventEntry[],
  homeTeamApiId: number,
  awayTeamApiId: number,
): { home: number; away: number } | null {
  let home = 0;
  let away = 0;
  let sawGoal = false;
  for (const event of events) {
    if (event.type !== "Goal" || event.detail === "Missed Penalty") continue;
    sawGoal = true;
    if (event.team.id === homeTeamApiId) home += 1;
    else if (event.team.id === awayTeamApiId) away += 1;
  }
  return sawGoal ? { home, away } : null;
}
