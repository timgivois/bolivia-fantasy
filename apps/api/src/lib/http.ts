import { z } from "@bolivia-fantasy/shared";
import type { FastifyReply } from "fastify";

/** Uniform error envelope: { error: { code, message, details? } }. */
export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): FastifyReply {
  return reply
    .code(status)
    .send({ error: { code, message, ...(details === undefined ? {} : { details }) } });
}

/**
 * Validates `data` with a zod schema. On failure sends a 400 and returns
 * null — callers must `return` immediately when null is returned.
 */
export function parseOr400<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  reply: FastifyReply,
): z.infer<T> | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    sendError(reply, 400, "request.invalid", "Invalid request", result.error.flatten());
    return null;
  }
  return result.data;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;
