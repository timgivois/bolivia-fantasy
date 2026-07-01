import { z } from "zod";

/**
 * Placeholder exports for @bolivia-fantasy/shared.
 * Real shared zod schemas and types (players, squads, scoring events, ...)
 * will live here.
 */
export const healthSchema = z.object({
  status: z.literal("ok"),
});

export type Health = z.infer<typeof healthSchema>;

export const SHARED_PACKAGE = "@bolivia-fantasy/shared";
