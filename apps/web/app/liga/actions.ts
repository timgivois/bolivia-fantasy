"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { LeagueInfo } from "@/components/leagues/types";
import { ApiError, createLeague, joinLeague } from "@/lib/api";

/**
 * Server actions bridging the leagues UI and the Fastify API. Errors come
 * back as data so the client can translate the API error codes into
 * Spanish via the "leagues.errors" message namespace.
 */

export type LeagueActionResult =
  | { ok: true; league: LeagueInfo }
  | { ok: false; code: string };

function toFailure(error: unknown): LeagueActionResult {
  if (error instanceof ApiError) return { ok: false, code: error.payload.code };
  return { ok: false, code: "api.unexpected" };
}

export async function createLeagueAction(name: string): Promise<LeagueActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    const league = await createLeague(name);
    revalidatePath("/liga");
    return { ok: true, league };
  } catch (error) {
    return toFailure(error);
  }
}

export async function joinLeagueAction(code: string): Promise<LeagueActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    const league = await joinLeague(code.trim().toUpperCase());
    revalidatePath("/liga");
    return { ok: true, league };
  } catch (error) {
    return toFailure(error);
  }
}
