import { encode } from "@auth/core/jwt";

export const AUTH_SECRET = "apitest-secret-do-not-use-in-prod";
export const SESSION_SALT = "authjs.session-token";
export const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://bolivia_fantasy:bolivia_fantasy@127.0.0.1:5432/bolivia_fantasy";

/** Encodes an Auth.js session JWT exactly the way apps/web issues them. */
export async function sessionToken(email: string, name = "Test User"): Promise<string> {
  return encode({
    token: { email, name, sub: `apitest-sub-${email}` },
    secret: AUTH_SECRET,
    salt: SESSION_SALT,
    maxAge: 60 * 60,
  });
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export function cookie(token: string): Record<string, string> {
  return { cookie: `${SESSION_SALT}=${token}` };
}
