"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { PickInput, SquadInfo, ValidationErrorLike } from "@/components/squad/types";
import {
  ApiError,
  createSquad,
  postTransfer,
  putSquadPicks,
  type PutPicksResponse,
  type TransferResponse,
} from "@/lib/api";

/**
 * Server actions bridging the client-side squad builder and the Fastify API.
 * Errors come back as data (never thrown) so the client can translate the
 * API error codes into Spanish via the "squad.errors" message namespace.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      /** API error code, e.g. "round.locked" or "squad.invalid". */
      code: string;
      /** Squad-rule violations (details of squad.invalid / transfer.invalidSquad). */
      validation?: ValidationErrorLike[];
    };

function toFailure<T>(error: unknown): ActionResult<T> {
  if (error instanceof ApiError) {
    const details = error.payload.details;
    const validation =
      Array.isArray(details) &&
      details.every((entry) => typeof entry === "object" && entry !== null && "code" in entry)
        ? (details as ValidationErrorLike[])
        : undefined;
    return { ok: false, code: error.payload.code, validation };
  }
  return { ok: false, code: "api.unexpected" };
}

async function requireSession(): Promise<boolean> {
  const session = await auth();
  return Boolean(session?.user);
}

export async function createSquadAction(name: string): Promise<ActionResult<SquadInfo>> {
  if (!(await requireSession())) return { ok: false, code: "auth.missingToken" };
  try {
    const squad = await createSquad(name);
    revalidatePath("/equipo");
    return { ok: true, data: squad };
  } catch (error) {
    return toFailure(error);
  }
}

export async function savePicksAction(
  roundId: number,
  picks: PickInput[],
): Promise<ActionResult<PutPicksResponse>> {
  if (!(await requireSession())) return { ok: false, code: "auth.missingToken" };
  try {
    const result = await putSquadPicks(roundId, picks);
    revalidatePath("/equipo");
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}

export async function transferAction(
  roundId: number,
  playerOutId: number,
  playerInId: number,
): Promise<ActionResult<TransferResponse>> {
  if (!(await requireSession())) return { ok: false, code: "auth.missingToken" };
  try {
    const result = await postTransfer(roundId, playerOutId, playerInId);
    revalidatePath("/equipo");
    return { ok: true, data: result };
  } catch (error) {
    return toFailure(error);
  }
}
