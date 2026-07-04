import type { FastifyInstance } from "fastify";

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * GET /live — Server-Sent Events stream of live score updates.
 *
 * The ingestion worker emits `NOTIFY live_scores, '<json>'`; the shared
 * LiveBroadcaster holds one LISTEN connection and fans payloads out to every
 * connected client as `event: live_scores` SSE messages. A comment heartbeat
 * every 25s keeps proxies from idling the connection out.
 */
export function registerLiveRoute(app: FastifyInstance): void {
  app.get("/live", async (request, reply) => {
    // Take over the socket: SSE responses outlive the normal request cycle.
    reply.hijack();
    const raw = reply.raw;

    // Subscribe BEFORE sending the preamble: once the client has received
    // ": connected", the Postgres LISTEN is guaranteed to be active.
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = await app.live.subscribe((payload) => {
        raw.write(`event: live_scores\ndata: ${payload}\n\n`);
      });
    } catch (error) {
      request.log.error(error, "live: failed to subscribe to Postgres channel");
      raw.writeHead(500, { "content-type": "application/json" });
      raw.end(JSON.stringify({ error: { code: "live.unavailable", message: "Live feed unavailable" } }));
      return;
    }

    raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
      // @fastify/cors hooks don't run on hijacked replies; mirror its policy.
      "access-control-allow-origin": app.config.webOrigin,
      "access-control-allow-credentials": "true",
    });
    raw.write(": connected\n\n");

    const heartbeat = setInterval(() => {
      raw.write(": heartbeat\n\n");
    }, HEARTBEAT_INTERVAL_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      unsubscribe?.();
      unsubscribe = undefined;
      if (!raw.writableEnded) raw.end();
    };
    request.raw.on("close", cleanup);
    raw.on("close", cleanup);
  });
}
