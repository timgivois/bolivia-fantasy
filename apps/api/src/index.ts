import Fastify from "fastify";

import type { Health } from "@bolivia-fantasy/shared";

const app = Fastify({
  logger: true,
});

app.get("/health", async (): Promise<Health> => {
  return { status: "ok" };
});

const port = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
