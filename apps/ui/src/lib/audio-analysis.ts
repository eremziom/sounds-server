// Pure DSP: Web Audio supplies decoded PCM; this runs in a worker, not on the UI thread.
export const ANALYSIS_VERSION = 1;
export const FFT_SIZE = 4096;
export const HOP_SIZE = 1024;
export const TIMELINE_STEP = 0.1;
export const BANDS = [
  { key: "sub", fromHz: 20, toHz: 60 },
  { key: "bass", fromHz: 60, toHz: 250 },
  { key: "mid", fromHz: 250, toHz: 2000 },
  { key: "upper", fromHz: 2000, toHz: 6000 },
  { key: "high", fromHz: 6000, toHz: 20000 },
] as const;
export type BandKey = typeof BANDS[number]["key"];
export type AudioEvent = { type: "bassOnset" | "onset" | "silence"; time: number; endTime?: number; strength?: number };
export type TimelineFrame = {
  start: number; end: number; rmsDbfs: number; peakDbfs: number;
  dominantHz: number | null; bands: Record<BandKey, number>;
};
export type AudioAnalysis = {
  version: number; duration: number; sampleRate: number; channels: number;
  settings: { fftSize: number; hopSize: number; stepSeconds: number; silenceDbfs: number; bands: typeof BANDS };
  timeline: TimelineFrame[]; events: AudioEvent[];
  tempo: { bpm: number; regularity: number } | null;
};

const db = (amplitude: number) => Math.max(-120, 20 * Math.log10(Math.max(amplitude, 1e-6)));
const rounded = (value: number) => Math.round(value * 1000) / 1000;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
};

// This describes periodicity of transients, not a musical meter or a verified beat grid.
export function estimateTempo(times: number[]): AudioAnalysis["tempo"] {
  if (times.length < 8 || times[times.length - 1] - times[0] < 4) return null;
  const intervals = times.slice(1).map((time, i) => time - times[i]);
  const period = median(intervals);
  if (period < 0.25 || period > 1.5) return null;
  const regularity = intervals.filter(interval => Math.abs(interval - period) / period < 0.12).length / intervals.length;
  return regularity >= 0.75 ? { bpm: rounded(60 / period), regularity: rounded(regularity) } : null;
}

