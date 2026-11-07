# Revision 0.3.0 — one distant volcanic plume

Follows [shared artwork-authoring-guidelines v1.0](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).

The right-hand distant volcano is the only new animation target. Preserve the
existing artwork, foreground effects and music lifecycle. Use existing `flow`,
`bend`, `opacity` and local `glow`; no engine extension or new clock/renderer.

## Production plan

- Preserve `source.png`. Generate a clean-background edit, using only an authored
  local, softly blended patch above the right crater. Keep the crater, silhouette
  and lava out of the replacement. The original opaque plate remains the coverage
  base. Remove the original distinct lower smoke column so the new plume has no
  fixed duplicate underneath. Upper storm clouds remain the scene background.
- Generate one isolated ash plume with genuine soft alpha, warm reflected light
  only near its narrow base, and transparent margins. Record original dimensions,
  prompt and hashes; register the asset with SVG without pretending it is native 4K.
- Separate asset alpha, patch visibility, smoke visibility/occlusion, deformation
  influence, vector field and basal illumination. Cloud/ash edges need soft alpha;
  the crater rim and neighboring mountains remain stationary and opaque.
- Pin the narrow base to the crater with zero spatial influence. Increase flow
  and bending smoothly toward the upper plume. Keep combined maximum deformation
  inside the authored transparent margins; use finite existing contract limits.
- Opacity varies gently in the upper body; it never disconnects the base. Glow
  is limited to the small warm basal region, with no frame-wide exposure change.
- The proposed motion is deterministic periodic deformation, not upward physical
  advection, new particle emission or endlessly growing smoke.

## Required review

Inspect neutral, cleaned background, masks, separate full flow/bend cycles and
combined motion at full strength, including camera zoom. Check base attachment,
crater/rock invariance, patch seam, no residual static column or clipping at plume
extrema. Compare pause, Reset, scene restoration, context restoration and coverage.
Record measured motion and visual limitations in `qa.md` before claiming readiness.

Uncertain areas: smoke-to-storm-cloud boundary, hand-authored clean-patch blend,
matching regenerated background lighting, and soft plume-to-crater attachment.
This remains a test artwork requiring artistic acceptance.

## Delivered authoring choices

- The first plume was too pale/sharp for the far plane. A separate image-tool
  refinement is selected at runtime; both original draft and refinement remain.
- Plume is registered at source x1122,y6 with width/height220. Generated source
  tip near630,1200 in the1280 square maps to the crater near1230,212.
- Flow amplitude36, .075 Hz; bend amount180, .09 Hz. Their shared influence is
  zero below source y197 and rises smoothly upward. A virtual bend pivot at
  artwork y1100 supplies useful leverage; the influence mask pins the true base.
- Flow RG ranges .35.. .65 and .30.. .46 cap vector magnitude to .5. Flow travel
  <=18 artwork pixels plus local bend <=47 fits the50+ source-pixel lateral
  visibility margin. Top margin accommodates vertical flow; soft tip attenuation
  helps merge the plume into the sky. No rigid terrain is deformed.
- Upper opacity .78±.16 at .087 Hz. Basal glow amount .2, threshold .02, .16 Hz
  uses a separate small footprint. Crater terrain is excluded from smoke alpha.
- Source filenames, exact prompts, hashes and actual delivered dimensions are
  retained. See `qa.md` for measured motion and outstanding visual acceptance.
