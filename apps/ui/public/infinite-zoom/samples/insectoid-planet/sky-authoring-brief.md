# High-attack cloud openings — revision 0.5.2

Follows [shared artwork-authoring-guidelines v1.2](../../../../src/engines/infinite-zoom/artwork-authoring-guidelines.md).
The source is the existing 1672x941 painting, registered to the existing 1600x900
runtime plate; no image generation, repainting or claim of native 4K.

Extract numerous bright cool cloud ridges/openings across the full width of the
sky from source luminance and local texture. A separate conservative authored
sky/horizon/architecture stencil excludes mountains, volcanoes, buildings,
spires and antennas. Visibility and emission-influence maps remain separate:
the stencil defines safe sky support; source-derived grayscale detail defines
which bright cloud material emits. Preserve dark gaps and painted cloud texture.
Exclude the generated volcanic plume's alpha footprint expanded by 55 source
pixels, covering its authored maximum flow/bend travel and filtering margin.
This conservatively withholds some light in clear sky adjacent to the plume;
it prevents cloud emission from painting over the separately moving smoke.
No geometric glow spots, detached points or global exposure flash.

Each detected highAttack drives emission strength 0..1, constant carrier phase,
1/60 s attack and .045 s release. The upstream high envelope lasts 100 ms.
Existing glow controls still attenuate/disable it. Silence has exactly zero
emission. Ribs, membranes, lava, mist and previous cloud glows retain their
operators and timing. No spatial deformation or newly exposed background.

The existing source-material chitin groups supply rich architectural light;
new cloudy detail provides additional distributed material-light sites. A new
additive-emission layer remains above the reveal curtain: its high-attack light
works from the first frame in darkness without displaying a static cloud copy.
Use the same source RGB with cool-white emission; do not flatten highlights.
The curtain must reach opacity 1 for true environmental blackout, then follow
the existing smooth 60 s reveal. Opaque base coverage is retained.

Engine extension, separate from artwork authoring: schema 2 emission-only
additive layers, restricted to glow operators and forbidden as coverage bases.
No new behavior, simulation clock, renderer, audio graph or runtime generation.

Review the stencil, source-detail mask and steady lighting before motion; then
100 ms impulses, silence, combined effects, full frame and zoom, pause, context
recovery and black-to-normal reveal. Sky boundaries are manually authored and
conservative; thin spires/antialiasing and mountain edges need explicit review.
Keep uncertain boundaries and final artistic acceptance in qa.md.
