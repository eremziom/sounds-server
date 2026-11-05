import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createAudioModulation } from "../src/engines/infinite-zoom/modulation/audio-modulation.ts";
import { createArtworkInstance, parseArtworkPackage } from "../src/engines/infinite-zoom/artwork/index.ts";

test("fixed-step audio modulation is deterministic, bounded and smooth", () => {
  const a = createAudioModulation(), b = createAudioModulation();
  for (let tick = 0; tick < 600; tick++) {
    const input = { bass: Math.sin(tick) + 1, mid: 0.7, high: -0.1 };
    const first = a.step(input, 1 / 60), second = b.step(input, 1 / 60);
    assert.deepEqual(first, second);
    assert.ok(first.strength >= 0.65 && first.strength <= 1);
    assert.ok(first.intensity >= 1 && first.intensity <= 1.25);
  }
  for (let tick = 0; tick < 600; tick++) a.step({ bass: NaN, mid: 1, high: 1 }, 1 / 60);
  assert.ok(Math.abs(a.getSnapshot().strength - 1) < 1e-10);
  assert.ok(Math.abs(a.getSnapshot().intensity - 1) < 1e-10);
  assert.throws(() => a.step(null, 0.1), /fixed/);
  a.reset(); assert.deepEqual(a.getSnapshot(), { strength: 1, intensity: 1 });
});

test("modulation attenuates authored effects and does not reset camera-independent phase", async () => {
  const data = JSON.parse(await readFile(new URL("../public/infinite-zoom/samples/foundation/motion-manifest.json", import.meta.url), "utf8"));
  const manifest = parseArtworkPackage(data), first = createArtworkInstance("a", manifest), second = createArtworkInstance("b", manifest);
  first.stepBehaviors({ dt: 1 / 60 }, { strength: 0.5, intensity: 1.2 });
  second.stepBehaviors({ dt: 1 / 60 });
  const a = first.getSnapshot().layers[1].groups[0].effects, b = second.getSnapshot().layers[1].groups[0].effects;
  const waveA = a.find(effect => effect.kind === "wave"), waveB = b.find(effect => effect.kind === "wave");
  assert.equal(waveA.phase, waveB.phase); assert.equal(waveA.amplitude, waveB.amplitude * 0.5);
  assert.equal(first.getSnapshot().layers[0].audioGain, 1.2);
  assert.throws(() => first.stepBehaviors({ dt: 1 / 60 }, { strength: 2, intensity: 1 }), /Invalid/);
  first.reset(); assert.equal(first.getSnapshot().layers[0].audioGain, 1);
});
