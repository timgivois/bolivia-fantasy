import { cookies } from "next/headers";

import type {
  Club,
  PickInput,
  PlayerLite,
  RoundInfo,
  SavedPick,
  SquadInfo,
} from "@/components/squad/types";

/**
 * Server-only client for the Fastify API (apps/api). Never import this from
 * a client component: it reads the Auth.js session cookie via next/headers.
 * Client components must go through the server actions in app/equipo/actions.ts.
 */

const API_URL =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

/** Error envelope thrown for non-2xx API responses: { error: { code, ... } }. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiErrorPayload,
  ) {
    super(`${payload.code}: ${payload.message}`);
    this.name = "ApiError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const store = await cookies();
  // The API decodes Bearer tokens with the plain cookie-name salt, so only
  // the non-secure cookie can travel as Authorization. The __Secure- variant
  // (https deployments) must keep its own name so the salt matches — forward
  // it as a Cookie header instead (the API accepts both, see apps/api/src/auth.ts).
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) return { Authorization: `Bearer ${token}` };
  const secureToken = store.get(SECURE_SESSION_COOKIE)?.value;
  if (secureToken) {
    return { Cookie: `${SECURE_SESSION_COOKIE}=${encodeURIComponent(secureToken)}` };
  }
  return {};
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT";
  body?: unknown;
  /** Attach the Auth.js session token (required for /me/* routes). */
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = options.auth ? await authHeaders() : {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {
      code: "api.unexpected",
      message: `API responded with status ${response.status}`,
    };
    try {
      const data = (await response.json()) as { error?: ApiErrorPayload };
      if (data.error?.code) payload = data.error;
    } catch {
      // Non-JSON error body; keep the fallback payload.
    }
    throw new ApiError(response.status, payload);
  }

  return (await response.json()) as T;
}

// ---------------------------------------------------------------------------
// Public endpoints
// ---------------------------------------------------------------------------

export async function getClubs(): Promise<Club[]> {
  const data = await request<{ items: Club[] }>("/clubs");
  return data.items;
}

/**
 * Fetch every active player by walking the paginated /players endpoint
 * (perPage caps at 100). Filtering/sorting then happens client-side in the
 * picker, which keeps search and tab switches instant. A 16-club league has
 * a few hundred players at most; the page cap is a safety net.
 */
export async function getAllPlayers(): Promise<PlayerLite[]> {
  const perPage = 100;
  const maxPages = 10;
  const players: PlayerLite[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await request<{ items: PlayerLite[]; total: number }>(
      `/players?page=${page}&perPage=${perPage}&sort=price&order=desc`,
    );
    players.push(...data.items);
    if (players.length >= data.total || data.items.length < perPage) break;
  }
  return players;
}

/** Current round, or null when the API reports none (round.noCurrent). */
export async function getCurrentRound(): Promise<RoundInfo | null> {
  try {
    return await request<RoundInfo>("/rounds/current");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Authenticated /me endpoints
// ---------------------------------------------------------------------------

export interface MySquadResponse {
  squad: SquadInfo;
  roundId: number | null;
  picks: SavedPick[];
}

/** The user's squad with current-round picks, or null if none exists yet. */
export async function getMySquad(): Promise<MySquadResponse | null> {
  try {
    return await request<MySquadResponse>("/me/squad", { auth: true });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      error.payload.code === "squad.notFound"
    ) {
      return null;
    }
    throw error;
  }
}

export async function createSquad(name: string): Promise<SquadInfo> {
  return request<SquadInfo>("/me/squad", { method: "POST", body: { name }, auth: true });
}

export interface PutPicksResponse {
  roundId: number;
  budget: number;
  picks: Array<{ playerId: number; position: number; purchasePrice: number }>;
}

export async function putSquadPicks(
  roundId: number,
  picks: PickInput[],
): Promise<PutPicksResponse> {
  return request<PutPicksResponse>("/me/squad/picks", {
    method: "PUT",
    body: { roundId, picks },
    auth: true,
  });
}

export interface TransferResponse {
  transfer: { id: number; playerOutId: number; playerInId: number };
  budget: number;
}

export async function postTransfer(
  roundId: number,
  playerOutId: number,
  playerInId: number,
): Promise<TransferResponse> {
  return request<TransferResponse>("/me/transfers", {
    method: "POST",
    body: { roundId, out: playerOutId, in: playerInId },
    auth: true,
  });
}
