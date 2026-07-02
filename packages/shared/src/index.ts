import { z } from "zod";

// Re-export zod so downstream workspace packages (e.g. apps/api) can build
// validation schemas without declaring their own zod dependency/version.
export { z };

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
