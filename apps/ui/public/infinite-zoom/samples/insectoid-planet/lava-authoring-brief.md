# Downhill volcanic color travel — revision 0.5.4, 2026-11-09

Follows [shared artwork-authoring-guidelines v1.3](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).
Use the existing 1672x941 source painting and its registered 1600x900 runtime
plate. No generation, repainting, texture displacement or native-4K claim.

Three bounded cone-face domains select the left volcano, right volcano and
middle descending lava slope. Within them, source warm chroma and red-channel
brightness define the detailed material mask. Preserve thin branching seams,
source brightness variation and antialiased edges. Polygons bound the search;
they must not become visible geometric contours. Protect static dark rock,
clouds, smoke and architecture. Existing precise sky masks remain unchanged.
Inspect the crater rim and faint stream boundaries in the source and at zoom.

Keep material visibility and timing separate. Full-resolution visibility
identifies actual lava; an independent 400x225 grayscale field increases
continuously with source y, normalized separately for each cone. Fill timing
over the cone domain beyond the thin lava streams so filtering cannot make
their edges run ahead. Coarse timing never determines a visible material edge.

Start with the original orange everywhere. A smooth nonnegative cosine color
envelope then travels from summit to lower slope with up to five seconds of
delay. Rotate toward purple (hue -1.65 radians), then smoothly return toward
orange, repeating every twelve seconds; the return also travels downhill.
Retain source texture, with no added exposure pulse. Use the existing colorShift
control and fixed simulation clock. Pause, parked scenes and suspension preserve
phase; Reset alone restores the initial orange. Existing foreground lava,
membrane colors, smoke, rich distributed rim-light groups and sky impulses keep
their own operators and timing.

Complete-blackout support: clone the new animated lava layer above the reveal
curtain, retaining its full behavior and delay map, just as for the original
foreground lava. The protected copy starts colored and animated from the first
fixed steps, fades out with the existing smooth 60-second reveal, and is hidden
when the mode is disabled. Do not change curtain timing or opaque base coverage.

Engine extension, separate from artwork preparation: optional paired schema-2
colorShift parameters `delayMapAssetId` and `travelSeconds`. The shader samples
the authored delay on the same layer; CPU evaluation supplies bounded fixed-tick
phase and existing control strength. Legacy colorShift retains its signed sine
envelope. No new renderer, clock, audio owner or product control is introduced.

QA: overlay the source-derived material mask; compare initial orange, 2/4/6/8/
10/12/16-second gradients, pause, Reset, color control and blackout. Capture at
least eighteen logical seconds with all existing effects, camera movement/zoom
and context recovery. Inspect both full frame and zoomed lava branches, including
the returning orange wave. Report original source-resolution limits and uncertain
faint glow/stream boundaries separately from test results and artistic acceptance.
