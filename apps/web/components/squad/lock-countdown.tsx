"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/**
 * Ticking countdown to the round lock. Renders nothing until mounted
 * (avoids a server/client hydration mismatch on the remaining time) and
 * fires `onExpire` once when the deadline passes.
 */
export function LockCountdown({
  lockAt,
  onExpire,
}: {
  lockAt: string | null;
  onExpire: () => void;
}) {
  const t = useTranslations("squad");
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!lockAt) return;
    const target = Date.parse(lockAt);
    if (Number.isNaN(target)) return;

    let expired = false;
    const tick = () => {
      const remaining = target - Date.now();
      if (remaining <= 0) {
        if (!expired) {
          expired = true;
          setLabel(null);
          onExpire();
        }
        return true;
      }
      setLabel(formatRemaining(remaining));
      return false;
    };

    if (tick()) return;
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [lockAt, onExpire]);

  if (!label) return null;

  return (
    <span
      data-testid="lock-countdown"
      className="inline-flex items-center gap-1.5 rounded-full border border-bo-yellow/40 bg-bo-yellow/10 px-3 py-1 text-xs font-semibold text-bo-yellow"
      suppressHydrationWarning
    >
      {t("lock.countdown", { time: label })}
    </span>
  );
}
