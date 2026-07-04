"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { Club, Position } from "@/components/squad/types";

import { FixturesStrip } from "./fixtures-strip";
import { RoundSelector, type RoundOption } from "./round-selector";
import {
  isLiveFixtureStatus,
  type FixtureItem,
  type LiveScoreEvent,
  type MySquadPointsResponse,
  type PointsPick,
} from "./types";

const POSITIONS: readonly Position[] = ["GK", "DEF", "MID", "FWD"];

const POSITION_BADGE: Record<Position, string> = {
  GK: "bg-bo-yellow text-pitch-950",
  DEF: "bg-sky-400 text-pitch-950",
  MID: "bg-emerald-400 text-pitch-950",
  FWD: "bg-bo-red text-white",
};

/** Minimum gap between SSE-triggered server refetches of the points data. */
const REFRESH_THROTTLE_MS = 4_000;

export interface PointsViewProps {
  rounds: RoundOption[];
  roundId: number;
  roundName: string;
  points: MySquadPointsResponse;
  fixtures: FixtureItem[];
  clubs: Club[];
}

export function PointsView({
  rounds,
  roundId,
  roundName,
  points,
  fixtures,
  clubs,
}: PointsViewProps) {
  const t = useTranslations("points");
  const tSquad = useTranslations("squad");
  const router = useRouter();

  const [selected, setSelected] = useState<PointsPick | null>(null);
  /** Latest SSE payload per fixture; overrides the server-fetched fixture. */
  const [liveEvents, setLiveEvents] = useState<ReadonlyMap<number, LiveScoreEvent>>(
    () => new Map(),
  );

  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const fixtureIds = useMemo(() => new Set(fixtures.map((f) => f.id)), [fixtures]);

  // -------------------------------------------------------------------------
  // Live updates: apply scores to the fixtures strip straight from the SSE
  // payload, and refetch the points (server-computed, throttled) — the client
  // never recomputes points locally.
  // -------------------------------------------------------------------------
  const lastRefreshRef = useRef(0);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
    const source = new EventSource(`${apiUrl}/live`);

    const requestRefresh = () => {
      if (refreshTimerRef.current !== null) return;
      const wait = Math.max(
        0,
        lastRefreshRef.current + REFRESH_THROTTLE_MS - Date.now(),
      );
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        lastRefreshRef.current = Date.now();
        router.refresh();
      }, wait);
    };

    source.addEventListener("live_scores", (event) => {
      let payload: LiveScoreEvent;
      try {
        payload = JSON.parse((event as MessageEvent<string>).data) as LiveScoreEvent;
      } catch {
        return;
      }
      if (!fixtureIds.has(payload.fixtureId)) return;
      setLiveEvents((current) => {
        const next = new Map(current);
        next.set(payload.fixtureId, payload);
        return next;
      });
      requestRefresh();
    });

    return () => {
      source.close();
      if (refreshTimerRef.current !== null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [fixtureIds, router]);

  const mergedFixtures = useMemo(
    () =>
      fixtures.map((fixture) => {
        const event = liveEvents.get(fixture.id);
        if (!event) return fixture;
        return {
          ...fixture,
          status: event.status,
          homeGoals: event.homeGoals ?? fixture.homeGoals,
          awayGoals: event.awayGoals ?? fixture.awayGoals,
        };
      }),
    [fixtures, liveEvents],
  );
  const elapsedByFixture = useMemo(() => {
    const map = new Map<number, number | null>();
    for (const [id, event] of liveEvents) map.set(id, event.elapsed);
    return map;
  }, [liveEvents]);

  const anyLive = mergedFixtures.some((f) => isLiveFixtureStatus(f.status));

  /** Clubs playing right now — powers the per-player live pulse. */
  const liveClubIds = useMemo(() => {
    const ids = new Set<number>();
    for (const fixture of mergedFixtures) {
      if (!isLiveFixtureStatus(fixture.status)) continue;
      ids.add(fixture.homeClub.id);
      ids.add(fixture.awayClub.id);
    }
    return ids;
  }, [mergedFixtures]);

  // -------------------------------------------------------------------------
  // Derived squad data
  // -------------------------------------------------------------------------
  const starters = points.picks.filter((pick) => pick.isStarter);
  const bench = points.picks
    .filter((pick) => !pick.isStarter)
    .sort((a, b) => a.position - b.position);
  const autoSubIns = useMemo(
    () => new Set(points.autoSubs.map((s) => s.in)),
    [points.autoSubs],
  );
  const autoSubOuts = useMemo(
    () => new Set(points.autoSubs.map((s) => s.out)),
    [points.autoSubs],
  );

  const clubShort = (clubId: number | null): string => {
    if (clubId === null) return "—";
    const club = clubsById.get(clubId);
    return club?.shortName ?? club?.name.slice(0, 3).toUpperCase() ?? "—";
  };

  const renderCard = (pick: PointsPick) => (
    <PlayerPointsCard
      key={pick.playerId}
      pick={pick}
      clubShort={clubShort(pick.player.clubId)}
      positionShort={tSquad(`positionsShort.${pick.player.fieldPosition}`)}
      live={pick.player.clubId !== null && liveClubIds.has(pick.player.clubId)}
      openLabel={t("player.openBreakdown", { name: pick.player.name })}
      onTap={() => setSelected(pick)}
    />
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <main className="mx-auto max-w-4xl px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            {t("title")}
          </h1>
          <p className="mt-0.5 text-sm text-emerald-100/60">
            {points.squad.name} · {roundName}
          </p>
        </div>
        <RoundSelector rounds={rounds} selectedId={roundId} label={t("roundLabel")} />
      </header>

      {/* Totals */}
      <section className="mb-4 rounded-2xl border border-white/10 bg-pitch-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
              {t("summary.total")}
            </p>
            <p
              data-testid="points-total"
              className="text-4xl font-extrabold tracking-tight text-bo-yellow tabular-nums"
            >
              {points.totalPoints}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            {anyLive ? (
              <span className="flex items-center gap-1.5 rounded-full border border-bo-red/50 bg-bo-red/15 px-3 py-1 text-[11px] font-black tracking-wider text-red-200 uppercase">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bo-red opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-bo-red" />
                </span>
                {t("summary.live")}
              </span>
            ) : (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold tracking-wider text-emerald-100/70 uppercase">
                {points.finalized ? t("summary.finalized") : t("summary.provisional")}
              </span>
            )}
          </div>
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/10 pt-3 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="text-emerald-100/60">{t("summary.bench")}</dt>
            <dd className="font-bold text-white tabular-nums">{points.benchPoints}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="text-emerald-100/60">{t("summary.transferPenalty")}</dt>
            <dd
              data-testid="transfer-penalty"
              className={`font-bold tabular-nums ${
                points.transferPenalty > 0 ? "text-bo-red" : "text-white"
              }`}
            >
              {points.transferPenalty > 0 ? `-${points.transferPenalty}` : 0}
            </dd>
          </div>
        </dl>
      </section>

      {/* Fixtures strip */}
      <div className="mb-4">
        <FixturesStrip fixtures={mergedFixtures} elapsedByFixture={elapsedByFixture} />
      </div>

      {points.picks.length === 0 ? (
        <div
          data-testid="no-picks"
          className="rounded-2xl border border-white/10 bg-pitch-900/70 p-8 text-center"
        >
          <p className="font-bold text-white">{t("noPicks.title")}</p>
          <p className="mt-1 text-sm text-emerald-100/60">{t("noPicks.description")}</p>
        </div>
      ) : (
        <PitchAndBench
          starters={starters}
          bench={bench}
          benchLabel={t("pitch.bench")}
          renderCard={renderCard}
        />
      )}

      {/* Breakdown modal (bottom sheet on mobile) */}
      {selected ? (
        <BreakdownModal
          pick={selected}
          clubShort={clubShort(selected.player.clubId)}
          autoSubbedIn={autoSubIns.has(selected.playerId)}
          autoSubbedOut={autoSubOuts.has(selected.playerId)}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </main>
  );
}

function PitchAndBench({
  starters,
  bench,
  benchLabel,
  renderCard,
}: {
  starters: PointsPick[];
  bench: PointsPick[];
  benchLabel: string;
  renderCard: (pick: PointsPick) => ReactNode;
}) {
  return (
    <>
      {/* XI on the pitch */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-pitch-800 via-pitch-900 to-pitch-900 p-3 sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-3 rounded-2xl border border-emerald-300/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full border border-emerald-300/10"
        />
        <div className="relative flex flex-col gap-3 sm:gap-5">
          {POSITIONS.map((position) => (
            <div
              key={position}
              data-testid={`points-row-${position}`}
              className="flex min-h-[4.9rem] flex-wrap items-stretch justify-center gap-2 sm:gap-4"
            >
              {starters
                .filter((pick) => pick.player.fieldPosition === position)
                .map(renderCard)}
            </div>
          ))}
        </div>
      </div>

      {/* Bench strip */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-pitch-900/70 p-3">
        <p className="mb-2 text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
          {benchLabel}
        </p>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-4" data-testid="points-bench">
          {bench.map(renderCard)}
        </div>
      </div>
    </>
  );
}

function PlayerPointsCard({
  pick,
  clubShort,
  positionShort,
  live,
  openLabel,
  onTap,
}: {
  pick: PointsPick;
  clubShort: string;
  positionShort: string;
  live: boolean;
  openLabel: string;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={openLabel}
      data-testid={`points-player-${pick.playerId}`}
      className="relative flex w-[4.6rem] flex-col items-center gap-1 rounded-xl border border-white/10 bg-pitch-950/85 px-1 pt-2 pb-1.5 text-center shadow-lg shadow-black/30 transition hover:border-white/30 sm:w-20"
    >
      {pick.isCaptain ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bo-yellow text-[10px] font-black text-pitch-950 ring-1 ring-pitch-950">
          C
        </span>
      ) : pick.isViceCaptain ? (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-pitch-950 ring-1 ring-pitch-950">
          V
        </span>
      ) : null}
      {live ? (
        <span className="absolute -top-1 -left-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-bo-red opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-bo-red ring-1 ring-pitch-950" />
        </span>
      ) : null}
      <span
        className={`rounded px-1 text-[9px] font-black tracking-wide ${POSITION_BADGE[pick.player.fieldPosition]}`}
      >
        {positionShort}
      </span>
      <span className="w-full truncate text-[11px] leading-tight font-semibold text-white">
        {pick.player.name}
      </span>
      <span className="flex items-center gap-1 text-[10px]">
        <span className="font-semibold text-emerald-100/70">{clubShort}</span>
        <span
          data-testid={`points-player-${pick.playerId}-points`}
          className="font-black text-bo-yellow tabular-nums"
        >
          {pick.points}
        </span>
        {pick.multiplier > 1 ? (
          <span className="font-black text-bo-yellow/80">×{pick.multiplier}</span>
        ) : null}
      </span>
    </button>
  );
}

function BreakdownModal({
  pick,
  clubShort,
  autoSubbedIn,
  autoSubbedOut,
  onClose,
}: {
  pick: PointsPick;
  clubShort: string;
  autoSubbedIn: boolean;
  autoSubbedOut: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("points");
  const tSquad = useTranslations("squad");
  const didNotPlay = pick.stats === null || pick.stats.minutes === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label={t("player.close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/60"
      />
      <div
        role="dialog"
        aria-label={t("player.modalTitle", { name: pick.player.name })}
        data-testid="player-breakdown"
        className="relative w-full max-w-sm rounded-t-3xl border border-white/10 bg-pitch-900 p-4 pb-6 shadow-2xl sm:rounded-3xl sm:pb-4"
      >
        <div className="mb-3 flex items-start justify-between gap-3 px-1">
          <div>
            <p className="text-base font-extrabold text-white">{pick.player.name}</p>
            <p className="text-xs text-emerald-100/60">
              {tSquad(`positions.${pick.player.fieldPosition}`)} · {clubShort}
              {pick.isCaptain ? ` · ${t("player.captain")}` : ""}
              {pick.isViceCaptain ? ` · ${t("player.viceCaptain")}` : ""}
            </p>
          </div>
          <span className="rounded-xl bg-bo-yellow/15 px-2.5 py-1 text-lg font-black text-bo-yellow tabular-nums">
            {t("player.points", { count: pick.points })}
          </span>
        </div>

        {autoSubbedIn ? (
          <p className="mb-2 px-1 text-xs text-emerald-200/80">{t("player.autoSubIn")}</p>
        ) : null}
        {autoSubbedOut ? (
          <p className="mb-2 px-1 text-xs text-emerald-200/80">{t("player.autoSubOut")}</p>
        ) : null}

        {didNotPlay ? (
          <p className="rounded-xl bg-white/5 px-3 py-4 text-center text-sm text-emerald-100/60">
            {t("player.didNotPlay")}
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {pick.breakdown.map((entry) => (
                <tr key={entry.rule} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-2 text-emerald-100/80">
                    {t(`rules.${entry.rule}`)}
                  </td>
                  <td className="py-1.5 pr-2 text-right text-emerald-100/50 tabular-nums">
                    {entry.rule === "cleanSheet" ? "" : entry.value}
                  </td>
                  <td
                    className={`py-1.5 text-right font-bold tabular-nums ${
                      entry.points < 0 ? "text-bo-red" : "text-white"
                    }`}
                  >
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </td>
                </tr>
              ))}
              {pick.multiplier > 1 ? (
                <>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5 pr-2 text-emerald-100/80">
                      {t("player.basePoints")}
                    </td>
                    <td />
                    <td className="py-1.5 text-right font-bold text-white tabular-nums">
                      {pick.basePoints}
                    </td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-1.5 pr-2 font-semibold text-bo-yellow">
                      {t("player.captainDouble", { multiplier: pick.multiplier })}
                    </td>
                    <td />
                    <td className="py-1.5 text-right font-bold text-bo-yellow tabular-nums">
                      ×{pick.multiplier}
                    </td>
                  </tr>
                </>
              ) : null}
              <tr>
                <td className="pt-2 pr-2 font-extrabold text-white">{t("player.total")}</td>
                <td />
                <td className="pt-2 text-right font-extrabold text-bo-yellow tabular-nums">
                  {pick.points}
                </td>
              </tr>
            </tbody>
          </table>
        )}

        <button
          type="button"
          onClick={onClose}
          data-testid="close-breakdown"
          className="mt-4 w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
        >
          {t("player.close")}
        </button>
      </div>
    </div>
  );
}
