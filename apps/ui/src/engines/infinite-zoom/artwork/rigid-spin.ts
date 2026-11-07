export interface RigidSpin {
  readonly pivotX: number;
  readonly pivotY: number;
  readonly turnsPerSecond: number;
  readonly phaseTurns: number;
}

/** Optional rigid motion for a separated layer. It never deforms its texture or
 * neighboring layers; alpha/mattes move with the layer around a fixed pivot. */
export function parseRigidSpin(input: unknown): RigidSpin | undefined {
  if (input === undefined) return;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid layer spin");
  const value=input as Record<string,unknown>;
  if (Object.keys(value).some(key=>!["pivotX","pivotY","turnsPerSecond","phaseTurns"].includes(key))) throw new Error("Unsupported layer spin field");
  function finite(key:string,min:number,max:number,fallback?:number){
    const n=value[key] ?? fallback;
    if(typeof n!=="number"||!Number.isFinite(n)||n<min||n>max)throw new Error("Invalid layer spin parameter");
    return n;
  }
  return Object.freeze({pivotX:finite("pivotX",0,3840),pivotY:finite("pivotY",0,2160),turnsPerSecond:finite("turnsPerSecond",-.5,.5),phaseTurns:finite("phaseTurns",-1,1,0)});
}

export function spinTransform(spin:RigidSpin,angle:number){
  const x=spin.pivotX-1920,y=spin.pivotY-1080,c=Math.cos(angle),s=Math.sin(angle);
  return{x:x-c*x+s*y,y:y-s*x-c*y,rotation:angle};
}
