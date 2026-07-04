"use client";

import { FORMATION_BOUNDS } from "@bolivia-fantasy/scoring";
import { useTranslations } from "next-intl";

import { POSITIONS, countByPosition } from "./reducer";
import type { Club, PlayerLite, Position } from "./types";

const POSITION_BADGE: Record<Position, string> = {
  GK: "bg-bo-yellow text-pitch-950",
  DEF: "bg-sky-400 text-pitch-950",
  MID: "bg-emerald-400 text-pitch-950",
  FWD: "bg-bo-red text-white",
};

interface PlayerCardProps {
  player: PlayerLite;
  price: number;
  clubShort: string;
  isCaptain: boolean;
  isVice: boolean;
  dimmed: boolean;
  highlighted: boolean;
  selected: boolean;
  disabled: boolean;
  captainLabel: string;
  viceLabel: string;
  positionShort: string;
  onTap: () => void;
}

function PlayerCard({
  player,
  price,
  clubShort,
  isCaptain,
  isVice,
  dimmed,
  highlighted,
  selected,
  disabled,
  captainLabel,
  viceLabel,
  positionShort,
  onTap,
}: PlayerCardProps) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      data-testid={`squad-player-${player.id}`}
      className={`relative flex w-[4.6rem] flex-col items-center gap-1 rounded-xl border bg-pitch-950/85 px-1 pt-2 pb-1.5 text-center shadow-lg shadow-black/30 transition sm:w-20 ${
        highlighted
          ? "border-bo-yellow ring-2 ring-bo-yellow/70"
          : selected
            ? "border-bo-yellow/70 ring-2 ring-bo-yellow/40"
            : "border-white/10 hover:border-white/30"
      } ${dimmed ? "opacity-40" : ""} ${disabled ? "cursor-default" : "cursor-pointer"}`}
    >
      {isCaptain ? (
        <span
          aria-label={captainLabel}
          className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-bo-yellow text-[10px] font-black text-pitch-950 ring-1 ring-pitch-950"
        >
          C
        </span>
      ) : null}
      {isVice ? (
        <span
          aria-label={viceLabel}
          className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-black text-pitch-950 ring-1 ring-pitch-950"
        >
          V
        </span>
      ) : null}
      <span
        className={`rounded px-1 text-[9px] font-black tracking-wide ${POSITION_BADGE[player.position]}`}
      >
        {positionShort}
      </span>
      <span className="w-full truncate text-[11px] leading-tight font-semibold text-white">
        {player.name}
      </span>
      <span className="flex items-center gap-1 text-[10px] text-emerald-100/70">
        <span className="font-semibold">{clubShort}</span>
        <span className="text-bo-yellow">{price.toFixed(1)}M</span>
      </span>
    </button>
  );
}

function EmptySlot({
  label,
  positionShort,
  onTap,
}: {
  label: string;
  positionShort: string;
  onTap?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      aria-label={label}
      className="flex h-[4.9rem] w-[4.6rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 bg-white/5 text-emerald-100/50 transition hover:border-bo-yellow/60 hover:text-bo-yellow sm:w-20"
    >
      <span className="text-lg leading-none font-light">+</span>
      <span className="text-[9px] font-bold tracking-wide">{positionShort}</span>
    </button>
  );
}

export interface PitchProps {
  starters: PlayerLite[];
  bench: PlayerLite[];
  captainId: number | null;
  viceId: number | null;
  /** Display price per player (purchase price for saved picks). */
  priceOf: (player: PlayerLite) => number;
  clubsById: Map<number, Club>;
  locked: boolean;
  /** Show add-slot placeholders (squad not complete yet). */
  showPlaceholders: boolean;
  swapId: number | null;
  swapTargets: Set<number>;
  onCardTap: (player: PlayerLite) => void;
  onEmptySlotTap: (position: Position) => void;
}

/** Dark pitch with GK/DEF/MID/FWD starter rows plus the 4-slot bench strip. */
export function Pitch({
  starters,
  bench,
  captainId,
  viceId,
  priceOf,
  clubsById,
  locked,
  showPlaceholders,
  swapId,
  swapTargets,
  onCardTap,
  onEmptySlotTap,
}: PitchProps) {
  const t = useTranslations("squad");
  const counts = countByPosition(starters);
  const startersTotal = starters.length;

  const clubShort = (player: PlayerLite): string => {
    if (player.clubId === null) return "—";
    const club = clubsById.get(player.clubId);
    return club?.shortName ?? club?.name.slice(0, 3).toUpperCase() ?? "—";
  };

  const renderCard = (player: PlayerLite) => (
    <PlayerCard
      key={player.id}
      player={player}
      price={priceOf(player)}
      clubShort={clubShort(player)}
      isCaptain={captainId === player.id}
      isVice={viceId === player.id}
      dimmed={swapId !== null && swapId !== player.id && !swapTargets.has(player.id)}
      highlighted={swapTargets.has(player.id)}
      selected={swapId === player.id}
      disabled={locked}
      captainLabel={t("builder.captainBadge")}
      viceLabel={t("builder.viceBadge")}
      positionShort={t(`positionsShort.${player.position}`)}
      onTap={() => onCardTap(player)}
    />
  );

  /**
   * Placeholder slots per row while building: always show the missing
   * formation minimums, plus one extra slot when the row can still take a
   * starter and the XI is not full.
   */
  const placeholderCount = (position: Position): number => {
    if (!showPlaceholders || locked) return 0;
    const current = counts[position];
    const { min, max } = FORMATION_BOUNDS[position];
    const forMinimum = Math.max(0, min - current);
    if (forMinimum > 0) return forMinimum;
    return current < max && startersTotal < 11 ? 1 : 0;
  };

  return (
    <div>
      {/* Pitch */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-pitch-800 via-pitch-900 to-pitch-900 p-3 sm:p-5">
        {/* Field markings */}
        <div aria-hidden className="pointer-events-none absolute inset-3 rounded-2xl border border-emerald-300/10" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-24 h-px bg-emerald-300/10" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full border border-emerald-300/10" />
        <div aria-hidden className="pointer-events-none absolute top-3 left-1/2 h-14 w-44 -translate-x-1/2 rounded-b-2xl border border-t-0 border-emerald-300/10" />

        <div className="relative flex flex-col gap-3 sm:gap-5">
          {POSITIONS.map((position) => (
            <div
              key={position}
              data-testid={`pitch-row-${position}`}
              className="flex min-h-[4.9rem] flex-wrap items-stretch justify-center gap-2 sm:gap-4"
            >
              {starters.filter((p) => p.position === position).map(renderCard)}
              {Array.from({ length: placeholderCount(position) }, (_, i) => (
                <EmptySlot
                  key={`empty-${position}-${i}`}
                  label={t("builder.emptySlot", { position: t(`positions.${position}`) })}
                  positionShort={t(`positionsShort.${position}`)}
                  onTap={() => onEmptySlotTap(position)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Bench strip */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-pitch-900/70 p-3">
        <p className="mb-2 text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
          {t("builder.bench")}
        </p>
        <div className="flex flex-wrap justify-center gap-2 sm:gap-4" data-testid="bench">
          {bench.map(renderCard)}
          {!locked
            ? Array.from({ length: Math.max(0, 4 - bench.length) }, (_, i) => (
                <div
                  key={`bench-empty-${i}`}
                  className="flex h-[4.9rem] w-[4.6rem] items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 text-[9px] font-bold tracking-wide text-emerald-100/40 uppercase sm:w-20"
                >
                  {t("builder.benchSlot")}
                </div>
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
