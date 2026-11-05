import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { createInfiniteZoomController } from "/engine/index.ts";
import { decodeArtworkAsset } from "/engine/artwork/artwork-loader.ts";
export { check, waitFor, pixels, hash, opaque };

const check = (condition, message) => { if (!condition) throw new Error(message); };
const waitFor = async predicate => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("WebGL context event timed out");
};

function pixels(canvas, render) {
  render();
  const gl = canvas.getContext("webgl2");
  const result = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, result);
  check(gl.getError() === gl.NO_ERROR, "readPixels succeeds");
  return result;
}

function hash(bytes) {
  let value = 0;
  for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
  return value;
}

function opaque(bytes) {
  for (let i = 3; i < bytes.length; i += 4) check(bytes[i] === 255, "Every viewport pixel is covered");
}

window.runFoundationRenderer = async () => {
  const manifest = await (await fetch("/infinite-zoom/samples/foundation/manifest.json")).json();
  let lease, engine, nextFrame = 0;
  const frames = new Map(), failures = [], availability = [];
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const viewport = { width: 640, height: 360, dpr: 1, renderScale: 1 };
  const scheduler = {
    request(callback) { const id = nextFrame++; frames.set(id, callback); return id; },
    cancel(id) { frames.delete(id); },
  };
  const frame = time => {
    check(frames.size === 1, "One frame pending");
    const [id, callback] = frames.entries().next().value;
    frames.delete(id); callback(time);
  };
  engine = createInfiniteZoomController({ seed: 5, scheduler,
    prepare: async signal => {
      lease = await prepareArtwork({ canvas, manifest, instanceId: "sample", viewport,
        onAvailabilityChange(available) { availability.push(available); engine.setSuspended("context-lost", !available); },
        onError(error) { failures.push(String(error)); },
        evaluate(instance, context) {
          instance.setLayerTransform("backdrop", { scale: 1.1, x: Math.sin(context.timeSeconds) * 40 });
          instance.setLayerTransform("foreground", { x: Math.cos(context.timeSeconds * 2) * 240, y: Math.sin(context.timeSeconds) * 120 });
        },
      }, signal);
      return lease;
    },
  });
  try {
    await engine.prepare();
    check(engine.getSnapshot().session.tick === 0, "GPU preparation never advances simulation");
    const initial = pixels(canvas, lease.render); opaque(initial);
    const initialHash = hash(initial);
    engine.start(); frame(0);
    for (let i = 1; i <= 60; i++) frame(i * 1000 / 60);
    const animated = pixels(canvas, lease.render); opaque(animated);
    check(hash(animated) !== initialHash, "Independent layer motion changes GPU pixels");
    const transforms = lease.instance.getSnapshot().layers;
    check(transforms[0].x !== transforms[1].x, "Layers have independent motion");
    const withBoth = hash(animated);
    lease.instance.setLayerTransform("foreground", { opacity: 0 });
    check(hash(pixels(canvas, lease.render)) !== withBoth, "Foreground contributes visible pixels");
    lease.instance.setLayerTransform("foreground", { opacity: 1 });

    engine.pause();
    const before = JSON.stringify(engine.getSnapshot().session);
    for (const size of [{ width: 320, height: 480 }, { width: 960, height: 240 }]) {
      lease.resize({ ...viewport, ...size });
      opaque(pixels(canvas, lease.render));
      check(JSON.stringify(engine.getSnapshot().session) === before, "Resize does not advance journey");
    }
    lease.resize({ ...viewport, dpr: 2, renderScale: 0.5 });
    check(canvas.width === 640 && canvas.height === 360, "Target follows viewport times DPR times renderScale");
    const covered = hash(pixels(canvas, lease.render));
    lease.instance.setLayerTransform("backdrop", { scale: 1, x: 200 });
    let blocked = false;
    try { lease.render(); } catch (error) { blocked = String(error).includes("COVERAGE_INVALID"); }
    check(blocked, "Unsafe base transform is rejected before drawing");
    lease.instance.setLayerTransform("backdrop", { scale: transforms[0].scale, x: transforms[0].x });
    check(hash(pixels(canvas, lease.render)) === covered, "Safe pose can still render");

    const stableState = JSON.stringify(lease.instance.getSnapshot());
    const stablePixels = hash(pixels(canvas, lease.render));
    const memoryBeforeLoss = lease.getDiagnostics();
    const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    check(extension, "Context loss extension available");
    const lossDelivered = new Promise(resolve => canvas.addEventListener("webglcontextlost", resolve, { once: true }));
    extension.loseContext();
    // Force the draw/event race: loss is observable synchronously, while the
    // cancellable DOM event has not yet been delivered.
    lease.render();
    check(engine.getSnapshot().status !== "error", "Loss before DOM event never poisons controller");
    await waitFor(() => !lease.getDiagnostics().available);
    await lossDelivered; // The browser must deliver/cancel loss before restoreContext.
    await new Promise(resolve => setTimeout(resolve, 25)); // Leave the event-dispatch task.
    check(frames.size === 0, "Context loss suspends scheduling");
    lease.resize({ ...viewport, width: 320, height: 480 });
    lease.resize(viewport);
    extension.restoreContext();
    await waitFor(() => lease.getDiagnostics().available || failures.length > 0);
    check(failures.length === 0, failures.join("; "));
    check(engine.getSnapshot().status === "paused", "Context recovery respects user pause");
    check(JSON.stringify(lease.instance.getSnapshot()) === stableState, "GPU recovery preserves layer state");
    check(hash(pixels(canvas, lease.render)) === stablePixels, "GPU recovery reproduces the preserved frame");
    check(lease.getDiagnostics().textures === memoryBeforeLoss.textures, "Recovery does not multiply GPU textures");
    check(JSON.stringify(engine.getSnapshot().session) === before, "Context recovery preserves logical time");
    engine.resume(); frame(1_000_000);
    check(JSON.stringify(engine.getSnapshot().session) === before, "Recovery never catches up elapsed time");
    engine.reset();
    check(hash(pixels(canvas, lease.render)) === initialHash, "Explicit reset restores initial GPU frame");
    check(failures.length === 0, failures.join("; "));
    check(availability.join(",") === "false,true", "Context hooks report loss and recovery once");
  } finally {
    engine.dispose();
    canvas.remove();
  }
  const disposed = lease.getDiagnostics();
  check(disposed.textures === 0 && disposed.geometries === 0 && disposed.programs === 0, "Terminal dispose releases all tracked GPU objects");

  const cycles = [];
  let acquiredBitmaps = 0, closedBitmaps = 0;
  for (let i = 0; i < 4; i++) {
    const canvas = document.createElement("canvas"); document.body.append(canvas);
    const lease = await prepareArtwork({ canvas, manifest, instanceId: `cycle-${i}`, viewport,
      onAvailabilityChange() {}, onError(error) { throw error; },
      async decode(asset, signal) {
        const decoded = await decodeArtworkAsset(asset, signal);
        acquiredBitmaps++;
        return { ...decoded, close() { closedBitmaps++; decoded.close(); } };
      },
    }, new AbortController().signal);
    const live = lease.getDiagnostics();
    lease.dispose(); lease.dispose();
    const dead = lease.getDiagnostics();
    check(dead.textures === 0 && dead.geometries === 0 && dead.programs === 0, "Repeated cleanup releases tracked GPU objects");
    cycles.push({ textures: live.textures, geometries: live.geometries, programs: live.programs });
    canvas.remove();
  }
  check(cycles.every(value => JSON.stringify(value) === JSON.stringify(cycles[0])), "Repeated prepare has stable GPU object counts");
  check(acquiredBitmaps === 8 && closedBitmaps === acquiredBitmaps, "Repeated dispose closes every real decoded bitmap exactly once");

  // A loss during the first critical draw must reject readiness, even though
  // a loss during normal rendering is recoverable suspension.
  const earlyCanvas = document.createElement("canvas"); document.body.append(earlyCanvas);
  const earlyGl = earlyCanvas.getContext("webgl2"), earlyLoss = earlyGl.getExtension("WEBGL_lose_context");
  let earlyCloses = 0, earlyFailure = false;
  earlyGl.drawElements = () => { earlyLoss.loseContext(); throw new Error("Interrupted first draw"); };
  try {
    await prepareArtwork({ canvas: earlyCanvas, manifest, instanceId: "early-loss", viewport,
      onAvailabilityChange() {}, onError(error) { throw error; },
      async decode(asset, signal) {
        const decoded = await decodeArtworkAsset(asset, signal);
        return { ...decoded, close() { earlyCloses++; decoded.close(); } };
      },
    }, new AbortController().signal);
  } catch (error) { earlyFailure = String(error).includes("GPU unavailable during critical preparation"); }
  finally { earlyCanvas.remove(); }
  check(earlyFailure && earlyCloses === 2, "First-draw loss rejects readiness and releases CPU leases");

  // Independent pixel oracle: half-alpha white over sRGB 128 gray must be
  // about 205, rather than the gamma-space blend of 192.
  const blendCanvas = document.createElement("canvas"); document.body.append(blendCanvas);
  let closes = 0;
  const blend = await prepareArtwork({ canvas: blendCanvas, manifest, instanceId: "linear-blend", viewport,
    onAvailabilityChange() {}, onError(error) { throw error; },
    async decode(asset) {
      const source = new OffscreenCanvas(3840, 2160);
      const context = source.getContext("2d");
      context.fillStyle = asset.id === "backdrop" ? "rgb(128,128,128)" : "rgba(255,255,255,0.5)";
      context.fillRect(0, 0, 3840, 2160);
      const image = await createImageBitmap(source, { premultiplyAlpha: "none", imageOrientation: "flipY" });
      source.width = source.height = 1;
      return { image, width: 3840, height: 2160, opaque: asset.id === "backdrop", close() { closes++; image.close(); } };
    },
  }, new AbortController().signal);
  let blendValue;
  try {
    const bytes = pixels(blendCanvas, blend.render); opaque(bytes);
    blendValue = bytes[0];
    check(Math.abs(blendValue - 205) <= 2, `Linear-light blend expected 205, received ${blendValue}`);
    blend.instance.setLayerTransform("foreground", { opacity: 0 });
    check(Math.abs(pixels(blendCanvas, blend.render)[0] - 128) <= 1, "sRGB image round trip retains source color");
  } finally { blend.dispose(); blendCanvas.remove(); }
  check(closes === 2, "CPU bitmap leases close exactly once");
  const cameraBehaviors = await runCameraBehaviors();
  const maskPixels = await runMaskPixels(manifest);
  return { cycles, blendValue, contextRecovery: true, opaqueViewport: true, cameraBehaviors, maskPixels };
};

