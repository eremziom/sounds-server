# QA — insectoid planet, 2026-11-07

Experimental artwork prepared under shared authoring guidelines v1.0. Technical
passes and sampled visual inspection are separate from final artistic acceptance.

## Revision 0.3.0 — one distant volcanic plume

Current package has eight applicable controls and fifteen compositing layers.
The original `source.png` is retained, along with the generated clean-background
edit, smoke draft and selected darker/softer smoke refinement. Exact prompts are
in `smoke-prompts.md`, hashes/dimensions in `production.json`, and authored
boundaries/limits in `smoke-authoring-brief.md` and the packaging scripts.

The runtime plate incorporates only a softly blended patch above the right-hand
crater. All inherited overlays sample this same cleaned plate, so none reintroduce
the old fixed smoke column. Actual decoded-asset comparisons verify that pixels
outside the conservative local patch bounds remain unchanged within two channel
levels of rasterization tolerance. Terrain is explicitly excluded from the patch.

Flow uses a seeded smooth vector map and a height-dependent influence mask.
The base at source y>=197 has zero spatial influence; the same ramp protects it
from wind bending and opacity changes. The bend has a virtual pivot below the
crater (artwork y=1100); actual attachment is separately pinned by the mask. This
provides a readable sway on the small asset without changing the engine's
full-canvas bend definition. Upper opacity stays .62.. .94, while basal glow has
its own small mask. Estimated critical texture storage is 51,840,000 bytes.

Validation performed with the commands below: 20 focused unit tests and production
build pass. Full application integration also passes: the eight real controls,
new flow/bend Solo actions, paused audio, unchanged canvas/context, journey
restoration and critical-readiness failure/retry are covered. WebGL tests pass
full 15-second cycles for all eight operators,
combined full-strength effects, pinning, actual alpha, local backing, context
recovery, exact parked-scene restoration, pause, reset, zoom and portrait/wide
coverage. Flow/bend preserve every sampled pixel in a band containing the base
and crater (source x1200..1269, y198..245) throughout all sampled phases.

At 960×540, flow changes 1,169 pixels by >8 channel levels (max 44), and bend
changes 2,443 (max 54). These are localized effects; pixel changes alone do not
establish artistic acceptance. Neutral, flow/bend peaks, combined sampled frames,
and a camera zoom toward the volcano were visually inspected. The first plume
was too bright/sharp; the selected image-tool refinement darkens it and softens
the upper boundary. No still inspection is presented as full motion approval.

The motion run with `--insectoid-motion` also passes and regenerates two review
videos at repository root: `.tmp/infinite-zoom-artwork/insectoid-motion.webm`
(full scene, 15 logical seconds), and `insectoid-smoke-motion.webm` (camera zoom
on the plume, another 15 logical seconds). Selected zoom-cycle frames are saved
alongside them. These are review captures, not a frame-rate benchmark.

Remaining review: soft patch/cloud seam, the manually traced crater rim, perceived
wind reversal over long viewing, and whether upper wisps blend enough into the
storm. Flow is periodic deformation, not sustained upward advection or emitted
particles; source resolution limits extreme zoom. Final artistic approval and
target-device performance remain outstanding. No engine animation code changed.

## Earlier revisions (historical results)

## Checks performed

Commands from `apps/ui`:

```
node --test tests/infinite-zoom-insectoid.test.mjs tests/infinite-zoom-pilot.test.mjs tests/infinite-zoom-phase2.test.mjs
node tests/infinite-zoom-renderer.browser.mjs --insectoid-only
node tests/infinite-zoom-integration.browser.mjs
```

Production build from repository root: `pnpm --filter ui build`.

Revision 0.1.0 passed these checks with 17 focused unit tests. Revision 0.2.0
adds guarded heat refraction and an independent generated-alpha vapor overlay.
The updated focused unit run passes 19 tests; build, WebGL verification and the
full application integration test pass. The initial concurrent integration run
hit a browser-protocol evaluation timeout; its standalone rerun passed both
normal playback/lifecycle and critical-readiness failure/retry scenarios.

Actual WebGL2 renderer: 15 seconds of fixed-tick simulation for each individual
effect and another 15 seconds combined at 100%. These cover full authored cycles,
including the slowest cloud envelope (13.70 s) and color shift (14.29 s).
Stationary rendering preserves exact phases/pixels. Reset restores the neutral
frame; switching away/back and context loss/recovery restore the exact frame.
Camera movement/zoom, portrait 360×640 and wide 1280×360 retain opaque coverage.
The application integration verifies the real scene selector, six applicable
controls, Solo, paused audio, same canvas/context and existing journey behavior.

At 960×540, maximum pixels differing from neutral by >8 in any channel:

| Effect | Changed pixels | Frame share | Maximum channel difference |
| --- | ---: | ---: | ---: |
| Breathing | 9,072 | 1.75% | 154 |
| Heat refraction | 949 | 0.18% | 109 |
| Pulse | 39,835 | 7.68% | 76 |
| Vapor fading | 4,249 | 0.82% | 87 |
| Color | 41,172 | 7.94% | 159 |
| Glow | 26,784 | 5.17% | 107 |

Five explicitly selected rigid rock/rib/horizon sites remain exactly unchanged
for every sampled individual and combined frame. Separate full-map safety tests
check membrane inverse sampling at both scale extrema, including 1.25 overall
modulation: samples remain inside the traced interiors with a bilinear guard.
This establishes sampling safety relative to the authored polygons, not a proof
that every hand-traced boundary semantically matches the material.

Revision 0.2.0 adds exhaustive distance-guard checks for heat sampling and actual
WebGL pixel comparisons outside its mask support: those pixels remain identical
through sampled wave phases. Vapor has real localized alpha, bounded to .24 in
the registered asset, and fully transparent sky/foreground margins. Opacity
stays within 0..1 over full cycles; edits preserve phases. Two transparent wisps
fade independently and contain no duplicated scene backing. Three authored
foreground-rock exclusions keep those silhouettes in front of the wisps.

## Visual review and remaining uncertainty

Inspected neutral, mask atlas, effect peaks, combined frames at multiple phases,
and a camera zoom. Color remains localized to authored materials; cloud glows
preserve the painted cloud texture. Foreground ribs retain their fixed outlines.
At maximum strength the membrane hue changes are deliberately conspicuous;
their interior mask margins and fine fibres need the user's visual assessment
in continuous playback. The smaller source resolution softens details on zoom.
For revision 0.2.0, inspected neutral, opacity/wave extrema and combined/zoomed
frames. Heat shimmer is intentionally subtle in the full frame: use Solo and
zoom for review. Hand-traced heat and rock-occlusion contours remain the main
uncertain boundaries. Vapor fades in place, rather than rising or advecting.

Evidence is written to `.tmp/infinite-zoom-artwork/insectoid-*` at repository root.
Optional motion capture: append `--insectoid-motion` to the renderer command;
this records a 15-second logical combined cycle as `insectoid-motion.webm`.
The capture is a review artifact, not a frame-rate benchmark.
The revision 0.2.0 motion capture was regenerated with both new effects active;
the renderer command with `--insectoid-motion` completed successfully.

Not claimed: native 4K, independently moving depth planes, full silhouette
inflation, random lightning, physically advected clouds, AI inpainting, target
device performance certification, or production/artistic acceptance. No engine
extension, extra renderer, clock, audio owner or change to the Loop is included.
