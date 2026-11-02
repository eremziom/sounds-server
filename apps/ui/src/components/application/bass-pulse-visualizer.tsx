"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { DEFAULT_BASS_OPTIONS, type BassDetectionOptions, type BassPulse, type LiveSnapshot } from "@/lib/live-audio-analysis";
import { Button } from "../ui/button";

export function BassPulseVisualizer({ snapshot, pulse, active, options, onOptionsChange }: {
  snapshot: LiveSnapshot | null;
  pulse: BassPulse | null;
  active: boolean;
  options: BassDetectionOptions;
  onOptionsChange: (options: BassDetectionOptions) => void;
}) {
  const t = useTranslations("app.bassVisual");
  const [decay, setDecay] = useState(220);
  const ring = useRef<HTMLDivElement>(null);
  const lastPulse = useRef<number | null>(null);
  const bassDb = snapshot ? 20 * Math.log10(Math.max(snapshot.lowAmplitude, 1e-6)) : -120;
  // Absolute bass amplitude, not its relative percentage of an otherwise quiet signal.
  const energy = active ? Math.max(0, Math.min(1, (bassDb + 60) / 60)) : 0;

  useEffect(() => {
    const element = ring.current;
    if (!element) return;
    if (!active || !pulse) {
      element.getAnimations().forEach(animation => animation.cancel());
      if (!pulse) lastPulse.current = null;
      return;
    }
    if (lastPulse.current === pulse.time) return;
    lastPulse.current = pulse.time;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    element.getAnimations().forEach(animation => animation.cancel());
    const intensity = Math.min(1, Math.max(0, (pulse.strength - 1) / 5));
    element.animate([
      { opacity: 0.25 + 0.35 * intensity, transform: "scale(1)" },
      { opacity: 0, transform: `scale(${1.35 + intensity * 0.35})` },
    ], { duration: decay, easing: "ease-out" });
  }, [active, pulse, decay]);

  useEffect(() => {
    const element = ring.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => element?.getAnimations().forEach(animation => animation.cancel());
    preference.addEventListener("change", stop);
    return () => { preference.removeEventListener("change", stop); stop(); };
  }, []);

  return <section className="rounded-lg border bg-background/40 p-4" aria-label={t("title")} data-bass-visual
    data-bass-last-pulse={active ? pulse?.time ?? "" : ""} data-bass-energy={energy}>
    <h3 className="font-medium">{t("title")}</h3>
    <div className="grid min-w-0 items-center gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="relative mx-auto flex size-60 max-w-full items-center justify-center overflow-hidden" aria-hidden="true">
        <div ref={ring} data-bass-pulse className="pointer-events-none absolute size-36 rounded-full border-4 border-fuchsia-300 bg-fuchsia-400/15 opacity-0" />
        <div data-bass-orb className="flex size-36 transform-[scale(var(--bass-scale))] items-center justify-center rounded-full border border-fuchsia-300/50 bg-fuchsia-500/10 transition-[transform,box-shadow] duration-100 motion-reduce:transform-none motion-reduce:transition-none"
          style={{ "--bass-scale": 1 + 0.35 * energy, boxShadow: `0 0 ${10 + 24 * energy}px rgb(217 70 239 / ${0.06 + 0.2 * energy})` } as CSSProperties}>
          <span className="text-xs font-medium tracking-widest">BASS</span>
        </div>
      </div>
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex min-w-0 flex-col gap-2 text-xs">{t("sensitivity", { value: options.sensitivity })}
            <input type="range" min={0.5} max={3} step={0.1} value={options.sensitivity} data-bass-sensitivity
              onChange={event => onOptionsChange({ ...options, sensitivity: Number(event.target.value) })} className="w-full accent-fuchsia-400" />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-xs">{t("interval", { value: options.minIntervalMs })}
            <input type="range" min={120} max={600} step={10} value={options.minIntervalMs} data-bass-interval
              onChange={event => onOptionsChange({ ...options, minIntervalMs: Number(event.target.value) })} className="w-full accent-fuchsia-400" />
          </label>
          <label className="flex min-w-0 flex-col gap-2 text-xs">{t("decay", { value: decay })}
            <input type="range" min={150} max={600} step={10} value={decay} data-bass-decay
              onChange={event => setDecay(Number(event.target.value))} className="w-full accent-fuchsia-400" />
          </label>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => { setDecay(220); onOptionsChange({ ...DEFAULT_BASS_OPTIONS }); }} data-bass-reset>{t("reset")}</Button>
        <p className="text-xs text-muted-foreground">{t("notes")}</p>
      </div>
    </div>
  </section>;
}
