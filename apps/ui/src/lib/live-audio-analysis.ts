import { BANDS, FFT_SIZE, estimateTempo, type AudioAnalysis, type BandKey } from "./audio-analysis.ts";

export type LiveMeasurement = {
  start: number; end: number; rmsDbfs: number; peakDbfs: number; dominantHz: number | null;
  bands: Record<BandKey, number>; lowAmplitude: number; amplitude: number;
};
export type LiveSnapshot = LiveMeasurement & {
  bassOnset: boolean; onset: boolean; silence: boolean;
  lastBassTime: number | null; lastOnsetTime: number | null;
  bassStrength: number | null; onsetStrength: number | null;
  silenceStart: number | null; tempo: AudioAnalysis["tempo"];
};
export type BassDetectionOptions = { sensitivity: number; minIntervalMs: number };
export const DEFAULT_BASS_OPTIONS: BassDetectionOptions = { sensitivity: 1, minIntervalMs: 180 };
export const TRANSIENT_INTERVAL_MS = 20;
export const TRANSIENT_WINDOW_SIZE = 1024;
export type TransientMeasurement = Pick<LiveMeasurement, "start" | "end" | "rmsDbfs" | "amplitude" | "lowAmplitude">;
export type LiveDetection = Omit<LiveSnapshot, keyof LiveMeasurement>;
export type BassPulse = { time: number; strength: number };
const db = (amplitude: number) => Math.max(-120, 20 * Math.log10(Math.max(1e-6, amplitude)));

// Frequency arrays are Web Audio decibels. Sum linear powers, never decibels.
export function measureLiveAudio(samples: Float32Array[], frequencies: Float32Array[], sampleRate: number, time: number): LiveMeasurement {
  let energy = 0, peak = 0, lowPower = 0, dominant = 0, dominantPower = 0;
  const bands = [0, 0, 0, 0, 0];
  for (const channel of samples) for (const sample of channel) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
  const amplitude = Math.sqrt(energy / samples.reduce((sum, channel) => sum + channel.length, 0));
  for (let bin = 1; bin < frequencies[0].length; bin++) {
    const hz = bin * sampleRate / FFT_SIZE;
    const band = BANDS.findIndex(range => hz >= range.fromHz && hz < range.toHz);
    if (band < 0) continue;
    let power = 0;
    for (const channel of frequencies) power += Number.isFinite(channel[bin]) ? 10 ** (channel[bin] / 10) / frequencies.length : 0;
    bands[band] += power;
    if (band <= 1) lowPower += power;
    if (power > dominantPower) { dominantPower = power; dominant = hz; }
  }
  const total = bands.reduce((sum, value) => sum + value, 0);
  return {
    start: Math.max(0, time - FFT_SIZE / sampleRate), end: time,
    rmsDbfs: db(amplitude), peakDbfs: db(peak), dominantHz: total > 1e-12 ? dominant : null,
    bands: Object.fromEntries(BANDS.map((band, i) => [band.key, total > 1e-12 ? 100 * bands[i] / total : 0])) as Record<BandKey, number>,
    // Blackman window coherent-gain correction for Web Audio FFT magnitudes.
    lowAmplitude: Math.sqrt(lowPower * 2 / 0.3046), amplitude,
  };
}

// An attack locks the gate until the envelope has fallen for at least 40 ms.
// This groups the attack, body and ringing of one hit into a single event.
function createAttackGate() {
  let baseline: number | null = null;
  let previous = 0, armed = true, peak = 0, releaseLevel = 0, releaseDuration = 0;
  let lastTime: number | null = null;
  let history: { time: number; delta: number }[] = [];
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  return (level: number, time: number, dt: number, sensitivity: number, spacing: number) => {
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
    if (!armed || (lastTime !== null && time - lastTime < spacing) || delta <= threshold ||
        level < before * (1 + 0.35 / sensitivity) + threshold) return null;
    armed = false; peak = level; releaseLevel = before * 1.2; releaseDuration = 0; lastTime = time;
    return delta / threshold;
  };
}

export function createLiveDetector() {
  let previous: TransientMeasurement | null = null;
  let bassGate = createAttackGate(), overallGate = createAttackGate();
  let bassTimes: number[] = [];
  let lastBassTime: number | null = null, lastOnsetTime: number | null = null;
  let bassStrength: number | null = null, onsetStrength: number | null = null;
  let silenceStart: number | null = null;
  const detect = (frame: TransientMeasurement, bassOptions: BassDetectionOptions = DEFAULT_BASS_OPTIONS): LiveDetection => {
      // Seeks, stalled polling and source changes must not fabricate transients.
      if (previous && (frame.end <= previous.end || frame.end - previous.end > 0.35)) {
        previous = null; bassGate = createAttackGate(); overallGate = createAttackGate();
        bassTimes = []; lastBassTime = lastOnsetTime = null;
        bassStrength = onsetStrength = null; silenceStart = null;
      }
      const dt = previous ? frame.end - previous.end : TRANSIENT_INTERVAL_MS / 1000;
      const spacing = Math.max(120, Math.min(600, bassOptions.minIntervalMs)) / 1000;
      const bassAttack = bassGate(frame.lowAmplitude, frame.end, dt, Math.max(0.5, Math.min(3, bassOptions.sensitivity)), spacing);
      const overallAttack = overallGate(frame.amplitude, frame.end, dt, 1, 0.18);
      const bassOnset = bassAttack !== null, onset = overallAttack !== null;
      if (bassOnset) { lastBassTime = frame.end; bassStrength = bassAttack; bassTimes.push(frame.end); }
      if (onset) { lastOnsetTime = frame.end; onsetStrength = overallAttack; }
      if (frame.rmsDbfs < -60) silenceStart ??= frame.start; else silenceStart = null;
      bassTimes = bassTimes.filter(time => frame.end - time <= 15);
      previous = frame;
      return {
        bassOnset, onset, silence: silenceStart !== null && frame.end - silenceStart >= 0.3,
        lastBassTime, lastOnsetTime, bassStrength, onsetStrength, silenceStart,
        tempo: estimateTempo(bassTimes),
      };
  };
  return {
    sampleTransient: detect,
    sample(frame: LiveMeasurement, options: BassDetectionOptions = DEFAULT_BASS_OPTIONS): LiveSnapshot {
      return { ...frame, ...detect(frame, options) };
    },
  };
}

