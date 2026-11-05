import { createSeededRandom } from "./seeded-random.ts";
import { FIXED_DT } from "./simulation-clock.ts";
import type { SessionSnapshot, StepContext } from "./contracts.ts";

export function createVisualSession(seed: number) {
  const random = createSeededRandom(seed);
  let tick = 0;
  return {
    step(evaluate: (context: StepContext) => void) {
      if (tick === Number.MAX_SAFE_INTEGER) throw new RangeError("Simulation tick exhausted");
      tick++;
      // The random capability expires with this synchronous step; retaining it
      // cannot consume simulation randomness from a render or async callback.
      let active = true;
      try {
        evaluate(Object.freeze({ tick, timeSeconds: tick / 60, dt: FIXED_DT,
          random: () => {
            if (!active) throw new Error("Random is only available during a simulation step");
            return random.next();
          } }));
      } finally { active = false; }
    },
    reset() { tick = 0; random.reset(); },
    getSnapshot(): SessionSnapshot {
      return Object.freeze({ seed, randomState: random.getState(), tick, timeSeconds: tick / 60 });
    },
  };
}
