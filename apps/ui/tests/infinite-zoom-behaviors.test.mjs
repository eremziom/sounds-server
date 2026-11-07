import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseBehaviors, resolveBehaviors, validateComposition, createBehaviorEvaluator, behaviorGroups } from "../src/engines/infinite-zoom/behaviors/index.ts";
import { parseArtworkPackage, createArtworkInstance } from "../src/engines/infinite-zoom/artwork/index.ts";
import { createInfiniteZoomController } from "../src/engines/infinite-zoom/index.ts";
import { createCameraController } from "../src/engines/infinite-zoom/camera/index.ts";

const source = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/foundation/manifest.json", import.meta.url), "utf8"));
const translate = (id, x = 30, order = 0) => ({ id, kind: "translate", order, params: { x, y: 0, frequencyHz: 1, phase: 0 } });
const wave = (id = "wave") => ({ id, kind: "wave", order: 1, params: { amplitude: 10, wavelength: 600, axis: "x", frequencyHz: 0.5, phase: 0 } });
const pulse = (id = "pulse") => ({ id, kind: "pulse", order: 2, params: { amount: 0.25, frequencyHz: 1, phase: 0 } });

test("behavior definitions validate strongly typed parameters and reject unknown or ambiguous data", () => {
  const input = [translate("move"), wave(), pulse()];
  const parsed = parseBehaviors(input);
  input[0].params.x = 999;
  assert.equal(parsed[0].params.x, 30);
  assert.ok(Object.isFrozen(parsed[0].params));
  for (const invalid of [
    [{ ...translate("a"), kind: "glow" }], [translate("a"), translate("a")],
    [{ ...wave(), params: { ...wave().params, axis: "z" } }],
    [{ ...pulse(), params: { ...pulse().params, amount: 2 } }],
    [{ ...translate("a"), params: { ...translate("a").params, frequencyHz: NaN } }],
    [{ ...translate("a"), params: { ...translate("a").params, unknown: 1 } }],
  ]) assert.throws(() => parseBehaviors(invalid));
});

test("inheritance overrides stable IDs and resolves explicit order then lexical IDs", () => {
  const artwork = parseBehaviors([translate("b", 10), translate("a", 20)]);
  const layer = parseBehaviors([translate("b", 30)]);
  const region = parseBehaviors([translate("a", 40)]);
  const resolved = resolveBehaviors(artwork, layer, region);
  assert.deepEqual(resolved.map(value => [value.id, value.params.x]), [["a", 40], ["b", 30]]);
  const groups = behaviorGroups(artwork, { behaviors: layer, regions: [{ id: "tip", influenceMaskAssetId: "mask", behaviors: region }] });
  assert.equal(groups[0].behaviors[0].params.x, 20);
  assert.equal(groups[1].behaviors[0].params.x, 40);
  assert.equal(groups[1].behaviors[1].params.x, 30);
});

test("glow sharpness makes short glints while preserving legacy peaks and hard intensity bounds",()=>{
  const descriptor=sharpness=>({id:"glint",kind:"glow",order:0,params:{frequencyHz:1,phase:0,amount:1,threshold:.1,...(sharpness===undefined?{}:{sharpness})}});
  const evaluator=sharpness=>createBehaviorEvaluator([{id:"layer",behaviors:parseBehaviors([descriptor(sharpness)])}]);
  const legacy=evaluator(),explicit=evaluator(1),glint=evaluator(6);
  assert.equal(legacy.getSnapshot()[0].effects[0].amount,.5);
  assert.equal(glint.getSnapshot()[0].effects[0].amount,.5**6);
  for(let i=0;i<15;i++){legacy.step(1/60);explicit.step(1/60);glint.step(1/60);}
  assert.deepEqual(legacy.getSnapshot(),explicit.getSnapshot());
  assert.equal(glint.getSnapshot()[0].effects[0].amount,1);
  validateComposition(parseBehaviors([descriptor(16)]));
  for(const sharpness of [0,17,NaN,Infinity])assert.throws(()=>parseBehaviors([descriptor(sharpness)]));
});

test("colored specular emission validates immutable color and includes intensity in the hard budget",()=>{
  const input={id:"specular",kind:"glow",order:0,params:{frequencyHz:1,phase:Math.PI/2,amount:1,threshold:.015,intensity:3,color:[1,.92,.72]}};
  const parsed=parseBehaviors([input]);input.params.color[0]=0;
  assert.equal(parsed[0].params.color[0],1);assert.ok(Object.isFrozen(parsed[0].params.color));validateComposition(parsed);
  assert.throws(()=>validateComposition(parseBehaviors([{...input,params:{...input.params,intensity:3}},pulse()])));
  const evaluator=createBehaviorEvaluator([{id:"layer",behaviors:parsed}]);
  assert.equal(evaluator.getSnapshot()[0].effects[0].amount,3);assert.deepEqual(evaluator.getSnapshot()[0].effects[0].color,[1,.92,.72]);
  for(const params of [{intensity:3.1},{intensity:0},{color:[1,1]},{color:[1,1,1,1]},{color:[1,NaN,1]},{color:[1,1,2]}]){
    assert.throws(()=>parseBehaviors([{...input,params:{...input.params,...params}}]));
  }
});

