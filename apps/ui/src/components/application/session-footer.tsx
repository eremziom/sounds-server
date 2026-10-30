"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { ApplicationSessionStatus } from "../../lib/application-session";
import { startCountdownClock } from "../../lib/countdown-clock";

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

export function SessionFooter({ accessTokenExpiresAt, sessionExpiresAt, status, labels }: {
  accessTokenExpiresAt: number | null;
  sessionExpiresAt: number;
  status: ApplicationSessionStatus;
  labels: SessionFooterLabels;
}) {
  const t = useTranslations("auth.session");
  // The server and first client render show the same placeholder. Only this
  // small footer re-renders at countdown boundaries; media/page are unaffected.
  const [snapshot, setSnapshot] = useState<{
    now: number;
    accessTokenExpiresAt: number | null;
    sessionExpiresAt: number;
  } | null>(null);
  const ended = status === "ended";
  useEffect(() => {
    if (ended) return;
    const clock = startCountdownClock([accessTokenExpiresAt, sessionExpiresAt], (now) => {
      // A renewed deadline and its clock reading must reach the display together;
      // combining a new token with the previous tick can briefly overcount it.
      setSnapshot({ now, accessTokenExpiresAt, sessionExpiresAt });
    });
    const resume = () => {
      if (document.visibilityState === "visible") clock.sync();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      clock.stop();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [accessTokenExpiresAt, sessionExpiresAt, ended]);

  const minutes = snapshot === null ? null : Math.max(0, Math.floor((snapshot.sessionExpiresAt - snapshot.now) / 60_000));
  const sessionRemaining = minutes === null ? "—"
    : minutes >= 1440 ? t("remainingDays", { value: Math.floor(minutes / 1440) })
    : minutes >= 60 ? t("remainingHours", { value: Math.floor(minutes / 60) })
    : t("remainingMinutes", { value: minutes });

  return (
    <footer className="mt-auto flex items-center justify-end gap-x-2 whitespace-nowrap border-t px-4 py-2 text-xs text-muted-foreground sm:px-6" data-session-footer>
      {status === "ended" ? labels.ended : (
        <>
          <div className="flex items-center justify-end gap-x-2">
            <span>{labels.expiresIn}</span>
            <span className="font-mono tabular-nums" role="timer" aria-live="off" data-session-countdown>
              {formatRemainingTime(snapshot?.accessTokenExpiresAt ?? null, snapshot?.now ?? null)}
            </span>
            {status === "refreshing" && <span role="status">{labels.refreshing}</span>}
          </div>
          <span aria-hidden="true">|</span>
          <span className="tabular-nums" role="timer" aria-live="off" data-session-deadline-countdown>
            {sessionRemaining}
          </span>
        </>
      )}
    </footer>
  );
}
