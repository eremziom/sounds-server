import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { prepareDraftManifest, previewReportId } from "../src/components/artwork-creator/preview-package.ts";
import { createDraftPreview } from "../src/components/infinite-zoom/draft-preview.ts";

function fixture() {
  const projectId = randomUUID(), imageId = randomUUID(), reportId = randomUUID(), revisionId = randomUUID(), jobId = randomUUID();
  const snapshot = { schemaVersion: 1, brief: { intent: "fixture" }, layers: [{ id: "source", imageArtifactId: imageId, maskArtifactIds: [], parameters: {} }], artifactIds: [imageId], decisions: [] };
  const revision = { id: revisionId, snapshot, validation: { ready: true, staleArtifactIds: [] } };
  const job = { id: jobId, projectId, baseRevisionId: revisionId, tool: "buildPreviewPackage", state: "succeeded", result: { baseRevisionId: revisionId, outputs: [{ name: "package", artifactId: reportId }] } };
  const artifacts = [{ id: imageId, kind: "image", mimeType: "image/png", width: 16, height: 9 }, { id: reportId, kind: "report", mimeType: "application/json" }];
  const uri = `/infinite-zoom/jobs/${jobId}/${imageId}.png`;
  const envelope = { published: false, visualAcceptance: false, snapshotCandidate: structuredClone(snapshot),
    manifest: { schemaVersion: 2, id: `project-${projectId}`, version: `job-${jobId}`, canvas: { width: 3840, height: 2160 },
      assets: [{ id: imageId, kind: "image", uri, width: 16, height: 9, critical: true }], layers: [{ id: "source", zIndex: 0, imageAssetId: imageId }], coverage: { baseLayerId: "source" }, anchors: [] },
    assetBindings: [{ artifactId: imageId, uri }] };
  return { projectId, imageId, reportId, revision, job, artifacts, envelope };
}
const parse = value => prepareDraftManifest(value.envelope, value.projectId, value.revision, value.job, value.artifacts);

test("validated job package maps only immutable selected PNGs to private engine-compatible URI", () => {
  const f = fixture(), result = parse(f);
  assert.equal(result.assets[0].uri, `/infinite-zoom/drafts/${f.projectId}/${f.imageId}.png`);
  assert.equal(f.envelope.manifest.assets[0].uri, `/infinite-zoom/jobs/${f.job.id}/${f.imageId}.png`);
  assert.ok(Object.isFrozen(result));
  assert.equal(result.canvas.width, 3840);
  assert.equal(result.assets[0].width, 16, "Preserve actual source dimensions");
});

test("only succeeded package job for this exact revision can open preview", () => {
  for (const change of [j => j.state = "running", j => j.tool = "setBehaviors", j => j.baseRevisionId = randomUUID(), j => j.result.baseRevisionId = randomUUID(), j => j.result.outputs = []]) {
    const f = fixture(); change(f.job);
    assert.equal(previewReportId(f.job, f.revision), null);
    assert.throws(() => parse(f));
  }
});

test("foreign identity, stale dependencies, mismatched report and different snapshot are rejected", () => {
  const mutations = [f => f.job.projectId = randomUUID(), f => f.revision.validation.ready = false,
    f => f.artifacts[1].kind = "image", f => f.envelope.snapshotCandidate.decisions.push("Unaccepted change"),
    f => f.envelope.manifest.id = "other-project", f => f.envelope.manifest.version = "other-job",
    f => f.envelope.published = true, f => f.envelope.visualAcceptance = true];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => parse(f)); }
});

test("URI bindings cannot redirect to another job, arbitrary local assets, remote URLs or another artifact", () => {
  for (const uri of ["https://example.test/a.png", "/infinite-zoom/samples/forest/backdrop.png", `/infinite-zoom/jobs/${randomUUID()}/${randomUUID()}.png`]) {
    const f = fixture(); f.envelope.manifest.assets[0].uri = uri; f.envelope.assetBindings[0].uri = uri;
    assert.throws(() => parse(f));
  }
  for (const mutate of [f => f.envelope.assetBindings[0].artifactId = randomUUID(), f => f.envelope.assetBindings.push(f.envelope.assetBindings[0]),
    f => f.revision.snapshot.artifactIds = [], f => f.artifacts[0].width = 32, f => f.artifacts[0].kind = "material-mask",
    f => f.artifacts[0].mimeType = "text/html"]) {
    const f = fixture(); mutate(f); assert.throws(() => parse(f));
  }
});

test("snapshot comparison ignores JSON object key order but preserves authored array order", () => {
  const f = fixture();
  f.envelope.snapshotCandidate = Object.fromEntries(Object.entries(f.envelope.snapshotCandidate).reverse());
  assert.ok(parse(f));
  f.revision.snapshot.decisions = ["first", "second"];
  f.envelope.snapshotCandidate.decisions = ["second", "first"];
  assert.throws(() => parse(f));
});

const gate = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function ports(overrides = {}) {
  let scene = "journey"; const calls = [];
  const value = { prepare: async () => {}, getScene: () => scene, select: async (next, manifest, signal) => {
    signal?.throwIfAborted(); calls.push([next, manifest]); scene = next;
  }, ...overrides };
  return { value, calls };
}

test("draft replacement retains original catalogue return target", async () => {
  let scene = "digital";
  const p = ports({ getScene: () => scene, select: async next => { p.calls.push(next); scene = next; } });
  const preview = createDraftPreview(p.value);
  await preview.start({ id: "v1" }, new AbortController().signal);
  await preview.start({ id: "v2" }, new AbortController().signal);
  await preview.end();
  assert.deepEqual(p.calls, ["draft", "draft", "digital"]);
  assert.equal(preview.isActive(), false);
});

test("leaving while critical decode is pending aborts entry before restoring, without late draft", async () => {
  const entered = gate();
  const p = ports({ select: async (next, manifest, signal) => {
    entered.resolve();
    await new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
  } });
  const preview = createDraftPreview(p.value);
  const start = preview.start({}, new AbortController().signal);
  const rejected = assert.rejects(start);
  await entered.promise; await preview.end(); await rejected;
  assert.equal(p.value.getScene(), "journey");
  assert.equal(preview.isActive(), false);
});

test("queued entry superseded by route cleanup is never prepared or shown", async () => {
  let prepared = 0;
  const p = ports({ prepare: async () => prepared++ }), preview = createDraftPreview(p.value);
  const start = preview.start({}, new AbortController().signal), rejected = assert.rejects(start);
  await preview.end(); await rejected;
  assert.equal(prepared, 0); assert.deepEqual(p.calls, []);
});

test("failed replacement keeps previous draft and a failed return can be retried", async () => {
  let scene = "journey", fail = "";
  const p = ports({ getScene: () => scene, select: async (next, manifest) => {
    if (fail) throw Error(fail);
    scene = next;
  } });
  const preview = createDraftPreview(p.value);
  await preview.start({}, new AbortController().signal);
  fail = "decode failure"; await assert.rejects(preview.start({}, new AbortController().signal));
  assert.equal(scene, "draft");
  fail = "GPU return failure"; await assert.rejects(preview.end());
  assert.equal(preview.isActive(), true);
  fail = ""; await preview.end(); assert.equal(scene, "journey");
});

test("disposed preview rejects entry and does not revive renderer on cleanup", async () => {
  const p = ports(), preview = createDraftPreview(p.value);
  preview.dispose(); await assert.rejects(preview.start({}, new AbortController().signal)); await preview.end();
  assert.deepEqual(p.calls, []);
});
