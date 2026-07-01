/**
 * Ingestion worker stub.
 * Later: polls API-Football every POLL_INTERVAL_MIN minutes for
 * División Profesional fixtures/stats and triggers scoring runs.
 */

console.log("[worker] Fantasy Fútbol Bolivia worker started");

// Keep the process alive until the real polling loop lands.
const keepAlive = setInterval(() => {
  // no-op heartbeat
}, 60_000);

function shutdown(signal: string): void {
  console.log(`[worker] received ${signal}, shutting down gracefully`);
  clearInterval(keepAlive);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