async function runCameraBehaviors() {
  const manifest = await (await fetch("/infinite-zoom/samples/foundation/motion-manifest.json")).json();
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const frames = new Map(), errors = [];
  let lease, engine, next = 0, timestamp = 0;
  const frame = () => {
    check(frames.size === 1, "Camera test keeps one pending frame");
    const [id, callback] = frames.entries().next().value;
    frames.delete(id); callback(timestamp); timestamp += 1000 / 60;
    check(engine.getSnapshot().status === "running", `Camera frame failed: ${String(engine.getSnapshot().error)}`);
  };
  const advance = ticks => {
    for (let i = 0; i < ticks; i++) { frame(); opaque(pixels(canvas, lease.render)); }
  };
  engine = createInfiniteZoomController({ seed: 9,
    scheduler: { request(callback) { const id = next++; frames.set(id, callback); return id; }, cancel(id) { frames.delete(id); } },
    prepare: async signal => {
      lease = await prepareArtwork({ canvas, manifest, instanceId: "motion", viewport: { width: 640, height: 360, dpr: 1, renderScale: 1 },
        onAvailabilityChange(available) { engine.setSuspended("context-lost", !available); },
        onError(error) { errors.push(String(error)); },
      }, signal);
      return lease;
    },
  });
  try {
    await engine.prepare();
    const initial = hash(pixels(canvas, lease.render));
    engine.start(); frame();
    lease.camera.zoomIn(2, 0.5); advance(30);
    check(lease.camera.getSnapshot().pose.logScale === Math.log(2), "GPU camera reaches zoom target");
    lease.camera.move(2050, 1120, 0.5); advance(30);
    lease.camera.rotate(0.15, 0.5); advance(30);
    lease.camera.hold(0.25); advance(15);
    check(hash(pixels(canvas, lease.render)) !== initial, "Camera/behaviors visibly change the frame");
    const layers = lease.instance.getSnapshot().layers;
    check(layers[1].groups[0].effects.some(effect => effect.kind === "wave" && effect.phase !== 0), "Wave phase advances only on fixed steps");
    lease.camera.saveBookmark("detail");
    engine.stop();
    const frozen = JSON.stringify({ camera: lease.camera.getSnapshot(), instance: lease.instance.getSnapshot() });
    lease.render(); lease.render();
    check(JSON.stringify({ camera: lease.camera.getSnapshot(), instance: lease.instance.getSnapshot() }) === frozen, "Stopped renders freeze camera and behavior phases");
    engine.resume(); timestamp += 100_000; frame();
    check(JSON.stringify({ camera: lease.camera.getSnapshot(), instance: lease.instance.getSnapshot() }) === frozen, "Resume never catches up paused camera/behavior time");
    engine.pause();
    const stablePixels = hash(pixels(canvas, lease.render));
    const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    extension.loseContext(); await waitFor(() => !lease.getDiagnostics().available);
    extension.restoreContext(); await waitFor(() => lease.getDiagnostics().available || errors.length);
    check(errors.length === 0, errors.join("; "));
    check(hash(pixels(canvas, lease.render)) === stablePixels, "Context recovery preserves camera, masks and current effects");
    check(engine.getSnapshot().status === "paused", "Recovery preserves pause with moving camera");
    engine.resume(); frame();
    lease.camera.returnTo("full-frame", 1); advance(60);
    check(JSON.stringify(lease.camera.getSnapshot().pose) === JSON.stringify({ x: 1920, y: 1080, rotation: 0, logScale: 0 }), "Camera returns to exact full frame");
    engine.reset();
    check(hash(pixels(canvas, lease.render)) === initial, "Reset restores camera, regions and every behavior phase");
    return true;
  } finally {
    engine.dispose();
    const dead = lease.getDiagnostics();
    check(dead.textures === 0 && dead.geometries === 0 && dead.programs === 0, "Camera/region/mask GPU resources are disposed");
    canvas.remove();
  }
}

