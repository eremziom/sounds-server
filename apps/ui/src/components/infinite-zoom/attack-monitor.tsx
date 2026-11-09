"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useAudioSignals, useLiveAnalysis } from "../application/live-analysis-runtime";
import { AudioBandRangeControls } from "../application/band-detection-controls";
import { sampleKickAttack } from "../../engines/infinite-zoom/modulation/kick-signal";
import { sampleHighAttack, sampleMidAttack } from "../../engines/infinite-zoom/modulation/attack-signal";

/** Read-only preview of the same envelope delivered to the engine. This RAF
 * paints UI only; it never advances simulation or operates the audio player. */
export function AttackMonitor({ active, source }: { active: boolean; source: "kick" | "highAttack" | "midAttack" }) {
  const signals = useAudioSignals(), analysis = useLiveAnalysis();
  const t = useTranslations(`app.infiniteZoom.${source}`);
  const band = source === "kick" ? "bass" : source === "midAttack" ? "mid" : "high";
  const sample = source === "kick" ? sampleKickAttack : source === "midAttack" ? sampleMidAttack : sampleHighAttack;
  const root = useRef<HTMLDivElement>(null), bar = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLDivElement>(null);
  const interval = useRef<HTMLOutputElement>(null), count = useRef<HTMLOutputElement>(null);
  const enabled = active && analysis.state === "running";

  useEffect(() => {
    let frame = 0, lastAttack: number | null = null, hits = 0;
    let previousSignals = signals.current;
    function draw(now: number) {
      const signal = signals.current[band];
      const ready = enabled && !document.hidden;
      if (!ready || previousSignals !== signals.current || signal.attackAt === null) {
        lastAttack = null; hits = 0;
        if (interval.current) interval.current.textContent = "—";
      }
      previousSignals = signals.current;
      const value = ready ? sample(signal, now) : 0;
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
        root.current.dataset[`${source}Value`] = value.toFixed(3);
        root.current.dataset[`${source}Count`] = String(hits);
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [enabled, signals, band, sample, source]);

  return <div ref={root} data-iz-kick={source === "kick" ? "" : undefined} data-iz-high-attack={source === "highAttack" ? "" : undefined} data-iz-mid-attack={source === "midAttack" ? "" : undefined} className="space-y-2 rounded-md border p-3 text-sm">
    <p className="font-medium">{t("title")}</p>
    <div ref={meter} role="meter" aria-label={t("title")} aria-valuemin={0} aria-valuemax={1} aria-valuenow={0} className="h-3 overflow-hidden rounded bg-muted">
      <div ref={bar} data-iz-kick-bar={source === "kick" ? "" : undefined} data-iz-high-attack-bar={source === "highAttack" ? "" : undefined} data-iz-mid-attack-bar={source === "midAttack" ? "" : undefined} className="h-full origin-left bg-primary" style={{ transform: "scaleX(0)" }} />
    </div>
    <p>{t("interval")}: <output ref={interval} aria-live="off" data-iz-kick-interval={source === "kick" ? "" : undefined} data-iz-high-attack-interval={source === "highAttack" ? "" : undefined} data-iz-mid-attack-interval={source === "midAttack" ? "" : undefined}>—</output> · {t("count")}: <output ref={count} aria-live="off">0</output></p>
    <p className="text-xs text-muted-foreground">{t("note")}</p>
    <AudioBandRangeControls band={band} />
    {!enabled && <p className="text-xs text-muted-foreground">{t("inactive")}</p>}
  </div>;
}
