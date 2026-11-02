"use client";

import { useTranslations } from "next-intl";
import { ANIMATION_PARAMETERS, AUDIO_SOURCES, DEFAULT_AUDIO_MAPPINGS, type AudioMapping, type AudioSource, type AnimationParameter } from "@/lib/audio-animation";
import { BandDetectionControls } from "./band-detection-controls";
import { useBackgroundSettings } from "./background-settings";
import { useLiveAnalysis } from "./live-analysis-runtime";
import { usePlayback } from "./media-runtime";
import { useApplicationSession } from "./application-runtime";
import { Button } from "../ui/button";

const inputClass = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm";

export function AudioAnimationControls() {
  const t = useTranslations("app.animations.audio");
  const parameters = useTranslations("app.animations.parameters");
  const liveLabels = useTranslations("app.liveAnalysis");
  const { audioEnabled, setAudioEnabled, mappings, setMappings, decayMs, setDecayMs } = useBackgroundSettings();
  const { start, stop, enabled, starting, state } = useLiveAnalysis();
  const playback = usePlayback();
  const { status } = useApplicationSession();
  const update = (id: string, patch: Partial<AudioMapping>) => setMappings(mappings.map(row => row.id === id ? { ...row, ...patch } : row));

  async function activate() {
    if (!playback.track) return;
    setAudioEnabled(true);
    await start(playback.track);
  }

  return <section className="space-y-4 rounded-lg border bg-card/60 p-4" data-audio-animation>
    <h2 className="text-lg font-semibold">{t("title")}</h2>
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={audioEnabled} onChange={event => setAudioEnabled(event.target.checked)} data-audio-reactive />
        {t("enabled")}
      </label>
      <Button type="button" disabled={!playback.track || starting || status !== "active"} onClick={() => void activate()} data-audio-start>{t("start")}</Button>
      {enabled && <Button type="button" variant="outline" onClick={stop}>{liveLabels("stop")}</Button>}
      <span role="status" className="text-sm" data-audio-status>{liveLabels(state)}</span>
    </div>
    {!playback.track && <p className="text-sm text-muted-foreground">{t("selectTrack")}</p>}
    <p className="text-xs text-muted-foreground">{t("kickNote")}</p>
    <BandDetectionControls />
    <div className="space-y-3">
      {mappings.map(row => <div key={row.id} className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_1fr_1fr_auto]" data-audio-mapping={row.id}>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" checked={row.enabled} onChange={event => update(row.id, { enabled: event.target.checked })} />
          {t("rowEnabled")}
        </label>
        <label className="space-y-1 text-sm">{t("source")}
          <select className={inputClass} value={row.source} onChange={event => update(row.id, { source: event.target.value as AudioMapping["source"] })} data-mapping-source>
            {(Object.keys(AUDIO_SOURCES) as AudioSource[]).map(source => <option key={source} value={source}>{t(source)}</option>)}
          </select>
        </label>
        <span className="hidden pb-2 lg:block" aria-hidden="true">→</span>
        <label className="space-y-1 text-sm">{t("target")}
          <select className={inputClass} value={row.target} onChange={event => update(row.id, { target: event.target.value as AudioMapping["target"] })} data-mapping-target>
            {(Object.keys(ANIMATION_PARAMETERS) as AnimationParameter[]).map(key => <option key={key} value={key}>{parameters(key)} ({key})</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm">{t("amount")} ({Math.round(row.amount * 100)}%)
          <input className="block min-h-9 w-full accent-primary" type="range" min={-100} max={100} step={1} value={Math.round(row.amount * 100)}
            onChange={event => update(row.id, { amount: event.target.valueAsNumber / 100 })} data-mapping-amount />
        </label>
        <Button type="button" variant="outline" onClick={() => setMappings(mappings.filter(item => item.id !== row.id))}>{t("remove")}</Button>
      </div>)}
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={() => setMappings([...mappings, { id: crypto.randomUUID(), source: "bass", target: "pulses", amount: 0.2, enabled: true }])} data-mapping-add>{t("add")}</Button>
      <Button type="button" variant="outline" onClick={() => { setMappings(DEFAULT_AUDIO_MAPPINGS); setDecayMs(220); }}>{t("reset")}</Button>
      <label className="flex items-center gap-3 text-sm">{t("decay")} ({decayMs} ms)
        <input type="range" min={80} max={1000} step={10} value={decayMs} onChange={event => setDecayMs(event.target.valueAsNumber)} data-audio-decay />
      </label>
    </div>
    <p className="text-xs text-muted-foreground">{t("amountHelp")}</p>
  </section>;
}
