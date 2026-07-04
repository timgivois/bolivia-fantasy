"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { loadFixturesAction, loadStatLineAction, saveStatCorrectionAction } from "@/app/admin/actions";
import { EMPTY_STAT_FIELDS, type StatFields } from "@/components/admin/types";
import type { FixtureItem } from "@/components/points/types";
import type { Club, PlayerLite } from "@/components/squad/types";

/** Numeric stat inputs, in display order. cleanSheet (boolean) renders apart. */
const NUMERIC_FIELDS = [
  "minutes",
  "goals",
  "assists",
  "goalsConceded",
  "penaltiesSaved",
  "penaltiesMissed",
  "yellowCards",
  "redCards",
  "ownGoals",
  "saves",
] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

const FIELD_MAX: Partial<Record<NumericField, number>> = {
  minutes: 120,
  yellowCards: 2,
  redCards: 1,
};

const selectClass =
  "w-full rounded-xl border border-white/15 bg-pitch-950/60 px-3 py-2.5 text-white focus:border-bo-yellow focus:outline-none";
const numberClass =
  "w-full rounded-xl border border-white/15 bg-pitch-950/60 px-3 py-2 text-right text-white tabular-nums focus:border-bo-yellow focus:outline-none";
const labelClass = "text-xs font-bold tracking-wide text-emerald-100/60 uppercase";

/** "auth.forbidden" -> "auth_forbidden" (message keys can't contain dots). */
function errorKey(code: string): string {
  return code.replaceAll(".", "_");
}

function fixtureLabel(fixture: FixtureItem): string {
  const home = fixture.homeClub.shortName ?? fixture.homeClub.name;
  const away = fixture.awayClub.shortName ?? fixture.awayClub.name;
  return `${home} vs ${away}`;
}

/**
 * Cascading round -> fixture -> player picker plus the stat form. The form
 * pre-fills from GET /admin/stats/:fixtureId/:playerId when a line exists and
 * submits via PUT (the API marks the row isCorrection=true).
 */
