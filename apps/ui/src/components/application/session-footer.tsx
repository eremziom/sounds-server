"use client";

import { useEffect, useState } from "react";
import type { ApplicationSessionStatus } from "../../lib/application-session";

export type SessionFooterLabels = {
  expiresIn: string;
  refreshing: string;
  ended: string;
  unavailable: string;
  rateLimited: string;
  retry: string;
};

function formatRemainingTime(expiry: number | null, now: number | null) {
  if (expiry === null || now === null) return "—";
  const seconds = Math.max(0, Math.ceil((expiry - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const parts = [minutes, seconds % 60].map((part) => String(part).padStart(2, "0"));
  if (hours > 0) parts.unshift(String(hours).padStart(2, "0"));
  return parts.join(":");
}

export function SessionFooter({ accessTokenExpiresAt, status, labels }: {
  accessTokenExpiresAt: number | null;
  status: ApplicationSessionStatus;
  labels: SessionFooterLabels;
}) {
  // The server and first client render show the same placeholder. Only this
  // small footer re-renders each second; media and page content are unaffected.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (status === "ended") return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [status]);

  return (
    <footer className="mt-auto flex flex-wrap items-center justify-end gap-x-2 border-t px-4 py-2 text-xs text-muted-foreground sm:px-6" data-session-footer>
      {status === "ended" ? labels.ended : (
        <>
          <span>{labels.expiresIn}</span>
          <span className="font-mono tabular-nums" role="timer" aria-live="off" data-session-countdown>
            {formatRemainingTime(accessTokenExpiresAt, now)}
          </span>
          {status === "refreshing" && <span role="status">{labels.refreshing}</span>}
        </>
      )}
    </footer>
  );
}
