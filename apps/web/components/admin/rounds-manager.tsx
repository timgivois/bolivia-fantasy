"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { lockRoundAction, unlockRoundAction } from "@/app/admin/actions";
import type { RoundListItem } from "@/components/points/types";
import type { RoundInfo } from "@/components/squad/types";

type RoundStatus = RoundInfo["status"];

const STATUS_BADGE: Record<RoundStatus, string> = {
  upcoming: "bg-white/10 text-emerald-100/70",
  locked: "bg-bo-yellow/20 text-bo-yellow",
  live: "bg-bo-red/20 text-bo-red",
  finalized: "bg-bo-green/20 text-bo-green",
};

const actionButtonClass =
  "rounded-full border border-white/15 px-4 py-1.5 text-xs font-black tracking-wide text-white uppercase transition hover:bg-white/10 disabled:opacity-50";
const confirmButtonClass =
  "rounded-full bg-bo-yellow px-4 py-1.5 text-xs font-black tracking-wide text-pitch-950 uppercase transition hover:brightness-110 disabled:opacity-50";

/** "auth.forbidden" -> "auth_forbidden" (message keys can't contain dots). */
function errorKey(code: string): string {
  return code.replaceAll(".", "_");
}

function RoundRow({ round }: { round: RoundListItem }) {
  const t = useTranslations("admin.rounds");
  const tErrors = useTranslations("admin.errors");
  const [status, setStatus] = useState<RoundStatus>(round.status);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const locking = status !== "locked";

  const apply = () => {
    setError(null);
    startTransition(async () => {
      const result = locking
        ? await lockRoundAction(round.id)
        : await unlockRoundAction(round.id);
      if (result.ok) {
        setStatus(result.data.status);
        setConfirming(false);
      } else {
        setError(result.code);
        setConfirming(false);
      }
    });
  };

  return (
    <tr
      data-testid={`round-row-${round.id}`}
      className="border-b border-white/5 last:border-0"
    >
      <td className="px-3 py-2.5 font-semibold text-white sm:px-4">{round.name}</td>
      <td className="px-3 py-2.5 sm:px-4">
        <span
          data-testid={`round-status-${round.id}`}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-black tracking-wide uppercase ${STATUS_BADGE[status]}`}
        >
          {t(`status.${status}`)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right sm:px-4">
        {confirming ? (
          <span className="inline-flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs font-semibold text-emerald-100/70">
              {locking
                ? t("confirmLock", { name: round.name })
                : t("confirmUnlock", { name: round.name })}
            </span>
            <button
              type="button"
              data-testid={`round-confirm-${round.id}`}
              className={confirmButtonClass}
              disabled={pending}
              onClick={apply}
            >
              {pending ? t("working") : t("confirm")}
            </button>
            <button
              type="button"
              className={actionButtonClass}
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {t("cancel")}
            </button>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2">
            {error ? (
              <span role="alert" className="text-xs font-semibold text-bo-red">
                {tErrors.has(errorKey(error)) ? tErrors(errorKey(error)) : tErrors("generic")}
              </span>
            ) : null}
            <button
              type="button"
              data-testid={`round-toggle-${round.id}`}
              className={actionButtonClass}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              {locking ? t("lock") : t("unlock")}
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Round list with confirmed lock/unlock (POST /admin/rounds/:id/(un)lock). */
export function RoundsManager({ rounds }: { rounds: RoundListItem[] }) {
  const t = useTranslations("admin.rounds");

  if (rounds.length === 0) {
    return (
      <p className="rounded-2xl border border-white/10 bg-pitch-950/40 p-6 text-center text-sm text-emerald-100/60">
        {t("empty")}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-pitch-950/40">
      <table className="w-full min-w-[30rem] text-sm" data-testid="rounds-table">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs font-bold tracking-wide text-emerald-100/60 uppercase">
            <th className="px-3 py-2.5 sm:px-4">{t("round")}</th>
            <th className="px-3 py-2.5 sm:px-4">{t("statusLabel")}</th>
            <th className="px-3 py-2.5 text-right sm:px-4">{t("actions")}</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((round) => (
            <RoundRow key={round.id} round={round} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
