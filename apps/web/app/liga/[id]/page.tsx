import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { ApiError, getLeagueStandings, getMySquad } from "@/lib/api";

export const dynamic = "force-dynamic";

function Notice({ title, description }: { title: string; description?: string }) {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-extrabold tracking-tight text-white">{title}</h1>
      {description ? <p className="max-w-md text-emerald-100/70">{description}</p> : null}
    </main>
  );
}

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("leagues");
  const { id } = await params;
  const leagueId = Number.parseInt(id, 10);
  if (!Number.isInteger(leagueId)) return <Notice title={t("detail.notFound")} />;

  try {
    const [data, mySquadId] = await Promise.all([
      getLeagueStandings(leagueId),
      getMySquad()
        .then((mine) => mine?.squad.id ?? null)
        .catch(() => null),
    ]);

    return (
      <main className="mx-auto max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
        <Link
          href="/liga"
          className="text-sm font-semibold text-emerald-100/60 transition hover:text-white"
        >
          ← {t("detail.back")}
        </Link>
        <header className="mt-2 mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {data.league.name}
          </h1>
          <p className="mt-0.5 text-sm text-emerald-100/60">
            {t("detail.shareHint", { code: data.league.inviteCode })}
          </p>
        </header>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-pitch-900/70">
          <table className="w-full min-w-[24rem] text-sm" data-testid="league-standings">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
                <th className="px-3 py-2.5 text-right sm:px-4">{t("table.rank")}</th>
                <th className="px-3 py-2.5 sm:px-4">{t("table.squad")}</th>
                <th className="px-3 py-2.5 sm:px-4">{t("table.manager")}</th>
                <th className="px-3 py-2.5 text-right sm:px-4">{t("table.points")}</th>
              </tr>
            </thead>
            <tbody>
              {data.standings.map((entry) => {
                const mine = mySquadId !== null && entry.squadId === mySquadId;
                return (
                  <tr
                    key={entry.userId}
                    data-mine={mine || undefined}
                    className={`border-b border-white/5 last:border-0 ${
                      mine ? "bg-bo-yellow/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5 text-right font-bold text-emerald-100/70 tabular-nums sm:px-4">
                      {entry.rank}
                    </td>
                    <td className="px-3 py-2.5 font-semibold text-white sm:px-4">
                      <span className="flex items-center gap-2">
                        {entry.squadName ?? (
                          <span className="text-emerald-100/50 italic">
                            {t("detail.noSquad")}
                          </span>
                        )}
                        {mine ? (
                          <span className="rounded-full bg-bo-yellow/20 px-2 py-0.5 text-[10px] font-black tracking-wide text-bo-yellow uppercase">
                            {t("detail.you")}
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-emerald-100/70 sm:px-4">
                      {entry.userName ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-bold text-bo-yellow tabular-nums sm:px-4">
                      {entry.totalPoints}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    );
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return <Notice title={t("detail.notFound")} />;
      if (error.status === 403) return <Notice title={t("detail.notMember")} />;
    }
    return <Notice title={t("apiDown.title")} description={t("apiDown.description")} />;
  }
}
