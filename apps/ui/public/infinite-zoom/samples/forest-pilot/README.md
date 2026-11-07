# Forest clearing — Phase 3 pilot

Draft package `forest-pilot@0.2.0`, schema 2. This is one scene for reviewing the
production boundary inside `/animations`; it is not an approved final art library.
No image-generation API is called by the authoring script or runtime.

## Artwork and ownership

The unchanged Forest sample backdrop is the opaque 3840×2160 plate. Its existing
transparent foreground supplies the parallax layer. Newly authored organic SVG
layers contain pollen, a hanging bud, a mushroom, a fern, upper/lower mist, water
reflections/trails and luminous spores. Pulse and colorShift affect feathered
regions of the original plate. Masks separate visibility from motion influence.

Every new object has complete plate pixels behind it. This tests clean-plate
coverage without inventing an AI inpainting result: the original raster's baked
objects have not been segmented out or reconstructed. Painted/vector style
integration and eventual semantic segmentation/inpainting remain artistic QA.
See `production.json` for provenance and the outstanding review checklist.

All layers share 3840×2160 artwork coordinates. SVG object layers initially decode
at 1280×720, maps at 960×540, and the fern has optional 3840×2160 full-frame detail.
These are explicit asset resolutions, not claims of a newly generated native-4K
painting. The critical texture admission estimate is 108,864,000 bytes, plus the
viewport target and driver overhead. The fern detail adds 33,177,600 bytes when
eligible; failure/budget refusal keeps the valid lower level.

| Operator | Authored element |
| --- | --- |
| translate | drifting pollen above the stream |
| rotate | hanging bud on the upper-left branch |
| scale | additional small mushroom on the right bank |
| parallax | independent foreground with radial depth |
| bend | left fern, motion gradient pinned at its base |
| wave | stream reflections |
| displace | upper haze, linear RG field |
| flow | lower water trails, composed-UV field sampling |
| pulse | feathered left mushroom region |
| opacity | lower mist |
| colorShift | feathered right-bank plant region |
| glow | luminous spores (local emission, not bloom) |

## In-app review

Select **Forest clearing — 12-behavior pilot** on the protected `/animations`
page. Confirmed music playback advances its one fixed-step clock. Pause/end keep
the scene frozen; controls may change strength at the existing phase while paused.
Each checkbox enables an operator; sliders cover 0..100% of the authored envelope.
**Only this** disables the other operators, preserving their phases and objects.
The default is all effects at 100%, with deliberately exaggerated review ranges:
pollen travel ±160/90 artwork pixels, bud sway ±0.11 rad, mushroom scale ±8/10%,
fern bend 256 px, reflection waves 90 px and field deformation 180 px. Field maps,
mist opacity and highlight sizes also increase visibility; rendered displacement
still depends on map values, depth, influence and viewport size. Cycles last
2.5–5 seconds. These are test envelopes, not final production art direction.
**Test: all at 100%** and **Only this** restore full strength; the subtle preset
sets 25%, and neutral disables effects while retaining slider values. Enable
camera movement to inspect depth/parallax: it zooms to log scale 0.65 and pans
±600 px on three-second segments. A stationary camera cannot show parallax.
Immersive mode has a collapsible copy
of the same controls, using the existing canvas and renderer.

Selecting the pilot freezes and saves the original three-world journey, including
camera trajectory/velocity, bookmarks, phases and Loop intent. Only the active
scene is GPU-resident. CPU source leases stay bounded for return without decoding
again. Returning restores the exact saved composition. The explicit selection is
a studio view switch, not a new zoomThrough portal or a fourth item in the Loop.

Reset in the pilot rewinds that test scene, preserving its controls and the parked
journey. Reset in the journey retains its original semantics. A failed load leaves
the old frame intact; a failed GPU replacement rebuilds it from retained leases.
Selection/visual errors never pause or seek already playing music.

The current replay schema does not encode scene switches or studio controls.
Entering this pilot stops recording and marks the retained journey prefix
`complete:false`. Export is disabled in the pilot. Reset in the journey begins a
new complete recording; preview time is not misrepresented as reproducible data.

## Rebuild and validate

From `apps/ui`:

```sh
node scripts/create-forest-pilot.mjs
node --experimental-strip-types --test tests/infinite-zoom-pilot.test.mjs
node tests/infinite-zoom-renderer.browser.mjs --pilot-only
node tests/infinite-zoom-integration.browser.mjs
```

The WebGL fixture compares neutral/single-operator pixels for all 12, decode/GPU
failure rollback, context recovery, exact journey return, cache reuse, portrait/
wide coverage and bitmap cleanup. Preview frames are written under
`.tmp/infinite-zoom-artwork/forest-pilot-*.png`. The application test checks the
actual selector, solo/strength controls, immersive access, paused tick retention,
playing-audio isolation and the same canvas/context. Technical passes do not
replace user review of style, halos, deformation quality or production hardware.
