# Infinite Zoom engine: IZ-181 through IZ-183

The implementation follows `docs/infinite-zoom/`. It is not mounted in the
application yet. MediaRuntime, audio playback and the experimental background
are unchanged.

## Entry points

- `index.ts`: the controller and core contracts (no Three.js import).
- `artwork/index.ts`: manifest validation, CPU loading, independent instances.
- `renderer/index.ts`: WebGL2 renderer and `prepareArtwork(options, signal)`.
- `camera/index.ts`: fixed-step trajectories, bookmarks and camera matrices.
- `behaviors/index.ts`: validated translate/wave/pulse definitions and evaluation.

Supply `prepareArtwork` as the controller's `prepare` dependency. The returned
lease implements `step`, `render`, `reset` and `dispose`, and exposes its instance,
`camera`, `resize` and GPU object diagnostics. The controller calls `render` once per
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
Behaviors may be defined on the artwork, layers and influence-masked regions.
Definitions with the same ID override artwork → layer → region; resolved order
is numeric `order`, then lexical ID. Each region blends its resolved result over
the inherited layer result using its mask, in manifest region order. Region masks
do not cut image alpha. Dedicated region visibility masks, depth/flow, anchors
and transition coverage remain unsupported and are rejected explicitly.

Packages are detached, deeply frozen descriptors. Instances own layer transforms
in artwork pixels: x right, y down, clockwise rotation in radians and scale about
the artwork center. Manifest identity and instance identity are separate.

The loader verifies decoded dimensions and every alpha pixel of the opaque base.
The renderer uses a cover projection and validates inverse-mapped viewport
corners before drawing or resizing. It blocks unsafe base transforms. This is
rectangle coverage with camera pose, not general deformation/transition coverage.
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
fixture, not approved Forest/Nebula production art. `motion-manifest.json` adds
the behavior subset and a gradient influence mask, using the same images.

## Camera and behavior conventions

The camera owns a center in artwork pixels, clockwise rotation in radians and
log-scale. `cameraMatrix` stores a 3×3 matrix row-major, for column vectors:
`S(exp(logScale)) R(-rotation) T(-center)`. Layer transforms pivot about the
artwork center. Camera velocities use pixels/radians/log-scale per second.

Commands `zoomIn`, `zoomOut`, `move`, `rotate`, `hold`, `saveBookmark` and
`returnTo` operate on a single cubic Hermite trajectory. Retargeting preserves
incoming pose/velocity. Hold decelerates to rest; completed return assigns the
exact saved pose and zero velocity. `full-frame` is the reserved initial bookmark.
Durations are 1/60..60 seconds, quantized to the nearest fixed step. Commands
preflight every pose that can be rendered; no render-time camera interpolation
is used. Unsafe commands leave the previous trajectory intact. A later change
to viewport/base constraints can stop at the last accepted pose and set
`constraintReached`; the renderer also validates coverage before each draw.

The preparation lease advances behaviors and camera only from `step(context)`.
Rendering, resize and context recovery do not advance them. Reset rewinds all
transforms, phases and camera state, and clears user bookmarks.

Behavior parameters (technical schema for this slice):

- Shared: `id`, `order`, optional `influenceMaskAssetId`; periodic params
  `frequencyHz` (0..10) and `phase` (−2π..2π).
- `translate`: sinusoidal `x`/`y` amplitudes in artwork pixels (±512).
- `wave`: signed `amplitude` (±256 pixels), `wavelength` (16..7680 pixels),
  displacement `axis` (`x` or `y`). The wave varies along the other axis.
- `pulse`: intensity `amount` (0..1), applied in linear light before opacity.

Operators use instance-local fixed-step phases, with no wall time, randomness
or audio signal dependency. Spatial operators compose in explicit order (inverse
order when sampling UVs); pulse is separate from alpha. Per-operator influence
masks use their red channel as a weight. Composed displacement is bounded to 512
pixels, aggregate unmasked wave slope to 0.5, and maximum pulse gain to 4.
The opaque base currently permits pulse but rejects nonzero spatial operators,
because no extended/deformation coverage has been authored. GPU sampler limits
reject unsupported configurations rather than dropping masks. These constraints
are implementation limits for the slice, not a complete Behavior Library,
soft-constraint system or Audio Data Contract.

## Focused verification

From `apps/ui`:

```text
node --experimental-strip-types --test tests/infinite-zoom-*.test.mjs
node tests/infinite-zoom-renderer.browser.mjs
```

The browser harness serves transpiled source and installed Three.js to Chromium,
without a Next build or a product test route. It checks real GPU pixels, camera
motion/return, region overrides, black/gray/white influence weights, linear
blending, coverage, resize, context recovery and repeated CPU/GPU disposal.
GPU counters establish object ownership, not a driver-level memory measurement.
