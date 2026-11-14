"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useApplicationSession } from "../application/application-runtime";
import { ProtectedLink } from "../application/protected-link";
import { Button } from "../ui/button";
import { artifactUrl, ArtworkRequestError, createArtworkClient, type Artifact, type Revision } from "../../api/artworks";
import { createCreatorSession } from "./creator-session";
import { DraftPreviewControls } from "./draft-preview-controls";
import { ProductionControls } from "./production-controls";
import type { ArtworkBrief, ArtworkRevisionSnapshot } from "../../../../artwork-contracts/index.d.ts";

const briefFields = ["intent", "composition", "motionPlan", "lightingPlan", "blackoutPlan", "qaPlan"] as const;
const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

function LayerView({ projectId, revision, artifacts }: { projectId: string; revision: Revision; artifacts: Artifact[] }) {
  const t = useTranslations("app.creator");
  return <div className="space-y-3" data-creator-layers>
    {!revision.snapshot.layers.length && <p>{t("noLayers")}</p>}
    {revision.snapshot.layers.map(layer => <article key={layer.id} className="rounded border p-3">
      <h4 className="font-medium">{layer.id}</h4>
      {[layer.imageArtifactId, ...layer.maskArtifactIds].map(id => {
        const artifact = artifacts.find(item => item.id === id);
        return <figure key={id} className="mt-2">
          <figcaption className="text-xs text-muted-foreground">{artifact?.kind ?? t("missingArtifact")}{artifact?.width ? ` · ${artifact.width} × ${artifact.height}` : ""}</figcaption>
          {artifact?.mimeType === "image/png" && <img /* eslint-disable-line @next/next/no-img-element -- Private authenticated PNG, no public image optimizer. */
            src={artifactUrl(projectId, id)} alt={`${layer.id} · ${artifact.kind}`} loading="lazy" className="mt-1 max-h-64 max-w-full rounded bg-black object-contain" />}
        </figure>;
      })}
    </article>)}
  </div>;
}

