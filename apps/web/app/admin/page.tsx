import { getTranslations } from "next-intl/server";

import { PlayerPrices } from "@/components/admin/player-prices";
import { RoundsManager } from "@/components/admin/rounds-manager";
import { StatCorrections } from "@/components/admin/stat-corrections";
import { SyncHealthCard } from "@/components/admin/sync-health-card";
import type { SyncHealth } from "@/components/admin/types";
import { ApiError, getAllPlayers, getClubs, getRounds, getSyncHealth } from "@/lib/api";

// Authed page (middleware-protected). The admin role itself is enforced by
// the API: the sync-health fetch below returns 403 for non-admins, which we
// render as an access-denied notice instead of the panel.
export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "precios", key: "prices" },
  { id: "fechas", key: "rounds" },
  { id: "correcciones", key: "stats" },
] as const;

function Notice({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
      <p className="max-w-md text-emerald-100/70">{description}</p>
    </main>
  );
}

export default async function AdminPage() {
  const t = await getTranslations("admin");

  let health: SyncHealth;
  let players;
  let clubs;
  let rounds;
  try {
    // The first admin call doubles as the role check (403 -> access denied).
    health = await getSyncHealth();
    [players, clubs, rounds] = await Promise.all([
      getAllPlayers(),
      getClubs(),
      getRounds(),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <main
          data-testid="admin-forbidden"
          className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center"
        >
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            {t("forbidden.title")}
          </h1>
          <p className="max-w-md text-emerald-100/70">{t("forbidden.description")}</p>
        </main>
      );
    }
    return <Notice title={t("apiDown.title")} description={t("apiDown.description")} />;
  }

  return (
    <main className="mx-auto max-w-5xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1
          data-testid="admin-title"
          className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl"
        >
          {t("title")}
        </h1>
        <p className="mt-0.5 max-w-md text-sm text-emerald-100/60">{t("description")}</p>
      </header>

      <SyncHealthCard health={health} />

      <nav className="mt-4 grid gap-3 sm:grid-cols-3" aria-label={t("title")}>
        {SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            data-testid={`admin-link-${section.id}`}
            className="block rounded-2xl border border-white/10 bg-pitch-900/70 p-4 transition hover:border-bo-yellow/40 hover:bg-pitch-900"
          >
            <span className="block text-base font-extrabold text-white">
              {t(`sections.${section.key}.title`)}
            </span>
            <span className="mt-1 block text-xs text-emerald-100/60">
              {t(`sections.${section.key}.description`)}
            </span>
          </a>
        ))}
      </nav>

      <section
        id="precios"
        data-testid="admin-prices"
        className="mt-6 scroll-mt-20 rounded-2xl border border-white/10 bg-pitch-900/70 p-5"
      >
        <h2 className="text-lg font-extrabold text-white">{t("sections.prices.title")}</h2>
        <p className="mt-0.5 mb-4 text-sm text-emerald-100/60">
          {t("sections.prices.description")}
        </p>
        <PlayerPrices players={players} clubs={clubs} />
      </section>

      <section
        id="fechas"
        data-testid="admin-rounds"
        className="mt-6 scroll-mt-20 rounded-2xl border border-white/10 bg-pitch-900/70 p-5"
      >
        <h2 className="text-lg font-extrabold text-white">{t("sections.rounds.title")}</h2>
        <p className="mt-0.5 mb-4 text-sm text-emerald-100/60">
          {t("sections.rounds.description")}
        </p>
        <RoundsManager rounds={rounds} />
      </section>

      <section
        id="correcciones"
        data-testid="admin-stats"
        className="mt-6 scroll-mt-20 rounded-2xl border border-white/10 bg-pitch-900/70 p-5"
      >
        <h2 className="text-lg font-extrabold text-white">{t("sections.stats.title")}</h2>
        <p className="mt-0.5 mb-4 text-sm text-emerald-100/60">
          {t("sections.stats.description")}
        </p>
        <StatCorrections
          rounds={rounds.map(({ id, name }) => ({ id, name }))}
          players={players}
          clubs={clubs}
        />
      </section>
    </main>
  );
}
