/**
 * Programmatic migration runner.
 * Usage: `pnpm --filter @bolivia-fantasy/db db:migrate`
 * (or `node dist/migrate.js` after a build). Reads DATABASE_URL, falling back
 * to the local docker-compose Postgres.
 */
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, DEFAULT_DATABASE_URL } from "./index.js";

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

async function main(): Promise<void> {
  const db = createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  try {
    await migrate(db, { migrationsFolder });
    console.log("Migrations applied successfully.");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
