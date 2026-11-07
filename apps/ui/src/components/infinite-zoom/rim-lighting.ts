import type {ArtworkInstance} from "../../engines/infinite-zoom/artwork/artwork-instance.ts";

/** Application presentation state only; the existing engine owns all phases. */
export function setRimLightingVisibility(instance:ArtworkInstance,enabled:boolean){
  if(typeof enabled!=="boolean")throw new Error("Invalid rim visibility");
  for(const layer of instance.manifest.layers)if(layer.id.startsWith("chitin-light-"))instance.setLayerTransform(layer.id,{opacity:enabled?1:0});
}
