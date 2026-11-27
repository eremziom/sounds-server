import assert from "node:assert/strict";
import { test } from "node:test";
import { createCreatorSession } from "../src/components/artwork-creator/creator-session.ts";
import { createArtworkClient, ArtworkRequestError } from "../src/api/artworks.ts";

const snapshot = { schemaVersion: 1, brief: { intent: "A garden", guidelinesVersion: "1.7", guidelinesPath: "shared", composition: "layered", motionPlan: "flying", lightingPlan: "veins", blackoutPlan: "independent", qaPlan: "motion" }, layers: [], artifactIds: [], decisions: ["Keep my decision"] };
const revision = { id: "r1", snapshot, validation: { ready: true, staleArtifactIds: [] } };
const project = { id: "p1", title: "Garden", activeRevisionId: "r1", revision };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
function mock(overrides = {}) {
  return { projects: async () => [project], project: async id => ({ ...project, id }), history: async () => [{ id: "r1" }], artifacts: async () => [], messages: async () => [{ id: "m1", text: "Saved note" }], jobs: async () => [], ...overrides };
}

test("reopening recovers project, full history, notes and unfinished jobs without generating", async () => {
  const jobs = [{ id: "j1", state: "running" }];
  const session = createCreatorSession(mock({ jobs: async () => jobs }));
  await session.loadProjects(); await session.open("p1");
  assert.equal(session.getSnapshot().project.activeRevisionId, "r1");
  assert.equal(session.getSnapshot().messages[0].text, "Saved note");
  assert.deepEqual(session.getSnapshot().jobs, jobs);
  assert.equal(session.getSnapshot().busy, false);
  session.dispose();
});

test("a late project read cannot replace the newly selected project", async () => {
  const gate = deferred();
  const session = createCreatorSession(mock({ project: id => id === "old" ? gate.promise : Promise.resolve({ ...project, id }) }));
  const old = session.open("old");
  await session.open("new"); gate.resolve({ ...project, id: "old" }); await old;
  assert.equal(session.getSnapshot().project.id, "new");
  assert.equal(session.getSnapshot().busy, false);
});

test("unknown enqueue outcome reuses idempotency key and explicit saved brief", async () => {
  const requests = [];
  const session = createCreatorSession(mock({ enqueue: async (id, job) => {
    requests.push({ id, ...job });
    if (requests.length === 1) throw new Error("Response lost after enqueue");
    return { id: "job" };
  } }));
  await session.open("p1"); await session.generate(7); await session.generate(7);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].requestKey, requests[1].requestKey);
  assert.deepEqual(requests[1].arguments, { prompt: "A garden", seed: 7, width: 1024, height: 576 });
  assert.equal(requests[1].baseRevisionId, "r1");
  assert.deepEqual(requests[1].inputIds, []);
  assert.equal(session.getSnapshot().error, null);
});

test("conflicting saves preserve local project and surface error without retrying", async () => {
  let writes = 0;
  const error = new ArtworkRequestError(409, "ARTWORK_REVISION_CONFLICT");
  const session = createCreatorSession(mock({ save: async () => { writes++; throw error; } }));
  await session.open("p1"); await session.save({ ...snapshot, brief: { ...snapshot.brief, intent: "New intent" } });
  assert.equal(writes, 1);
  assert.equal(session.getSnapshot().error, error);
  assert.equal(session.getSnapshot().project.revision.snapshot.brief.intent, "A garden");
});

test("restore creates a revision through API and retains notes and artifacts", async () => {
  const calls = [], artifacts = [{ id: "image", kind: "image", inputs: [] }];
  const session = createCreatorSession(mock({ artifacts: async () => artifacts, restore: async (...args) => calls.push(args.slice(0, 3)) }));
  await session.open("p1"); await session.restore("r0");
  assert.deepEqual(calls, [["p1", "r1", "r0"]]);
  assert.equal(session.getSnapshot().messages[0].id, "m1");
  assert.deepEqual(session.getSnapshot().artifacts, artifacts);
});

test("image selection preserves other layers, adds inputs and detaches only the source masks", async () => {
  let saved;
  const layers = [{ id: "source", imageArtifactId: "old", maskArtifactIds: ["old-mask"], parameters: { old: true } }, { id: "drone", imageArtifactId: "drone", maskArtifactIds: [], parameters: { travel: "keep" } }];
  const artifacts = [{ id: "new", kind: "image", inputs: [{ inputId: "ref" }] }, { id: "ref", kind: "image", inputs: [] }];
  const session = createCreatorSession(mock({ project: async () => ({ ...project, revision: { ...revision, snapshot: { ...snapshot, layers, artifactIds: ["old", "old-mask", "drone"] } } }),
    artifacts: async () => artifacts, save: async (id, base, value) => { saved = value; assert.equal(base, "r1"); } }));
  await session.open("p1"); await session.applyImage("new");
  assert.equal(saved.layers[0].imageArtifactId, "new");
  assert.deepEqual(saved.layers[0].maskArtifactIds, []);
  assert.deepEqual(saved.layers[1], layers[1]);
  assert.deepEqual(saved.artifactIds, ["old", "old-mask", "drone", "new", "ref"]);
  assert.deepEqual(saved.decisions, snapshot.decisions);
});

