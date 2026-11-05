# Infinite Zoom engine: IZ-181 / IZ-182

The implementation follows `docs/infinite-zoom/`. It is not mounted in the
application yet. MediaRuntime, audio playback and the experimental background
are unchanged.

## Entry points

- `index.ts`: the controller and core contracts (no Three.js import).
- `artwork/index.ts`: manifest validation, CPU loading, independent instances.
- `renderer/index.ts`: WebGL2 renderer and `prepareArtwork(options, signal)`.

Supply `prepareArtwork` as the controller's `prepare` dependency. The returned
lease implements `step`, `render`, `reset` and `dispose`, and exposes its instance,
`resize` and GPU object diagnostics. The controller calls `render` once per
scheduled frame, independently of its fixed 60 Hz steps. The renderer creates no
RAF, audio element or simulation clock.

The caller must route `onAvailabilityChange(available)` to the controller's
`setSuspended("context-lost", !available)` and handle `onError`. Recovery rebuilds
GPU objects and draws the preserved state before reporting availability. Other
suspensions and a user pause remain in force. The future playback adapter must
call start/resume only after confirmed audio playback.

## Supported package subset

Version 1 currently accepts a 3840×2160 canvas, local image/mask assets in the
same coordinate space, stable z-ordered layers and `coverage.baseLayerId`.
Every referenced image and mask must be critical. Optional unreferenced assets
are validated but not downloaded. Unsupported manifest fields are rejected.
Behaviors, regions, depth/flow, anchors and transition coverage will extend the
validated contract in their implementation stages.

Packages are detached, deeply frozen descriptors. Instances own layer transforms
in artwork pixels: x right, y down, clockwise rotation in radians and scale about
the artwork center. Manifest identity and instance identity are separate.

The loader verifies decoded dimensions and every alpha pixel of the opaque base.
The renderer uses a cover projection and validates inverse-mapped viewport
corners before drawing or resizing. It blocks unsafe base transforms. This is
rectangle coverage for the initial renderer, not deformation/transition coverage.
Viewport × DPR × renderScale determines GPU target size; artwork resolution does
not determine render-target resolution. The renderer rejects unsupported GPU
dimensions instead of silently resampling critical assets.

Layer shaders compose premultiplied colors into a linear-light target. The final
pass encodes to sRGB. Visibility masks use their red channel as linear data,
separately from image alpha. CPU bitmaps survive context loss and close on terminal
disposal. The renderer owns all GPU textures, geometry, materials and targets;
there is no cache/LRU or adaptive quality policy yet.

`public/infinite-zoom/samples/foundation/` contains manually authored SVG test
artwork, with an opaque backdrop and transparent foreground. It is a technical
fixture, not approved Forest/Nebula production art. Independent sample motion
is supplied by the browser test's fixed-step evaluator; the Behavior Library is
not implemented in this stage.

## Focused verification

From `apps/ui`:

```text
node --experimental-strip-types --test tests/infinite-zoom-*.test.mjs
node tests/infinite-zoom-renderer.browser.mjs
```

The browser harness serves transpiled source and installed Three.js to Chromium,
without a Next build or a product test route. It checks real GPU pixels, linear
blending, coverage, resize, context recovery and repeated CPU/GPU disposal.
GPU counters establish object ownership, not a driver-level memory measurement.
