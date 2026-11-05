import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseArtworkPackage, loadArtwork, createArtworkInstance, coversViewport, getCoverView } from "../src/engines/infinite-zoom/artwork/index.ts";

const source = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/foundation/manifest.json", import.meta.url), "utf8"));
const manifest = () => structuredClone(source);

test("manifest is a detached immutable package with stable layer ordering", () => {
  const input = manifest();
  input.layers[1].zIndex = 0;
  const parsed = parseArtworkPackage(input);
  input.assets[0].uri = "other";
  assert.deepEqual(parsed.layers.map(layer => layer.id), ["backdrop", "foreground"]);
  assert.equal(parsed.assets[0].uri, source.assets[0].uri);
  for (const value of [parsed, parsed.canvas, parsed.assets, parsed.assets[0], parsed.layers, parsed.layers[0], parsed.coverage]) {
    assert.ok(Object.isFrozen(value));
  }
});

test("manifest rejects invalid references, unsupported fields, unsafe URIs and invalid coverage", () => {
  const mutations = [
    value => { value.schemaVersion = 2; },
    value => { value.canvas.width = 1920; },
    value => { value.assets[0].height = 1080; },
    value => { value.assets[1].id = value.assets[0].id; },
    value => { value.layers[1].id = value.layers[0].id; },
    value => { value.layers[0].imageAssetId = "absent"; },
    value => { value.assets[0].critical = false; },
    value => { value.assets[0].kind = "mask"; },
    value => { value.layers[1].maskAssetId = "backdrop"; },
    value => { value.layers[0].zIndex = 0.5; },
    value => { value.coverage.baseLayerId = "foreground"; },
    value => { value.layers[0].behaviors = [{ kind: "wave" }]; },
    value => { value.assets[0].kind = "flow"; },
    value => { value.layers = []; },
  ];
  for (const mutation of mutations) { const input = manifest(); mutation(input); assert.throws(() => parseArtworkPackage(input)); }
  for (const uri of ["https://example.com/a.png", "//example.com/a.png", "/infinite-zoom/../a.png", "/infinite-zoom/%2e%2e/a.png", "/infinite-zoom/a.png?x=1"]) {
    const input = manifest(); input.assets[0].uri = uri;
    assert.throws(() => parseArtworkPackage(input), /URI/);
  }
});

function bitmap(overrides = {}) {
  let closes = 0;
  return { width: 3840, height: 2160, image: {}, opaque: true,
    close() { closes++; }, get closes() { return closes; }, ...overrides };
}

test("loader waits for critical assets, skips optional detail and owns each decode until disposal", async () => {
  const input = manifest();
  input.assets.push({ ...input.assets[0], id: "optional", critical: false });
  const images = [], ids = [];
  const loaded = await loadArtwork(input, new AbortController().signal, async asset => {
    ids.push(asset.id); const image = bitmap(); images.push(image); return image;
  });
  assert.deepEqual(ids, ["backdrop", "foreground"]);
  assert.equal(loaded.getAsset("backdrop"), images[0]);
  assert.throws(() => loaded.getAsset("optional"), /not loaded/);
  loaded.dispose(); loaded.dispose();
  assert.deepEqual(images.map(image => image.closes), [1, 1]);
  assert.throws(() => loaded.getAsset("backdrop"), /disposed/);
});

test("decode failure, wrong dimensions and nonopaque base reject readiness and release all acquired images", async () => {
  for (const mode of ["decode", "dimensions", "alpha"]) {
    const images = [];
    await assert.rejects(loadArtwork(manifest(), new AbortController().signal, async asset => {
      if (mode === "decode" && asset.id === "foreground") throw new Error("load failed");
      const image = bitmap({ ...(mode === "dimensions" ? { width: 10 } : {}), opaque: mode !== "alpha" });
      images.push(image); return image;
    }));
    assert.ok(images.length > 0);
    assert.ok(images.every(image => image.closes === 1));
  }
});

test("abort during decode closes late image and does not acquire another", async () => {
  const operation = new AbortController();
  const image = bitmap();
  let calls = 0;
  await assert.rejects(loadArtwork(manifest(), operation.signal, async () => {
    calls++; operation.abort(); return image;
  }), { name: "AbortError" });
  assert.equal(calls, 1);
  assert.equal(image.closes, 1);
  await assert.rejects(loadArtwork(manifest(), operation.signal, async () => { calls++; return bitmap(); }));
  assert.equal(calls, 1);
});

test("cleanup continues after an individual bitmap close fails", async () => {
  const second = bitmap();
  const loaded = await loadArtwork(manifest(), new AbortController().signal, async asset =>
    asset.id === "backdrop" ? bitmap({ close() { throw new Error("broken close"); } }) : second);
  loaded.dispose();
  assert.equal(second.closes, 1);
});

test("instances and layers have independent transforms, immutable snapshots and explicit reset", () => {
  const parsed = parseArtworkPackage(manifest());
  const a = createArtworkInstance("a", parsed), b = createArtworkInstance("b", parsed);
  a.setLayerTransform("foreground", { x: 120, rotation: 0.2, opacity: 0.7 });
  assert.equal(a.getSnapshot().layers[0].x, 0);
  assert.equal(a.getSnapshot().layers[1].x, 120);
  assert.equal(b.getSnapshot().layers[1].x, 0);
  const snapshot = a.getSnapshot();
  assert.throws(() => { snapshot.layers[1].x = 0; }, TypeError);
  for (const patch of [{ x: NaN }, { scale: 0 }, { opacity: 2 }, { rotation: Infinity }, { unknown: 1 }]) {
    assert.throws(() => a.setLayerTransform("foreground", patch));
  }
  assert.throws(() => a.setLayerTransform("backdrop", { opacity: 0.5 }), /opaque/);
  assert.throws(() => a.setLayerTransform("absent", { x: 1 }));
  a.reset();
  assert.equal(a.getSnapshot().layers[1].x, 0);
  assert.equal(snapshot.layers[1].x, 120, "old snapshot remains unchanged");
});

test("initial cover projection and inverse bounds preserve geometric coverage", () => {
  const transform = { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
  for (const [width, height] of [[1920, 1080], [800, 1200], [2400, 500]]) {
    const view = getCoverView(width, height);
    assert.ok(view.width <= 3840 && view.height <= 2160);
    assert.ok(coversViewport(transform, view));
  }
  const view = getCoverView(1920, 1080);
  assert.equal(coversViewport({ ...transform, x: 1 }, view), false);
  assert.equal(coversViewport({ ...transform, rotation: Math.PI / 4 }, view), false);
  assert.equal(coversViewport({ ...transform, x: 40, scale: 1.1 }, view), true);
  assert.throws(() => getCoverView(0, 1));
});
