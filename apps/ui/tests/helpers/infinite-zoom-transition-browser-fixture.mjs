import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { createInfiniteZoomController } from "/engine/index.ts";
import { decodeArtworkAsset, loadArtwork } from "/engine/artwork/artwork-loader.ts";
import { createArtworkInstance } from "/engine/artwork/artwork-instance.ts";
import { destinationRenderPlacement } from "/engine/transition/destination-view.ts";
import { createCameraController } from "/engine/camera/index.ts";
import { createArtworkRenderer } from "/engine/renderer/artwork-renderer.ts";
import { check, waitFor, pixels, hash, opaque } from "/fixture.mjs";

window.runTransitionRenderer = async () => {
  const source = await (await fetch("/infinite-zoom/samples/foundation/motion-manifest.json")).json();
  const destination = await (await fetch("/infinite-zoom/samples/foundation/destination.json")).json();
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const decoded = [], frames = new Map(), errors = [];
  let lease, engine, next = 0, timestamp = 0;
  const viewport = { width: 640, height: 360, dpr: 1, renderScale: 1 };
  const frame = () => {
    check(frames.size === 1, "Transition keeps one scheduled frame");
    const [id, callback] = frames.entries().next().value; frames.delete(id); callback(timestamp); timestamp += 1000 / 60;
    check(engine.getSnapshot().status === "running", `Engine failed: ${String(engine.getSnapshot().error)}`);
    opaque(pixels(canvas, lease.render));
  };
  const advance = ticks => { for (let i = 0; i < ticks; i++) frame(); };
  engine = createInfiniteZoomController({ seed: 44,
    scheduler: { request(callback) { const id = next++; frames.set(id, callback); return id; }, cancel(id) { frames.delete(id); } },
    prepare: async signal => {
      lease = await prepareArtwork({ canvas, manifest: source, instanceId: "source", viewport,
        onAvailabilityChange(available) { engine.setSuspended("context-lost", !available); }, onError(error) { errors.push(String(error)); },
        async decode(asset, signal) {
          const value = await decodeArtworkAsset(asset, signal), count = { uri: asset.uri, closes: 0 }; decoded.push(count);
          return { ...value, close() { count.closes++; value.close(); } };
        },
      }, signal);
      return lease;
    },
  });
  const request = patch => lease.transition.request({ sourceInstanceId: lease.instance.id, manifest: destination,
    anchorId: "center", placement: { x: 1920, y: 1080, scale: 0.5, rotation: 0.12 },
    region: { x: 1920, y: 1080, radiusX: 900, radiusY: 450, rotation: 0.12, feather: 0.2 }, durationSeconds: 1, ...patch });
  let handoff;
  try {
    await engine.prepare(); const context = canvas.getContext("webgl2"), initial = hash(pixels(canvas, lease.render));
    engine.start(); frame();

    const missing = structuredClone(destination); missing.assets[0].uri = "/infinite-zoom/samples/foundation/missing-critical.svg";
    let failed = false;
    try { await request({ manifest: missing }); } catch { failed = true; }
    check(failed && lease.instance.id === "source", "Missing B leaves A playable"); frame();
    const transparent = structuredClone(destination); transparent.assets[0].uri = "/infinite-zoom/samples/foundation/foreground.svg";
    let alphaRejected = false;
    try { await request({ manifest: transparent }); } catch (error) { alphaRejected = String(error).includes("transparent pixels"); }
    check(alphaRejected && lease.instance.id === "source", "Actual decoded alpha holes reject B readiness"); frame();
    const excessive = structuredClone(destination);
    for (let i = 0; i < 8; i++) excessive.assets.push({ ...excessive.assets[0], id: `extra${i}` });
    const loadedBeforeBudgetCheck = decoded.length;
    try { await request({ manifest: excessive }); throw new Error("Expected budget refusal"); }
    catch (error) { check(String(error).includes("GPU_BUDGET"), "Budget failure is explicit"); }
    check(decoded.length === loadedBeforeBudgetCheck, "Budget rejected before allocating B");

    const beforePreparation = hash(pixels(canvas, lease.render));
    await request(); check(lease.getDiagnostics().artworks === 2, "A and B share one renderer");
    check(hash(pixels(canvas, lease.render)) !== beforePreparation, "Prepared B is already visibly embedded before travel");
    lease.transition.start(); advance(20);
    const cancelledPose = JSON.stringify(lease.camera.getSnapshot().pose);
    lease.transition.cancel();
    check(lease.transition.getSnapshot().phase === "rollingBack", "Cancellation begins smooth rollback");
    check(JSON.stringify(lease.camera.getSnapshot().pose) === cancelledPose, "Rollback does not teleport");
    advance(60);
    check(lease.transition.getSnapshot().phase === "cancelled" && lease.getDiagnostics().artworks === 2, "Rollback retains visible B GPU leases");
    check(lease.instance.id === "source", "Rollback preserves A identity");

    lease.transition.start(); advance(15);
    engine.pause();
    const frozen = JSON.stringify({ transition: lease.transition.getSnapshot(), camera: lease.camera.getSnapshot(), artwork: lease.instance.getSnapshot() });
    const stablePixels = hash(pixels(canvas, lease.render));
    let locked = false;
    try { lease.resize({ ...viewport, renderScale: 0.5 }); } catch { locked = true; }
    check(locked && canvas.width === 640, "Critical A/B transaction locks render quality and viewport");
    const extension = context.getExtension("WEBGL_lose_context");
    extension.loseContext(); await waitFor(() => !lease.getDiagnostics().available);
    extension.restoreContext(); await waitFor(() => lease.getDiagnostics().available || errors.length > 0);
    check(errors.length === 0, errors.join("; "));
    check(engine.getSnapshot().status === "paused", "Transition recovery cannot override pause");
    check(JSON.stringify({ transition: lease.transition.getSnapshot(), camera: lease.camera.getSnapshot(), artwork: lease.instance.getSnapshot() }) === frozen, "A/B/reveal/camera state survives context loss");
    check(hash(pixels(canvas, lease.render)) === stablePixels, "Recovered A/B frame is unchanged");
    engine.resume(); timestamp += 100_000; frame();
    check(JSON.stringify({ transition: lease.transition.getSnapshot(), camera: lease.camera.getSnapshot(), artwork: lease.instance.getSnapshot() }) === frozen, "No catch-up after transition suspension");
    for (let i = 0; i < 70 && lease.transition.getSnapshot().phase !== "committed"; i++) frame();
    check(lease.transition.getSnapshot().phase === "committed", "zoomThrough commits");
    handoff = lease.transition.getSnapshot().handoff;
    check(handoff.before.velocity.logScale > 0, "Actual GPU transition hands off with nonzero velocity");
    check(lease.getDiagnostics().artworks === 1 && lease.instance.manifest.id === destination.id, "Commit releases source GPU and activates B");
    check(canvas.getContext("webgl2") === context, "Handoff retains the same WebGL context");
    advance(20);
    engine.reset();
    check(lease.instance.id === "source", "Explicit reset returns to initial artwork");
    check(hash(pixels(canvas, lease.render)) === initial, "Reset rewinds journey after committed transition");
    check(decoded.slice(0, 3).every(value => value.closes === 0), "Only initial CPU package remains cached for reset");
    check(decoded.slice(3).every(value => value.closes === 1), "All unused B CPU bitmaps are released");

    // Repeat in portrait and ultrawide viewports. Every rendered pixel retains
    // opaque coverage through reveal and after handoff.
    for (const size of [{ width: 240, height: 360 }, { width: 960, height: 240 }]) {
      lease.resize({ ...viewport, ...size }); engine.start(); frame();
      await request({ placement: { x: 1920, y: 1080, scale: 0.6, rotation: -0.15 },
        region: { x: 1920, y: 1080, radiusX: 900, radiusY: 450, rotation: -0.15, feather: 0.2 } });
      lease.transition.start();
      advance(65); check(lease.transition.getSnapshot().phase === "committed", "Aspect-ratio transition commits safely");
      engine.reset();
    }
    check(errors.length === 0, errors.join("; "));
  } finally {
    engine.dispose();
    const dead = lease.getDiagnostics();
    check(dead.textures === 0 && dead.geometries === 0 && dead.programs === 0, "Terminal cleanup releases A/B GPU objects");
    check(decoded.every(value => value.closes === 1), "Every acquired CPU bitmap closes once");
    canvas.remove();
  }
  const continuity = await checkHandoffPixels(source, destination, handoff);
  return { transitions: true, contextRecoveryDuringReveal: true, oneContext: true, opaqueViewports: true,
    acquiredBitmaps: decoded.length, continuity };
};

