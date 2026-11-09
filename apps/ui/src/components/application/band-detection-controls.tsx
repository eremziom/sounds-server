"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AUDIO_BANDS, DEFAULT_BAND_OPTIONS, type AudioBand } from "@/lib/audio-band-detection";
import { useLiveAnalysis } from "./live-analysis-runtime";
import { Button } from "../ui/button";

function BandNumberInput({ label, name, value, min, max, step = 1, onChange }: {
  label: string; name: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="flex min-w-0 flex-col gap-1 text-xs">{label}
    <input type="number" name={name} value={draft ?? value} min={min} max={max} step={step}
      onChange={event => {
        setDraft(event.target.value);
        if (event.target.value !== "" && event.target.validity.valid && Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber);
      }} onBlur={() => setDraft(null)}
      className="w-full min-w-0 rounded-md border bg-background px-2 py-2 text-sm" />
  </label>;
}

export function BandDetectionControls() {
  const t = useTranslations("app.audioBands");
  const locale = useLocale();
  const { bandOptions, bandReadings, updateBand, resetBands, state } = useLiveAnalysis();
  const running = state === "running";
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return <section className="min-w-0 space-y-3" data-band-controls>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="font-medium">{t("title")}</h3>
      <Button type="button" variant="outline" size="sm" onClick={resetBands} data-bands-reset>{t("reset")}</Button>
    </div>
    <p className="text-xs text-muted-foreground">{t("description")}</p>
    <div className="grid min-w-0 gap-3 xl:grid-cols-3">
      {AUDIO_BANDS.map(band => {
        const options = bandOptions[band];
        const reading = bandReadings?.[band];
        const level = running ? reading?.level ?? 0 : 0;
        return <fieldset key={band} className="min-w-0 space-y-3 rounded-md border p-3" data-audio-band={band}
          data-band-level={level} data-band-dbfs={reading?.dbfs ?? ""} data-band-last-attack={reading?.lastTime ?? ""}>
          <legend className="px-1 text-sm font-medium">{t(band)}</legend>
          <div className="flex min-w-0 items-center gap-2">
            <meter min={0} max={1} value={level} aria-label={t("level", { band: t(band) })} className="min-w-0 flex-1" />
            <span className="text-xs tabular-nums">{reading ? number(reading.dbfs) : "—"} dBFS</span>
          </div>
          <p className="text-xs tabular-nums">{t("lastAttack")}: {reading?.lastTime == null ? "—" : `${number(reading.lastTime)} s`}</p>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <BandNumberInput label={t("fromHz")} name={`band-${band}-fromHz`} value={options.fromHz} min={20} max={options.toHz - 10}
              onChange={fromHz => updateBand(band, { fromHz })} />
            <BandNumberInput label={t("toHz")} name={`band-${band}-toHz`} value={options.toHz} min={options.fromHz + 10} max={20000}
              onChange={toHz => updateBand(band, { toHz })} />
            <BandNumberInput label={t("sensitivity")} name={`band-${band}-sensitivity`} value={options.sensitivity} min={0.5} max={3} step={0.1}
              onChange={sensitivity => updateBand(band, { sensitivity })} />
            <BandNumberInput label={t("minDbfs")} name={`band-${band}-minDbfs`} value={options.minDbfs} min={-90} max={-6}
              onChange={minDbfs => updateBand(band, { minDbfs })} />
            <BandNumberInput label={t("minIntervalMs")} name={`band-${band}-minIntervalMs`} value={options.minIntervalMs} min={40} max={1000} step={10}
              onChange={minIntervalMs => updateBand(band, { minIntervalMs })} />
          </div>
        </fieldset>;
      })}
    </div>
    <p className="text-xs text-muted-foreground">{t("notes")}</p>
  </section>;
}

/** The animation previews and analysis panel edit the same live filter taps. */
export function AudioBandRangeControls({ band }: { band: AudioBand }) {
  const { bandOptions, updateBand } = useLiveAnalysis();
  const range = useTranslations("app.infiniteZoom.frequencyRange");
  const options = bandOptions[band];
  return <fieldset data-iz-band-range={band} className="space-y-2 rounded-md border p-3">
    <legend className="px-1 text-xs font-medium">{range("title")}</legend>
    <div className="grid grid-cols-2 gap-3">
      <BandNumberInput label={range("fromHz")} name={`iz-band-${band}-fromHz`} value={options.fromHz} min={20} max={options.toHz - 10}
        onChange={fromHz => updateBand(band, { fromHz })} />
      <BandNumberInput label={range("toHz")} name={`iz-band-${band}-toHz`} value={options.toHz} min={options.fromHz + 10} max={20000}
        onChange={toHz => updateBand(band, { toHz })} />
    </div>
    <Button type="button" variant="outline" size="sm" data-iz-band-reset onClick={() => updateBand(band, {
      fromHz: DEFAULT_BAND_OPTIONS[band].fromHz, toHz: DEFAULT_BAND_OPTIONS[band].toHz,
    })}>{range("reset")}</Button>
    <p className="text-xs text-muted-foreground">{range("note")}</p>
  </fieldset>;
}
