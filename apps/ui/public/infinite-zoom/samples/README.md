# Forest and Nebula demonstration artwork

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


These version `0.1.0` packages implement the first-slice artwork subset using the
existing engine. The application's persistent browser session starts with a small
Nebula already embedded in Forest's distant clearing. The transition control
starts one authored Forest → Nebula camera approach. Nebula is terminal in this
bounded slice; no unauthored reverse portal is introduced. Explicit reset returns
to the complete Forest+Nebula composition without reloading either package;
pause, track end and track changes preserve the current journey.
The `foundation/` technical fixtures remain available for regression tests.

## Files and visual direction

Each of `forest/` and `nebula/` contains:

- `manifest.json`: validated schema v1, a 3840×2160 canvas, stable layer IDs,
  critical local assets, and a `center` transition anchor at `(1920, 1080)`.
  Forest additionally authors `portal.id`, `region`, `scale`, `durationSeconds`
  and a versioned `destination` manifest/anchor link. Nebula has no onward portal.
- `backdrop.png`: a complete, opaque scene covering the entire artwork rectangle.
- `foreground.png`: a separate RGBA foreground, with soft transparent edges and
  an open central composition for the transition anchor.
- `influence.svg`: a 3840×2160 linear red-channel motion weight. This is not a
  visibility mask and does not determine image alpha or transition reveal.

The user selected psychedelic imagery. Forest includes twisted trees,
fluorescent mushrooms and a luminous river. Nebula uses multicolored cosmic
swirls, luminous filaments and a bright central vortex. Foregrounds are separately
generated overlays, not segmented copies of the backdrop; some foreground motifs
also occur in the complete scene behind them.

## Animation and coverage limits

Both layers have independently evaluated animation. The opaque backdrop uses
gentle `pulse` only. The foreground combines masked `translate`, `wave` and a
separate pulse frequency/phase. The Forest mask emphasizes the canopy over the
lower river, while Nebula emphasizes the outer clouds over the central anchor.
Forest's wave animates the foreground river ribbons as well as vegetation; this
is a flow suggestion, not a flow-map water simulation.

The engine's current base-layer constraints remain authoritative. There is no
authored out-of-canvas extension, spatially deforming base or unrestricted camera
travel. The full opaque base supports the existing coverage-safe zoom/move/rotate
trajectories and the authored portal `zoomThrough`; unsafe camera poses must still
be rejected. No depth, flow, detail LOD or production pipeline is introduced.

## Generation provenance

The four raster images were generated with the built-in `image_gen` tool using
the exact prompt set in `generation-prompts.json`. Despite a request for
3840×2160, the tool returned 1672×941 images. The user explicitly approved local
scaling to 3840×2160 with alpha preservation. These are **upscaled demonstration
assets, not native 4K**. Original files remain in the tool's generated-image
directory; all runtime assets are stored here in the repository.

Scaling used System.Drawing `HighQualityBicubic`, `SourceCopy`, `HighQuality`
pixel offset and `TileFlipXY` edge sampling. The slight source aspect discrepancy
was normalized to 16:9. Foreground alpha is retained, including a residual
1/255 alpha at Nebula's center; it is not a fully empty pixel. The art direction
is user-selected; final visual acceptance of these generated compositions is
still separate from technical validation.

## Verification

### Embedded-portal implementation and evidence

The first connection uses a static ellipse in Forest artwork space at
`(1920,1030)`, radii `(90,48)`, feather `0.24`, and a fixed B scale of `0.055`.
At a 640×360 full-frame view the ellipse is approximately 30×16 screen pixels.
The sixteen-second approach moves/zooms one shared camera; no timed reveal,
independent B enlargement or load-on-travel remains. The small portal, edge blend
and pacing are an initial authored composition for user review, not final art
approval. The existing images were not regenerated or retouched.

Current automated evidence:

- 77 focused engine tests pass, including validated portal schema, noncentral
  B anchor/off-center A region, shared-camera landmark mapping, cancellation and
  readiness cleanup on destination failure/cancellation/budget refusal.
- The WebGL2 harness passes the authored portal oracle: frozen-camera invariance,
  initial pair readiness, constant placement, rollback retaining B, portrait/wide
  coverage, context recovery, explicit reset during context loss, synchronous
  cached-pair reset, and exactly equal handoff pixels on the test machine.
- Application integration checks the destination's critical load before Play,
  preserved journey across tracks, mode switches, renderer/audio reuse and
  failure isolation. Travel and explicit Reset make no artwork network requests.
