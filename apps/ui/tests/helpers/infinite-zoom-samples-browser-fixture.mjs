import { prepareArtwork } from "/engine/artwork/prepare-artwork.ts";
import { check, pixels, hash, opaque } from "/fixture.mjs";

window.runSampleArtwork = async name => {
  window.sampleArtworkCaptures ??= {};
  const captures = window.sampleArtworkCaptures[name] = {};
  const manifest = await (await fetch(`/infinite-zoom/samples/${name}/manifest.json`)).json();
  // Isolate each artwork's layer/camera checks. The actual authored portal is
  // exercised separately by runEmbeddedPortal below, including initial readiness.
  delete manifest.portal;
  const canvas = document.createElement("canvas"); document.body.append(canvas);
  const errors = [];
  const viewport = { width: 640, height: 360, dpr: 1, renderScale: 1 };
  const lease = await prepareArtwork({ canvas, manifest, instanceId: `${name}-sample`, viewport,
    onAvailabilityChange() {}, onError(error) { errors.push(String(error)); },
  }, new AbortController().signal);
  const step = tick => lease.step({ tick, timeSeconds: tick / 60, dt: 1 / 60, random: () => 0.5 });
  try {
    const initialPixels = pixels(canvas, lease.render), initial = hash(initialPixels);
    const initialState = JSON.stringify(lease.instance.getSnapshot());
    opaque(pixels(canvas, lease.render));
    lease.render(); captures.initial = canvas.toDataURL("image/png");
    // Hide the foreground to observe the background's animation independently.
    lease.instance.setLayerTransform("foreground", { opacity: 0 });
    const base = hash(pixels(canvas, lease.render));
    check(base !== initial, `${name}: foreground contributes visible pixels`);
    for (let tick = 1; tick <= 90; tick++) step(tick);
    check(hash(pixels(canvas, lease.render)) !== base, `${name}: background light animates independently`);
    lease.reset();
    check(JSON.stringify(lease.instance.getSnapshot()) === initialState, `${name}: reset restores exact logical state`);
    const resetPixels = pixels(canvas, lease.render);
    let maximumResetDifference = 0;
    for (let i = 0; i < resetPixels.length; i++) maximumResetDifference = Math.max(maximumResetDifference, Math.abs(resetPixels[i] - initialPixels[i]));
    // GPU output is quantized; logical reset above must remain exact.
    check(maximumResetDifference <= 2, `${name}: reset restores initial frame (maximum channel difference ${maximumResetDifference})`);
    for (let tick = 1; tick <= 90; tick++) step(tick);
    const animated = hash(pixels(canvas, lease.render));
    check(animated !== initial, `${name}: animated composite changes`);
    lease.render(); captures.animated = canvas.toDataURL("image/png");
    const initialLayers = JSON.parse(initialState).layers;
    for (const [index, layer] of lease.instance.getSnapshot().layers.entries()) {
      check(JSON.stringify(layer.groups) !== JSON.stringify(initialLayers[index].groups), `${name}: ${layer.id} has independent animated outputs`);
    }
    // Inspect the source alpha independently of the opaque composite.
    const foreground = manifest.assets.find(asset => asset.id === "foreground");
    const image = new Image(); image.src = foreground.uri; await image.decode();
    check(image.naturalWidth === 3840 && image.naturalHeight === 2160, `${name}: exact foreground dimensions`);
    const alphaCanvas = new OffscreenCanvas(3840, 2160), context = alphaCanvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const rgba = context.getImageData(0, 0, 3840, 2160).data;
    let clear = 0, visible = 0, partial = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] === 0) clear++; else visible++;
      if (rgba[i] > 0 && rgba[i] < 255) partial++;
    }
    check(clear > 3840 * 2160 * 0.2 && visible > 3840 * 2160 * 0.05 && partial > 0, `${name}: genuine feathered foreground alpha`);
    const anchorAlpha = rgba[(1080 * 3840 + 1920) * 4 + 3];
    check(anchorAlpha <= 8, `${name}: central anchor is visually open (alpha ${anchorAlpha}/255)`);
    alphaCanvas.width = alphaCanvas.height = 1;
    lease.camera.zoomIn(2, 0.5);
    for (let tick = 91; tick <= 120; tick++) step(tick);
    lease.camera.move(2050, 1120, 0.5);
    for (let tick = 121; tick <= 150; tick++) step(tick);
    lease.camera.rotate(0.15, 0.5);
    for (let tick = 151; tick <= 180; tick++) step(tick);
    opaque(pixels(canvas, lease.render));
    for (const size of [{ width: 320, height: 480 }, { width: 960, height: 240 }]) {
      lease.resize({ ...viewport, ...size }); opaque(pixels(canvas, lease.render));
    }
    lease.resize(viewport);
    lease.camera.returnTo("full-frame", 0.5);
    for (let tick = 181; tick <= 210; tick++) step(tick);
    opaque(pixels(canvas, lease.render));
    // Validate the authored center anchors and the pair's actual texture budget.
    const destination = name === "forest" ? "nebula" : "forest";
    const nextManifest = await (await fetch(`/infinite-zoom/samples/${destination}/manifest.json`)).json();
    const request = (manifest = nextManifest) => lease.transition.request({ sourceInstanceId: lease.instance.id, manifest, anchorId: "center",
      placement: { x: 1920, y: 1080, scale: 0.5, rotation: 0.08 },
      region: { x: 1920, y: 1080, radiusX: 900, radiusY: 450, rotation: 0.08, feather: 0.2 }, durationSeconds: 4 });
    const baseline = lease.getDiagnostics();
    const invalid = structuredClone(nextManifest);
    // A real transparent foreground cannot serve as the coverage base.
    invalid.assets.find(asset => asset.id === "backdrop").uri = invalid.assets.find(asset => asset.id === "foreground").uri;
    let rejected = false;
    try { await request(invalid); } catch (error) { rejected = String(error).includes("transparent pixels"); }
    check(rejected && lease.instance.manifest.id === name, `${name}: decoded coverage failure preserves source`);
    check(lease.getDiagnostics().textures === baseline.textures, `${name}: invalid destination leaves no GPU allocation`);
    opaque(pixels(canvas, lease.render));
    await request();
    const peak = lease.getDiagnostics();
    check(peak.artworks === 2 && peak.estimatedTextureBytes === 2 * baseline.estimatedTextureBytes, `${name}: both critical packages resident`);
    check(peak.estimatedTextureBytes + peak.estimatedTargetBytes <= peak.gpuBudgetBytes, `${name}: transition fits admission budget`);
    lease.transition.start();
    for (let tick = 211; tick <= 240; tick++) { step(tick); opaque(pixels(canvas, lease.render)); }
    const beforeCancel = JSON.stringify(lease.camera.getSnapshot());
    lease.transition.cancel();
    check(lease.transition.getSnapshot().phase === "rollingBack", `${name}: cancellation starts rollback`);
    check(JSON.stringify(lease.camera.getSnapshot()) === beforeCancel, `${name}: rollback starts without camera discontinuity`);
    for (let tick = 241; tick <= 480; tick++) { step(tick); opaque(pixels(canvas, lease.render)); }
    check(lease.transition.getSnapshot().phase === "cancelled" && lease.instance.manifest.id === name, `${name}: rollback retains source`);
    check(lease.getDiagnostics().textures === peak.textures && lease.getDiagnostics().artworks === 2, `${name}: rollback preserves visible destination textures`);
    lease.transition.start();
    for (let tick = 481; tick <= 750; tick++) {
      step(tick);
      if (tick % 12 === 0) opaque(pixels(canvas, lease.render));
    }
    check(lease.transition.getSnapshot().phase === "committed", `${name}: authored pair transition commits`);
    check(lease.instance.manifest.id === destination, `${name}: destination becomes active`);
    lease.render(); captures.destination = canvas.toDataURL("image/png");
    check(errors.length === 0, errors.join("; "));
    return { name, clear, visible, partial, anchorAlpha, transitionTo: destination, rollback: true, invalidCoverageRejected: true,
      peakTextureBytes: peak.estimatedTextureBytes, peakTargetBytes: peak.estimatedTargetBytes, resources: lease.getDiagnostics() };
  } finally {
    lease.dispose();
    check(lease.getDiagnostics().textures === 0, `${name}: GPU textures released`);
    canvas.remove();
  }
};
