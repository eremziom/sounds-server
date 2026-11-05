import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { createInfiniteZoomController } from "/engine/index.ts";
import { decodeArtworkAsset } from "/engine/artwork/artwork-loader.ts";

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
    extension.loseContext();
    await waitFor(() => !lease.getDiagnostics().available);
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
  return { cycles, blendValue, contextRecovery: true, opaqueViewport: true };
};
