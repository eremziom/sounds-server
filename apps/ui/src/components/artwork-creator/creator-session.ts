import { createArtworkClient, type Artifact, type Message, type Project, type Revision, type RevisionSummary } from "../../api/artworks.ts";
import type { ArtworkJobRecord, ArtworkRevisionSnapshot } from "../../../../artwork-contracts/index.d.ts";

export interface CreatorState {
  projects: Project[]; project: Project | null; history: RevisionSummary[];
  artifacts: Artifact[]; messages: Message[]; jobs: ArtworkJobRecord[];
  comparison: Revision | null; busy: boolean; error: unknown;
}
const INITIAL: CreatorState = { projects: [], project: null, history: [], artifacts: [], messages: [], jobs: [], comparison: null, busy: false, error: null };

/** No media/renderer dependency. Late reads and writes cannot change the next project. */
export function createCreatorSession(api = createArtworkClient()) {
  let state = INITIAL, lifetime = new AbortController(), generation = 0, disposed = false;
  let pendingGeneration: { signature: string; requestKey: string } | null = null;
  const listeners = new Set<() => void>();
  function publish(change: Partial<CreatorState>) {
    if (disposed) return;
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }
  async function read(id: string, signal: AbortSignal) {
    const [project, history, artifacts, messages, jobs] = await Promise.all([
      api.project(id, signal), api.history(id, signal), api.artifacts(id, signal), api.messages(id, signal), api.jobs(id, signal),
    ]);
    return { project, history, artifacts, messages, jobs };
  }
  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    if (disposed || state.busy) return;
    const ticket = ++generation, signal = lifetime.signal;
    publish({ busy: true, error: null });
    try { await action(signal); }
    catch (error) { if (ticket === generation && !signal.aborted) publish({ error }); }
    finally { if (ticket === generation) publish({ busy: false }); }
  }
  async function update(id: string, signal: AbortSignal) {
    const data = await read(id, signal);
    if (state.project?.id === id && !signal.aborted) publish(data);
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    cancelReads() { lifetime.abort(); lifetime = new AbortController(); generation++; publish({ busy: false }); },
    getSnapshot: () => state,
    getServerSnapshot: () => INITIAL,
    loadProjects() { return perform(async signal => { const projects = await api.projects(signal); if (!signal.aborted) publish({ projects }); }); },
    async open(id: string) {
      if (disposed) return;
      lifetime.abort(); lifetime = new AbortController(); generation++;
      pendingGeneration = null;
      publish({ ...INITIAL, projects: state.projects });
      await perform(async signal => { const data = await read(id, signal); if (!signal.aborted) publish(data); });
    },
    create(title: string) {
      return perform(async signal => {
        const project = await api.create(title.trim(), signal);
        const data = await read(project.id, signal);
        if (!signal.aborted) publish({ ...data, comparison: null, projects: [project, ...state.projects] });
      });
    },
    refresh() { const id = state.project?.id; return perform(async signal => { if (id) await update(id, signal); }); },
    poll() {
      const id = state.project?.id;
      if (!id || state.busy || disposed) return Promise.resolve();
      const signal = lifetime.signal, ticket = generation;
      return Promise.all([api.jobs(id, signal), api.artifacts(id, signal)]).then(([jobs, artifacts]) => {
        if (ticket === generation && !signal.aborted && state.project?.id === id && !state.busy) publish({ jobs, artifacts });
      }).catch(error => { if (ticket === generation && !signal.aborted && state.project?.id === id) publish({ error }); });
    },
    save(snapshot: ArtworkRevisionSnapshot) {
      const project = state.project;
      return perform(async signal => {
        if (!project) return;
        await api.save(project.id, project.activeRevisionId, snapshot, signal);
        await update(project.id, signal);
      });
    },
    generate(seed: number) {
      const project = state.project, revision = project?.revision;
      return perform(async signal => {
        if (!project || !revision) return;
        const args = { prompt: revision.snapshot.brief.intent, seed, width: 1024, height: 576 };
        const signature = JSON.stringify([project.id, revision.id, args]);
        if (pendingGeneration?.signature !== signature) pendingGeneration = { signature, requestKey: crypto.randomUUID() };
        await api.enqueue(project.id, { baseRevisionId: revision.id, requestKey: pendingGeneration.requestKey,
          tool: "generateImage", arguments: args, inputIds: [] }, signal);
        if (signal.aborted) return;
        pendingGeneration = null;
        await update(project.id, signal);
      });
    },
    job(id: string, operation: "cancel" | "retry") {
      const project = state.project;
      return perform(async signal => { if (project) { await api[operation](project.id, id, signal); await update(project.id, signal); } });
    },
    upload(file: File) {
      const project = state.project;
      return perform(async signal => { if (project) { await api.upload(project.id, file, signal); await update(project.id, signal); } });
    },
    message(text: string) {
      const project = state.project;
      return perform(async signal => { if (project) { await api.message(project.id, text.trim(), signal); await update(project.id, signal); } });
    },
    compare(id: string) {
      const project = state.project;
      return perform(async signal => { if (project) { const comparison = await api.revision(project.id, id, signal); if (!signal.aborted) publish({ comparison }); } });
    },
    restore(id: string) {
      const project = state.project;
      return perform(async signal => {
        if (!project?.activeRevisionId) return;
        await api.restore(project.id, project.activeRevisionId, id, signal);
        await update(project.id, signal);
      });
    },
    applyImage(id: string) {
      const project = state.project;
      return perform(async signal => {
        if (!project?.revision) return;
        const artifact = state.artifacts.find(item => item.id === id);
        if (!artifact || artifact.kind !== "image") throw new Error("Invalid variant");
        const snapshot = project.revision.snapshot;
        const selected = new Set(snapshot.artifactIds);
        function include(artifactId: string) {
          if (selected.has(artifactId)) return;
          selected.add(artifactId);
          const node = state.artifacts.find(item => item.id === artifactId);
          if (!node) throw new Error("Missing artifact input");
          node.inputs.forEach(input => include(input.inputId));
        }
        include(id);
        const layer = { id: "source", imageArtifactId: id, maskArtifactIds: [], parameters: {} };
        const layers = snapshot.layers.some(item => item.id === "source")
          ? snapshot.layers.map(item => item.id === "source" ? layer : item) : [...snapshot.layers, layer];
        await api.save(project.id, project.activeRevisionId, { ...snapshot, layers, artifactIds: [...selected] }, signal);
        await update(project.id, signal);
      });
    },
    dispose() { disposed = true; lifetime.abort(); generation++; listeners.clear(); },
  };
}
