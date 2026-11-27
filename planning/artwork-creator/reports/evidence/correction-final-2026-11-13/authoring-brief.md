# Gate/drone correction pilot, v0.0.3

Shared rules: [artwork-authoring-guidelines.md](../../../../../apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md), **v1.7**, 2026-11-09.
Canonical repository path: `apps/ui/src/engines/infinite-zoom/artwork-authoring-guidelines.md`.
This is an isolated KRE-00 correction of the seed-500 source, not a published artwork.
Source resolution is 1024×576; logical canvas 3840×2160 does not imply native 4K.

Keep the original composition and source pixels. The moving drone is integral
to the original image. Reuse its SAM visibility mask and independent lamp mask;
prepare an inpainted backing with a smaller explicit removal area including the
original baked glow. Preserve every pixel outside that area by composition.
One 16-second eased Bezier flight crosses behind the left pillar, then in front
of the distant garden and right side of the gate, and exits the right edge.
The endpoint is outside the full frame so one-shot travel does not remove a
visible object. All drone parts share travel, pivot (1200,840) and stationary occlusion.
The existing `occlusionMaskAssetId` clips both hull and lamps even in blackout;
an extra front image layer is unnecessary. The pillar mask is SAM-assisted,
using points/box explicitly authored for this source. It is not a universal locator.

Use existing luminous vine edges, stone fissures and leaf highlights only. Select
many small chromatic ridges in three spatial groups (west, gate, east); exclude
flat blue stone faces, dark holes, the drone and its removed glow. The selection
intersects source material; paths are corridors/timing guides and draw no lines.
Record actual selected pixels and overlays; do not claim 100 suitable details
just because the original brief requested them. Dense botanical boundaries
and the continuity of cyan vines remain subjects of visual QA.

Independent impulse periods: 6/8/11 seconds, staggered phases. Separate grayscale
delay data follow the nearest authored vine polyline by normalized arc length.
`colorShift.delayMapAssetId` and `travelSeconds=3` use the existing runtime;
the 8-second color period must visibly repeat. Hue range π, saturation +0.35;
retain chroma and texture, avoid white emission washing out the color change.
No engine extensions are part of this correction. Leaf highlights far from a
vine inherit its nearest timing guide; this approximation needs explicit review.

Blackout hides environment and hull only, preserving animated material groups
and lamps from the first frame on an opaque black coverage layer. Smooth reveal
takes eight simulation seconds; pause freezes reveal, lights, travel and camera.
QA must include full cycles, the complete flight and pillar crossing, slow dark
reveal, return to blackout, camera zoom, portrait/wide coverage and exact Reset.
Capture video and beginning/crossing/end/flow frames. Review the pillar boundary,
rotating drone edge, inpainted sky and original glow footprint in motion and zoom.
Manual points, timing guides and mask review are explicit author interventions;
their presence must not be reported as autonomous creator capability.
