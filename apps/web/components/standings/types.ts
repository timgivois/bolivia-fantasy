/**
 * Client-safe shapes mirroring GET /leaderboard/global
 * (apps/api/src/routes/public.ts).
 */

export interface LeaderboardEntry {
  rank: number;
  squadId: number;
  squadName: string;
  userName: string | null;
  points: number;
}

export interface LeaderboardResponse {
  items: LeaderboardEntry[];
  page: number;
  perPage: number;
  total: number;
}
