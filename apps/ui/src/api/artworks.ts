import type { ArtworkJobRecord, ArtworkJobRequest, ArtworkRevisionSnapshot, ArtworkRevisionValidation } from "../../../artwork-contracts/index.d.ts";

export interface Revision {
  id: string; parentId: string | null; restoredFromId: string | null; createdAt: string;
  snapshot: ArtworkRevisionSnapshot; validation: ArtworkRevisionValidation;
}
export type RevisionSummary = Pick<Revision, "id" | "parentId" | "restoredFromId" | "createdAt">;
export interface Project { id: string; title: string; activeRevisionId: string | null; revision: Revision | null }
export interface Artifact {
  id: string; kind: string; mimeType: string; width: number | null; height: number | null;
  registrationId: string | null; inputs: { inputId: string }[]; createdAt: string;
}
export interface Message { id: string; text: string; role: string; createdAt: string }
export class ArtworkRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}
export const artifactUrl = (projectId: string, artifactId: string) => `/api/artworks/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/file`;

export function createArtworkClient(request: typeof fetch = fetch) {
  async function call<T>(path: string, signal?: AbortSignal, body?: object | FormData): Promise<T> {
    const form = body instanceof FormData;
    const response = await request(`/api/artworks/projects${path}`, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", signal,
      ...(body ? { body: form ? body : JSON.stringify(body), headers: form ? {} : { "Content-Type": "application/json" } } : {}),
    });
    if (!response.ok) {
      let code = "ARTWORK_REQUEST_FAILED";
      try { code = (await response.json()).code ?? code; } catch {}
      throw new ArtworkRequestError(response.status, code);
    }
    return response.json() as Promise<T>;
  }
  // All paginated histories are recovered, including projects with >100 operations.
  async function pages<T extends { id: string }>(path: string, signal?: AbortSignal): Promise<T[]> {
    const results: T[] = [], seen = new Set<string>();
    let cursor = "";
    while (true) {
      const page = await call<T[]>(`${path}${cursor ? `?cursor=${cursor}` : ""}`, signal);
      if (!Array.isArray(page)) throw new ArtworkRequestError(502, "UPSTREAM_INVALID_RESPONSE");
      for (const item of page) if (!seen.has(item.id)) { seen.add(item.id); results.push(item); }
      if (page.length < 100) return results;
      const next = page.at(-1)!.id;
      if (next === cursor) throw new ArtworkRequestError(502, "UPSTREAM_INVALID_RESPONSE");
      cursor = next;
    }
  }
  return {
    projects: (signal?: AbortSignal) => pages<Project>("", signal),
    create: (title: string, signal?: AbortSignal) => call<Project>("", signal, { title }),
    starter: (signal?: AbortSignal) => call<Project>("/starter/night-garden", signal, {}),
    project: (id: string, signal?: AbortSignal) => call<Project>(`/${id}`, signal),
    history: (id: string, signal?: AbortSignal) => pages<RevisionSummary>(`/${id}/revisions`, signal),
    revision: (id: string, revisionId: string, signal?: AbortSignal) => call<Revision>(`/${id}/revisions/${revisionId}`, signal),
    artifacts: (id: string, signal?: AbortSignal) => call<Artifact[]>(`/${id}/artifacts`, signal),
    previewPackage: (id: string, artifactId: string, signal?: AbortSignal) => call<unknown>(`/${id}/artifacts/${artifactId}/file`, signal),
    messages: (id: string, signal?: AbortSignal) => pages<Message>(`/${id}/messages`, signal),
    message: (id: string, text: string, signal?: AbortSignal) => call<Message>(`/${id}/messages`, signal, { text }),
    jobs: (id: string, signal?: AbortSignal) => pages<ArtworkJobRecord>(`/${id}/jobs`, signal),
    enqueue: (id: string, job: ArtworkJobRequest, signal?: AbortSignal) => call<ArtworkJobRecord>(`/${id}/jobs`, signal, job),
    cancel: (id: string, jobId: string, signal?: AbortSignal) => call<ArtworkJobRecord>(`/${id}/jobs/${jobId}/cancel`, signal, {}),
    retry: (id: string, jobId: string, signal?: AbortSignal) => call<ArtworkJobRecord>(`/${id}/jobs/${jobId}/retry`, signal, {}),
    save: (id: string, baseRevisionId: string | null, snapshot: ArtworkRevisionSnapshot, signal?: AbortSignal) =>
      call<Revision>(`/${id}/revisions`, signal, { baseRevisionId, snapshot }),
    restore: (id: string, baseRevisionId: string, revisionId: string, signal?: AbortSignal) =>
      call<Revision>(`/${id}/restore`, signal, { baseRevisionId, revisionId }),
    upload: (id: string, file: File, signal?: AbortSignal) => {
      const form = new FormData();
      form.set("metadata", JSON.stringify({ kind: "image", inputIds: [], registrationId: crypto.randomUUID(), provenance: { source: "creator-reference", filename: file.name } }));
      form.set("file", file);
      return call<Artifact>(`/${id}/artifacts`, signal, form);
    },
  };
}