test("hard constraints apply to the composed displacement, wave slope and pulse gain", () => {
  validateComposition(parseBehaviors([translate("a"), wave(), pulse()]));
  assert.throws(() => validateComposition(parseBehaviors([translate("a", 300), translate("b", 300)])), /Composed/);
  assert.throws(() => validateComposition(parseBehaviors([{ ...wave(), params: { ...wave().params, wavelength: 16 } }])), /Composed/);
  assert.throws(() => validateComposition(parseBehaviors(Array.from({ length: 8 }, (_, i) => pulse(`p${i}`)))), /Composed/);
});

test("fixed dt evaluates translate, wave phase and pulse deterministically without input signals", () => {
  const groups = [{ id: "layer", behaviors: parseBehaviors([translate("move"), wave(), pulse()]) }];
  const a = createBehaviorEvaluator(groups), b = createBehaviorEvaluator(groups);
  assert.equal(a.getSnapshot()[0].effects[0].x, 0);
  assert.equal(a.getSnapshot()[0].effects[2].gain, 1);
  for (let i = 0; i < 15; i++) { a.step(1 / 60); b.step(1 / 60); }
  assert.deepEqual(a.getSnapshot(), b.getSnapshot());
  const effects = a.getSnapshot()[0].effects;
  assert.equal(effects[0].x, 30);
  assert.equal(effects[1].phase, Math.PI / 4);
  assert.equal(effects[2].gain, 1.25);
  const before = a.getSnapshot();
  assert.throws(() => a.step(0.1), /fixed/);
  assert.equal(a.getSnapshot(), before);
  a.reset();
  assert.equal(a.getSnapshot()[0].effects[0].x, 0);
});

function maskedManifest() {
  const input = structuredClone(source);
  input.assets.push({ ...input.assets[0], id: "motion-mask", kind: "mask" });
  input.layers[1].behaviors = [{ ...wave(), influenceMaskAssetId: "motion-mask" }, pulse()];
  input.layers[1].regions = [{ id: "tip", influenceMaskAssetId: "motion-mask", behaviors: [translate("move")] }];
  return input;
}

test("manifest validates influence references and regions and protects coverage from spatial effects", () => {
  const parsed = parseArtworkPackage(maskedManifest());
  assert.equal(parsed.layers[1].regions[0].id, "tip");
  for (const mutate of [
    input => { input.assets[2].critical = false; },
    input => { input.assets[2].kind = "image"; },
    input => { input.layers[1].regions.push(input.layers[1].regions[0]); },
    input => { input.layers[1].regions[0].visibilityMaskAssetId = "motion-mask"; },
    input => { input.layers[0].behaviors = [translate("move")]; },
  ]) { const input = maskedManifest(); mutate(input); assert.throws(() => parseArtworkPackage(input)); }
  const inherited = maskedManifest(); inherited.behaviors = [translate("move")];
  inherited.layers[0].behaviors = [translate("move", 0)];
  assert.doesNotThrow(() => parseArtworkPackage(inherited));
});

test("independent artwork/region state freezes without steps and reset restores every phase", () => {
  const manifest = parseArtworkPackage(maskedManifest());
  const a = createArtworkInstance("a", manifest), b = createArtworkInstance("b", manifest);
  const before = a.getSnapshot().layers;
  for (let i = 0; i < 15; i++) a.stepBehaviors({ dt: 1 / 60 });
  assert.deepEqual(b.getSnapshot().layers, before);
  assert.notDeepEqual(a.getSnapshot().layers, before);
  const frozen = a.getSnapshot();
  assert.throws(() => { frozen.layers[1].groups[0].effects[0].phase = 0; }, TypeError);
  assert.deepEqual(a.getSnapshot(), frozen);
  a.reset(); assert.deepEqual(a.getSnapshot().layers, before);
});

test("camera and behaviors produce the same complete state across render rates and retain it through stop/resume", async () => {
  const results = [];
  for (const hz of [30, 60, 144]) {
    const manifest = parseArtworkPackage(maskedManifest());
    const instance = createArtworkInstance("deterministic", manifest);
    const camera = createCameraController(() => true);
    const frames = new Map(); let next = 0;
    const engine = createInfiniteZoomController({ seed: 42,
      scheduler: { request(callback) { const id = next++; frames.set(id, callback); return id; }, cancel(id) { frames.delete(id); } },
      prepare: async () => ({
        step(context) {
          if (context.tick === 1) camera.zoomIn(2, 1);
          if (context.tick === 60) camera.move(2000, 1100, 1);
          instance.setLayerTransform("foreground", { x: context.random() * 10 });
          instance.stepBehaviors(context); camera.step();
        },
        reset() { instance.reset(); camera.reset(); }, dispose() {},
      }),
    });
    const frame = time => {
      assert.equal(frames.size, 1);
      const [id, callback] = frames.entries().next().value; frames.delete(id); callback(time);
    };
    await engine.prepare(); engine.start(); frame(0);
    for (let i = 1; i <= hz * 2; i++) frame(i * 1000 / hz);
    const snapshot = () => ({ camera: camera.getSnapshot(), artwork: instance.getSnapshot(), session: engine.getSnapshot().session });
    const before = snapshot();
    engine.stop(); assert.equal(frames.size, 0);
    assert.deepEqual(snapshot(), before);
    engine.resume(); frame(100_000);
    assert.deepEqual(snapshot(), before);
    results.push(snapshot()); engine.dispose();
  }
  assert.deepEqual(results[0], results[1]);
  assert.deepEqual(results[1], results[2]);
  assert.equal(results[0].session.tick, 120);
});
