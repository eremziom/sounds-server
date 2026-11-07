# Infinite Zoom engine — foundation and embedded zoomThrough

## Phase 2 runtime (2026-11-07)

The runtime now supports all twelve typed operators, scoped hard/soft constraints,
gradient influence, depth/flow maps, budgeted optional full-frame detail LOD,
preflighted camera paths, bounded audio bindings, diagnostic context, adaptive
quality recovery and fixed-tick logical recording/replay. See
[phase2-contract.md](phase2-contract.md) for the versioned package boundary,
encoding, limits, tests and production responsibilities. Schema 1 sample artwork
is backward compatible; schema 2 opts into the new facilities.

The current sample journey is Forest -> Nebula -> Underwater Cavern -> Forest,
with Loop and manual stop/resume. It retains one renderer, one clock and the
existing music graph. Historical terminal-chain descriptions below are superseded.
New operators are demonstrated by the Phase 2 WebGL fixture rather than silently
changing the three visually accepted sample packages. Replay JSON can be exported
from the existing session diagnostics panel.


## Current demo: Forest -> Nebula -> Underwater Cavern (2026-11-05)

The user authorized integrating the third artwork. The demo now has two authored
links and stops in Underwater Cavern. Each use of the existing transition control
travels to the next world; destinations settle at full frame while the previous
world completes its approach. C is already embedded in B while B is seen inside A,
so neither command nor the A/B handoff introduces the next image.

Preparation validates and loads a bounded chain of at most three worlds before
initial readiness. The same renderer draws nested compositions with both ancestor
apertures. No planner, extra clock, audio player, renderer or runtime generation
is added. Masks are uploaded at unchanged 3840x2160 resolution as exact R8 red
channels, matching existing shader sampling. Color images remain RGBA8. The three
packages require 223,948,800 bytes (213.57 MiB) of texture storage before the
viewport target and driver overhead, within the unchanged 256 MiB admission
estimate at supported target sizes. All three initial packages stay cached until
terminal disposal, enabling synchronous Reset from C without loads or pixel changes.
This is a bounded demo cache, not an unbounded journey/resource strategy.

Evidence: 83 Infinite Zoom unit tests, production build, the WebGL renderer suite
(including both handoffs with maximum pixel difference 0, real R8 allocation,
B/C rollback, context recovery, portrait/wide coverage and reset from C), and the
application integration suite with actual audio and C readiness/failure/retry.
Visual acceptance remains separate from these automated checks.

The historical two-world descriptions below predate this integration.


The implementation follows `docs/infinite-zoom/`, including the 2026-11-05
embedded-artwork contract. The persistent application integration uses the
existing MediaRuntime/audio graph and one renderer across display modes.
The first authored connection is Forest→Nebula; further portals are not authored.

## Entry points

- `index.ts`: the controller and core contracts (no Three.js import).
- `artwork/index.ts`: manifest validation, CPU loading, independent instances.
- `renderer/index.ts`: WebGL2 renderer and `prepareArtwork(options, signal)`.
- `camera/index.ts`: fixed-step trajectories, bookmarks and camera matrices.
- `behaviors/index.ts`: all twelve validated operators, hierarchy, constraints and evaluation.

Supply `prepareArtwork` as the controller's `prepare` dependency. The returned
lease implements `step`, `render`, `reset` and `dispose`, and exposes its instance,
`camera`, `resize` and GPU object diagnostics. The controller calls `render` once per
scheduled frame, independently of its fixed 60 Hz steps. The renderer creates no
RAF, audio element or simulation clock.

The caller must route `onAvailabilityChange(available)` to the controller's
`setSuspended("context-lost", !available)` and handle `onError`. Recovery rebuilds
GPU objects and draws the preserved state before reporting availability. Other
suspensions and a user pause remain in force. The playback adapter must
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
do not cut image alpha. Dedicated region visibility masks and depth/flow remain
unsupported. Point anchors and one optional authored `portal` are validated.

Packages are detached, deeply frozen descriptors. Instances own layer transforms
in artwork pixels: x right, y down, clockwise rotation in radians and scale about
the artwork center. Manifest identity and instance identity are separate.

The loader verifies decoded dimensions and every alpha pixel of the opaque base.
The renderer uses a cover projection and validates inverse-mapped viewport
corners before drawing or resizing. It blocks unsafe base transforms. This is
rectangle coverage with camera pose. Embedded handoff additionally requires all
viewport corners to be inside the static portal ellipse's fully opaque interior;
no part of A or the feathered edge may contribute at commit.
Viewport × DPR × renderScale determines GPU target size; artwork resolution does
not determine render-target resolution. The renderer rejects unsupported GPU
dimensions instead of silently resampling critical assets.

Layer shaders compose premultiplied colors into a linear-light target. The final
pass encodes to sRGB. Visibility masks use their red channel as linear data,
separately from image alpha. CPU bitmaps survive context loss and close on terminal
disposal. The renderer owns all GPU textures, geometry, materials and targets;
the initial pair is retained as a bounded CPU cache for explicit reset. Admission
uses raw texture/target estimates, while the browser adapter owns adaptive render
scale. There is no general shared LRU cache.

## Authored embedded portal

Forest's manifest describes an ellipse at `(1920,1030)`, radii `(90,48)`, feather
`0.24`, B scale `0.055`, a sixteen-second approach and a versioned Nebula manifest/
anchor link. Region coordinates belong to A; the destination point anchor belongs
to B. They are separate from behavior influence masks. This schema extends the
existing optional v1 package subset; older packages without `portal` still load
as standalone artworks. Unknown fields are still rejected.

`prepareArtwork` resolves only the initial destination, validates its identity,
loads the pair before the first draw is exposed, and mounts the fixed composition
before visual readiness. It does not recursively expand a scene graph.
`transition.start()` queues camera travel for the next simulation step, without
fetching, resizing B or changing its aperture. Direct engine clients may use
`transition.request(...)` to prepare an embedded composition before displaying it;
that method no longer starts travel implicitly.

The shader has a static feathered ellipse in A space; there is no timed reveal
uniform. B's root scale/pose remain constant. Handoff rebases camera pose, velocity
and the remaining trajectory only after B covers the viewport inside the opaque
ellipse. Normal cancellation retains the visible B and returns the camera; only
unused or unusable failed GPU destinations are released. Explicit journey reset
restores the cached initial pair/phases without network requests. A fatal visual
failure still cannot manipulate ongoing audio.

The controls disable onward travel after reaching Nebula. Use explicit Reset to
review the first connection again; track changes never invoke reset.

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
