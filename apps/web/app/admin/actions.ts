"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { StatFields, StatLine } from "@/components/admin/types";
import type { FixtureItem } from "@/components/points/types";
import type { PlayerLite, RoundInfo } from "@/components/squad/types";
import {
  ApiError,
  getFixtures,
  getStatLine,
  lockRound,
  putStatCorrection,
  unlockRound,
  updatePlayerPrice,
} from "@/lib/api";

/**
 * Server actions bridging the admin UI and the Fastify /admin routes. The
 * role check lives in the API (users.role = 'admin'); errors come back as
 * data so the client can translate the codes via the "admin.errors" message
 * namespace. Mutations revalidate /admin so server-rendered data stays fresh.
 */

export type AdminActionResult<T> = { ok: true; data: T } | { ok: false; code: string };

function toFailure<T>(error: unknown): AdminActionResult<T> {
  if (error instanceof ApiError) return { ok: false, code: error.payload.code };
  return { ok: false, code: "api.unexpected" };
}

export async function updatePlayerPriceAction(
  playerId: number,
  price: number,
): Promise<AdminActionResult<PlayerLite>> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    const player = await updatePlayerPrice(playerId, price);
    revalidatePath("/admin");
    return { ok: true, data: player };
  } catch (error) {
    return toFailure(error);
  }
}

export async function lockRoundAction(
  roundId: number,
): Promise<AdminActionResult<RoundInfo>> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    const round = await lockRound(roundId);
    revalidatePath("/admin");
    return { ok: true, data: round };
  } catch (error) {
    return toFailure(error);
  }
}

export async function unlockRoundAction(
  roundId: number,
): Promise<AdminActionResult<RoundInfo>> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    const round = await unlockRound(roundId);
    revalidatePath("/admin");
    return { ok: true, data: round };
  } catch (error) {
    return toFailure(error);
  }
}

/** Fixtures of a round, for the stat-corrections cascading selects. */
export async function loadFixturesAction(
  roundId: number,
): Promise<AdminActionResult<FixtureItem[]>> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    return { ok: true, data: await getFixtures(roundId) };
  } catch (error) {
    return toFailure(error);
  }
}

/** Existing stat line to pre-fill the correction form; null when none exists. */
export async function loadStatLineAction(
  fixtureId: number,
  playerId: number,
): Promise<AdminActionResult<StatLine | null>> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    return { ok: true, data: await getStatLine(fixtureId, playerId) };
  } catch (error) {
    return toFailure(error);
  }
}

export async function saveStatCorrectionAction(
  fixtureId: number,
  playerId: number,
  fields: StatFields,
): Promise<AdminActionResult<StatLine>> {
  const session = await auth();
  if (!session?.user) return { ok: false, code: "auth.missingToken" };
  try {
    const line = await putStatCorrection(fixtureId, playerId, fields);
    revalidatePath("/admin");
    return { ok: true, data: line };
  } catch (error) {
    return toFailure(error);
  }
}