test("cancellation waits for server confirmation and rejects duplicate clicks", async () => {
  const gate = deferred(), jobs = [{ id: "j1", state: "running", cancelRequested: false }]; let calls = 0;
  const session = createCreatorSession(mock({ jobs: async () => jobs, cancel: async () => { calls++; await gate.promise; jobs[0] = { ...jobs[0], cancelRequested: true }; } }));
  await session.open("p1"); const cancelling = session.job("j1", "cancel"); await session.job("j1", "cancel");
  assert.equal(calls, 1); assert.equal(session.getSnapshot().jobs[0].state, "running");
  gate.resolve(); await cancelling;
  assert.equal(session.getSnapshot().jobs[0].cancelRequested, true);
  assert.equal(session.getSnapshot().jobs[0].state, "running");
});

test("poll dispatched before mutation cannot overwrite new job state", async () => {
  const gate = deferred(); let polling = false;
  const session = createCreatorSession(mock({ jobs: async () => polling ? gate.promise : [{ id: "new" }], cancel: async () => { polling = false; } }));
  await session.open("p1"); polling = true;
  const pending = session.poll(); await session.job("j", "cancel");
  gate.resolve([{ id: "old" }]); await pending;
  assert.equal(session.getSnapshot().jobs[0].id, "new");
});

test("suspending reads can restart, while disposal is terminal", async () => {
  const session = createCreatorSession(mock());
  await session.open("p1"); session.cancelReads(); await session.open("p2");
  assert.equal(session.getSnapshot().project.id, "p2");
  session.dispose(); await session.open("p3");
  assert.equal(session.getSnapshot().project.id, "p2");
});

test("API client follows >100 revision pages and does not put credentials in browser headers", async () => {
  const calls = [];
  const api = createArtworkClient(async (url, init) => {
    calls.push([url, init]);
    return Response.json(calls.length === 1 ? Array.from({ length: 100 }, (_, i) => ({ id: `r${i}` })) : [{ id: "r100" }]);
  });
  assert.equal((await api.history("p")).length, 101);
  assert.equal(calls[1][0], "/api/artworks/projects/p/revisions?cursor=r99");
  assert.equal(calls[0][1].credentials, "same-origin");
  assert.equal(calls[0][1].headers, undefined);
});

test("preview builds only a complete saved revision and retries with the same deterministic key", async () => {
  const calls = [];
  let complete = false;
  const session = createCreatorSession(mock({
    project: async () => ({ ...project, revision: { ...revision, snapshot: { ...snapshot, layers: complete ? [{ id: "source" }] : [] } } }),
    enqueue: async (id, job) => calls.push(job),
  }));
  await session.open("p1"); await session.buildPreview(); assert.deepEqual(calls, []);
  complete = true; await session.refresh(); await session.buildPreview(); await session.buildPreview();
  assert.equal(calls.length, 2); assert.equal(calls[0].tool, "buildPreviewPackage");
  assert.equal(calls[0].baseRevisionId, "r1"); assert.equal(calls[0].requestKey, calls[1].requestKey);
  assert.deepEqual(calls[0].arguments, {}); assert.deepEqual(calls[0].inputIds, []);
});

test("production tool retries an uncertain enqueue with the same key, but a different input starts a new operation", async () => {
  const requests = [];
  const session = createCreatorSession(mock({ enqueue: async (id, job) => {
    requests.push({ id, ...job });
    if (requests.length === 1) throw new Error("Lost response");
  } }));
  await session.open("p1");
  await session.runTool("extractLayer", {}, ["image", "mask"]);
  await session.runTool("extractLayer", {}, ["image", "mask"]);
  await session.runTool("extractLayer", {}, ["image", "new-mask"]);
  assert.equal(requests[0].requestKey, requests[1].requestKey);
  assert.notEqual(requests[1].requestKey, requests[2].requestKey);
  assert.equal(requests[1].baseRevisionId, "r1");
  assert.deepEqual(requests[2].inputIds, ["image", "new-mask"]);
  assert.equal(session.getSnapshot().error, null);
});

test("keeping a tool result saves its input closure without applying a new image or losing authored layers", async () => {
  let saved;
  const source = { id: "source", kind: "image", inputs: [] };
  const mask = { id: "mask", kind: "visibility-mask", inputs: [{ inputId: "source" }] };
  const session = createCreatorSession(mock({ artifacts: async () => [source, mask], save: async (id, base, next) => { saved = { id, base, next }; } }));
  await session.open("p1"); await session.keepResult("mask");
  assert.equal(saved.base, "r1");
  assert.deepEqual(saved.next.artifactIds, ["source", "mask"]);
  assert.deepEqual(saved.next.layers, snapshot.layers);
  assert.deepEqual(saved.next.decisions, snapshot.decisions);
});
