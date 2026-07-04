"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { POSITIONS } from "./reducer";
import type { Club, PlayerLite, Position } from "./types";

const MAX_ROWS = 100;

const POSITION_TEXT: Record<Position, string> = {
  GK: "text-bo-yellow",
  DEF: "text-sky-300",
  MID: "text-emerald-300",
  FWD: "text-red-300",
};

export interface PickerProps {
  players: PlayerLite[];
  clubs: Club[];
  clubCounts: Map<number, number>;
  inSquadIds: Set<number>;
  /** Transfers: replacement must share the outgoing player's position. */
  forcedPosition: Position | null;
  /** Grey out players that cannot currently be added (tap still explains why). */
  isSelectable: (player: PlayerLite) => boolean;
  onSelect: (player: PlayerLite) => void;
  busy: boolean;
  /** Externally-controlled tab (tapping an empty pitch slot focuses a position). */
  tab: Position | "ALL";
  onTabChange: (tab: Position | "ALL") => void;
}

/**
 * Player market: position tabs, club filter, name search and price/points
 * sorting. Filtering runs client-side over the full pool fetched by the
 * server component, so every interaction is instant.
 */
export function Picker({
  players,
  clubs,
  clubCounts,
  inSquadIds,
  forcedPosition,
  isSelectable,
  onSelect,
  busy,
  tab,
  onTabChange,
}: PickerProps) {
  const t = useTranslations("squad");
  const [clubId, setClubId] = useState<number | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"price" | "points">("price");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  const activeTab = forcedPosition ?? tab;

  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = players.filter((player) => {
      if (activeTab !== "ALL" && player.position !== activeTab) return false;
      if (clubId !== "ALL" && player.clubId !== clubId) return false;
      if (query && !player.name.toLowerCase().includes(query)) return false;
      return true;
    });
    const direction = order === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const diff = sort === "price" ? a.price - b.price : a.totalPoints - b.totalPoints;
      return diff !== 0 ? diff * direction : a.name.localeCompare(b.name);
    });
    return list;
  }, [players, activeTab, clubId, search, sort, order]);

  const toggleSort = (field: "price" | "points") => {
    if (sort === field) {
      setOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSort(field);
      setOrder("desc");
    }
  };

  const shown = filtered.slice(0, MAX_ROWS);

  return (
    <section
      aria-label={t("picker.title")}
      className="flex flex-col rounded-2xl border border-white/10 bg-pitch-900/70"
    >
      <div className="flex flex-col gap-3 border-b border-white/10 p-3 sm:p-4">
        <h2 className="text-sm font-bold tracking-wide text-white uppercase">
          {t("picker.title")}
        </h2>

        {/* Position tabs */}
        <div className="flex gap-1 overflow-x-auto" role="tablist">
          {(["ALL", ...POSITIONS] as const).map((position) => {
            const active = activeTab === position;
            const disabled = forcedPosition !== null && position !== forcedPosition;
            return (
              <button
                key={position}
                type="button"
                role="tab"
                aria-selected={active}
                disabled={disabled}
                data-testid={`picker-tab-${position}`}
                onClick={() => onTabChange(position)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  active
                    ? "bg-bo-yellow text-pitch-950"
                    : "bg-white/5 text-emerald-100/70 hover:bg-white/10"
                } ${disabled ? "cursor-not-allowed opacity-30" : ""}`}
              >
                {position === "ALL" ? t("picker.all") : t(`positionsShort.${position}`)}
              </button>
            );
          })}
        </div>

        {/* Search + club filter */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("picker.searchPlaceholder")}
            data-testid="picker-search"
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-pitch-950/80 px-3 py-2 text-sm text-white placeholder:text-emerald-100/30 focus:border-bo-yellow/60 focus:outline-none"
          />
          <select
            value={clubId === "ALL" ? "ALL" : String(clubId)}
            onChange={(event) =>
              setClubId(event.target.value === "ALL" ? "ALL" : Number(event.target.value))
            }
            data-testid="picker-club-filter"
            className="rounded-lg border border-white/15 bg-pitch-950/80 px-3 py-2 text-sm text-white focus:border-bo-yellow/60 focus:outline-none"
          >
            <option value="ALL">{t("picker.allClubs")}</option>
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
                {clubCounts.get(club.id) ? ` (${clubCounts.get(club.id)}/3)` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-emerald-100/50">{t("picker.sortBy")}</span>
          {(["price", "points"] as const).map((field) => (
            <button
              key={field}
              type="button"
              onClick={() => toggleSort(field)}
              data-testid={`picker-sort-${field}`}
              className={`rounded-full px-3 py-1 font-bold transition ${
                sort === field
                  ? "bg-white/15 text-white"
                  : "bg-white/5 text-emerald-100/60 hover:bg-white/10"
              }`}
            >
              {field === "price" ? t("picker.sortPrice") : t("picker.sortPoints")}
              {sort === field ? (order === "desc" ? " ↓" : " ↑") : ""}
            </button>
          ))}
        </div>
      </div>

      {/* Rows */}
      <ul className="max-h-[26rem] divide-y divide-white/5 overflow-y-auto lg:max-h-[34rem]">
        {shown.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-emerald-100/50">
            {t("picker.empty")}
          </li>
        ) : (
          shown.map((player) => {
            const inSquad = inSquadIds.has(player.id);
            const selectable = !inSquad && isSelectable(player);
            const club = player.clubId !== null ? clubsById.get(player.clubId) : undefined;
            const clubCount = player.clubId !== null ? (clubCounts.get(player.clubId) ?? 0) : 0;
            return (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => onSelect(player)}
                  disabled={busy || inSquad}
                  aria-label={t("picker.add", { name: player.name })}
                  data-testid={`picker-player-${player.id}`}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-white/5 sm:px-4 ${
                    inSquad ? "opacity-35" : selectable ? "" : "opacity-50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">
                      {player.name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-[11px] text-emerald-100/60">
                      <span className={`font-black ${POSITION_TEXT[player.position]}`}>
                        {t(`positionsShort.${player.position}`)}
                      </span>
                      <span>{club?.shortName ?? club?.name ?? "—"}</span>
                      {clubCount > 0 ? (
                        <span
                          className={
                            clubCount >= 3 ? "font-bold text-bo-red" : "text-emerald-100/50"
                          }
                        >
                          {clubCount}/3
                        </span>
                      ) : null}
                      {inSquad ? (
                        <span className="font-semibold text-bo-yellow">
                          {t("picker.inSquad")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-bold text-bo-yellow">
                      {player.price.toFixed(1)}M
                    </span>
                    <span className="block text-[11px] text-emerald-100/60">
                      {t("picker.points", { count: player.totalPoints })}
                    </span>
                  </span>
                </button>
              </li>
            );
          })
        )}
      </ul>

      <p className="border-t border-white/10 px-4 py-2 text-[11px] text-emerald-100/40">
        {t("picker.showing", { shown: shown.length, total: filtered.length })}
      </p>
    </section>
  );
}
