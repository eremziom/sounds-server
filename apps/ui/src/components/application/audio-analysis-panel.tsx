"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BANDS, type AudioAnalysis } from "@/lib/audio-analysis";
import { analyzeAudioFile, AudioAnalysisError, type AnalysisFailure } from "@/lib/analyze-audio-file";
import { useApplicationSession } from "./application-runtime";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

const PAGE_SIZE = 50;
function time(seconds: number) {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
}

export function AudioAnalysisPanel({ track }: { track: { id: number; title: string } }) {
  const t = useTranslations("app.analysis");
  const locale = useLocale();
  const { status, getStatus, runProtected, subscribe, end } = useApplicationSession();
  const [result, setResult] = useState<AudioAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<AnalysisFailure | null>(null);
  const [view, setView] = useState<"events" | "timeline">("events");
  const [page, setPage] = useState(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      if (["ended", "unavailable"].includes(getStatus())) {
        controller.current?.abort();
        setResult(null); setPending(false); setFailure(null);
      }
    });
    return () => { unsubscribe(); controller.current?.abort(); };
  }, [subscribe, getStatus]);

  async function analyze() {
    if (pending || getStatus() !== "active") return;
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setPending(true); setFailure(null); setResult(null); setProgress(0); setPage(0);
    const timeout = setTimeout(() => operation.abort(new AudioAnalysisError("failed")), 120000);
    try {
      await runProtected(async () => {
        operation.signal.throwIfAborted();
        const response = await fetch(`/api/tracks/${track.id}/audio`, { signal: operation.signal, cache: "no-store" });
        if (response.status === 401) { end(); return; }
        if (!response.ok) {
          await response.body?.cancel();
          throw new AudioAnalysisError(response.status === 403 ? "denied" : response.status === 404 ? "missing" : "failed");
        }
        const analysis = await analyzeAudioFile(response, operation.signal, setProgress);
        if (!operation.signal.aborted && controller.current === operation && !["ended", "unavailable"].includes(getStatus())) setResult(analysis);
      });
    } catch (error) {
      if (controller.current === operation && getStatus() === "active" && (!operation.signal.aborted || operation.signal.reason instanceof AudioAnalysisError)) {
        setFailure(error instanceof AudioAnalysisError ? error.kind : "failed");
      }
    } finally {
      clearTimeout(timeout);
      if (controller.current === operation && !operation.signal.aborted) setPending(false);
      if (controller.current === operation && operation.signal.reason instanceof AudioAnalysisError) setPending(false);
    }
  }
  function download() {
    if (!result || getStatus() !== "active") return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ trackId: track.id, ...result }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `track-${track.id}-analysis-v${result.version}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  const count = result ? result[view].length : 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  return <section className="space-y-4" aria-label={t("title")} data-analysis-panel>
    <h2 className="break-words text-lg font-medium">{track.title}</h2>
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <p className="text-sm text-muted-foreground">{t("limits")}</p>
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" disabled={pending || status !== "active"} onClick={() => void analyze()} data-analysis-start>{t("analyze")}</Button>
      {pending && <Button type="button" variant="outline" onClick={() => { controller.current?.abort(); setPending(false); }} data-analysis-cancel>{t("cancel")}</Button>}
      {result && <Button type="button" variant="outline" disabled={status !== "active"} onClick={download} data-analysis-export>{t("export")}</Button>}
    </div>
    {pending && <div role="status" aria-live="polite"><p>{t("processing", { progress })}</p><progress value={progress} max={100} aria-label={t("progress")} className="w-full" /></div>}
    {failure && <p role="alert" className="text-destructive">{t(failure)}</p>}
    {result && <div className="space-y-4" data-analysis-result>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt>{t("duration")}</dt><dd className="font-mono">{time(result.duration)}</dd></div>
        <div><dt>{t("sampleRate")}</dt><dd>{number(result.sampleRate)} Hz</dd></div>
        <div><dt>{t("channels")}</dt><dd>{result.channels}</dd></div>
        <div><dt>{t("tempo")}</dt><dd>{result.tempo ? `${number(result.tempo.bpm)} BPM` : t("unknown")}</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">{t("estimates")}</p>
      <label className="flex flex-wrap items-center gap-2 text-sm">{t("view")}
        <select value={view} onChange={event => { setView(event.target.value as typeof view); setPage(0); }} className="rounded border bg-background p-2" data-analysis-view>
          <option value="events">{t("events")}</option><option value="timeline">{t("timeline")}</option>
        </select>
      </label>
      <div className="overflow-x-auto rounded border">
        <Table aria-label={t(view)} className="text-xs tabular-nums">
          <TableHeader><TableRow>
            <TableHead scope="col">{t("time")}</TableHead>
            {view === "events" ? <><TableHead scope="col">{t("event")}</TableHead><TableHead scope="col">{t("end")}</TableHead><TableHead scope="col">{t("strength")}</TableHead></>
              : <><TableHead scope="col">{t("end")}</TableHead><TableHead scope="col">RMS dBFS</TableHead><TableHead scope="col">Peak dBFS</TableHead><TableHead scope="col">{t("dominant")}</TableHead>{BANDS.map(band => <TableHead scope="col" key={band.key}>{band.fromHz}–{band.toHz} Hz (%)</TableHead>)}</>}
          </TableRow></TableHeader>
          <TableBody>
            {view === "events" ? result.events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((event, index) => <TableRow key={index} data-analysis-event={event.type}>
              <TableCell>{time(event.time)}</TableCell><TableCell>{t(event.type)}</TableCell><TableCell>{event.endTime !== undefined ? time(event.endTime) : "—"}</TableCell><TableCell>{event.strength !== undefined ? `${number(event.strength)}×` : "—"}</TableCell>
            </TableRow>) : result.timeline.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(frame => <TableRow key={frame.start}>
              <TableCell>{time(frame.start)}</TableCell><TableCell>{time(frame.end)}</TableCell><TableCell>{number(frame.rmsDbfs)}</TableCell><TableCell>{number(frame.peakDbfs)}</TableCell><TableCell>{frame.dominantHz === null ? "—" : `${number(frame.dominantHz)} Hz`}</TableCell>{BANDS.map(band => <TableCell key={band.key}>{number(frame.bands[band.key])}</TableCell>)}
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
      {count === 0 && <p>{t("empty")}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t("previous")}</Button>
        <span className="text-sm">{t("page", { page: page + 1, pages: pageCount, count })}</span>
        <Button type="button" variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>{t("next")}</Button>
      </div>
    </div>}
  </section>;
}
