"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BANDS } from "@/lib/audio-analysis";
import { createLiveDetector, DEFAULT_BASS_OPTIONS, TRANSIENT_INTERVAL_MS, type BassDetectionOptions, type BassPulse, type LiveSnapshot } from "@/lib/live-audio-analysis";
import { BassPulseVisualizer } from "./bass-pulse-visualizer";
import { useApplicationSession } from "./application-runtime";
import { useMediaRuntime, usePlayback } from "./media-runtime";
import type { PlaybackTrack } from "./use-audio-playback";
import { Button } from "../ui/button";

function timestamp(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export function LiveAudioAnalysisPanel({ track }: { track: PlaybackTrack }) {
  const t = useTranslations("app.liveAnalysis");
  const labels = useTranslations("app.analysis");
  const locale = useLocale();
  const playback = usePlayback();
  const { audio, analysisGraph, registerStop } = useMediaRuntime();
  const { status, getStatus } = useApplicationSession();
  const [enabled, setEnabled] = useState(false);
  const [run, setRun] = useState(0);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState(false);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [bassPulse, setBassPulse] = useState<BassPulse | null>(null);
  const [bassOptions, setBassOptions] = useState<BassDetectionOptions>(DEFAULT_BASS_OPTIONS);
  const operation = useRef(0);
  useEffect(() => () => { operation.current++; }, []);

  useEffect(() => {
    if (!enabled) return;
    const element = audio.current;
    if (!element) return;
    let detector = createLiveDetector();
    let readyAt = performance.now() + 60;
    let nextUiAt = performance.now() + 120;
    let bassSinceUi = false, onsetSinceUi = false;
    const expectedSrc = `/api/tracks/${track.id}/audio`;
    const reset = (event: Event) => {
      detector = createLiveDetector(); readyAt = performance.now() + 60;
      nextUiAt = performance.now() + 120; bassSinceUi = onsetSinceUi = false; setBassPulse(null);
      if (["seeking", "seeked", "emptied", "loadstart"].includes(event.type)) setSnapshot(null);
    };
    const tick = () => {
      if (["ended", "unavailable"].includes(getStatus()) || document.hidden || performance.now() < readyAt ||
          element.paused || element.ended || element.seeking || element.readyState < 3 || element.getAttribute("src") !== expectedSrc) return;
      try {
        const transient = analysisGraph.measureTransient(element.currentTime);
        if (!transient) return;
        const detection = detector.sampleTransient(transient, bassOptions);
        bassSinceUi ||= detection.bassOnset; onsetSinceUi ||= detection.onset;
        // Deliver attacks immediately to the visualizer, independently of numeric fields.
        if (detection.bassOnset && detection.lastBassTime !== null) {
          setBassPulse({ time: detection.lastBassTime, strength: detection.bassStrength! });
        }
        const now = performance.now();
        if (now >= nextUiAt) {
          const measurement = analysisGraph.measure(element.currentTime);
          if (measurement) setSnapshot({ ...measurement, ...detection, bassOnset: bassSinceUi, onset: onsetSinceUi });
          bassSinceUi = onsetSinceUi = false; nextUiAt = now + 100;
        }
      } catch { setFailure(true); setEnabled(false); }
    };
    const timer = setInterval(tick, TRANSIENT_INTERVAL_MS);
    const events = ["playing", "pause", "waiting", "seeking", "seeked", "emptied", "loadstart", "ratechange"];
    events.forEach(event => element.addEventListener(event, reset));
    document.addEventListener("visibilitychange", reset);
    const unregister = registerStop(() => {
      clearInterval(timer); operation.current++;
      setSnapshot(null); setBassPulse(null); setEnabled(false); setStarting(false);
    });
    return () => {
      clearInterval(timer); unregister();
      events.forEach(event => element.removeEventListener(event, reset));
      document.removeEventListener("visibilitychange", reset);
    };
  }, [enabled, run, audio, analysisGraph, registerStop, track.id, getStatus, bassOptions]);

  async function start() {
    if (starting || getStatus() !== "active" || !audio.current) return;
    const revision = ++operation.current;
    setStarting(true); setFailure(false); setSnapshot(null); setBassPulse(null);
    try {
      // Initialize/resume directly from the user gesture, without replacing the player.
      analysisGraph.connect(audio.current);
      await analysisGraph.resume();
      if (revision !== operation.current || getStatus() !== "active") return;
      setEnabled(true);
      setRun(value => value + 1);
      if (playback.track?.id !== track.id || audio.current.paused || audio.current.ended) await playback.toggle(track);
    } catch {
      if (revision === operation.current) { setFailure(true); setEnabled(false); }
    } finally { if (revision === operation.current) setStarting(false); }
  }
  const number = (value: number | null | undefined, unit = "") => value == null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${unit}`;
  const time = (value: number | null | undefined) => value == null ? "—" : timestamp(value);
  const yesNo = (value: boolean | undefined) => value === undefined ? "—" : t(value ? "yes" : "no");
  const state = failure ? "failed" : !enabled ? "idle" : playback.track?.id !== track.id ? "otherTrack"
    : playback.error ? "playbackFailed" : playback.ended ? "ended" : playback.waiting ? "waiting" : !playback.playing ? "paused" : "running";
  const field = (key: string, label: string, value: string) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs">
    <span>{label}</span>
    <input type="text" readOnly value={value} data-live-value={key} aria-live="off"
      className="w-full min-w-0 rounded-md border bg-background/60 px-3 py-2 font-mono text-sm tabular-nums" />
  </label>;
  return <section className="space-y-4 rounded-lg border bg-card/60 p-4" aria-label={t("title")} data-live-analysis data-live-state={state}>
    <h2 className="text-lg font-semibold">{t("title")}</h2>
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={starting || status !== "active"} onClick={() => void start()} data-live-start>{t(enabled ? "restart" : "start")}</Button>
      {enabled && <Button type="button" variant="outline" onClick={() => { operation.current++; setEnabled(false); setStarting(false); }} data-live-stop>{t("stop")}</Button>}
      <span role="status" className="text-sm" data-live-status>{t(state)}</span>
    </div>
    {failure && <p role="alert" className="text-sm text-destructive">{t("failed")}</p>}
    <BassPulseVisualizer snapshot={snapshot} pulse={bassPulse} active={state === "running"} options={bassOptions}
      onOptionsChange={options => { setSnapshot(null); setBassPulse(null); setBassOptions(options); }} />
    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4">
      {field("start", t("windowStart"), time(snapshot?.start))}
      {field("time", t("windowEnd"), time(snapshot?.end))}
      {field("rms", "RMS dBFS", number(snapshot?.rmsDbfs))}
      {field("peak", "Peak dBFS", number(snapshot?.peakDbfs))}
      {field("dominant", labels("dominant"), number(snapshot?.dominantHz, " Hz"))}
      {BANDS.map(band => field(band.key, `${band.fromHz}–${band.toHz} Hz (%)`, number(snapshot?.bands[band.key], "%")))}
      {field("bassOnset", labels("bassOnset"), yesNo(snapshot?.bassOnset))}
      {field("bassTime", t("lastBassTime"), time(snapshot?.lastBassTime))}
      {field("bassStrength", t("lastBassStrength"), number(snapshot?.bassStrength, "×"))}
      {field("onset", labels("onset"), yesNo(snapshot?.onset))}
      {field("onsetTime", t("lastOnsetTime"), time(snapshot?.lastOnsetTime))}
      {field("onsetStrength", t("lastOnsetStrength"), number(snapshot?.onsetStrength, "×"))}
      {field("silence", labels("silence"), yesNo(snapshot?.silence))}
      {field("silenceStart", t("silenceStart"), snapshot?.silence ? time(snapshot.silenceStart) : "—")}
      {field("tempo", labels("tempo"), number(snapshot?.tempo?.bpm, " BPM"))}
    </div>
    <p className="text-xs text-muted-foreground">{t("notes")}</p>
  </section>;
}