async function runMaskPixels(manifest) {
  const results = {};
  for (const caseName of ["translate", "wave", "pulse", "region"]) {
    const kind = caseName === "region" ? "translate" : caseName;
    const values = [];
    for (const maskLevel of [0, 128, 255]) {
      const input = structuredClone(manifest);
      input.assets.push({ ...input.assets[0], id: "influence", kind: "mask" });
      const params = kind === "translate" ? { x: 120, y: 0, frequencyHz: 0, phase: Math.PI / 2 }
        : kind === "wave" ? { amplitude: 120, wavelength: 2160, axis: "x", frequencyHz: 0, phase: 0 }
        : { amount: 1, frequencyHz: 0, phase: Math.PI / 2 };
      input.layers[1].behaviors = [{ id: "test-effect", kind, order: 0, influenceMaskAssetId: "influence", params }];
      if (caseName === "region") {
        input.layers[1].behaviors = [{ id: "test-effect", kind, order: 0, params: { ...params, x: 0 } }];
        input.layers[1].regions = [{ id: "tip", influenceMaskAssetId: "influence",
          behaviors: [{ id: "test-effect", kind, order: 0, params }] }];
      }
      const canvas = document.createElement("canvas"); document.body.append(canvas);
      const lease = await prepareArtwork({ canvas, manifest: input, instanceId: `${kind}-${maskLevel}`,
        viewport: { width: 640, height: 360, dpr: 1, renderScale: 1 },
        onAvailabilityChange() {}, onError(error) { throw error; },
        async decode(asset) {
          const source = new OffscreenCanvas(3840, 2160), context = source.getContext("2d");
          if (asset.id === "influence") {
            context.fillStyle = `rgb(${maskLevel},${maskLevel},${maskLevel})`;
            context.fillRect(0, 0, 3840, 2160);
          } else if (asset.id === "backdrop") {
            context.fillStyle = "black"; context.fillRect(0, 0, 3840, 2160);
          } else {
            context.fillStyle = kind === "pulse" ? "rgb(128,128,128)" : "white";
            context.fillRect(1500, 0, 120, 2160);
          }
          const image = await createImageBitmap(source, { premultiplyAlpha: "none", imageOrientation: "flipY" });
          source.width = source.height = 1;
          return { image, width: 3840, height: 2160, opaque: asset.id !== "foreground", close() { image.close(); } };
        },
      }, new AbortController().signal);
      try {
        const bytes = pixels(canvas, lease.render); opaque(bytes);
        let total = 0, weighted = 0, maximum = 0;
        for (let x = 0; x < 640; x++) {
          const value = bytes[(270 * 640 + x) * 4];
          total += value; weighted += value * x; maximum = Math.max(maximum, value);
        }
        values.push(kind === "pulse" ? maximum : weighted / total);
      } finally { lease.dispose(); canvas.remove(); }
    }
    if (kind === "pulse") {
      check(Math.abs(values[0] - 128) <= 1 && Math.abs(values[1] - 154) <= 2 && Math.abs(values[2] - 176) <= 2,
        `Pulse influence must scale intensity without changing alpha: ${values}`);
    } else {
      check(Math.abs(values[1] - values[0] - 10) < 1 && Math.abs(values[2] - values[0] - 20) < 1,
        `${kind} mask black/gray/white must scale displacement 0/half/full: ${values}`);
    }
    results[caseName] = values;
  }
  return results;
}
