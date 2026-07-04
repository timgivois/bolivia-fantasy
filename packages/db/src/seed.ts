/**
 * Idempotent seed for the 16 clubs of Bolivia's División Profesional 2026.
 * Usage: `pnpm --filter @bolivia-fantasy/db db:seed`
 *
 * Upserts on the unique `name` column, so it is safe to run repeatedly.
 *
 * Club list verified via web search on 2026-07-01 (2026 FBF División
 * Profesional): the top 14 of 2025 plus Real Potosí (2025 Copa Simón Bolívar
 * champions) and Totora Real Oruro (awarded the last spot after the FBF
 * disciplinary ruling that relegated Royal Pari); ABB kept its place via the
 * promotion/relegation play-off. NOTE: Wilstermann was relegated and Real
 * Oriente dropped out after 2025, so neither plays in 2026 — this list
 * intentionally differs from earlier drafts that included them. If the FBF
 * changes the composition mid-season, adjust here.
 *
 * TODO: apiFootballId is null for every club — reliable API-Football team ids
 * for league 344 could not be verified without an API key. The ingestion
 * worker backfills them by (fuzzy) name match against /teams?league=344.
 */
import { createDb, DEFAULT_DATABASE_URL, type NewClub } from "./index.js";
import { clubs } from "./schema/index.js";

const CLUBS_2026: NewClub[] = [
  { name: "Bolívar", shortName: "BOL", apiFootballId: null },
  { name: "The Strongest", shortName: "STR", apiFootballId: null },
  { name: "Always Ready", shortName: "ALW", apiFootballId: null },
  { name: "Blooming", shortName: "BLO", apiFootballId: null },
  { name: "Oriente Petrolero", shortName: "ORI", apiFootballId: null },
  { name: "Guabirá", shortName: "GUA", apiFootballId: null },
  { name: "Real Tomayapo", shortName: "TOM", apiFootballId: null },
  { name: "Nacional Potosí", shortName: "NPO", apiFootballId: null },
  { name: "Real Potosí", shortName: "RPO", apiFootballId: null },
  { name: "Aurora", shortName: "AUR", apiFootballId: null },
  { name: "San Antonio Bulo Bulo", shortName: "SAB", apiFootballId: null },
  { name: "GV San José", shortName: "GVS", apiFootballId: null },
  { name: "Real Oruro", shortName: "ROR", apiFootballId: null },
  { name: "Universitario de Vinto", shortName: "UVI", apiFootballId: null },
  { name: "Independiente Petrolero", shortName: "IND", apiFootballId: null },
  { name: "ABB", shortName: "ABB", apiFootballId: null },
];

async function main(): Promise<void> {
  const db = createDb(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  try {
    for (const club of CLUBS_2026) {
      await db
        .insert(clubs)
        .values(club)
        .onConflictDoUpdate({
          target: clubs.name,
          set: {
            shortName: club.shortName,
            // apiFootballId / logoUrl are intentionally NOT overwritten here:
            // the ingestion worker owns those once it backfills them.
            updatedAt: new Date(),
          },
        });
    }
    const seeded = await db.select({ name: clubs.name }).from(clubs);
    console.log(`Seed complete. ${seeded.length} clubs in database.`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