export function StatCorrections({
  rounds,
  players,
  clubs,
}: {
  rounds: Array<{ id: number; name: string }>;
  players: PlayerLite[];
  clubs: Club[];
}) {
  const t = useTranslations("admin.stats");
  const tErrors = useTranslations("admin.errors");

  const [roundId, setRoundId] = useState<number | null>(null);
  const [fixtures, setFixtures] = useState<FixtureItem[] | null>(null);
  const [fixtureId, setFixtureId] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [fields, setFields] = useState<StatFields>(EMPTY_STAT_FIELDS);
  const [hasExisting, setHasExisting] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loadingFixtures, startFixtures] = useTransition();
  const [loadingStats, startStats] = useTransition();
  const [saving, startSave] = useTransition();

  const clubNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const club of clubs) map.set(club.id, club.shortName ?? club.name);
    return map;
  }, [clubs]);

  const fixture = fixtures?.find((item) => item.id === fixtureId) ?? null;

  // Only players of the two clubs playing the selected fixture; if the clubs
  // have no registered players (stale data), fall back to the full list.
  const eligiblePlayers = useMemo(() => {
    if (!fixture) return players;
    const clubIds = new Set([fixture.homeClub.id, fixture.awayClub.id]);
    const filtered = players.filter(
      (player) => player.clubId !== null && clubIds.has(player.clubId),
    );
    return filtered.length > 0 ? filtered : players;
  }, [fixture, players]);

  const resetForm = () => {
    setPlayerId(null);
    setFields(EMPTY_STAT_FIELDS);
    setHasExisting(null);
    setSaved(false);
    setError(null);
  };

  const selectRound = (value: string) => {
    const id = value === "" ? null : Number(value);
    setRoundId(id);
    setFixtures(null);
    setFixtureId(null);
    resetForm();
    if (id === null) return;
    startFixtures(async () => {
      const result = await loadFixturesAction(id);
      if (result.ok) setFixtures(result.data);
      else setError(result.code);
    });
  };

  const selectFixture = (value: string) => {
    const id = value === "" ? null : Number(value);
    setFixtureId(id);
    resetForm();
  };

  const selectPlayer = (value: string) => {
    const id = value === "" ? null : Number(value);
    setPlayerId(id);
    setFields(EMPTY_STAT_FIELDS);
    setHasExisting(null);
    setSaved(false);
    setError(null);
    if (id === null || fixtureId === null) return;
    const currentFixtureId = fixtureId;
    startStats(async () => {
      const result = await loadStatLineAction(currentFixtureId, id);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      if (result.data === null) {
        setHasExisting(false);
        return;
      }
      const line = result.data;
      setHasExisting(true);
      setFields({
        minutes: line.minutes,
        goals: line.goals,
        assists: line.assists,
        cleanSheet: line.cleanSheet,
        goalsConceded: line.goalsConceded,
        penaltiesSaved: line.penaltiesSaved,
        penaltiesMissed: line.penaltiesMissed,
        yellowCards: line.yellowCards,
        redCards: line.redCards,
        ownGoals: line.ownGoals,
        saves: line.saves,
        rating: line.rating,
      });
    });
  };

  const setNumeric = (field: NumericField, value: string) => {
    const parsed = Number(value);
    setSaved(false);
    setFields((prev) => ({
      ...prev,
      [field]: value === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, Math.trunc(parsed)),
    }));
  };

  const submit = () => {
    if (fixtureId === null || playerId === null) return;
    setError(null);
    setSaved(false);
    startSave(async () => {
      const result = await saveStatCorrectionAction(fixtureId, playerId, fields);
      if (result.ok) {
        setSaved(true);
        setHasExisting(true);
      } else {
        setError(result.code);
      }
    });
  };

  const formReady = fixtureId !== null && playerId !== null && !loadingStats;

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="stats-round">
            {t("roundLabel")}
          </label>
          <select
            id="stats-round"
            data-testid="stats-round"
            className={`${selectClass} mt-1`}
            value={roundId ?? ""}
            onChange={(event) => selectRound(event.target.value)}
          >
            <option value="">{t("selectPlaceholder")}</option>
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                {round.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass} htmlFor="stats-fixture">
            {t("fixtureLabel")}
          </label>
          <select
            id="stats-fixture"
            data-testid="stats-fixture"
            className={`${selectClass} mt-1`}
            value={fixtureId ?? ""}
            disabled={roundId === null || loadingFixtures}
            onChange={(event) => selectFixture(event.target.value)}
          >
            <option value="">
              {loadingFixtures ? t("loadingFixtures") : t("selectPlaceholder")}
            </option>
            {(fixtures ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {fixtureLabel(item)}
              </option>
            ))}
          </select>
          {fixtures !== null && fixtures.length === 0 ? (
            <p className="mt-1 text-xs text-emerald-100/50">{t("noFixtures")}</p>
          ) : null}
        </div>

        <div>
          <label className={labelClass} htmlFor="stats-player">
            {t("playerLabel")}
          </label>
          <select
            id="stats-player"
            data-testid="stats-player"
            className={`${selectClass} mt-1`}
            value={playerId ?? ""}
            disabled={fixtureId === null}
            onChange={(event) => selectPlayer(event.target.value)}
          >
            <option value="">{t("selectPlaceholder")}</option>
            {eligiblePlayers.map((player) => (
              <option key={player.id} value={player.id}>
                {player.name}
                {player.clubId !== null && clubNames.has(player.clubId)
                  ? ` (${clubNames.get(player.clubId)})`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {formReady ? (
        <form
          data-testid="stats-form"
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <p
            data-testid={hasExisting ? "stats-existing" : "stats-new"}
            className="text-sm text-emerald-100/60"
          >
            {hasExisting ? t("existing") : t("new")}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NUMERIC_FIELDS.map((field) => (
              <div key={field}>
                <label className={labelClass} htmlFor={`stat-${field}`}>
                  {t(`fields.${field}`)}
                </label>
                <input
                  id={`stat-${field}`}
                  data-testid={`stat-${field}`}
                  type="number"
                  min={0}
                  max={FIELD_MAX[field]}
                  step={1}
                  className={`${numberClass} mt-1`}
                  value={fields[field]}
                  onChange={(event) => setNumeric(field, event.target.value)}
                />
              </div>
            ))}

            <div>
              <label className={labelClass} htmlFor="stat-rating">
                {t("fields.rating")}
              </label>
              <input
                id="stat-rating"
                data-testid="stat-rating"
                type="number"
                min={0}
                max={10}
                step={0.1}
                className={`${numberClass} mt-1`}
                value={fields.rating ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  const parsed = Number(value);
                  setSaved(false);
                  setFields((prev) => ({
                    ...prev,
                    rating: value === "" || !Number.isFinite(parsed) ? null : parsed,
                  }));
                }}
              />
            </div>

            <label
              className="flex items-end gap-2 pb-2 text-sm font-semibold text-white"
              htmlFor="stat-cleanSheet"
            >
              <input
                id="stat-cleanSheet"
                data-testid="stat-cleanSheet"
                type="checkbox"
                className="size-4 accent-bo-yellow"
                checked={fields.cleanSheet}
                onChange={(event) => {
                  setSaved(false);
                  setFields((prev) => ({ ...prev, cleanSheet: event.target.checked }));
                }}
              />
              {t("fields.cleanSheet")}
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              data-testid="stats-save"
              className="rounded-full bg-bo-yellow px-5 py-2.5 text-sm font-black tracking-wide text-pitch-950 uppercase transition hover:brightness-110 disabled:opacity-50"
              disabled={saving}
            >
              {saving ? t("saving") : t("save")}
            </button>
            {saved ? (
              <span
                data-testid="stats-saved"
                className="text-sm font-bold text-bo-green"
              >
                {t("saved")}
              </span>
            ) : null}
            {error ? (
              <span role="alert" className="text-sm font-semibold text-bo-red">
                {tErrors.has(errorKey(error)) ? tErrors(errorKey(error)) : tErrors("generic")}
              </span>
            ) : null}
          </div>
        </form>
      ) : loadingStats ? (
        <p className="mt-4 text-sm text-emerald-100/60">{t("loadingStats")}</p>
      ) : error !== null ? (
        <p role="alert" className="mt-4 text-sm font-semibold text-bo-red">
          {tErrors.has(errorKey(error)) ? tErrors(errorKey(error)) : tErrors("generic")}
        </p>
      ) : null}
    </div>
  );
}
