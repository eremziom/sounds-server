import type {ArtworkInstance} from "../../engines/infinite-zoom/artwork/artwork-instance.ts";

export const SCENE_REVEAL_TICKS = 60 * 60;

/** Presentation variant; the normal authored package remains independently usable. */
export function withSceneReveal(input: unknown): unknown {
  const manifest = input as {id:string; assets:unknown[]; layers:{id:string}[]};
  if (manifest.id !== "insectoid-planet") throw new Error("Reveal requires the insectoid scene");
  const lava=manifest.layers.find(layer=>layer.id==="lava-seams");
  if(!lava)throw new Error("Reveal requires the authored animated lava layer");
  return {...manifest, assets:[...manifest.assets, {
    id:"reveal-black", kind:"image", width:16, height:9, critical:true,
    uri:"/infinite-zoom/samples/insectoid-planet/reveal-black.svg",
  }], layers:[...manifest.layers,
    {id:"reveal-curtain",zIndex:18,imageAssetId:"reveal-black"},
    {...lava,id:"reveal-lava",zIndex:19},
  ]};
}

/** Advanced exclusively by the existing engine's fixed steps, never wall time. */
export function createSceneReveal() {
  let enabled=false, ticks=0;
  function apply(instance:ArtworkInstance) {
    if (!instance.manifest.layers.some(layer=>layer.id==="reveal-curtain")) return;
    const t=ticks/SCENE_REVEAL_TICKS, remaining=enabled ? 1-t*t*(3-2*t) : 0;
    instance.setLayerTransform("reveal-curtain",{opacity:remaining});
    instance.setLayerTransform("reveal-lava",{opacity:remaining});
  }
  return {
    getSnapshot:()=>({enabled,progress:ticks/SCENE_REVEAL_TICKS}),
    setEnabled(value:boolean,instance:ArtworkInstance) {
      enabled=value; ticks=0; apply(instance);
    },
    restart(instance:ArtworkInstance) {ticks=0;apply(instance);},
    apply,
    step(instance:ArtworkInstance) {
      if(instance.manifest.id!=="insectoid-planet")return;
      if(enabled)ticks=Math.min(SCENE_REVEAL_TICKS,ticks+1);
      apply(instance);
    },
  };
}
