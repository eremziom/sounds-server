import type {ArtworkInstance} from "../../engines/infinite-zoom/artwork/artwork-instance.ts";

export const ENVIRONMENT_REVEAL_TICKS=3*60;

/** Presentation control for the authored environment layer. Only the existing
 * fixed simulation steps advance reveal; protected light layers are untouched. */
export function createEnvironmentBlackout(){
  let enabled=false,brightness=1,startBrightness=1,ticks=ENVIRONMENT_REVEAL_TICKS;
  const supports=(instance:ArtworkInstance)=>instance.manifest.id==="digital-grid";
  function apply(instance:ArtworkInstance){
    if(supports(instance))instance.setLayerTransform("environment",{opacity:brightness});
  }
  return {
    getSnapshot:()=>({enabled,brightness}),
    apply,
    setEnabled(value:boolean,instance:ArtworkInstance){
      if(typeof value!=="boolean")throw new Error("Invalid environment blackout preference");
      if(!supports(instance)||value===enabled)return;
      enabled=value;
      if(enabled){brightness=0;ticks=ENVIRONMENT_REVEAL_TICKS;}
      else{startBrightness=brightness;ticks=0;}
      apply(instance);
    },
    step(instance:ArtworkInstance){
      if(!supports(instance))return;
      if(!enabled&&ticks<ENVIRONMENT_REVEAL_TICKS){
        const t=++ticks/ENVIRONMENT_REVEAL_TICKS;
        brightness=startBrightness+(1-startBrightness)*t*t*(3-2*t);
      }
      apply(instance);
    },
  };
}
