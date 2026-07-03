import { getTranslations } from "next-intl/server";

import {
  API_REQUEST_DAILY_LIMIT,
  API_REQUEST_WARN_THRESHOLD,
  type SyncHealth,
} from "@/components/admin/types";

const dateFormatter = new Intl.DateTimeFormat("es-BO", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/La_Paz",
});

function formatTimestamp(iso: string | null, never: string): string {
  if (iso === null) return never;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? never : dateFormatter.format(date);
}

/** Sync-health dashboard card: API-Football request budget + last sync times. */
export async function SyncHealthCard({ health }: { health: SyncHealth }) {
  const t = await getTranslations("admin.health");
  const used = health.apiRequestsToday;
  const warning = used > API_REQUEST_WARN_THRESHOLD;
  const percent = Math.min(100, Math.round((used / API_REQUEST_DAILY_LIMIT) * 100));

  const timestamps = [
    { key: "lastFixtureSync", value: health.lastFixtureSyncAt },
    { key: "lastFixtureUpdate", value: health.lastFixtureUpdateAt },
    { key: "lastStatUpdate", value: health.lastStatUpdateAt },
  ] as const;

  return (
    <section
      data-testid="sync-health"
      className="rounded-2xl border border-white/10 bg-pitch-900/70 p-5"
    >
      <h2 className="text-lg font-extrabold text-white">{t("title")}</h2>

      <div className="mt-3">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-emerald-100/60">{t("requestsLabel")}</span>
          <span
            data-testid="sync-health-requests"
            className={`font-bold tabular-nums ${warning ? "text-bo-red" : "text-bo-green"}`}
          >
            {t("requestsOf", { used, limit: API_REQUEST_DAILY_LIMIT })}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={API_REQUEST_DAILY_LIMIT}
          aria-valuenow={used}
          aria-label={t("requestsLabel")}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10"
        >
          <div
            className={`h-full rounded-full transition-all ${
              warning ? "bg-bo-red" : "bg-bo-green"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {warning ? (
          <p
            data-testid="sync-health-warning"
            className="mt-2 text-xs font-bold tracking-wide text-bo-red uppercase"
          >
            {t("warning")}
          </p>
        ) : null}
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {timestamps.map(({ key, value }) => (
          <div key={key}>
            <dt className="text-xs font-bold tracking-wide text-emerald-100/50 uppercase">
              {t(key)}
            </dt>
            <dd className="mt-0.5 font-semibold text-white tabular-nums">
              {formatTimestamp(value, t("never"))}
            </dd>
          </div>
        ))}
      </dl>

      {health.lastEndpoint !== null ? (
        <p className="mt-3 text-xs text-emerald-100/50">
          {t("lastEndpoint")}:{" "}
          <code className="font-mono text-emerald-100/70">{health.lastEndpoint}</code>
        </p>
      ) : null}
    </section>
  );
}
