import type { Database, UserRole } from "@bolivia-fantasy/db";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { LiveBroadcaster } from "./live.js";

/** The authenticated principal attached to each request by the auth plugin. */
export interface AuthedUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface ServerConfig {
  databaseUrl: string;
  authSecret: string;
  webOrigin: string;
}

type AuthGuard = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
    config: ServerConfig;
    live: LiveBroadcaster;
    /** preHandler: decodes the Auth.js JWT and attaches request.user (401 otherwise). */
    authenticate: AuthGuard;
    /** preHandler: requires request.user.role === "admin" (403 otherwise). Run after authenticate. */
    requireAdmin: AuthGuard;
  }

  interface FastifyRequest {
    user?: AuthedUser;
  }
}
