"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAudioSignals, useLiveAnalysis } from "../application/live-analysis-runtime";
import { sampleKickAttack } from "../../engines/infinite-zoom/modulation/kick-signal";

/** Read-only preview of the same envelope delivered to the engine. This RAF
 * paints UI only; it never advances simulation or operates the audio player. */
export function KickMonitor({ active }: { active: boolean }) {
  const signals = useAudioSignals(), analysis = useLiveAnalysis();
  const t = useTranslations("app.infiniteZoom.kick");
  const root = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const interval = useRef<HTMLOutputElement>(null), count = useRef<HTMLOutputElement>(null);
  const enabled = active && analysis.state === "running";

  useEffect(() => {
    let frame = 0, lastAttack: number | null = null, hits = 0;
    let previousSignals = signals.current;
    function draw(now: number) {
      const signal = signals.current.bass;
      const ready = enabled && !document.hidden;
      if (!ready || previousSignals !== signals.current || signal.attackAt === null) {
        lastAttack = null; hits = 0;
        if (interval.current) interval.current.textContent = "—";
      }
      previousSignals = signals.current;
      const value = ready ? sampleKickAttack(signal, now) : 0;
      if (ready && value > 0 && signal.attackAt !== lastAttack) {
        if (lastAttack !== null && signal.attackAt! > lastAttack && interval.current) {
          interval.current.textContent = `${Math.round(signal.attackAt! - lastAttack)} ms`;
        }
        lastAttack = signal.attackAt; hits++;
      }
      if (lastAttack !== null && now - lastAttack > 2000 && interval.current) interval.current.textContent = "—";
      if (bar.current) bar.current.style.transform = `scaleX(${value})`;
      if (meter.current) meter.current.setAttribute("aria-valuenow", value.toFixed(3));
      if (count.current && count.current.textContent !== String(hits)) count.current.textContent = String(hits);
      if (root.current) {
        root.current.dataset.kickValue = value.toFixed(3);
        root.current.dataset.kickCount = String(hits);
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [enabled, signals]);

  return <div ref={root} data-iz-kick className="space-y-2 rounded-md border p-3 text-sm">
    <p className="font-medium">{t("title")}</p>
    <div ref={meter} role="meter" aria-label={t("title")} aria-valuemin={0} aria-valuemax={1} aria-valuenow={0} className="h-3 overflow-hidden rounded bg-muted">
      <div ref={bar} data-iz-kick-bar className="h-full origin-left bg-primary" style={{ transform: "scaleX(0)" }} />
    </div>
    <p>{t("interval")}: <output ref={interval} aria-live="off" data-iz-kick-interval>—</output> · {t("count")}: <output ref={count} aria-live="off">0</output></p>
    <p className="text-xs text-muted-foreground">{t("note")}</p>
    {!enabled && <p className="text-xs text-muted-foreground">{t("inactive")}</p>}
  </div>;
}
