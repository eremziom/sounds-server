"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ArtworkJobRecord } from "../../../../artwork-contracts/index.d.ts";
import { createArtworkClient, ArtworkRequestError, type Artifact, type Revision } from "../../api/artworks";
import { useApplicationSession } from "../application/application-runtime";
import { useInfiniteZoom, useVisualSnapshot } from "../infinite-zoom/infinite-zoom-provider";
import { Button } from "../ui/button";
import { prepareDraftManifest, previewEnvironmentGroups, previewReportId } from "./preview-package";

export function DraftPreviewControls({ projectId, revision, jobs, artifacts, disabled, onBuild }: {
  projectId: string; revision: Revision; jobs: ArtworkJobRecord[]; artifacts: Artifact[];
  disabled: boolean; onBuild(): Promise<void>;
}) {
  const t = useTranslations("app.creator"), displayT = useTranslations("app.infiniteZoom"), runtime = useInfiniteZoom(), visual = useVisualSnapshot();
  const { runProtected } = useApplicationSession();
  const [api] = useState(() => createArtworkClient(async (input, init) => {
    const result = await runProtected(() => fetch(input, init));
    if (!result.executed) throw new ArtworkRequestError(401, "AUTH_REQUIRED");
    return result.value;
  }));
  const lifetime = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    const scope = new AbortController(); lifetime.current = scope;
    return () => { scope.abort(); void runtime.endDraftPreview().catch(() => {}); };
  }, [runtime]);
  const job = jobs.find(item => previewReportId(item, revision));
  const reportId = job && previewReportId(job, revision);
  const pendingBuild = jobs.some(item => item.tool === "buildPreviewPackage" && item.baseRevisionId === revision.id &&
    (item.state === "queued" || item.state === "running"));
  const active = visual.scene === "draft";
  async function show() {
    const signal = lifetime.current?.signal;
    if (!signal || !job || !reportId) return;
    setBusy(true); setError(false);
    try {
      const data = await api.previewPackage(projectId, reportId, signal);
      signal.throwIfAborted();
      const manifest = prepareDraftManifest(data, projectId, revision, job, artifacts);
      await runtime.previewDraft(manifest, signal, previewEnvironmentGroups(data, manifest));
      signal.throwIfAborted();
      runtime.setMode("immersive");
    } catch { if (!signal.aborted) setError(true); }
    finally { if (!signal.aborted) setBusy(false); }
  }
  async function end() {
    runtime.setMode("background"); setBusy(true); setError(false);
    try { await runtime.endDraftPreview(); }
    catch { if (!lifetime.current?.signal.aborted) setError(true); }
    finally { if (!lifetime.current?.signal.aborted) setBusy(false); }
  }
  return <section data-draft-preview className="space-y-3 rounded border p-3">
    <h3 className="font-semibold">{t("previewTitle")}</h3>
    <p className="text-xs text-muted-foreground">{t("previewHelp")}</p>
    {error && <p role="alert">{t("previewError")}</p>}
    {(busy || visual.sceneLoading) && <p role="status">{t("previewLoading")}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" data-creator-build-preview disabled={disabled || busy || pendingBuild || !revision.validation.ready || !revision.snapshot.layers.length} onClick={() => void onBuild()}>{t("buildPreview")}</Button>
      <Button type="button" data-creator-show-preview disabled={disabled || busy || visual.sceneLoading || !reportId} onClick={() => void show()}>{t("showPreview")}</Button>
      {active && <Button type="button" variant="outline" disabled={busy || visual.sceneLoading} onClick={() => void end()}>{t("endPreview")}</Button>}
    </div>
    {!reportId && <p className="text-xs" role="status">{t(pendingBuild ? "previewQueued" : "previewNotBuilt")}</p>}
    {active && <>
      <p className="text-xs" role="status">{t("previewActive")}</p>
      <div className="flex flex-wrap gap-2">
        {(["zoomIn", "zoomOut", "return"] as const).map(command => <Button key={command} type="button" variant="outline" disabled={visual.status !== "running" || visual.sceneLoading} onClick={() => runtime.command(command)}>{t(`previewCamera.${command}`)}</Button>)}
        <Button type="button" variant="outline" disabled={visual.sceneLoading || !visual.ready} onClick={() => runtime.reset()}>{t("resetPreview")}</Button>
        <Button type="button" data-creator-preview-immersive variant="outline" onClick={() => runtime.setMode("immersive")}>{displayT("immersive")}</Button>
      </div>
    </>}
  </section>;
}
