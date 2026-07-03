/**
 * Client-safe shapes mirroring the /leagues routes
 * (apps/api/src/routes/leagues.ts).
 */

export interface LeagueInfo {
  id: number;
  name: string;
  inviteCode: string;
  ownerId: string;
}

export interface MyLeague extends LeagueInfo {
  memberCount: number;
}

export interface LeagueStandingEntry {
  rank: number;
  userId: string;
  userName: string | null;
  /** Null while the member has not created a squad yet. */
  squadId: number | null;
  squadName: string | null;
  totalPoints: number;
  joinedAt: string;
}

export interface LeagueStandingsResponse {
  league: LeagueInfo;
  standings: LeagueStandingEntry[];
}