export async function checkHandoffPixels(source, destination, handoff, authoredPlacement, authoredRegion) {
  const signal = new AbortController().signal;
  const a = await loadArtwork(source, signal), b = await loadArtwork(destination, signal);
  const ai = createArtworkInstance("a", a.manifest), bi = createArtworkInstance("b", b.manifest);
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const camera = createCameraController(() => true, handoff.before.pose);
  const renderer = createArtworkRenderer(canvas, a, ai, { camera, viewport: { width: 640, height: 360, dpr: 1, renderScale: 1 },
    onAvailabilityChange() {}, onError(error) { throw error; } });
  try {
    renderer.attach(b, bi);
    const placement = authoredPlacement ?? { x: 1920, y: 1080, scale: 0.5, rotation: 0.12, anchorX: 1920, anchorY: 1080 };
    renderer.setComposition({ sourceId: "a", destinationId: "b", placement,
      destinationCamera: source.portal?.destinationCamera,
      portal: authoredRegion ?? { x: 1920, y: 1080, radiusX: 900, radiusY: 450, rotation: 0.12, feather: 0.2 } });
    const before = pixels(canvas, renderer.render); opaque(before);
    camera.rebaseCoordinates(destinationRenderPlacement(handoff.before.pose, placement, source.portal?.destinationCamera)); renderer.setComposition({ sourceId: "b" }); renderer.detach("a");
    const after = pixels(canvas, renderer.render); opaque(after);
    let maximum = 0, total = 0;
    for (let i = 0; i < before.length; i++) { const error = Math.abs(before[i]-after[i]); maximum = Math.max(maximum,error); total += error; }
    check(maximum <= 2 && total / before.length < 0.02, `Handoff pixels remain continuous: max=${maximum}, mean=${total / before.length}`);
    return { maximumChannelDifference: maximum, meanChannelDifference: total / before.length };
  } finally { renderer.dispose(); a.dispose(); b.dispose(); canvas.remove(); }
}