// Owned by the persistent player: a media element may have only one source node.
// Closing this context when a page unmounts would permanently silence that player.
export function createLiveAudioGraph() {
  let context: AudioContext | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let analysers: AnalyserNode[] = [];
  let transientAnalysers: AnalyserNode[] = [], bassAnalysers: AnalyserNode[] = [];
  let samples: Float32Array<ArrayBuffer>[] = [], frequencies: Float32Array<ArrayBuffer>[] = [];
  let transientSamples: Float32Array<ArrayBuffer>[] = [], bassSamples: Float32Array<ArrayBuffer>[] = [];
  return {
    connect(element: HTMLAudioElement) {
      if (source) return;
      if (typeof AudioContext === "undefined") throw new Error("unsupported");
      context ??= new AudioContext({ sampleRate: 44100 });
      // Prepare the tap before rerouting playback. The audible path stays direct.
      const stereo = context.createGain();
      stereo.channelCount = 2; stereo.channelCountMode = "explicit"; stereo.channelInterpretation = "speakers";
      const splitter = context.createChannelSplitter(2);
      stereo.connect(splitter);
      analysers = [0, 1].map(channel => {
        const analyser = context!.createAnalyser();
        analyser.fftSize = FFT_SIZE; analyser.smoothingTimeConstant = 0;
        splitter.connect(analyser, channel);
        return analyser;
      });
      samples = analysers.map(() => new Float32Array(FFT_SIZE));
      frequencies = analysers.map(node => new Float32Array(node.frequencyBinCount));
      // Independent short time-domain windows avoid smearing attacks across the
      // 93 ms spectrum window used by the slower numeric UI.
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass"; highpass.frequency.value = 20; highpass.Q.value = Math.SQRT1_2;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass"; lowpass.frequency.value = 250; lowpass.Q.value = Math.SQRT1_2;
      const bassSplitter = context.createChannelSplitter(2);
      stereo.connect(highpass); highpass.connect(lowpass); lowpass.connect(bassSplitter);
      const shortAnalysers = (input: ChannelSplitterNode) => [0, 1].map(channel => {
        const node = context!.createAnalyser(); node.fftSize = TRANSIENT_WINDOW_SIZE; node.smoothingTimeConstant = 0;
        input.connect(node, channel); return node;
      });
      transientAnalysers = shortAnalysers(splitter); bassAnalysers = shortAnalysers(bassSplitter);
      transientSamples = transientAnalysers.map(() => new Float32Array(TRANSIENT_WINDOW_SIZE));
      bassSamples = bassAnalysers.map(() => new Float32Array(TRANSIENT_WINDOW_SIZE));
      source = context.createMediaElementSource(element);
      source.connect(context.destination);
      source.connect(stereo);
    },
    async resume() { if (context?.state === "suspended") await context.resume(); },
    measure(time: number) {
      if (!context || context.state !== "running" || !source) return null;
      analysers.forEach((node, i) => { node.getFloatTimeDomainData(samples[i]); node.getFloatFrequencyData(frequencies[i]); });
      return measureLiveAudio(samples, frequencies, context.sampleRate, time);
    },
    measureTransient(time: number): TransientMeasurement | null {
      if (!context || context.state !== "running" || !source) return null;
      const rms = (nodes: AnalyserNode[], buffers: Float32Array<ArrayBuffer>[]) => {
        let power = 0;
        nodes.forEach((node, channel) => {
          node.getFloatTimeDomainData(buffers[channel]);
          for (const sample of buffers[channel]) power += sample * sample;
        });
        return Math.sqrt(power / nodes.length / TRANSIENT_WINDOW_SIZE);
      };
      const amplitude = rms(transientAnalysers, transientSamples);
      return { start: Math.max(0, time - TRANSIENT_WINDOW_SIZE / context.sampleRate), end: time,
        amplitude, lowAmplitude: rms(bassAnalysers, bassSamples), rmsDbfs: db(amplitude) };
    },
    close() {
      source?.disconnect();
      [...analysers, ...transientAnalysers, ...bassAnalysers].forEach(node => node.disconnect());
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