export function ArtworkCreator() {
  const t = useTranslations("app.creator"), { runProtected } = useApplicationSession();
  const [session] = useState(() => createCreatorSession(createArtworkClient(async (input, init) => {
    const result = await runProtected(() => fetch(input, init));
    if (!result.executed) throw new ArtworkRequestError(401, "AUTH_REQUIRED");
    return result.value;
  })));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getServerSnapshot);
  const [dirty, setDirty] = useState(false), [seed, setSeed] = useState(42);
  const [localError, setLocalError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let stopped = false;
    const id = new URL(window.location.href).searchParams.get("project");
    void (async () => { await session.loadProjects(); if (id && !stopped) await session.open(id); })();
    return () => { stopped = true; session.cancelReads(); };
  }, [session]);
  useEffect(() => {
    let stopped = false, timer: ReturnType<typeof setTimeout>;
    async function poll() { await session.poll(); if (!stopped) timer = setTimeout(poll, 3000); }
    timer = setTimeout(poll, 3000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [session]);
  function rememberProject(id: string) {
    const url = new URL(window.location.href); url.searchParams.set("project", id);
    window.history.replaceState(window.history.state, "", url);
  }
  async function open(id: string) { setLocalError(null); await session.open(id); rememberProject(id); }
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (!title) return;
    await session.create(title);
    const project = session.getSnapshot().project;
    if (project) rememberProject(project.id);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget), previous = state.project?.revision?.snapshot;
    const brief = Object.fromEntries(briefFields.map(field => [field, String(data.get(field) ?? "").trim()])) as Pick<ArtworkBrief, typeof briefFields[number]>;
    if (Object.values(brief).some(value => !value)) { setLocalError(t("required")); return; }
    const snapshot: ArtworkRevisionSnapshot = { schemaVersion: 1, layers: previous?.layers ?? [], artifactIds: previous?.artifactIds ?? [], decisions: previous?.decisions ?? [],
      brief: { ...brief, guidelinesVersion: "1.7", guidelinesPath: "apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md" } };
    await session.save(snapshot);
    if (!session.getSnapshot().error) { setDirty(false); setLocalError(null); }
  }
  const project = state.project, revision = project?.revision;
  const error = state.error;
  const errorText = error instanceof ArtworkRequestError
    ? t(error.status === 409 ? "conflict" : error.status === 401 ? "authError" : error.status === 404 ? "notFound" : error.status === 413 ? "tooLarge" : "requestError")
    : error ? t("requestError") : localError;
  const jobActive = state.jobs.some(job => job.state === "queued" || job.state === "running");
  return <section data-artwork-creator className="space-y-6 rounded-lg border bg-background/95 p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{t("title")}</h1><p className="text-sm text-muted-foreground">{t("description")}</p></div>
      <ProtectedLink href="/animations" className="text-sm underline">{t("back")}</ProtectedLink>
    </div>
    <p className="rounded border p-3 text-sm">{t("milestone")}</p>
    <div className="space-y-2 rounded border p-3">
      <h2 className="font-semibold">{t("starterTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("starterHelp")}</p>
      <Button type="button" data-creator-starter disabled={state.busy || dirty} onClick={async () => {
        await session.starter(); const selected = session.getSnapshot().project; if (selected) rememberProject(selected.id);
      }}>{t("starterOpen")}</Button>
    </div>
    {errorText && <p role="alert" data-creator-error className="rounded border border-destructive p-3">{errorText}</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <form onSubmit={create} className="space-y-2">
        <label htmlFor="creator-title" className="block text-sm font-medium">{t("projectTitle")}</label>
        <input id="creator-title" name="title" required maxLength={160} className={inputClass} disabled={state.busy || dirty} />
        <Button type="submit" disabled={state.busy || dirty}>{t("create")}</Button>
      </form>
      <div className="space-y-2">
        <label htmlFor="creator-project" className="block text-sm font-medium">{t("projects")}</label>
        <select id="creator-project" value={project?.id ?? ""} className={inputClass} disabled={state.busy || dirty} onChange={event => { if (event.target.value) void open(event.target.value); }}>
          <option value="">{t("chooseProject")}</option>
          {state.projects.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <Button type="button" variant="outline" disabled={state.busy || dirty} onClick={() => { void session.loadProjects(); }}>{t("refreshProjects")}</Button>
      </div>
    </div>
    {state.busy && <p role="status">{t("working")}</p>}
    {project && <>
      <h2 className="text-xl font-semibold">{project.title}</h2>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <form ref={form} key={revision?.id ?? project.id} onSubmit={save} onChange={() => setDirty(true)} className="space-y-3">
            <h3 className="font-semibold">{t("brief")}</h3>
            {briefFields.map(field => <label key={field} className="block text-sm font-medium">
              {t(`fields.${field}`)}
              <textarea name={field} required maxLength={16000} defaultValue={revision?.snapshot.brief[field] ?? ""} placeholder={t(`hints.${field}`)} rows={field === "intent" ? 4 : 2} className={`${inputClass} mt-1`} disabled={state.busy} />
            </label>)}
            <p className="text-xs text-muted-foreground">{t("guidelines")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={state.busy}>{t("save")}</Button>
              {dirty && <Button type="button" variant="outline" onClick={() => { form.current?.reset(); setDirty(false); setLocalError(null); }}>{t("discard")}</Button>}
              <Button type="button" variant="outline" disabled={state.busy || dirty} onClick={() => void session.refresh()}>{t("reload")}</Button>
            </div>
            {dirty && <p role="status" className="text-sm">{t("unsaved")}</p>}
          </form>
          <div className="space-y-2 rounded border p-3">
            <h3 className="font-semibold">{t("generation")}</h3>
            <label className="block text-sm">{t("seed")}<input type="number" min={0} max={2147483647} step={1} value={seed} onChange={event => setSeed(event.target.valueAsNumber)} className={`${inputClass} mt-1`} /></label>
            <Button type="button" data-creator-generate disabled={state.busy || dirty || !revision || jobActive || !Number.isInteger(seed) || seed < 0 || seed > 2147483647} onClick={() => void session.generate(seed)}>{t("generate")}</Button>
            <p className="text-xs text-muted-foreground">{t("generationHelp")}</p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">{t("references")}</h3>
            <p className="text-xs text-muted-foreground">{t("referenceHelp")}</p>
            <label className="block text-sm">{t("upload")}
              <input type="file" accept="image/png" disabled={state.busy || dirty} className={`${inputClass} mt-1`} onChange={event => {
                const file = event.target.files?.[0]; event.target.value = "";
                if (!file) return;
                if (file.size > 32 * 1024 * 1024 || file.type !== "image/png") { setLocalError(t("pngOnly")); return; }
                setLocalError(null); void session.upload(file);
              }} />
            </label>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">{t("notes")}</h3>
            <p className="text-xs text-muted-foreground">{t("notesHelp")}</p>
            <form onSubmit={async event => {
              event.preventDefault(); const target = event.currentTarget;
              const text = String(new FormData(target).get("note") ?? "").trim();
              if (text) { await session.message(text); if (!session.getSnapshot().error) target.reset(); }
            }} className="space-y-2">
              <label className="block text-sm">{t("note")}<textarea name="note" required maxLength={16000} className={`${inputClass} mt-1`} /></label>
              <Button disabled={state.busy || dirty} type="submit" variant="outline">{t("addNote")}</Button>
            </form>
            <ul className="max-h-60 space-y-2 overflow-auto text-sm">{state.messages.map(message => <li key={message.id} className="whitespace-pre-wrap rounded border p-2">{message.text}</li>)}</ul>
          </div>
        </div>
        <div className="space-y-5">
          {revision && <DraftPreviewControls key={`${project.id}:${revision.id}`} projectId={project.id} revision={revision}
            jobs={state.jobs} artifacts={state.artifacts} disabled={state.busy || dirty} onBuild={session.buildPreview} />}
          {revision && <ProductionControls key={project.id} projectId={project.id} revision={revision} artifacts={state.artifacts} jobs={state.jobs}
            disabled={state.busy || dirty || jobActive} onRun={session.runTool} onAssemble={session.assemble} onKeep={session.keepResult} />}
          <section className="space-y-2" aria-label={t("jobs")}>
            <h3 className="font-semibold">{t("jobs")}</h3>
            {!state.jobs.length && <p className="text-sm">{t("noJobs")}</p>}
            {state.jobs.map(job => <article key={job.id} data-creator-job={job.id} className="space-y-2 rounded border p-3 text-sm">
              <p>{t(job.tool === "generateImage" ? "generation" : "processing")} · {t(`states.${job.state}`)} · {t("attempt", { count: job.attempt })}</p>
              <progress value={job.progress} max={100} aria-label={t("progress")} className="w-full" />
              {["MEMORY_DEFERRED", "MEMORY_TELEMETRY_UNAVAILABLE"].includes(job.phase) && <p>{t("waitingResources")}</p>}
              {job.errorCode && <p role="status">{t("jobFailed")} ({job.errorCode})</p>}
              {job.cancelRequested && <p role="status">{t("cancelling")}</p>}
              <div className="flex gap-2">
                {["queued", "running"].includes(job.state) && <Button type="button" variant="outline" disabled={state.busy || job.cancelRequested || dirty} onClick={() => void session.job(job.id, "cancel")}>{t("cancel")}</Button>}
                {["failed", "cancelled"].includes(job.state) && <Button type="button" variant="outline" disabled={state.busy || dirty} onClick={() => void session.job(job.id, "retry")}>{t("retry")}</Button>}
              </div>
            </article>)}
          </section>
          <section className="space-y-3" aria-label={t("variants")}>
            <h3 className="font-semibold">{t("variants")}</h3>
            <p className="text-xs text-muted-foreground">{t("variantHelp")}</p>
            <div className="grid max-h-[34rem] grid-cols-2 gap-3 overflow-auto">
              {state.artifacts.filter(artifact => artifact.mimeType === "image/png").map((artifact, index) => <figure key={artifact.id} className="rounded border p-2">
                <img /* eslint-disable-line @next/next/no-img-element -- Authenticated private PNG. */
                  src={artifactUrl(project.id, artifact.id)} alt={t("artifact", { index: index + 1 })} loading="lazy" className="aspect-video w-full bg-black object-contain" />
                <figcaption className="my-2 break-words text-xs">{artifact.kind} · {artifact.width} × {artifact.height}</figcaption>
                {artifact.kind === "image" && <Button type="button" variant="outline" disabled={state.busy || dirty || !revision} onClick={() => void session.applyImage(artifact.id)}>{t("apply")}</Button>}
              </figure>)}
            </div>
          </section>
          {revision && <section className="space-y-2">
            <h3 className="font-semibold">{t("layers")}</h3>
            <p className="text-xs text-muted-foreground">{t("staticHelp")}</p>
            {!revision.validation.ready && <p role="status">{t("stale")}</p>}
            <LayerView projectId={project.id} revision={revision} artifacts={state.artifacts} />
          </section>}
        </div>
      </div>
      <section className="space-y-3">
        <h3 className="font-semibold">{t("history")}</h3>
        <ol className="max-h-64 space-y-2 overflow-auto">{state.history.map((item, index) => <li key={item.id} className="flex flex-wrap items-center gap-2 rounded border p-2 text-sm">
          <span>{t("revision", { index: state.history.length - index })} · <time dateTime={item.createdAt}>{item.createdAt.replace("T", " ").slice(0, 19)} UTC</time>{item.id === project.activeRevisionId ? ` · ${t("active")}` : ""}</span>
          <Button type="button" variant="outline" disabled={state.busy} onClick={() => void session.compare(item.id)}>{t("compare")}</Button>
          <Button type="button" variant="outline" disabled={state.busy || dirty || item.id === project.activeRevisionId || !project.activeRevisionId} onClick={() => void session.restore(item.id)}>{t("restore")}</Button>
        </li>)}</ol>
        {state.comparison && <div className="grid gap-4 md:grid-cols-2" data-creator-comparison>
          {[revision, state.comparison].map((item, index) => item && <div key={`${index}-${item.id}`} className="space-y-2 rounded border p-3">
            <h4 className="font-semibold">{t(index ? "selectedRevision" : "currentRevision")}</h4>
            {briefFields.map(field => <p key={field} className="whitespace-pre-wrap text-sm"><strong>{t(`fields.${field}`)}: </strong>{item.snapshot.brief[field]}</p>)}
            <LayerView projectId={project.id} revision={item} artifacts={state.artifacts} />
          </div>)}
        </div>}
      </section>
    </>}
  </section>;
}
