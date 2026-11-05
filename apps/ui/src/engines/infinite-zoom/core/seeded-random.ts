function validateUint32(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError("Expected an unsigned 32-bit integer");
  }
}

/** Mulberry32. Integer overflow and unsigned shifts are part of the algorithm. */
export function createSeededRandom(seed: number) {
  validateUint32(seed);
  let state = seed;
  return {
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    },
    getState: () => state,
    restore(value: number) { validateUint32(value); state = value; },
    reset() { state = seed; },
  };
}
