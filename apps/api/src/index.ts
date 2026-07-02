import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ port, host: "0.0.0.0" });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
  }
}

void main();
