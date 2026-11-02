import { AUDIO_BANDS, DEFAULT_BAND_OPTIONS, createAttackGate, createBandDetector, sanitizeBandOptions, type AudioBand, type BandOptions, type BandDetections } from "./audio-band-detection.ts";
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
export type TransientMeasurement = Pick<LiveMeasurement, "start" | "end" | "rmsDbfs" | "amplitude" | "lowAmplitude"> & { bandAmplitudes?: Record<AudioBand, number> };
export type LiveDetection = Omit<LiveSnapshot, keyof LiveMeasurement> & { bandDetections: BandDetections };
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

export function createLiveDetector() {
  let previous: TransientMeasurement | null = null;
  const bandDetectors = { bass: createBandDetector(), mid: createBandDetector(), high: createBandDetector() };
  let overallGate = createAttackGate();
  let bassTimes: number[] = [];
  let lastBassTime: number | null = null, lastOnsetTime: number | null = null;
  let bassStrength: number | null = null, onsetStrength: number | null = null;
  let silenceStart: number | null = null;
  const detect = (frame: TransientMeasurement, bassOptions: BassDetectionOptions = DEFAULT_BASS_OPTIONS, bandOptions: BandOptions = DEFAULT_BAND_OPTIONS): LiveDetection => {
      // Seeks, stalled polling and source changes must not fabricate transients.
      if (previous && (frame.end <= previous.end || frame.end - previous.end > 0.35)) {
        previous = null; overallGate = createAttackGate();
        bassTimes = []; lastBassTime = lastOnsetTime = null;
        bassStrength = onsetStrength = null; silenceStart = null;
      }
      const dt = previous ? frame.end - previous.end : TRANSIENT_INTERVAL_MS / 1000;
      const bandDetections = Object.fromEntries(AUDIO_BANDS.map(band => [band, bandDetectors[band](
        band === "bass" ? frame.lowAmplitude : frame.bandAmplitudes?.[band] ?? 0,
        frame.end, band === "bass" ? { ...bandOptions.bass, ...bassOptions } : bandOptions[band],
      )])) as BandDetections;
      const bassAttack = bandDetections.bass.onset ? bandDetections.bass.strength : null;
      const overallAttack = overallGate(frame.amplitude, frame.end, dt, 1, 0.18);
      const bassOnset = bassAttack !== null, onset = overallAttack !== null;
      if (bassOnset) { lastBassTime = frame.end; bassStrength = bassAttack; bassTimes.push(frame.end); }
      if (onset) { lastOnsetTime = frame.end; onsetStrength = overallAttack; }
      if (frame.rmsDbfs < -60) silenceStart ??= frame.start; else silenceStart = null;
      bassTimes = bassTimes.filter(time => frame.end - time <= 15);
      previous = frame;
      return {
        bandDetections, bassOnset, onset, silence: silenceStart !== null && frame.end - silenceStart >= 0.3,
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
  let transientAnalysers: AnalyserNode[] = [];
  let bandOptions = DEFAULT_BAND_OPTIONS;
  type BandTap = { highpass: BiquadFilterNode[]; lowpass: BiquadFilterNode[]; analysers: AnalyserNode[]; samples: Float32Array<ArrayBuffer>[] };
  const taps: Partial<Record<AudioBand, BandTap>> = {};
  let samples: Float32Array<ArrayBuffer>[] = [], frequencies: Float32Array<ArrayBuffer>[] = [];
  let transientSamples: Float32Array<ArrayBuffer>[] = [];
  return {
    configureBands(options: BandOptions) {
      bandOptions = Object.fromEntries(AUDIO_BANDS.map(band => [band, sanitizeBandOptions(options[band])])) as BandOptions;
      for (const band of AUDIO_BANDS) {
        const tap = taps[band];
        if (!tap) continue;
        tap.highpass.forEach(filter => { filter.frequency.value = bandOptions[band].fromHz; });
        tap.lowpass.forEach(filter => { filter.frequency.value = bandOptions[band].toHz; });
      }
    },
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
      const shortAnalysers = (input: ChannelSplitterNode) => [0, 1].map(channel => {
        const node = context!.createAnalyser(); node.fftSize = TRANSIENT_WINDOW_SIZE; node.smoothingTimeConstant = 0;
        input.connect(node, channel); return node;
      });
      transientAnalysers = shortAnalysers(splitter);
      for (const band of AUDIO_BANDS) {
        // Fourth-order Butterworth edges reduce leakage when tuning a narrow band.
        const filters = (type: BiquadFilterType, hz: number) => [0.5411961, 1.306563].map(q => {
          const filter = context!.createBiquadFilter();
          filter.type = type; filter.frequency.value = hz;
          // Web Audio expresses low/high-pass Q in dB, unlike bandpass Q.
          filter.Q.value = 20 * Math.log10(q);
          return filter;
        });
        const highpass = filters("highpass", bandOptions[band].fromHz);
        const lowpass = filters("lowpass", bandOptions[band].toHz);
        const bandSplitter = context.createChannelSplitter(2);
        let input: AudioNode = stereo;
        for (const filter of [...highpass, ...lowpass]) { input.connect(filter); input = filter; }
        input.connect(bandSplitter);
        const bandAnalysers = shortAnalysers(bandSplitter);
        taps[band] = { highpass, lowpass, analysers: bandAnalysers,
          samples: bandAnalysers.map(() => new Float32Array(TRANSIENT_WINDOW_SIZE)) };
      }
      transientSamples = transientAnalysers.map(() => new Float32Array(TRANSIENT_WINDOW_SIZE));
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
      const bandAmplitudes = Object.fromEntries(AUDIO_BANDS.map(band => {
        const tap = taps[band]!;
        return [band, rms(tap.analysers, tap.samples)];
      })) as Record<AudioBand, number>;
      return { start: Math.max(0, time - TRANSIENT_WINDOW_SIZE / context.sampleRate), end: time,
        amplitude, bandAmplitudes, lowAmplitude: bandAmplitudes.bass, rmsDbfs: db(amplitude) };
    },
    close() {
      source?.disconnect();
      [...analysers, ...transientAnalysers].forEach(node => node.disconnect());
      for (const tap of Object.values(taps)) {
        [...tap.highpass, ...tap.lowpass, ...tap.analysers].forEach(node => node.disconnect());
      }
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
