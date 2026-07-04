"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { updatePlayerPriceAction } from "@/app/admin/actions";
import type { Club, PlayerLite } from "@/components/squad/types";

const MAX_ROWS = 30;

const inputClass =
  "w-24 rounded-xl border border-white/15 bg-pitch-950/60 px-3 py-1.5 text-right text-white tabular-nums focus:border-bo-yellow focus:outline-none";
const buttonClass =
  "rounded-full bg-bo-yellow px-4 py-1.5 text-xs font-black tracking-wide text-pitch-950 uppercase transition hover:brightness-110 disabled:opacity-50";

/** "auth.forbidden" -> "auth_forbidden" (message keys can't contain dots). */
function errorKey(code: string): string {
  return code.replaceAll(".", "_");
}

function PriceRow({ player, clubName }: { player: PlayerLite; clubName: string }) {
  const t = useTranslations("admin.prices");
  const tErrors = useTranslations("admin.errors");
  const tPositions = useTranslations("squad.positionsShort");
  const [price, setPrice] = useState(String(player.price));
  const [savedPrice, setSavedPrice] = useState(player.price);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const parsed = Number(price);
  const valid = price.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;
  const dirty = valid && parsed !== savedPrice;

  const save = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      // The API accepts one decimal place; round to avoid float noise.
      const rounded = Math.round(parsed * 10) / 10;
      const result = await updatePlayerPriceAction(player.id, rounded);
      if (result.ok) {
        setSavedPrice(result.data.price);
        setPrice(String(result.data.price));
        setSaved(true);
      } else {
        setError(result.code);
      }
    });
  };

  return (
    <tr
      data-testid={`price-row-${player.id}`}
      className="border-b border-white/5 last:border-0"
    >
      <td className="px-3 py-2 font-semibold text-white sm:px-4">{player.name}</td>
      <td className="px-3 py-2 text-emerald-100/70 sm:px-4">{clubName}</td>
      <td className="px-3 py-2 text-emerald-100/70 sm:px-4">
        {tPositions(player.position)}
      </td>
      <td className="px-3 py-2 text-right sm:px-4">
        <input
          data-testid={`price-input-${player.id}`}
          aria-label={t("price")}
          type="number"
          min={0}
          max={1000}
          step={0.1}
          className={inputClass}
          value={price}
          onChange={(event) => {
            setPrice(event.target.value);
            setSaved(false);
          }}
        />
      </td>
      <td className="px-3 py-2 text-right sm:px-4">
        <span className="inline-flex items-center gap-2">
          {saved ? (
            <span
              data-testid={`price-saved-${player.id}`}
              className="text-xs font-bold text-bo-green"
            >
              {t("saved")}
            </span>
          ) : null}
          {error ? (
            <span role="alert" className="text-xs font-semibold text-bo-red">
              {tErrors.has(errorKey(error)) ? tErrors(errorKey(error)) : tErrors("generic")}
            </span>
          ) : null}
          <button
            type="button"
            data-testid={`price-save-${player.id}`}
            className={buttonClass}
            disabled={pending || !dirty}
            onClick={save}
          >
            {pending ? t("saving") : t("save")}
          </button>
        </span>
      </td>
    </tr>
  );
}

/** Searchable player list with inline price editing (PATCH /admin/players/:id). */
export function PlayerPrices({
  players,
  clubs,
}: {
  players: PlayerLite[];
  clubs: Club[];
}) {
  const t = useTranslations("admin.prices");
  const [search, setSearch] = useState("");

  const clubNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const club of clubs) map.set(club.id, club.shortName ?? club.name);
    return map;
  }, [clubs]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (query === "") return players;
    return players.filter((player) => player.name.toLowerCase().includes(query));
  }, [players, search]);

  const shown = filtered.slice(0, MAX_ROWS);

  return (
    <div>
      <label className="sr-only" htmlFor="admin-price-search">
        {t("searchLabel")}
      </label>
      <input
        id="admin-price-search"
        data-testid="price-search"
        className="w-full rounded-xl border border-white/15 bg-pitch-950/60 px-4 py-2.5 text-white placeholder:text-emerald-100/40 focus:border-bo-yellow focus:outline-none sm:max-w-sm"
        placeholder={t("searchPlaceholder")}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {shown.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-white/10 bg-pitch-950/40 p-6 text-center text-sm text-emerald-100/60">
          {t("empty")}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-pitch-950/40">
          <table className="w-full min-w-[34rem] text-sm" data-testid="price-table">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
                <th className="px-3 py-2.5 sm:px-4">{t("player")}</th>
                <th className="px-3 py-2.5 sm:px-4">{t("club")}</th>
                <th className="px-3 py-2.5 sm:px-4">{t("position")}</th>
                <th className="px-3 py-2.5 text-right sm:px-4">{t("price")}</th>
                <th className="px-3 py-2.5 text-right sm:px-4">
                  <span className="sr-only">{t("actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((player) => (
                <PriceRow
                  key={player.id}
                  player={player}
                  clubName={
                    player.clubId === null ? "—" : (clubNames.get(player.clubId) ?? "—")
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > shown.length ? (
        <p className="mt-2 text-xs text-emerald-100/50">
          {t("showing", { shown: shown.length, total: filtered.length })}
        </p>
      ) : null}
    </div>
  );
}
