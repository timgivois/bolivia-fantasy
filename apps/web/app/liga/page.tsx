import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { CreateLeagueForm, JoinLeagueForm } from "@/components/leagues/league-forms";
import { getMyLeagues } from "@/lib/api";

// Authed page (middleware-protected); league memberships change on join.
export const dynamic = "force-dynamic";

export default async function LigaPage() {
  const t = await getTranslations("leagues");

  let leagues;
  try {
    leagues = await getMyLeagues();
  } catch {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          {t("apiDown.title")}
        </h1>
        <p className="max-w-md text-emerald-100/70">{t("apiDown.description")}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
          {t("title")}
        </h1>
        <p className="mt-0.5 max-w-md text-sm text-emerald-100/60">{t("description")}</p>
      </header>

      {leagues.length === 0 ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-pitch-900/70 p-8 text-center">
          <h2 className="text-lg font-extrabold text-white">{t("empty.title")}</h2>
          <p className="mt-1 text-sm text-emerald-100/60">{t("empty.description")}</p>
        </div>
      ) : (
        <ul data-testid="my-leagues" className="mb-6 grid gap-3 sm:grid-cols-2">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link
                href={`/liga/${league.id}`}
                className="block rounded-2xl border border-white/10 bg-pitch-900/70 p-5 transition hover:border-bo-yellow/40 hover:bg-pitch-900"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="text-lg font-extrabold text-white">{league.name}</span>
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-emerald-100/70">
                    {t("members", { count: league.memberCount })}
                  </span>
                </span>
                <span className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-emerald-100/60">
                    {t("inviteCode")}:{" "}
                    <code className="font-mono font-bold tracking-widest text-bo-yellow">
                      {league.inviteCode}
                    </code>
                  </span>
                  <span className="font-semibold text-bo-yellow">{t("view")} →</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <CreateLeagueForm />
        <JoinLeagueForm />
      </div>
    </main>
  );
}
