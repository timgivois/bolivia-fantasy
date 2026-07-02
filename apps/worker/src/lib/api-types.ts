/**
 * Minimal shapes of the API-Football v3 responses the worker consumes.
 * Only the fields we actually read are typed; everything else is ignored.
 */

/** GET /teams?league&season — one entry per club. */
export interface ApiTeamEntry {
  team: {
    id: number;
    name: string;
    code: string | null;
    logo: string | null;
  };
}

/** GET /players?league&season&page — season-aggregate player profile. */
export interface ApiPlayerEntry {
  player: {
    id: number;
    name: string;
    photo: string | null;
  };
  statistics: Array<{
    team: { id: number; name: string };
    games: {
      /** "Goalkeeper" | "Defender" | "Midfielder" | "Attacker" */
      position: string | null;
    };
  }>;
}

/** GET /fixtures?... — one entry per fixture. */
export interface ApiFixtureEntry {
  fixture: {
    id: number;
    date: string;
    status: {
      long: string;
      short: string;
      elapsed: number | null;
    };
  };
  league: {
    id: number;
    season: number;
    /** e.g. "Apertura - 5" */
    round: string;
  };
  teams: {
    home: { id: number; name: string };
    away: { id: number; name: string };
  };
  goals: { home: number | null; away: number | null };
}

/** GET /fixtures/events — one entry per match event. */
export interface ApiEventEntry {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number | null; name: string | null };
  assist: { id: number | null; name: string | null };
  /** "Goal" | "Card" | "subst" | "Var" */
  type: string;
  /** e.g. "Normal Goal", "Own Goal", "Penalty", "Missed Penalty",
   *  "Yellow Card", "Red Card", "Second Yellow card", "Substitution 1" */
  detail: string;
}

/** GET /fixtures/players — one entry per team, full stat lines. */
export interface ApiFixturePlayersTeam {
  team: { id: number; name: string };
  players: Array<{
    player: { id: number; name: string };
    statistics: Array<{
      games: {
        minutes: number | null;
        position: string | null;
        rating: string | null;
        substitute: boolean;
      };
      goals: {
        total: number | null;
        conceded: number | null;
        assists: number | null;
        saves: number | null;
      };
      cards: { yellow: number | null; red: number | null };
      penalty: {
        scored: number | null;
        missed: number | null;
        saved: number | null;
      };
    }>;
  }>;
}
