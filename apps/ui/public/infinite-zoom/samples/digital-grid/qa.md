# Digital Grid 0.2.0 — test-artwork QA

Created 2026-11-09 with shared creator guidelines v1.5. Status: **test pilot, artistic acceptance pending**.

## Tower experiment withdrawn (2026-11-09)

At the user's request the white/black tower experiment was completely removed:
no extra tower masks/material, black backing, attack bindings or propagation
adapter remain. Original 0.2.0 manifests, source-material masks, full multicolor
tower flow and packaging script were restored byte-for-byte from the pre-test
repository revision. Existing environment blackout remains unchanged. The shared
KickMonitor, music-reaction checkbox and bass frequency configuration remain in
the digital panel/immersive controls, explicitly labeled as unassigned. Bass
attack configuration is not connected to any mask; assignment is deferred to
the user's next step. Historical `.tmp/tower-attack-qa/` captures describe only
the withdrawn experiment and are not evidence of current application behavior.

## Application blackout control (2026-11-09)

The application panel now exposes **Wygaszenie otoczenia** for Digital Grid,
including immersive mode. A presentation-only adapter controls the normal
manifest's `environment` layer: immediate exact blackout, then a three-second
smoothstep reveal on disable using existing simulation evaluation steps. Light
layers are not replaced, recolored, reset or covered. The adapter preserves its
preference and brightness across scene parking and journey Reset. Pause freezes
reveal; no wall-time animation, engine change or audio manipulation was added.

Focused checks:

```powershell
node --experimental-strip-types --test tests/infinite-zoom-environment-blackout.test.mjs tests/infinite-zoom-digital-grid.test.mjs tests/infinite-zoom-scene-reveal.test.mjs
pnpm --filter ui build
node tests/infinite-zoom-integration.browser.mjs --digital-ui
```

Eight focused unit tests passed, including exact zero/one endpoints, a half-way
brightness of 0.5 at 90 steps, untouched protected phases, parking/pause/reset,
bridge forwarding and the existing insectoid reveal. Production build and
translation validation passed. The targeted authenticated browser check passed and exercises
the visible checkbox, paused frame changes, retained preference/frame after
parking, reset, paused reveal, playback/resume and immersive controls with the
same audio element, canvas and WebGL context. The existing package motion/zoom
recording remains evidence for the unchanged protected artwork and masks; this
UI addition does not establish production acceptance of the known mask seams.

## 0.2.0 — exaggerated diagnostic colors

User-requested revision: much stronger visible cyan, white, orange, green, blue and violet before refining motorcycle boundaries. Mask domains, visibility/influence PNGs and delay maps were not edited. Original source and normal environment remain intact. Only the protected layers use the authored SVG luminance-to-cyan material variant, two composed existing delayed hue rotations and a periodic white pass. Untinted glow is deliberately reduced to avoid washing out the hues. No engine or application code was changed for this revision. See `diagnostic-color.json` for the material/operator contract.

The updated focused unit tests validate the material asset and full 2pi hue excursion in every light group, plus the existing blackout/pause/reset checks. The 28-second WebGL2 recording covers complete cycles, blackout, eight-second reveal and combined zoom/pan. Frame samples now include every simulation second. The browser palette check counts highly saturated colors only inside strong motorcycle masks before camera travel; all six colors must each occupy more than 500 pixels in a sampled frame. This verifies actual rendered material colors, not only changed pixels or descriptor values.

Visual review of the 3-, 8- and 10-second samples shows saturated blue/violet/orange, a light neutral pass, and clearly separated green/cyan/orange bands respectively. Remaining wheel/body timing seams are deliberately retained for later mask refinement. Colored texture includes shadow variation from the registered source. Disabling color modulation leaves the cyan diagnostic material; it does not restore original white panels. The white pass is synchronized across groups, while the hue propagation retains separate spatial delays. This is deliberately exaggerated mask inspection, not final artistic lighting.

The detailed original baseline checks below describe revision 0.1.0 unless superseded above.

## Executed checks

From `apps/ui`:

```powershell
node --experimental-strip-types --test tests/infinite-zoom-digital-grid.test.mjs tests/infinite-zoom-pilot.test.mjs
node --experimental-strip-types scripts/check-messages.mjs
node tests/infinite-zoom-digital-grid.browser.mjs
```

Six unit checks passed, including asset dimensions/critical references, package validation, six source-material light groups, unchanged protected behaviors in blackout, continuous opacity strength, pause/reset and existing pilot controls. Translation validation passed for Polish, English and Spanish.

The browser harness used the actual existing engine and WebGL2 renderer with RGBA16F color output. It recorded 28 simulation seconds (delayed startup plus two 12-second cycles), a complete 8-second environment reveal, blackout from zero, combined lights, camera zoom and pan. Checks passed for fully opaque coverage, exact black sky sample, active lights during blackout, render-only pause, exact reset and no runtime/shader errors. This is offline test playback, not a second application clock. No music or application audio integration was modified.

Evidence lives in repository-local `.tmp/digital-grid-qa/`: `motion.webm`, `report.json`, initial/blackout/time-series PNG captures. Inspect the recording for visual acceptance; numerical pixel changes alone do not prove readable flow. The neutral plate, source-mask overlay, blackout zero/three-second frames and zoomed combined-effects frame were inspected visually. Material masks follow real bright panels, seams, dome ribs and road lights; black gaps stay fixed. White panel shading and long body/wheel strips change locally rather than changing exposure of the whole image. No geometry deformation is assigned.

## Remaining limitations and uncertain boundaries

- Source is 1672×941; registered runtime texture/masks are 1600×900. Artwork coordinates are 3840×2160, **not native raster 4K**. Close zoom softens small details.
- Classification between wheel rings and adjacent body panels can change timing direction across white material. Review both boundaries and the angular phase wrap in close motion before production acceptance.
- Dome lighting is a spatially staggered field across integrated ribs. It is not individually routed along each hexagonal branch. Wheel and body timing supply the authored longitudinal strip flow.
- Some cyan road reflections are intentionally protected in blackout; neutral floor reflections are excluded. Fine antialiased highlights and threshold falloff need artistic review; blackout deliberately exposes the source-material selections sharply.
- Full-screen inspection and sampled zoom frames do not establish every aspect ratio, all shadow ramps or a manual review of every recorded frame. RGBA8 fallback, context recovery and an authenticated `/animations` UI session were not re-tested for this new package.
- Historical 0.1.0 limitation: blackout was only package/API-tested. The application control described above supersedes that limitation.
- No engine extensions were made. The only engine-directory edit for this task is the declarative `digital: "digital-grid"` studio catalog entry; animation implementations, renderer, clocks and audio lifecycle remain unchanged. Existing uncommitted engine changes predate this task.
