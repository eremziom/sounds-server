# Underwater Cavern — third demonstration artwork

Psychedelic underwater rock arches, turquoise depth, luminous coral and kelp.
The central passage is the destination entrance at `(1920,1080)`. This package
is the third world in the Forest -> Nebula -> Underwater Cavern demo. Nebula
authors its small visible entry portal; this terminal world has no onward portal.

## Deliverables

- `backdrop.png`: exactly **3840×2160**, complete opaque painted scene.
- `foreground.png`: exactly **3840×2160**, genuine RGBA transparency, open center,
  separately generated coral/kelp overlay; not a segmented duplicate of the base.
- `influence.svg`: 3840×2160 motion weights, calmer around the entrance.
- `manifest.json`: schema v1, two independently animated layers, local critical
  resources and a center anchor. The backdrop only pulses, preserving coverage;
  foreground motion uses gentle masked translation, wave and separate pulse.
- `generation-prompts.json`: exact prompt set, tool and processing provenance.

Generated using built-in `image_gen`. The generator returned **1672×941** despite
the exact 4K request. Final PNGs were normalized to **3840×2160 (16:9)** using the
same local upscale approach as Forest/Nebula: System.Drawing HighQualityBicubic,
SourceCopy, HighQuality pixel offset and TileFlipXY sampling, preserving alpha.
These are upscaled demonstration images, **not native 4K**. No empty border or
letterboxing was added. Generator originals remain in its generated-image folder.

## Validation

From `apps/ui`: `node tests/infinite-zoom-renderer.browser.mjs` includes this third
package. It checks actual decoded dimensions and backdrop opacity, foreground
alpha and open center, independent layer animation, reset, safe camera movement,
portrait/wide coverage, resource admission and cleanup. Its synthetic transitions
exercise technical compatibility; the actual Nebula-to-C portal is covered by the three-world chain oracle.
Captures and numerical evidence are saved in `.tmp/infinite-zoom-artwork/`.

Each package uses two RGBA8 image textures and one exact full-resolution R8 mask:
74,649,600 bytes (71.19 MiB), before render targets/driver overhead. The three-world
cache uses 213.57 MiB of texture storage and fits the unchanged 256 MiB admission
estimate at supported target sizes. No image dimensions were reduced.
