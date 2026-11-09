import type {NormalizedSignals} from "../modulation/bindings.ts";

export const MAX_ATTACK_COLOR_WAVES=32;
export interface AttackColorWave {
  readonly travelSeconds:number; readonly pulseSeconds:number;
  readonly startY:number; readonly endY:number;
  readonly baseIntensity:number;
  readonly palette:readonly (readonly [number,number,number])[];
}
export interface ColorWaveEvent {readonly ageSeconds:number;readonly color:readonly [number,number,number]}

/** The evaluator calls this once per fixed step. Event tokens alternate on
 * detector timestamps, so even a weaker overlapping attack starts a new wave. */
export function createAttackColorWave(config:AttackColorWave){
  let tick=0,lastToken=0,nextColor=0;
  let events:{tick:number;color:readonly [number,number,number]}[]=[];
  return{
    step(signals:NormalizedSignals|undefined){
      tick++;
      const token=signals?.kickEvent;
      events=events.filter(e=>(tick-e.tick)/60<config.travelSeconds+config.pulseSeconds);
      if(token!==0&&token!==1){events=[];return;}
      if(token!==lastToken){
        lastToken=token;
        if((signals?.kick??0)>0){
          events.push({tick,color:config.palette[nextColor]});nextColor=(nextColor+1)%config.palette.length;
          // A <=1 s journey + <=0.24 s width fits every supported 40 ms
          // detector attack in 32 slots. Defensive capacity for malformed input.
          if(events.length>MAX_ATTACK_COLOR_WAVES)events.shift();
        }
      }
    },
    getSnapshot:():readonly ColorWaveEvent[]=>Object.freeze(events.map(e=>Object.freeze({ageSeconds:(tick-e.tick)/60,color:e.color}))),
    reset(){tick=0;lastToken=0;nextColor=0;events=[];},
  };
}
