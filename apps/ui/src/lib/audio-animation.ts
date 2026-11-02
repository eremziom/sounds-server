import { AUDIO_BANDS, type AudioBand } from "./audio-band-detection.ts";

export const ANIMATION_PARAMETERS = {
  threadCount: { min: 1, max: 24, step: 1 },
  spread: { min: 0, max: 1, step: 0.001 },
  speed: { min: 0, max: 5, step: 0.01 },
  frequency: { min: 0, max: 20, step: 0.1 },
  taper: { min: 0, max: 2, step: 0.01 },
  position: { min: 0, max: 1, step: 0.01 },
  pinch: { min: 0, max: 1, step: 0.01 },
  nodes: { min: 1, max: 6, step: 1 },
  angle: { min: -180, max: 180, step: 1 },
  glow: { min: 0, max: 0.1, step: 0.001 },
  falloff: { min: 0.05, max: 2, step: 0.01 },
  brightness: { min: 0, max: 2, step: 0.01 },
  depth: { min: 0, max: 1, step: 0.01 },
  pulses: { min: 0, max: 5, step: 0.01 },
  fade: { min: 0, max: 1, step: 0.01 },
  grain: { min: 0, max: 1, step: 0.01 },
  mouseStrength: { min: 0, max: 1, step: 0.01 },
};

export type AnimationParameter = keyof typeof ANIMATION_PARAMETERS;
export const AUDIO_SOURCES = {
  bass: { band: "bass", kind: "level" },
  kick: { band: "bass", kind: "attack" },
  mid: { band: "mid", kind: "level" },
  midAttack: { band: "mid", kind: "attack" },
  high: { band: "high", kind: "level" },
  highAttack: { band: "high", kind: "attack" },
} as const;
export type AudioSource = keyof typeof AUDIO_SOURCES;
export type AudioSignals = Record<AudioBand, { level: number; attackAt: number | null; strength: number }>;
export function createEmptyAudioSignals(): AudioSignals {
  return Object.fromEntries(AUDIO_BANDS.map(band => [band, { level: 0, attackAt: null, strength: 0 }])) as AudioSignals;
}
export type AudioMapping = {
  id: string;
  enabled: boolean;
  source: AudioSource;
  target: AnimationParameter;
  // Fraction of the destination's range added at full signal strength.
  amount: number;
};
export const DEFAULT_AUDIO_MAPPINGS: AudioMapping[] = [
  { id: "bass-spread", enabled: true, source: "bass", target: "spread", amount: 0.25 },
  { id: "bass-speed", enabled: true, source: "bass", target: "speed", amount: 0.15 },
  { id: "kick-brightness", enabled: true, source: "kick", target: "brightness", amount: 0.4 },
  { id: "kick-glow", enabled: true, source: "kick", target: "glow", amount: 0.3 },
];

export function normalizeAudioLevel(amplitude: number) {
  const db = 20 * Math.log10(Math.max(1e-6, amplitude));
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

export function createAudioModulator() {
  const levels: Record<AudioBand, number> = { bass: 0, mid: 0, high: 0 };
  return (
    base: Record<AnimationParameter, number>, mappings: AudioMapping[], signals: AudioSignals,
    enabled: boolean, decayMs: number, dt: number, now: number,
  ): Partial<Record<AnimationParameter, number>> => {
    if (!enabled) {
      for (const band of AUDIO_BANDS) levels[band] = 0;
      return {};
    }
    for (const band of AUDIO_BANDS) {
      const target = signals[band].level;
      levels[band] += (target - levels[band]) * (1 - Math.exp(-dt / (target > levels[band] ? 0.04 : 0.15)));
    }
    const offsets: Partial<Record<AnimationParameter, number>> = {};
    for (const mapping of mappings) {
      if (!mapping.enabled) continue;
      const source = AUDIO_SOURCES[mapping.source];
      const signal = signals[source.band];
      // A hit reaches zero exactly at decayMs. A seek/reset clears its timestamp.
      const value = source.kind === "level" ? levels[source.band] : signal.attackAt === null ? 0
        : signal.strength * Math.max(0, 1 - Math.max(0, now - signal.attackAt) / Math.max(1, decayMs)) ** 2;
      const { min, max } = ANIMATION_PARAMETERS[mapping.target];
      offsets[mapping.target] = (offsets[mapping.target] ?? 0)
        + value * mapping.amount * (max - min);
    }
    for (const target of Object.keys(offsets) as AnimationParameter[]) {
      const { min, max } = ANIMATION_PARAMETERS[target];
      const value = Math.max(min, Math.min(max, base[target] + offsets[target]!));
      offsets[target] = target === "threadCount" || target === "nodes" ? Math.round(value) : value;
    }
    return offsets;
  };
}
