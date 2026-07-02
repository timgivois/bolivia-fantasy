import { playerFixtureStats, type Database, type PlayerPosition } from "@bolivia-fantasy/db";
import { scorePlayer } from "@bolivia-fantasy/scoring";
import { inArray } from "drizzle-orm";

/**
 * Sums fantasy points (via the scoring engine) across all recorded fixture
 * stat lines for the given players. Players without stats map to 0.
 */
export async function computeTotalPoints(
  db: Database,
  playerRows: ReadonlyArray<{ id: number; position: PlayerPosition }>,
): Promise<Map<number, number>> {
  const totals = new Map<number, number>(playerRows.map((p) => [p.id, 0]));
  if (playerRows.length === 0) return totals;

  const positions = new Map(playerRows.map((p) => [p.id, p.position]));
  const stats = await db
    .select()
    .from(playerFixtureStats)
    .where(inArray(playerFixtureStats.playerId, [...totals.keys()]));

  for (const stat of stats) {
    const position = positions.get(stat.playerId);
    if (!position) continue;
    const { total } = scorePlayer({
      playerId: String(stat.playerId),
      position,
      minutes: stat.minutes,
      goals: stat.goals,
      assists: stat.assists,
      cleanSheet: stat.cleanSheet,
      goalsConceded: stat.goalsConceded,
      penaltiesSaved: stat.penaltiesSaved,
      penaltiesMissed: stat.penaltiesMissed,
      yellowCards: stat.yellowCards,
      redCards: stat.redCards,
      ownGoals: stat.ownGoals,
      saves: stat.saves,
    });
    totals.set(stat.playerId, (totals.get(stat.playerId) ?? 0) + total);
  }
  return totals;
}
