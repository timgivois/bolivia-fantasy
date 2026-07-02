import cors from "@fastify/cors";
import { createDb, DEFAULT_DATABASE_URL } from "@bolivia-fantasy/db";
import Fastify, { type FastifyInstance } from "fastify";

import { registerAuth } from "./auth.js";
import { LiveBroadcaster } from "./live.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerLeagueRoutes } from "./routes/leagues.js";
import { registerLiveRoute } from "./routes/live.js";
import { registerMeRoutes } from "./routes/me.js";
import { registerPublicRoutes } from "./routes/public.js";
import type { ServerConfig } from "./types.js";

export interface BuildServerOptions {
  databaseUrl?: string;
  authSecret?: string;
  webOrigin?: string;
  logger?: boolean;
}

export async function buildServer(
  options: BuildServerOptions = {},
): Promise<FastifyInstance> {
  const config: ServerConfig = {
    databaseUrl:
      options.databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    authSecret: options.authSecret ?? process.env.AUTH_SECRET ?? "",
    webOrigin: options.webOrigin ?? process.env.WEB_ORIGIN ?? "http://localhost:3000",
  };
  if (!config.authSecret) {
    throw new Error("AUTH_SECRET is required (same secret as the web app)");
  }

  const app = Fastify({
    logger: options.logger ?? true,
    // Long-lived SSE connections must not block shutdown.
    forceCloseConnections: true,
  });

  const db = createDb(config.databaseUrl);
  app.decorate("db", db);
  app.decorate("config", config);
  app.decorate("live", new LiveBroadcaster(db.$client));

  app.addHook("onClose", async () => {
    await app.live.close();
    await db.$client.end();
  });

  await app.register(cors, {
    origin: config.webOrigin,
    credentials: true,
  });

  registerAuth(app);
  registerPublicRoutes(app);
  registerLiveRoute(app);
  await app.register(async (scope) => registerMeRoutes(scope), { prefix: "/me" });
  await app.register(async (scope) => registerLeagueRoutes(scope), { prefix: "/leagues" });
  await app.register(async (scope) => registerAdminRoutes(scope), { prefix: "/admin" });

  return app;
}
