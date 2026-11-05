"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "../ui/button";
import { useInfiniteZoom, useVisualSnapshot } from "./infinite-zoom-provider";

export function InfiniteZoomControls() {
  const runtime = useInfiniteZoom(), snapshot = useVisualSnapshot(), t = useTranslations("app.infiniteZoom");
  const modulation = useSyncExternalStore(runtime.subscribe, runtime.getModulation, () => true);
  const running = snapshot.status === "running";
  const busy = ["preparing", "prepared", "revealing", "rollingBack"].includes(snapshot.transition);
  return <section data-infinite-zoom-controls className="space-y-4 rounded-lg border bg-background/90 p-5">
    <h1 className="text-xl font-semibold">Infinite Zoom</h1>
    <p className="text-sm text-muted-foreground">{t("description")}</p>
    <p role="status" data-iz-state className="text-sm" data-status={snapshot.status} data-tick={snapshot.tick} data-artwork={snapshot.artwork} data-transition={snapshot.transition}>
      {t.has(`states.${snapshot.status}`) ? t(`states.${snapshot.status}`) : t("states.idle")}
    </p>
    <div className="flex flex-wrap gap-2">
      <Button type="button" data-iz-immersive onClick={event => {
        const trigger = event.currentTarget;
        runtime.setMode("immersive", () => { if (trigger.isConnected) trigger.focus(); });
      }}>{t("immersive")}</Button>
      <Button type="button" variant="outline" data-iz-transition disabled={!snapshot.ready || busy} onClick={() => void runtime.transition()}>{t("transition")}</Button>
      <Button type="button" variant="outline" data-iz-cancel disabled={!running || !busy} onClick={() => runtime.command("cancel")}>{t("cancel")}</Button>
      <Button type="button" variant="outline" data-iz-reset disabled={!snapshot.ready} onClick={() => runtime.reset()}>{t("reset")}</Button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label={t("camera")}>
      {(["zoomIn", "zoomOut", "rotate", "hold", "return"] as const).map(command => <Button key={command} type="button" variant="outline" disabled={!running || busy} data-iz-command={command} onClick={() => runtime.command(command)}>{t(command)}</Button>)}
    </div>
    <label className="flex items-center gap-2 text-sm"><input data-iz-modulation type="checkbox" checked={modulation} onChange={event => runtime.setModulation(event.target.checked)} />{t("modulation")}</label>
    <details className="text-xs" data-iz-diagnostics>
      <summary>{t("diagnostics")}</summary>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap" data-iz-diagnostic-snapshot>{JSON.stringify(snapshot.diagnostics ?? {}, null, 2)}</pre>
    </details>
    {snapshot.error && <div role="alert" className="space-y-2 text-sm"><p>{t("failed")}</p>
      {snapshot.retryable && <Button type="button" variant="outline" data-iz-retry onClick={() => void runtime.retry().catch(() => {})}>{t("retry")}</Button>}
    </div>}
  </section>;
}