- The 330-second stability run completed in 332.944 s, with 310.355 s measured
  audio, 7 track changes, 13 starts of the authored approach and 12 explicit
  resets between repeats. High stayed selected; final p50/p95 were 6.9/7.0 ms
  over the retained frame window. All tracked GPU objects and bitmaps were zero
  after logout. See `.tmp/infinite-zoom-portal-stability.json`.

The GPU ellipse/pixel oracle disables internal layer motion to isolate camera
projection. Other sample and application tests retain animated layers. Headless
metrics are device-dependent, and the full stability run preceded the final
reset-during-context-loss edge fix; the dedicated GPU test and application
integration were rerun after that fix. Earlier technical results below describe
the previous transition implementation, not the new visual contract.

From `apps/ui`, run:

```text
node tests/infinite-zoom-renderer.browser.mjs
```

The existing WebGL2 harness now additionally loads both real packages through
the actual loader and renderer. It validates decoded dimensions and opaque base,
visible foreground contribution, independently changing layer behavior outputs,
background animation, foreground alpha, exact logical reset (GPU channel
tolerance 2/255), coverage at zoom/move/rotation and portrait/wide resize,
isolated synthetic placements in both directions, cancellation with smooth rollback,
rejection of a transparent destination base, and GPU texture cleanup. Each package
has three critical RGBA8 textures (approximately 94.9 MiB before render targets
and driver overhead); the tested pair fits the current 256 MiB admission estimate.

The pair's measured admission estimate is 199,065,600 bytes (189.84 MiB) for
critical textures plus a 921,600-byte target at the test viewport (640×360).
This excludes driver overhead, browser framebuffers and retained CPU images;
it is not a driver-level GPU memory measurement.

The renderer harness writes numerical evidence to
`.tmp/infinite-zoom-artwork/verification.json` at the repository root and initial,
animated and destination PNG captures alongside it. These are reproducible local
test artifacts, not additional runtime assets. The separate authored-portal GPU
test additionally verifies the actual Forest portal: two worlds ready initially,
no appearance on command, frozen-camera invariance during approach, fixed root
placement, off-center source region, context recovery, rollback retaining B,
reset without network reload, and pixel-equivalent handoff. It saves
`portal-initial.png`, `portal-approach-*.png`, `portal-handoff.png` and
`portal-destination.png`. Layer motion is disabled only for that pixel oracle;
the isolated sample checks still run the actual animation behaviors.

For application acceptance on the selected Forest/Nebula packages, also run:

```text
node tests/infinite-zoom-integration.browser.mjs
node tests/infinite-zoom-stability.browser.mjs
```

The latter uses 330 seconds of wall time with real generated-tone audio playback,
multiple track changes, context loss/recovery, visibility/buffering suspensions,
resize and display switches. Repeated approaches use the explicit Reset control;
this is recorded as `explicitResets`, separately from nonresetting track changes.
It writes `.tmp/infinite-zoom-portal-stability.json` with
the test machine/browser, frame-time samples, bounded resource history and logout
cleanup. Buffering and visibility events are emulated. Headless measurements
cannot guarantee frame rates on other hardware or replace final artistic review.

### Earlier technical verification — 2026-11-05, before embedded portal correction

- `node --experimental-strip-types --test tests/infinite-zoom-*.test.mjs`:
  74 tests passed.
- `node tests/infinite-zoom-renderer.browser.mjs`: passed for both real packages,
  including rollback, invalid coverage, camera/resize and texture cleanup.
- `node tests/infinite-zoom-integration.browser.mjs`: passed; readiness and
  cancellation, blocked-play retry, both scene directions, preserved state across
  track changes, display modes, reset and audio isolation on renderer failure.
- `node tests/infinite-zoom-stability.browser.mjs`: passed; 333.586 s session,
  314.824 s measured audio, 7 track switches and 14 requested transitions.
  High/renderScale 1 remained selected at every checkpoint. Post-transition
  checkpoints retained one artwork and four textures (three assets and target).
  Logout left zero live tracked textures, buffers, programs and ImageBitmaps.
- Machine: Ryzen 7 7800X3D, Radeon RX 7800 XT, Windows x64,
  Headless Chrome 156.0.8078.80, 1280×720 device viewport, DPR 1.
  Final p50/p95 frame intervals: 7/8 ms; percentile samples retain only the
  most recent 600 frames, not the entire session. Earlier focused GPU checks ran
  concurrently during part of this run, so this is stability evidence rather
  than an isolated performance benchmark.

Saved rendered frames were inspected for both compositions. Forest retains the
visible central river/clearing and Nebula the central vortex; both foregrounds
blend into the full backdrop. Final artistic acceptance remains with the user.
