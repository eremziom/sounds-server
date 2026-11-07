# Revision 0.5.0 — lighting actual chitin ribs

Follows [shared artwork-authoring-guidelines v1.0](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).

The user rejected thin approximate curves in revision 0.4.0. Do not reuse its
visible paths, ribbon image or sampled curve masks. This attempt must light
the original painted material itself. First inspect original crops and a static
material-lighting preview; only then add moving emission and the checkbox.

## Asset and animation approach

- Retain all existing source images. Reuse the runtime plate as the overlay image;
  no new visible stroke, invented wire, replacement building or altered silhouette.
- Inspect city and foreground ribs in enlarged original-image crops. Author broad
  support polygons around actual chitin bands, separately excluding glass,
  openings, sky, lamps and foreground occluders. Fine mask values derive from the
  source's local luminance/chroma, retaining worn facets, narrow glints and dark
  gaps. Source texture and mask determine the visible shape, not a timing spline.
- Material visibility maps use full runtime resolution. Separate low-resolution
  phase maps describe progress along each selected rib. Those maps only control
  emission timing and must never paint new visible geometry.
- The existing glow operator supplies local cyan/blue-green emission from actual
  source luminance. Forty-eight phase samples and four rendering groups allow
  six-second traveling packets within existing WebGL sampler/intensity budgets.
  No geometry deforms and no background is exposed. Fixed rigid ribs remain
  separate from existing membrane breathing masks.
- The optional overlay starts off. Its checkbox uses existing layer opacity in
  the React/application adapter, retaining phase, camera and audio. No new engine
  operator, CSS/SMIL clock, extra renderer or audio ownership.

## Review gates

Save original crops with coordinates, mask-on-source previews and steady-light
previews in `.tmp/chitin-rim-review/`. Inspect attachment to the actual material
and protection of membrane interiors/occlusions before implementing travel.
Then inspect at least two complete cycles, frame and zoom views, intersections,
phase-group joins and repeat boundaries. Tests must establish direction, exact
off-frame restoration and pause/context/scene/reset behavior; these do not
substitute for artistic acceptance. Report uncertain manual contours explicitly.

This is a new experiment requiring the user's artistic assessment, not a claim
that technical checks establish visual success.
