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
  let previous: LiveMeasurement | null = null;
  let history: { time: number; bass: number; overall: number }[] = [];
  let bassTimes: number[] = [];
  let lastBassTime: number | null = null, lastOnsetTime: number | null = null;
  let bassStrength: number | null = null, onsetStrength: number | null = null;
  let silenceStart: number | null = null;
  return {
    sample(frame: LiveMeasurement): LiveSnapshot {
      // Seeks, stalled polling and source changes must not fabricate transients.
      if (previous && (frame.end <= previous.end || frame.end - previous.end > 0.35)) {
        previous = null; history = []; bassTimes = []; lastBassTime = lastOnsetTime = null;
        bassStrength = onsetStrength = null; silenceStart = null;
      }
      const bass = previous ? Math.max(0, frame.lowAmplitude - previous.lowAmplitude) : 0;
      const overall = previous ? Math.max(0, frame.amplitude - previous.amplitude) : 0;
      history = history.filter(item => frame.end - item.time <= 1);
      const threshold = (key: "bass" | "overall") => {
        if (!history.length) return 0.008;
        const mean = history.reduce((sum, item) => sum + item[key], 0) / history.length;
        const deviation = Math.sqrt(history.reduce((sum, item) => sum + (item[key] - mean) ** 2, 0) / history.length);
        return Math.max(0.008, mean + 1.5 * deviation);
      };
      const bassThreshold = threshold("bass"), overallThreshold = threshold("overall");
      const bassOnset = bass > bassThreshold && (lastBassTime === null || frame.end - lastBassTime >= 0.18);
      const onset = overall > overallThreshold && (lastOnsetTime === null || frame.end - lastOnsetTime >= 0.18);
      if (bassOnset) { lastBassTime = frame.end; bassStrength = bass / bassThreshold; bassTimes.push(frame.end); }
      if (onset) { lastOnsetTime = frame.end; onsetStrength = overall / overallThreshold; }
      if (frame.rmsDbfs < -60) silenceStart ??= frame.start; else silenceStart = null;
      bassTimes = bassTimes.filter(time => frame.end - time <= 15);
      history.push({ time: frame.end, bass, overall }); previous = frame;
      return {
        ...frame, bassOnset, onset, silence: silenceStart !== null && frame.end - silenceStart >= 0.3,
        lastBassTime, lastOnsetTime, bassStrength, onsetStrength, silenceStart,
        tempo: estimateTempo(bassTimes),
      };
    },
  };
}

// Owned by the persistent player: a media element may have only one source node.
// Closing this context when a page unmounts would permanently silence that player.
export function createLiveAudioGraph() {
  let context: AudioContext | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let analysers: AnalyserNode[] = [];
  let samples: Float32Array<ArrayBuffer>[] = [], frequencies: Float32Array<ArrayBuffer>[] = [];
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
    close() {
      source?.disconnect();
      analysers.forEach(node => node.disconnect());
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
