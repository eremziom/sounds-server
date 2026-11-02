"use client";

import { useLocale, useTranslations } from "next-intl";
import { BANDS } from "@/lib/audio-analysis";
import { useLiveAnalysis } from "./live-analysis-runtime";
import { BassPulseVisualizer } from "./bass-pulse-visualizer";
import { BandDetectionControls } from "./band-detection-controls";
import { useApplicationSession } from "./application-runtime";
import { usePlayback } from "./media-runtime";
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
  const { status } = useApplicationSession();
  const { enabled, starting, snapshot: liveSnapshot, bassPulse: livePulse, bassOptions, setBassOptions, start, stop, state: liveState } = useLiveAnalysis();
  const selected = playback.track?.id === track.id;
  const snapshot = selected ? liveSnapshot : null;
  const bassPulse = selected ? livePulse : null;
  const state = enabled && !selected ? "otherTrack" : liveState;
  const failure = liveState === "failed";
  const number = (value: number | null | undefined, unit = "") => value == null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}${unit}`;
  const time = (value: number | null | undefined) => value == null ? "—" : timestamp(value);
  const yesNo = (value: boolean | undefined) => value === undefined ? "—" : t(value ? "yes" : "no");
  const field = (key: string, label: string, value: string) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs">
    <span>{label}</span>
    <input type="text" readOnly value={value} data-live-value={key} aria-live="off"
      className="w-full min-w-0 rounded-md border bg-background/60 px-3 py-2 font-mono text-sm tabular-nums" />
  </label>;
  return <section className="space-y-4 rounded-lg border bg-card/60 p-4" aria-label={t("title")} data-live-analysis data-live-state={state}>
    <h2 className="text-lg font-semibold">{t("title")}</h2>
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={starting || status !== "active"} onClick={() => void start(track)} data-live-start>{t(enabled ? "restart" : "start")}</Button>
      {enabled && <Button type="button" variant="outline" onClick={stop} data-live-stop>{t("stop")}</Button>}
      <span role="status" className="text-sm" data-live-status>{t(state)}</span>
    </div>
    {failure && <p role="alert" className="text-sm text-destructive">{t("failed")}</p>}
    <BassPulseVisualizer snapshot={snapshot} pulse={bassPulse} active={state === "running"} options={bassOptions}
      onOptionsChange={setBassOptions} />
    {selected && <BandDetectionControls />}
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
