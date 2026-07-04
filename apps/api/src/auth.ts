import { decode, type JWT } from "@auth/core/jwt";
import { users, type Database, type User } from "@bolivia-fantasy/db";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { sendError } from "./lib/http.js";

/**
 * Auth.js (apps/web) issues encrypted JWTs whose encryption key is derived
 * from AUTH_SECRET + the cookie name as salt. We accept the session token
 * either as the session cookie or as `Authorization: Bearer <token>`
 * (decoded with the plain cookie-name salt).
 */
const SESSION_COOKIE = "authjs.session-token";
const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token";

function parseCookies(header: string): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const name = part.slice(0, eqIdx).trim();
    const value = part.slice(eqIdx + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }
  return cookies;
}

interface ExtractedToken {
  token: string;
  salt: string;
}

function extractToken(request: FastifyRequest): ExtractedToken | null {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    const token = authorization.slice("Bearer ".length).trim();
    if (token) return { token, salt: SESSION_COOKIE };
  }
  const cookieHeader = request.headers.cookie;
  if (typeof cookieHeader === "string" && cookieHeader.length > 0) {
    const cookies = parseCookies(cookieHeader);
    // The salt MUST be the cookie name the token was issued under.
    for (const name of [SESSION_COOKIE, SECURE_SESSION_COOKIE]) {
      const token = cookies.get(name);
      if (token) return { token, salt: name };
    }
  }
  return null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Find-or-create the users row for a decoded session token, keyed by email. */
export async function findOrCreateUser(db: Database, payload: JWT): Promise<User | null> {
  const email = optionalString(payload.email);
  if (!email) return null;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return existing;

  const inserted = await db
    .insert(users)
    .values({
      email,
      name: optionalString(payload.name),
      image: optionalString(payload.picture),
      provider: optionalString(payload.provider),
      providerAccountId:
        optionalString(payload.providerAccountId) ?? optionalString(payload.sub),
    })
    // Race-safe: a concurrent request may have created the row; fall through
    // to a re-select instead of failing on the unique email constraint.
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (inserted[0]) return inserted[0];

  return (await db.query.users.findFirst({ where: eq(users.email, email) })) ?? null;
}

export function registerAuth(app: FastifyInstance): void {
  const authenticate = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    const extracted = extractToken(request);
    if (!extracted) {
      await sendError(reply, 401, "auth.missingToken", "Authentication required");
      return;
    }

    let payload: JWT | null = null;
    try {
      payload = await decode({
        token: extracted.token,
        secret: app.config.authSecret,
        salt: extracted.salt,
      });
    } catch {
      payload = null;
    }
    if (!payload) {
      await sendError(reply, 401, "auth.invalidToken", "Invalid or expired session token");
      return;
    }

    const user = await findOrCreateUser(app.db, payload);
    if (!user) {
      await sendError(reply, 401, "auth.noEmail", "Session token has no email claim");
      return;
    }

    request.user = { id: user.id, email: user.email, role: user.role };
  };

  const requireAdmin = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (request.user?.role !== "admin") {
      await sendError(reply, 403, "auth.forbidden", "Admin access required");
    }
  };

  app.decorateRequest("user", undefined);
  app.decorate("authenticate", authenticate);
  app.decorate("requireAdmin", requireAdmin);
}
