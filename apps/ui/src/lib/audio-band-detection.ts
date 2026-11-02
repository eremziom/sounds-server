export const AUDIO_BANDS = ["bass", "mid", "high"] as const;
export type AudioBand = typeof AUDIO_BANDS[number];
export type BandDetectionOptions = {
  fromHz: number; toHz: number; sensitivity: number; minDbfs: number; minIntervalMs: number;
};
export type BandOptions = Record<AudioBand, BandDetectionOptions>;
export const DEFAULT_BAND_OPTIONS: BandOptions = {
  bass: { fromHz: 20, toHz: 250, sensitivity: 1, minDbfs: -60, minIntervalMs: 180 },
  mid: { fromHz: 250, toHz: 2000, sensitivity: 1, minDbfs: -60, minIntervalMs: 120 },
  high: { fromHz: 2000, toHz: 16000, sensitivity: 1, minDbfs: -60, minIntervalMs: 60 },
};
export type BandDetection = { onset: boolean; lastTime: number | null; strength: number | null };
export type BandDetections = Record<AudioBand, BandDetection>;

export function sanitizeBandOptions(options: BandDetectionOptions): BandDetectionOptions {
  const bounded = (value: number, min: number, max: number, fallback: number) =>
    Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
  const fromHz = bounded(options.fromHz, 20, 19990, 250);
  return {
    fromHz, toHz: bounded(options.toHz, fromHz + 10, 20000, 2000),
    sensitivity: bounded(options.sensitivity, 0.5, 3, 1),
    minDbfs: bounded(options.minDbfs, -90, -6, -60),
    minIntervalMs: bounded(options.minIntervalMs, 40, 1000, 180),
  };
}

// One gate per band groups an attack, its body and ringing into one event.
export function createAttackGate() {
  let baseline: number | null = null;
  let previous = 0, armed = true, peak = 0, releaseLevel = 0, releaseDuration = 0;
  let lastTime: number | null = null;
  let history: { time: number; delta: number }[] = [];
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  return (level: number, time: number, dt: number, sensitivity: number, spacing: number, minLevel = 0) => {
    if (baseline === null) { baseline = previous = level; return null; }
    const delta = Math.max(0, level - previous);
    history = history.filter(item => time - item.time <= 1);
    const noise = median(history.map(item => item.delta));
    const deviation = median(history.map(item => Math.abs(item.delta - noise)));
    const threshold = Math.max(0.008, noise + 3 * deviation) / sensitivity;
    const before = baseline;
    baseline += (1 - Math.exp(-dt / 0.25)) * (level - baseline);
    previous = level;
    history.push({ time, delta });
    if (!armed) {
      peak = Math.max(peak, level);
      if (level <= Math.max(releaseLevel, peak * 0.55)) releaseDuration += dt;
      else releaseDuration = 0;
      if (releaseDuration >= 0.04) armed = true;
    }
    if (!armed || level < minLevel || (lastTime !== null && time - lastTime < spacing) || delta <= threshold ||
        level < before * (1 + 0.35 / sensitivity) + threshold) return null;
    armed = false; peak = level; releaseLevel = before * 1.2; releaseDuration = 0; lastTime = time;
    return delta / threshold;
  };
}

export function createBandDetector() {
  let gate = createAttackGate();
  let previousTime: number | null = null, lastTime: number | null = null, strength: number | null = null;
  let configuration = "";
  return (amplitude: number, time: number, options: BandDetectionOptions): BandDetection => {
    const settings = sanitizeBandOptions(options);
    const key = `${settings.fromHz}:${settings.toHz}`;
    if (key !== configuration || (previousTime !== null && (time <= previousTime || time - previousTime > 0.35))) {
      gate = createAttackGate(); previousTime = lastTime = strength = null; configuration = key;
    }
    const dt = previousTime === null ? 0.02 : time - previousTime;
    const attack = gate(amplitude, time, dt, settings.sensitivity, settings.minIntervalMs / 1000, 10 ** (settings.minDbfs / 20));
    previousTime = time;
    if (attack !== null) { lastTime = time; strength = attack; }
    return { onset: attack !== null, lastTime, strength };
  };
}
