"use client";

import { usePathname, useRouter } from "next/navigation";

export interface RoundOption {
  id: number;
  name: string;
}

/**
 * Round dropdown that navigates via the `?fecha=` search param (dropping any
 * other params, e.g. pagination). An optional "overall" entry maps to the
 * bare path — used by the standings page for the all-time table.
 */
export function RoundSelector({
  rounds,
  selectedId,
  label,
  overallLabel,
}: {
  rounds: RoundOption[];
  /** Selected round id, or null for the "overall" entry. */
  selectedId: number | null;
  /** Accessible label for the select. */
  label: string;
  /** When set, prepends an "overall" option (value ""). */
  overallLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      aria-label={label}
      data-testid="round-selector"
      value={selectedId === null ? "" : String(selectedId)}
      onChange={(event) => {
        const value = event.target.value;
        router.push(value === "" ? pathname : `${pathname}?fecha=${value}`);
      }}
      className="max-w-full rounded-full border border-white/15 bg-pitch-900 px-4 py-2 text-sm font-semibold text-white outline-none focus:border-bo-yellow/60"
    >
      {overallLabel !== undefined ? <option value="">{overallLabel}</option> : null}
      {rounds.map((round) => (
        <option key={round.id} value={round.id}>
          {round.name}
        </option>
      ))}
    </select>
  );
}
