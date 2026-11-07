# Insectoid planet — animation test

Follows [shared artwork-authoring-guidelines v1.0](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).

Revision 0.3.0 adds one distant volcanic plume under the same shared guidelines:
see [its detailed brief](smoke-authoring-brief.md) and [prompt set](smoke-prompts.md).
This includes a locally regenerated backing patch, independent alpha plume,
root-pinning influence, vector field, terrain occlusion and basal-light mask.

Asymmetric hostile volcanic planet: foreground chitinous membranes on the right,
midground city on the left, lava valleys, distant volcanoes and dense storm sky.
No geometric center, authored portal or change to the existing Loop.

## Application of the shared rules

- Independent groups: three membrane interiors; city amber lights; foreground
  cool reflections/edge seams; lava; wet ground reflections; three cloud pockets.
- Fixed areas: architecture, ribs, membrane attachment rims, rock, silhouettes,
  volcanoes and horizon. Depth is painted in several planes; these are not
  independent parallax cutouts. No rigid object receives breathing deformation.
- Visibility and deformation influence are separate grayscale maps. Membranes
  use hand-traced internal polygons with a three-texel edge feather. Influence
  uses conservative distance-to-boundary with three texels of sampling guard.
- Breathing uses local scale x=.06, y=.045, fixed per-membrane pivots, staggered
  0.112–0.173 Hz phases. Guard includes the existing maximum 1.25 modulation.
  Maximum inverse sampling travel is bounded by radius*.075/(1-.075).
  Influence is rounded down and cannot carry a sample beyond the guarded polygon.
- The original full opaque plate remains below every overlay. Only interior
  membrane texture deforms. No complete object displacement, inpainting or
  silhouette expansion is claimed; no duplicate moving silhouette is exposed.
- Material masks combine authored spatial boundaries with actual source chroma:
  warm seams, tiny lamps, molten cracks and cold specular detail. Neutral rock
  remains outside those data maps. No universal blurred blob masks for lights.
- Storm masks are separate soft internal-cloud illumination pockets, away from
  architecture/horizon. Three sharpness-16 glow envelopes have distinct periods
  (7.30, 9.17, 13.70 s) and phases. They are deterministic periodic glows, not
  random or physically simulated lightning. No new clock or renderer.
- Local colorShift → pulse → glow composition remains within existing hard
  intensity limits. Layer ordering preserves foreground occlusion. No engine
  extension is required; this package only authors existing operators.

## Review requirements and uncertain boundaries

### Revision 0.2.0: heat refraction and separate vapor

Uses shared guidelines v1.0 and existing `wave`/`opacity`; no engine extension.
The original painting, lamps, membranes and their parameters remain unchanged.

- Three hand-traced atmospheric pockets above lava carry local horizontal wave
  refraction: amplitude 18 artwork pixels, wavelength 260, frequency .65 Hz.
  Visibility and deformation influence are separate grayscale masks. Distance
  influence fades to zero before the border; maximum travel is 9.375 runtime
  texels including a conservative 1.25 factor, plus three texels of sampling guard.
  Background texture may shimmer inside pockets; adjacent boundaries stay fixed.
- A new AI-generated transparent vapor source is retained separately. Two wisps
  are registered over the left waterfall and central valley with alpha capped
  to .24. Real alpha preserves fine detail; no backing image is duplicated.
- Separate visibility windows isolate the wisps; three hand-traced foreground
  rock exclusions provide occlusion. Those rock contours require visual review.
  The vapor does not move, so no inpainted backing or travel extension is needed.
- Two `opacity` envelopes use .13/.17 Hz and independent phases, base .5 and
  amount .5. At full modulation they fade from 0 to 1 over the authored alpha.
  Disabling the operator leaves its neutral alpha 1; it stops fading, rather
  than hiding the layer. This existing engine behavior is explained in the UI.
- Full cycles, interaction with original effects, zero changes outside heat
  support, vapor alpha, rock landmarks, pause, zoom and Reset are QA gates.

Remaining uncertainty: heat is intentionally subtle in the full frame; inspect
it with Solo and zoom. Manual atmospheric/rock masks should be reviewed in motion
for small contour mismatches. Vapor fades in place; no rising/advection is claimed.

Check full cycles separately and combined at 100%, zoom toward the membranes,
then inspect attachments, fine ribs, lava/rock borders and tiny lamps. Check
pause/render invariance, Reset and restore after switching scenes. Inspect
portrait/wide crops for opaque coverage. Record evidence in `qa.md`.

The three membrane polygons are manually traced conservative interiors, not
semantic segmentation. Thin internal fibres are allowed to flex. Adjacent rigid
rib edges and highlights need visual review at zoom. Chroma masks can select
warm reflected light as well as emitters; wet ground and foreground lighting
must be assessed in motion. The delivered artwork remains an experimental test
scene; final artistic approval and target-device performance are outstanding.
