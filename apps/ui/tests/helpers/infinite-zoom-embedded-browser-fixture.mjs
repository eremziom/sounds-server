import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { decodeArtworkAsset } from "/engine/artwork/artwork-loader.ts";
import { cameraInDestination, placePoint } from "/engine/transition/placement.ts";
import { destinationView } from "/engine/transition/destination-view.ts";
import { cameraMatrix } from "/engine/camera/camera-math.ts";
import { check, pixels, opaque, waitFor } from "/fixture.mjs";
import { checkHandoffPixels } from "/transition-fixture.mjs";

function withoutMotion(manifest) {
  const result = structuredClone(manifest); result.behaviors = [];
  for (const layer of result.layers) { layer.behaviors = []; layer.regions = []; }
  return result;
}
const difference = (a, b) => {
  let maximum = 0, count = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); maximum = Math.max(maximum, d); if (d) count++; }
  return { maximum, count };
};

window.runEmbeddedPortal = async () => {
  // Disable internal behavior motion for the frozen-camera pixel oracle only.
  // Both actual sample behavior programs are tested in runSampleArtwork.
  const source = withoutMotion(await (await fetch("/infinite-zoom/samples/forest/manifest.json")).json());
  const destination = withoutMotion(await (await fetch(source.portal.destination.manifestUri)).json());
  delete destination.portal; // Isolate the existing two-world oracle; the full demo has its own chain test.
  const travelTicks = Math.round(source.portal.durationSeconds * 60);
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const viewport = { width: 640, height: 360, dpr: 1, renderScale: 1 };
  const closed = [], errors = [];
  const lease = await prepareArtwork({ canvas, manifest: source, instanceId: "authored-forest", viewport,
    resolveManifest: async () => destination,
    onAvailabilityChange() {}, onError(error) { errors.push(String(error)); },
    async decode(asset, signal) {
      const value = await decodeArtworkAsset(asset, signal), entry = { id: asset.uri, closes: 0 }; closed.push(entry);
      return { ...value, close() { entry.closes++; value.close(); } };
    },
  }, new AbortController().signal);
  let tick = 0;
  const step = () => lease.step({ tick: ++tick, timeSeconds: tick / 60, dt: 1 / 60, random: () => 0.5 });
  window.embeddedPortalCaptures = {};
  const captures = window.embeddedPortalCaptures;
  const capture = name => { lease.render(); captures[name] = canvas.toDataURL("image/png"); };
  let handoff, placement, region, initialResources;
  try {
    const initial = pixels(canvas, lease.render); opaque(initial); capture("initial");
    initialResources = lease.getDiagnostics();
    check(initialResources.artworks === 2 && closed.length === 6, "Both worlds are decoded/GPU-ready before readiness");
    const state = lease.transition.getSnapshot(); placement = state.placement; region = state.region;
    check(state.phase === "prepared" && state.canStart, "Initial B is embedded and waiting for travel");
    check(placement.scale === source.portal.scale && placement.scale < 0.1, "Authored B root is small and fixed");
    check(region.y !== 1080, "Authored source portal is off center");

    for (let i = 0; i < 120; i++) step();
    check(difference(initial, pixels(canvas, lease.render)).maximum <= 2, "Elapsed time before travel does not reveal/enlarge B");
    lease.transition.start();
    check(difference(initial, pixels(canvas, lease.render)).maximum <= 2, "Travel command does not introduce a new image");
    for (let i = 0; i < 60; i++) step();
    const cameraAtCancel = lease.camera.getSnapshot();
    lease.transition.cancel();
    check(JSON.stringify(lease.camera.getSnapshot()) === JSON.stringify(cameraAtCancel), "Cancel starts with exact pose/velocity continuity");
    for (let i = 0; i < travelTicks; i++) step();
    check(lease.transition.getSnapshot().phase === "cancelled" && lease.getDiagnostics().artworks === 2, "Rollback preserves both worlds");
    check(difference(initial, pixels(canvas, lease.render)).maximum <= 2, "Rollback restores the initial embedded composition");
    lease.reset();
    lease.transition.start(); for (let i = 0; i < 60; i++) step();
    lease.camera.halt();
    const frozen = pixels(canvas, lease.render);
    for (let i = 0; i < 60; i++) step();
    check(difference(frozen, pixels(canvas, lease.render)).maximum <= 2, "During approach, a frozen camera means a frozen portal boundary");
    lease.reset();

    // Real context loss while both worlds are initially visible; no state reset.
    const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    const beforeLoss = JSON.stringify({ instance: lease.instance.getSnapshot(), camera: lease.camera.getSnapshot(), transition: lease.transition.getSnapshot() });
    extension.loseContext(); await waitFor(() => !lease.getDiagnostics().available);
    lease.reset();
    check(!lease.getDiagnostics().available, "Explicit reset during context loss preserves the technical blocker");
    extension.restoreContext(); await waitFor(() => lease.getDiagnostics().available || errors.length > 0);
    check(errors.length === 0, errors.join("; "));
    check(JSON.stringify({ instance: lease.instance.getSnapshot(), camera: lease.camera.getSnapshot(), transition: lease.transition.getSnapshot() }) === beforeLoss, "Context recovery preserves embedded pair/camera");
    check(difference(initial, pixels(canvas, lease.render)).maximum <= 2, "Context recovery restores integrated initial pixels");

    let cappedFrames = 0, capSourceScale = null, cappedPatch = null;
    lease.transition.start();
    for (let i = 1; i <= travelTicks; i++) {
      step(); const frame = pixels(canvas, lease.render); opaque(frame);
      const sourcePose = lease.camera.getSnapshot().pose;
      if (lease.transition.getSnapshot().phase === "approaching" && destinationView(sourcePose, placement, source.portal.destinationCamera).logScale === 0) {
        const patch = [];
        for (let y = 170; y < 190; y++) for (let x = 300; x < 340; x++) {
          const offset = (y * 640 + x) * 4; patch.push(...frame.slice(offset, offset + 4));
        }
        if (cappedPatch) check(difference(cappedPatch, patch).maximum <= 2, "Nebula landmarks stop growing while forest keeps moving");
        cappedPatch = patch; capSourceScale ??= sourcePose.logScale; cappedFrames++;
      }
      if (i % Math.round(travelTicks / 8) === 0) capture(`approach-${String(i).padStart(3, "0")}`);
      check(JSON.stringify(lease.transition.getSnapshot().placement) === JSON.stringify(placement), "B root placement never changes");
      if (lease.transition.getSnapshot().phase === "committed") {
        handoff = lease.transition.getSnapshot().handoff; capture("handoff"); break;
      }
    }
    check(handoff && lease.instance.manifest.id === "nebula", "Authored Forest→Nebula commits");
    check(cappedFrames > 30 && handoff.before.pose.logScale > capSourceScale, "B holds full frame for many frames while A keeps zooming");
    check(Math.abs(handoff.after.pose.logScale) < 1e-10, "Destination stays at native full frame after handoff");
    const mapped = cameraInDestination(handoff.before.pose, handoff.placement);
    check(JSON.stringify(mapped) === JSON.stringify(handoff.after.pose), "Handoff maps exact pose");
    // Verify landmarks in common projected coordinates at the handoff.
    const project = (pose, point) => { const m = cameraMatrix(pose); return [m[0]*point.x+m[1]*point.y+m[2], m[3]*point.x+m[4]*point.y+m[5]]; };
    for (const point of [{ x: 1920, y: 1080 }, { x: 1600, y: 800 }, { x: 2100, y: 1200 }]) {
      const before = project(handoff.before.pose, placePoint(point, handoff.placement)), after = project(handoff.after.pose, point);
      check(before.every((v, i) => Math.abs(v - after[i]) < 1e-7), "Landmarks retain their shared-camera projection");
    }
    for (let i = 0; i < 60; i++) step();
    capture("destination");
    lease.reset();
    check(closed.every(entry => entry.closes === 0), "The initial pair CPU cache supports synchronous reset without reload");
    check(difference(initial, pixels(canvas, lease.render)).maximum <= 2, "Post-handoff reset restores the entire embedded initial pair");
    for (const size of [{ width: 240, height: 360 }, { width: 960, height: 240 }]) {
      lease.resize({ ...viewport, ...size }); lease.transition.start();
      for (let i = 0; i < travelTicks; i++) { step(); opaque(pixels(canvas, lease.render)); }
      check(lease.instance.manifest.id === "nebula", "Authored portal remains covered on portrait/wide approach");
      lease.reset();
    }
  } finally {
    lease.dispose(); canvas.remove();
    check(closed.every(entry => entry.closes === 1), "Every initial-pair bitmap closes exactly once on disposal");
    check(lease.getDiagnostics().textures === 0, "Embedded pair GPU resources are released");
  }
  const continuity = await checkHandoffPixels(source, destination, handoff, placement, region);
  return { initiallyEmbedded: true, noTimeDrivenReveal: true, independentDestinationZoom: true, rollbackRetainsB: true,
    contextRecovery: true, resetWithoutReload: true, decodedBitmaps: closed.length, placement, region, initialResources, continuity };
};