class Spectrum {
  private real = new Float64Array(FFT_SIZE);
  private imaginary = new Float64Array(FFT_SIZE);
  private window = Float64Array.from({ length: FFT_SIZE }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
  private reverse = Uint16Array.from({ length: FFT_SIZE }, (_, i) => {
    let bits = i, result = 0;
    for (let j = 0; j < 12; j++) { result = result * 2 + (bits & 1); bits >>>= 1; }
    return result;
  });
  readonly normalization = FFT_SIZE * this.window.reduce((sum, value) => sum + value * value, 0);

  power(samples: Float32Array, offset: number, target: Float64Array, channelCount: number, end = samples.length) {
    const { real, imaginary } = this;
    imaginary.fill(0);
    for (let i = 0; i < FFT_SIZE; i++) real[this.reverse[i]] = (offset + i < end ? samples[offset + i] : 0) * this.window[i];
    for (let size = 2; size <= FFT_SIZE; size *= 2) {
      const angle = -2 * Math.PI / size;
      const stepReal = Math.cos(angle), stepImaginary = Math.sin(angle);
      for (let start = 0; start < FFT_SIZE; start += size) {
        let wr = 1, wi = 0;
        for (let j = 0; j < size / 2; j++) {
          const a = start + j, b = a + size / 2;
          const r = wr * real[b] - wi * imaginary[b];
          const im = wr * imaginary[b] + wi * real[b];
          real[b] = real[a] - r; imaginary[b] = imaginary[a] - im;
          real[a] += r; imaginary[a] += im;
          const nextReal = wr * stepReal - wi * stepImaginary;
          wi = wr * stepImaginary + wi * stepReal; wr = nextReal;
        }
      }
    }
    for (let i = 1; i < target.length; i++) target[i] += 2 * (real[i] ** 2 + imaginary[i] ** 2) / this.normalization / channelCount;
  }
}

export function analyzePcm(channels: Float32Array[], sampleRate: number, progress: (value: number) => void = () => {}): AudioAnalysis {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      channels.length < 1 || channels.length > 2 || !channels[0].length ||
      channels.some(channel => channel.length !== channels[0].length)) throw new Error("Invalid PCM input");
  const length = channels[0].length, duration = length / sampleRate;
  const spectrum = new Spectrum();
  const powers = new Float64Array(FFT_SIZE / 2);
  const binBands = Array.from(powers, (_, bin) => BANDS.findIndex(band => bin * sampleRate / FFT_SIZE >= band.fromHz && bin * sampleRate / FFT_SIZE < band.toHz));
  type Raw = { time: number; low: number; energy: number };
  const raw: Raw[] = [];
  const hopSize = Math.min(HOP_SIZE, Math.floor(sampleRate * TIMELINE_STEP));
  for (let offset = 0; offset < length; offset += hopSize) {
    powers.fill(0);
    let energy = 0;
    const actualLength = Math.min(FFT_SIZE, length - offset);
    for (const channel of channels) {
      for (let i = offset; i < offset + actualLength; i++) {
        const sample = channel[i];
        if (!Number.isFinite(sample)) throw new Error("Invalid PCM sample");
        energy += sample * sample;
      }
      spectrum.power(channel, offset, powers, channels.length);
    }
    energy /= actualLength * channels.length;
    const bands = [0, 0, 0, 0, 0];
    for (let bin = 1; bin < powers.length; bin++) {
      const band = binBands[bin];
      if (band < 0) continue;
      bands[band] += powers[bin];
    }
    const time = Math.min(duration, (offset + actualLength / 2) / sampleRate);
    raw.push({ time, low: Math.sqrt(bands[0] + bands[1]), energy: Math.sqrt(energy) });
    if (raw.length % 128 === 0) progress(0.8 * offset / length);
  }
  const timeline = Array.from({ length: Math.ceil(duration / TIMELINE_STEP) }, (_, index): TimelineFrame => {
    const start = Math.round(index * TIMELINE_STEP * sampleRate);
    const end = Math.min(length, Math.round((index + 1) * TIMELINE_STEP * sampleRate));
    let energy = 0, peak = 0, dominant = 0;
    powers.fill(0);
    for (const channel of channels) {
      for (let i = start; i < end; i++) { energy += channel[i] ** 2; peak = Math.max(peak, Math.abs(channel[i])); }
      // The FFT window starts at the row's timestamp and never reads beyond it.
      spectrum.power(channel, start, powers, channels.length, end);
    }
    const bands = [0, 0, 0, 0, 0];
    for (let bin = 1; bin < powers.length; bin++) {
      if (binBands[bin] < 0) continue;
      bands[binBands[bin]] += powers[bin];
      if (powers[bin] > powers[dominant]) dominant = bin;
    }
    const total = bands.reduce((sum, value) => sum + value, 0);
    if (index % 128 === 0) progress(0.8 + 0.2 * index / Math.ceil(duration / TIMELINE_STEP));
    return {
      start: rounded(index * TIMELINE_STEP), end: rounded(Math.min(duration, (index + 1) * TIMELINE_STEP)),
      rmsDbfs: rounded(db(Math.sqrt(energy / (end - start) / channels.length))), peakDbfs: rounded(db(peak)),
      dominantHz: total > 1e-12 ? rounded(dominant * sampleRate / FFT_SIZE) : null,
      bands: Object.fromEntries(BANDS.map((band, i) => [band.key, total > 1e-12 ? rounded(100 * bands[i] / total) : 0])) as Record<BandKey, number>,
    };
  });
  const events: AudioEvent[] = [];
  for (const [type, key] of [["bassOnset", "low"], ["onset", "energy"]] as const) {
    const flux = raw.map((frame, i) => Math.max(0, frame[key] - (raw[i - 1]?.[key] ?? 0)));
    let last = -Infinity;
    for (let i = 1; i < raw.length - 1; i++) {
      const history = flux.slice(Math.max(0, i - Math.ceil(sampleRate / hopSize)), i);
      const mean = history.reduce((sum, value) => sum + value, 0) / history.length;
      const deviation = Math.sqrt(history.reduce((sum, value) => sum + (value - mean) ** 2, 0) / history.length);
      const threshold = Math.max(0.008, mean + 1.5 * deviation);
      if (flux[i] > threshold && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && raw[i].time - last >= 0.18) {
        last = raw[i].time;
        events.push({ type, time: rounded(last), strength: rounded(flux[i] / threshold) });
      }
    }
  }
  let silenceStart: number | null = null;
  for (let i = 0; i <= timeline.length; i++) {
    if (i < timeline.length && timeline[i].rmsDbfs < -60) silenceStart ??= timeline[i].start;
    else if (silenceStart !== null) {
      const endTime = i < timeline.length ? timeline[i].start : duration;
      if (endTime - silenceStart >= 0.3) events.push({ type: "silence", time: silenceStart, endTime: rounded(endTime) });
      silenceStart = null;
    }
  }
  events.sort((a, b) => a.time - b.time || a.type.localeCompare(b.type));
  const bassTimes = events.filter(event => event.type === "bassOnset").map(event => event.time);
  progress(1);
  return {
    version: ANALYSIS_VERSION, duration, sampleRate, channels: channels.length,
    settings: { fftSize: FFT_SIZE, hopSize, stepSeconds: TIMELINE_STEP, silenceDbfs: -60, bands: BANDS },
    timeline, events, tempo: estimateTempo(bassTimes),
  };
}
