import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { auth } from "@/auth";
import { RoundSelector } from "@/components/points/round-selector";
import { getGlobalLeaderboard, getMySquad, getRounds } from "@/lib/api";

// Public page, but rankings (and the viewer's own squad) change constantly.
export const dynamic = "force-dynamic";

const PER_PAGE = 20;

export default async function ClasificacionPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; pagina?: string }>;
}) {
  const t = await getTranslations("standings");
  const { fecha, pagina } = await searchParams;

  try {
    const rounds = await getRounds();
    const requestedRound = fecha === undefined ? Number.NaN : Number(fecha);
    const round = rounds.find((r) => r.id === requestedRound);
    const page = Math.max(1, Number.parseInt(pagina ?? "1", 10) || 1);

    const session = await auth();
    const [board, mySquadId] = await Promise.all([
      getGlobalLeaderboard({ page, perPage: PER_PAGE, roundId: round?.id }),
      session?.user
        ? getMySquad()
            .then((mine) => mine?.squad.id ?? null)
            .catch(() => null)
        : Promise.resolve(null),
    ]);
    const pages = Math.max(1, Math.ceil(board.total / board.perPage));

    const pageHref = (target: number): string => {
      const params = new URLSearchParams();
      if (round) params.set("fecha", String(round.id));
      if (target > 1) params.set("pagina", String(target));
      const query = params.toString();
      return query === "" ? "/clasificacion" : `/clasificacion?${query}`;
    };

    return (
      <main className="mx-auto max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
        <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-0.5 max-w-md text-sm text-emerald-100/60">{t("description")}</p>
          </div>
          {rounds.length > 0 ? (
            <RoundSelector
              rounds={rounds.map(({ id, name }) => ({ id, name }))}
              selectedId={round?.id ?? null}
              label={t("filter.label")}
              overallLabel={t("filter.overall")}
            />
          ) : null}
        </header>

        {board.items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-pitch-900/70 p-8 text-center text-emerald-100/60">
            {t("empty")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-pitch-900/70">
            <table className="w-full min-w-[26rem] text-sm" data-testid="leaderboard">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
                  <th className="px-3 py-2.5 text-right sm:px-4">{t("table.rank")}</th>
                  <th className="px-3 py-2.5 sm:px-4">{t("table.squad")}</th>
                  <th className="px-3 py-2.5 sm:px-4">{t("table.manager")}</th>
                  <th className="px-3 py-2.5 text-right sm:px-4">{t("table.points")}</th>
                </tr>
              </thead>
              <tbody>
                {board.items.map((entry) => {
                  const mine = mySquadId !== null && entry.squadId === mySquadId;
                  return (
                    <tr
                      key={entry.squadId}
                      data-testid={`leaderboard-row-${entry.squadId}`}
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
                          {entry.squadName}
                          {mine ? (
                            <span className="rounded-full bg-bo-yellow/20 px-2 py-0.5 text-[10px] font-black tracking-wide text-bo-yellow uppercase">
                              {t("you")}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-emerald-100/70 sm:px-4">
                        {entry.userName ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-bo-yellow tabular-nums sm:px-4">
                        {entry.points}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 ? (
          <nav className="mt-4 flex items-center justify-between gap-3 text-sm">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-full border border-white/15 px-4 py-1.5 font-semibold text-white transition hover:bg-white/10"
              >
                {t("pagination.previous")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-emerald-100/60">
              {t("pagination.pageOf", { page, pages })}
            </span>
            {page < pages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-full border border-white/15 px-4 py-1.5 font-semibold text-white transition hover:bg-white/10"
              >
                {t("pagination.next")}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
    );
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
}
