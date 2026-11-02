"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { UploadConfig } from "@/api/tracks";
import { translateApiError } from "@/i18n/api-errors";
import { registerNavigationBlocker } from "@/lib/unsaved-navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { ProtectedLink } from "./protected-link";
import { useApplicationSession } from "./application-runtime";
import { emptyDraft, validateDraft, validateUploadFile, type TrackDraft } from "./upload-validation";
import { uploadAudio } from "./upload-audio";

type Stage = "idle" | "uploading" | "ready" | "saving" | "cancelling" | "failed" | "unknown" | "expired" | "success";
type TemporaryUpload = { uploadId: string; expiresAt: string };

export function UploadForm({ config }: { config: UploadConfig }) {
  const t = useTranslations("app.upload");
  const all = useTranslations();
  const router = useRouter();
  const { runProtected, end, subscribe, getStatus } = useApplicationSession();
  const [draft, setDraft] = useState<TrackDraft>(emptyDraft);
  const [publicationDate, setPublicationDate] = useState("");
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({});
  const [stage, setStage] = useState<Stage>("idle");
  const [started, setStarted] = useState(false);
  const [name, setName] = useState("");
  const [upload, setUpload] = useState<TemporaryUpload>();
  const [message, setMessage] = useState("");
  const [serverFields, setServerFields] = useState<Record<string, string[]>>({});
  const [dialog, setDialog] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [progress, setProgress] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [denied, setDenied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const knownUpload = useRef<TemporaryUpload | undefined>(undefined);
  const dirty = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const decision = useRef<((leave: boolean) => void) | undefined>(undefined);
  const decisionPromise = useRef<Promise<boolean> | undefined>(undefined);
  const labels = useRef(t);
  useEffect(() => { labels.current = t; }, [t]);

  function stop() {
    controller.current?.abort(); controller.current = null; busy.current = false;
  }
  async function cancelKnown() {
    const id = knownUpload.current?.uploadId;
    knownUpload.current = undefined;
    if (!id || getStatus() === "ended") return;
    // Best effort, bounded cleanup. TTL covers disconnects and unknown IDs.
    try { await fetch(`/api/tracks/uploads/${id}`, { method: "DELETE", signal: AbortSignal.timeout(5000) }); } catch { /* TTL cleanup */ }
  }

  useEffect(() => {
    mounted.current = true;
    const unregister = registerNavigationBlocker(() => {
      if (!decisionPromise.current) {
        decisionPromise.current = new Promise<boolean>(resolve => { decision.current = resolve; });
        setDialog(true);
      }
      return decisionPromise.current;
    }, () => dirty.current && getStatus() !== "ended");
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current && getStatus() !== "ended") { event.preventDefault(); event.returnValue = ""; }
    };
    const unsubscribe = subscribe(() => {
      const status = getStatus();
      if (status === "ended" || status === "unavailable") {
        stop();
        if (status === "ended") {
          dirty.current = false;
          decision.current?.(false); decision.current = undefined; decisionPromise.current = undefined;
          setDialog(false);
          setCancelDialog(false);
        } else {
          setStage("unknown"); setMessage(labels.current("unknownResult"));
        }
      }
    });
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted.current = false; unregister(); unsubscribe(); stop();
      decision.current?.(false);
      decision.current = undefined; decisionPromise.current = undefined;
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [subscribe, getStatus]);

  useEffect(() => {
    if (!upload || stage !== "ready") return;
    const expire = () => {
      if (Date.now() >= Date.parse(upload.expiresAt)) { setStage("expired"); setMessage(t("expired")); }
    };
    expire();
    const timer = setTimeout(expire, Math.max(0, Date.parse(upload.expiresAt) - Date.now()));
    window.addEventListener("focus", expire);
    return () => { clearTimeout(timer); window.removeEventListener("focus", expire); };
  }, [upload, stage, t]);

  function decide(leave: boolean) {
    if (!leave) {
      decision.current?.(false); decision.current = undefined; decisionPromise.current = undefined; setDialog(false);
      return;
    }
    setLeaving(true); dirty.current = false; stop();
    void cancelKnown().finally(() => {
      decision.current?.(true); decision.current = undefined; decisionPromise.current = undefined;
      if (mounted.current) {
        setDialog(false); setLeaving(false);
        setUpload(undefined); setDraft(emptyDraft); setPublicationDate(""); setErrors({}); setServerFields({}); setStarted(false); setName(""); setMessage(""); setStage("idle");
        if (fileInput.current) fileInput.current.value = "";
      }
    });
  }

  async function failure(response: Response) {
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    if (response.status === 401) { end(); return; }
    if (response.status >= 500 && body && typeof body === "object" && "code" in body &&
        typeof body.code === "string" && body.code.startsWith("UPSTREAM_")) {
      setStage("unknown"); setMessage(t("unknownResult")); return;
    }
    if (response.status === 403) setDenied(true);
    const translated = translateApiError({ kind: "http", status: response.status, body }, "track", all);
    setMessage(translated.message); setServerFields({ ...translated.fieldErrors,
      bpmFrom: translated.fieldErrors["bpm.bpmFrom"] ?? [],
      bpmTo: [...(translated.fieldErrors["bpm.bpmTo"] ?? []), ...(translated.fieldErrors.bpm ?? [])],
    });
    setStage(response.status === 410 ? "expired" : response.status === 409 ? "unknown" : "failed");
  }

  async function chooseFile(file: File | undefined) {
    if (!file || busy.current || knownUpload.current) return;
    setMessage("");
    const invalid = validateUploadFile(file, config);
    if (invalid) { setMessage(t(invalid)); if (fileInput.current) fileInput.current.value = ""; return; }
    dirty.current = true; busy.current = true;
    const request = new AbortController(); controller.current = request;
    try {
      const result = await runProtected(async () => {
        if (request.signal.aborted) return;
        setStarted(true); setName(file.name); setProgress(0); setStage("uploading");
        const response = await uploadAudio(file, request.signal, setProgress);
        if (request.signal.aborted) return;
        if (response.status !== 201) { await failure(response); return; }
        const value = await response.json() as TemporaryUpload;
        if (typeof value.uploadId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.uploadId) || !Number.isFinite(Date.parse(value.expiresAt))) throw Error("Invalid upload response");
        const now = new Date();
        setPublicationDate(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
        knownUpload.current = value; setUpload(value); setProgress(100); setStage("ready");
      });
      if (!result.executed && !request.signal.aborted) { setStage("failed"); setMessage(t("sessionUnavailable")); }
    } catch {
      if (!request.signal.aborted && mounted.current) { setStage("unknown"); setMessage(t("unknownResult")); }
    } finally { if (controller.current === request) { controller.current = null; busy.current = false; } }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const current = knownUpload.current;
    if (!current || busy.current || denied || (stage !== "ready" && stage !== "failed")) return;
    const validation = validateDraft(draft);
    setErrors(validation); setServerFields({}); setMessage("");
    if (Object.keys(validation).length) {
      document.getElementById(`track-${Object.keys(validation)[0]}`)?.focus();
      return;
    }
    if (Date.now() >= Date.parse(current.expiresAt)) { setStage("expired"); setMessage(t("expired")); return; }
    busy.current = true; setStage("saving"); setMessage(""); setServerFields({});
    const request = new AbortController(); controller.current = request;
    try {
      const result = await runProtected(async () => {
        if (request.signal.aborted) return;
        const response = await fetch(`/api/tracks/uploads/${current.uploadId}/complete`, {
          method: "POST", headers: { "Content-Type": "application/json" }, signal: request.signal,
          body: JSON.stringify({ title: draft.title, publicationDate,
            ...(draft.description ? { description: draft.description } : {}),
            ...(draft.genre ? { genre: draft.genre } : {}),
            ...(draft.subgenre ? { subgenre: draft.subgenre } : {}),
            ...(draft.bpmFrom.trim() || draft.bpmTo.trim() ? { bpm: { bpmFrom: Number(draft.bpmFrom), bpmTo: Number(draft.bpmTo) } } : {}) }),
        });
        if (request.signal.aborted) return;
        if (response.status !== 201) { await failure(response); return; }
        const value = await response.json();
        if (!Number.isSafeInteger(value.id) || value.id <= 0) throw Error("Invalid completion response");
        dirty.current = false; knownUpload.current = undefined; setUpload(undefined);
        setDraft(emptyDraft); setPublicationDate(""); setErrors({}); setStarted(false); setName(""); setStage("success");
        if (fileInput.current) fileInput.current.value = "";
        router.refresh(); // Invalidate the visited Library RSC cache, preserving the runtime.
      });
      if (!result.executed && !request.signal.aborted) { setStage("failed"); setMessage(t("sessionUnavailable")); }
    } catch {
      if (!request.signal.aborted && mounted.current) { setStage("unknown"); setMessage(t("unknownResult")); }
    } finally { if (controller.current === request) { controller.current = null; busy.current = false; } }
  }

  async function reset() {
    if (stage === "saving" || stage === "cancelling") return;
    stop(); busy.current = true; setStage("cancelling");
    await cancelKnown();
    if (!mounted.current) return;
    busy.current = false;
    setUpload(undefined); setStage("idle"); setMessage(""); setName(""); setProgress(0); setServerFields({}); setCancelDialog(false);
    setDraft(emptyDraft); setPublicationDate(""); setErrors({}); setStarted(false); dirty.current = false;
    if (fileInput.current) fileInput.current.value = "";
  }

  const pending = stage === "uploading" || stage === "saving" || stage === "cancelling";
  const canSave = !!upload && (stage === "ready" || stage === "failed") && !denied;
  if (stage === "success") return <section className="max-w-2xl space-y-6" data-upload-success>
    <p role="status">{t("success")}</p>
    <div className="flex flex-wrap gap-4">
      <ProtectedLink href="/library" className="underline">{t("library")}</ProtectedLink>
      <a href="/upload" className="underline" onClick={event => {
        event.preventDefault();
        setProgress(0); setMessage(""); setServerFields({}); setStage("idle");
      }}>{t("addAnother")}</a>
    </div>
  </section>;
  return <>
    <form onSubmit={save} className="max-w-2xl space-y-6" data-upload-form noValidate aria-busy={pending}>
      <div className="space-y-2">
        <Label htmlFor="audio-file">{t("file")}</Label>
        <input ref={fileInput} id="audio-file" name="file" type="file" accept={config.formats.map(f => f.extension).join(",")}
          disabled={pending || !!upload || denied} aria-describedby="audio-help" className="block w-full rounded-lg border p-3"
          onChange={event => { void chooseFile(event.target.files?.[0]); }} />
        <p id="audio-help" className="text-sm text-muted-foreground">{t("fileHelp", { formats: config.formats.map(f => f.extension.toUpperCase()).join(", "), limit: config.maxFileBytes / (1024 * 1024) })}</p>
        {name && <p className="break-all">{name}</p>}
        {(stage === "uploading" || !!upload) && <div className="space-y-1">
          <div className="flex items-center gap-3">
            <progress aria-label={t("progress")} value={progress} max={100} className="h-2 w-full accent-primary" />
            <span className="text-sm tabular-nums">{progress}%</span>
          </div>
          {stage === "uploading" && progress === 100 && <p className="text-sm text-muted-foreground">{t("processing")}</p>}
        </div>}
        {name && <Button type="button" variant="outline" disabled={stage === "saving" || stage === "cancelling"}
          onClick={() => setCancelDialog(true)}>{t("chooseAnother")}</Button>}
      </div>
      {pending && <p role="status">{stage === "uploading" ? t("uploading") : stage === "cancelling" ? t("cancelling") : t("saving")}</p>}
      {stage === "ready" && <p role="status">{t("uploaded")}</p>}
      {message && <p role="alert" className="text-destructive">{message}</p>}
      {started && <fieldset className="space-y-4" disabled={stage === "saving"}>
        <legend className="mb-4 font-semibold">{t("metadata")}</legend>
        <div className="space-y-2"><Label htmlFor="track-publicationDate">{t("publicationDate")}</Label>
          <Input id="track-publicationDate" name="publicationDate" type="date" value={publicationDate} disabled /></div>
        {([["title", "description", "genre", "subgenre"], ["bpmFrom", "bpmTo"]] as const).map((group, index) =>
          <div key={index} className={index === 1 ? "grid grid-cols-2 gap-4" : "space-y-4"}>
          {group.map(key => {
          const fieldError = serverFields[key]?.length ? serverFields[key] : (errors[key] ? [t(errors[key])] : []);
          const props = { id: `track-${key}`, name: key, value: draft[key], required: key === "title", spellCheck: false, autoCorrect: "off",
            "aria-invalid": fieldError.length > 0, "aria-describedby": fieldError.length ? `${key}-error` : undefined,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              dirty.current = true; setDraft({ ...draft, [key]: event.target.value });
              setErrors(fields => ({ ...fields, [key]: undefined, ...(key.startsWith("bpm") ? { bpmFrom: undefined, bpmTo: undefined } : {}) }));
              setServerFields(fields => ({ ...fields, [key]: [], ...(key.startsWith("bpm") ? { bpmFrom: [], bpmTo: [] } : {}) }));
            } };
          return <div key={key} className="space-y-2">
            <Label htmlFor={props.id}>{t(key === "title" ? "fieldTitle" : key)}</Label>
            {key === "description" ? <textarea {...props} rows={4} className="w-full rounded-lg border bg-transparent p-3" /> :
              <Input {...props} type={key.startsWith("bpm") ? "number" : "text"}
                min={key.startsWith("bpm") ? 60 : undefined} max={key.startsWith("bpm") ? 200 : undefined} step="any" />}
            {fieldError.length > 0 && <p id={`${key}-error`} className="text-sm text-destructive">{fieldError.join(" ")}</p>}
          </div>;
        })}</div>)}
        <Button type="submit" disabled={!canSave || pending}>{t("save")}</Button>
      </fieldset>}
      <p><ProtectedLink href="/library" className="underline">{t("library")}</ProtectedLink></p>
    </form>
    <AlertDialog open={cancelDialog} onOpenChange={open => { if (stage !== "cancelling") setCancelDialog(open); }}>
      <AlertDialogContent aria-busy={stage === "cancelling"}>
        <AlertDialogHeader><AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cancelDescription")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={stage === "cancelling"}>{t("keepUpload")}</AlertDialogCancel>
          <AlertDialogAction disabled={stage === "cancelling"} onClick={() => { void reset(); }}>{t("confirmCancel")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={dialog} onOpenChange={open => { if (!open && !leaving) decide(false); }}>
      <AlertDialogContent initialFocus={stayButton} aria-busy={leaving}>
        <AlertDialogHeader><AlertDialogTitle>{t("leaveTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("leaveDescription")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel ref={stayButton} disabled={leaving} onClick={() => decide(false)}>{t("stay")}</AlertDialogCancel>
          <AlertDialogAction disabled={leaving} onClick={() => decide(true)}>{t("leave")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
