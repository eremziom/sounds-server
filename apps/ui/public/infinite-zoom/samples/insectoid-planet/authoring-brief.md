# Insectoid planet — animation test

## Revision 0.5.2 — high-attack sky lighting

Follows [shared artwork-authoring-guidelines v1.2](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).
See [the sky-specific brief](sky-authoring-brief.md): two separate masks derived
from guarded sky support and source cloud luminance/local texture, spanning all
eight horizontal sky sectors. HighAttack drives additive emission on existing
cloud openings; zero signal emits no light and never overlays a static plate.
Sky light is protected above the reveal curtain, whose full opacity now reaches
1 (correcting the historical .995 near-black limitation). Existing source-material
rim detail and lava remain independently animated. No new generated painting.

## Revision 0.5.1 — kick-driven membrane breathing

This parameter-only revision follows
[shared artwork-authoring-guidelines v1.2](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).
The three existing organic membrane interiors expand on each detected bass attack
and relax over the short kick envelope, with 1/60 s attack and .05 s release
smoothing. Their `scale` carrier is constant (0 Hz, pi/2 phase), so an attack is
never suppressed or inverted by an unrelated oscillator phase. Silence, missing
analysis and disabled music response relax to rest. The existing scale control
still attenuates the motion. No other effect is bound to kick.

Existing x=.06/y=.045 bounds, pivots, separate visibility/influence masks and
sampling guard are retained. Rigid ribs, silhouettes, glazing and surrounding
architecture remain fixed; the full plate backs the moving interior texture.
The numerous source-material rim-light groups, emission timing, protected lava
and reveal controls are retained. No images, masks or generation prompts change.
The existing reveal's .995 near-black curtain remains a known v1.2 full-blackout
limitation; this bounded audio-binding revision does not claim to correct it.

Engine change (separate from artwork authoring): kick bindings initialize/reset
at their mapped zero-input minimum and decay toward it when missing. Continuous
signal bindings keep their neutral fallback. No new operator, clock or renderer.
Motion/zoom evidence and outstanding visual review belong in `qa.md`.

Follows [shared artwork-authoring-guidelines v1.0](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).

Revision 0.5.0 retries optional architecture lighting with actual source-derived
chitin masks, after rejection of the earlier drawn curves. See
[the new scene-specific brief](rim-authoring-brief.md). The original plate is
reused as the overlay image, with full-resolution material visibility, protected
glazing and independent timing masks. No new visible outline geometry is authored.

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

## Optional darkness reveal experiment — 2026-11-07

This revision follows [shared artwork guidelines v1.1](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).
Original generation briefs above retain their historical provenance. No image
generation or source repainting is used for this presentation variant.

- Retain the accepted textured impulse-lighting support: 19,822 material texels,
  three composition bands, four runtime groups and 48 ordered phases per 6-second
  cycle. Existing glass exclusions, facets, thickness and shadows stay intact.
- Insert a full-artwork black curtain above normal scene effects and below those
  four lighting layers. Start at 99.5% opacity. A source-registered plate copy,
  restricted to the existing `select-lava-seams` mask, keeps lava visible above it.
  It inherits the complete original lava layer, including colorShift/pulse/glow,
  so both copies evaluate the same phases and respond to the same live controls.
  Visibility and impulse timing remain separate; no new drawn outlines are added.
- Existing layer opacity follows a smoothstep reveal over exactly 3,600 existing
  fixed engine steps (60 simulation seconds). Curtain and protected lava copy both
  reach zero opacity. At completion the unmodified animated composition remains.
- The application adapter prepares this optional manifest variant; the ordinary
  `manifest.json` stays independently usable. Enabling the mode enables the rim
  layer. Its glow still follows the existing effect controls. Disabling the mode
  immediately restores normal exposure. Restart affects only the reveal; explicit
  scene Reset also rewinds it. Pause/suspension and parking freeze progress.
- The black texture is 16x9, normalized to the same artwork extent: 576 additional
  critical GPU bytes, no extra renderer, scheduler or engine operator.
- Review the full minute, representative intermediate views, combined effects,
  source-aligned material boundaries, context restore and portrait/wide zoom.

Uncertain boundaries: the existing chroma-based lava mask also admits some warm
reflection and plume pixels near the flows; these are visible in the dark opening.
Rim intensity depends on the current glow controls and the running 6-second phase.
The intended mood and reveal timing still require the user's visual acceptance.

### Renderer correction after user feedback

The original reveal used an unanimated lava copy and revealed banding from the
RGBA8 linear composition target. Artwork changes alone cannot recover detail
discarded by that target. Separately from artwork authoring, the application now
requests `highPrecisionColor`: the existing renderer uses RGBA16F when supported
and within its unchanged memory budget. Static screen-position dithering, below
one display-code level, is applied after linear-to-sRGB conversion. It has no time
input and cannot advance while paused. Source textures retain original dimensions
and 8-bit provenance; this change preserves intermediate composition precision.

The composition target costs 8 rather than 4 bytes per rendered viewport pixel.
Diagnostics report actual format/bytes. Unsupported hardware or insufficient
budget falls back to RGBA8, preserving readiness and coverage but retaining some
shadow banding. Precision is reconsidered on scene/viewport/context changes.
