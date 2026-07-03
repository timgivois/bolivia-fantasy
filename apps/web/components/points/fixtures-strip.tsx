"use client";

import { useTranslations } from "next-intl";

import {
  isFinishedFixtureStatus,
  isLiveFixtureStatus,
  type FixtureItem,
} from "./types";

/** Kickoff formatter pinned to Bolivian time so SSR and client HTML match. */
const KICKOFF_FORMAT = new Intl.DateTimeFormat("es-BO", {
  timeZone: "America/La_Paz",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function clubLabel(club: FixtureItem["homeClub"]): string {
  return club.shortName ?? club.name.slice(0, 3).toUpperCase();
}

function FixtureCard({
  fixture,
  elapsed,
}: {
  fixture: FixtureItem;
  /** Live minute from the SSE feed; null/undefined when unknown. */
  elapsed: number | null | undefined;
}) {
  const t = useTranslations("points.fixtures");
  const live = isLiveFixtureStatus(fixture.status);
  const finished = isFinishedFixtureStatus(fixture.status);
  const started = live || finished;

  let statusLabel: string | null = null;
  if (fixture.status === "HT") statusLabel = t("status.halftime");
  else if (live && typeof elapsed === "number") {
    statusLabel = t("status.elapsed", { minutes: elapsed });
  } else if (finished) statusLabel = t("status.finished");
  else if (fixture.status === "PST") statusLabel = t("status.postponed");
  else if (fixture.status === "CANC" || fixture.status === "ABD") {
    statusLabel = t("status.canceled");
  }

  return (
    <div
      data-testid={`fixture-${fixture.id}`}
      data-status={fixture.status}
      className={`flex min-w-[9.5rem] shrink-0 flex-col gap-1.5 rounded-2xl border p-3 ${
        live ? "border-bo-red/50 bg-bo-red/10" : "border-white/10 bg-pitch-900/70"
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold tracking-wide uppercase">
        {live ? (
          <span className="flex items-center gap-1.5 text-bo-red">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bo-red opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-bo-red" />
            </span>
            {t("live")}
          </span>
        ) : (
          <span className="text-emerald-100/50">
            {statusLabel ?? KICKOFF_FORMAT.format(new Date(fixture.kickoffAt))}
          </span>
        )}
        {live && statusLabel ? <span className="text-red-200">{statusLabel}</span> : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-sm font-bold text-white">
        <span className="min-w-0 truncate">{clubLabel(fixture.homeClub)}</span>
        <span
          data-testid={`fixture-${fixture.id}-score`}
          className={`shrink-0 rounded-lg px-2 py-0.5 text-sm tabular-nums ${
            started ? "bg-white/10 text-bo-yellow" : "text-emerald-100/40"
          }`}
        >
          {started ? `${fixture.homeGoals ?? 0} - ${fixture.awayGoals ?? 0}` : "vs"}
        </span>
        <span className="min-w-0 truncate text-right">{clubLabel(fixture.awayClub)}</span>
      </div>
    </div>
  );
}

/** Horizontally scrollable strip with the selected round's matches. */
export function FixturesStrip({
  fixtures,
  elapsedByFixture,
}: {
  fixtures: FixtureItem[];
  elapsedByFixture: ReadonlyMap<number, number | null>;
}) {
  const t = useTranslations("points.fixtures");

  return (
    <section aria-label={t("title")} data-testid="fixtures-strip">
      {fixtures.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-pitch-900/70 p-3 text-sm text-emerald-100/60">
          {t("empty")}
        </p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1 sm:gap-3">
          {fixtures.map((fixture) => (
            <FixtureCard
              key={fixture.id}
              fixture={fixture}
              elapsed={elapsedByFixture.get(fixture.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
