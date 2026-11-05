"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createLiveDetector, TRANSIENT_INTERVAL_MS, type BassDetectionOptions, type BassPulse, type LiveSnapshot } from "@/lib/live-audio-analysis";
import { normalizeAudioLevel, createEmptyAudioSignals, type AudioSignals } from "@/lib/audio-animation";
import { AUDIO_BANDS, DEFAULT_BAND_OPTIONS, sanitizeBandOptions, type AudioBand, type BandOptions } from "@/lib/audio-band-detection";
import { useApplicationSession } from "./application-runtime";
import { useMediaRuntime, usePlayback } from "./media-runtime";
import type { PlaybackTrack } from "./use-audio-playback";

type BandReadings = Record<AudioBand, { level: number; dbfs: number; lastTime: number | null }>;

const LiveAnalysisContext = createContext<ReturnType<typeof useLiveAnalysisRuntime> | null>(null);
const AudioSignalsContext = createContext<React.RefObject<AudioSignals> | null>(null);

function useLiveAnalysisRuntime() {
  const playback = usePlayback();
  const { audio, analysisGraph, registerStop } = useMediaRuntime();
  const { getStatus } = useApplicationSession();
  const [enabled, setEnabled] = useState(false);
  const [run, setRun] = useState(0);
  const [starting, setStarting] = useState(false);
  const [failure, setFailure] = useState(false);
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [bassPulse, setBassPulse] = useState<BassPulse | null>(null);
  const [bandOptions, setBandOptions] = useState<BandOptions>(DEFAULT_BAND_OPTIONS);
  const [bandReadings, setBandReadings] = useState<BandReadings | null>(null);
  const signals = useRef<AudioSignals>(createEmptyAudioSignals());
  const explicitlyStopped = useRef(false);
  const bassOptions = bandOptions.bass;
  function updateBand(band: AudioBand, patch: Partial<BandOptions[AudioBand]>) {
    signals.current = createEmptyAudioSignals();
    setBandReadings(null); setBassPulse(null);
    setBandOptions(current => ({ ...current, [band]: sanitizeBandOptions({ ...current[band], ...patch }) }));
  }
  function setBassOptions(options: BassDetectionOptions) { updateBand("bass", options); }
  const operation = useRef(0);
  const trackId = playback.track?.id;
  useEffect(() => () => { operation.current++; }, []);

  useEffect(() => {
    if (!enabled) return;
    const element = audio.current;
    if (!element) return;
    analysisGraph.configureBands(bandOptions);
    let detector = createLiveDetector();
    let readyAt = performance.now() + 60;
    let nextUiAt = performance.now() + 120;
    let bassSinceUi = false, onsetSinceUi = false;
    const expectedSrc = `/api/tracks/${trackId}/audio`;
    const reset = (event: Event) => {
      detector = createLiveDetector(); readyAt = performance.now() + 60;
      nextUiAt = performance.now() + 120; bassSinceUi = onsetSinceUi = false; setBassPulse(null); setBandReadings(null);
      signals.current = createEmptyAudioSignals();
      if (["seeking", "seeked", "emptied", "loadstart"].includes(event.type)) setSnapshot(null);
    };
    const tick = () => {
      if (["ended", "unavailable"].includes(getStatus()) || document.hidden || performance.now() < readyAt ||
          element.paused || element.ended || element.seeking || element.readyState < 3 || element.getAttribute("src") !== expectedSrc) {
        signals.current = createEmptyAudioSignals();
        return;
      }
      try {
        const transient = analysisGraph.measureTransient(element.currentTime);
        if (!transient) { signals.current = createEmptyAudioSignals(); return; }
        const detection = detector.sampleTransient(transient, bandOptions.bass, bandOptions);
        for (const band of AUDIO_BANDS) {
          const amplitude = transient.bandAmplitudes?.[band] ?? 0;
          const signal = signals.current[band];
          signal.level = amplitude >= 10 ** (bandOptions[band].minDbfs / 20) ? normalizeAudioLevel(amplitude) : 0;
          const attack = detection.bandDetections[band];
          if (attack.onset) {
            signal.attackAt = performance.now(); signal.strength = Math.min(1, attack.strength! / 4);
          }
        }
        bassSinceUi ||= detection.bassOnset; onsetSinceUi ||= detection.onset;
        // Deliver attacks immediately to the visualizer, independently of numeric fields.
        if (detection.bassOnset && detection.lastBassTime !== null) {
          setBassPulse({ time: detection.lastBassTime, strength: detection.bassStrength! });
        }
        const now = performance.now();
        if (now >= nextUiAt) {
          const measurement = analysisGraph.measure(element.currentTime);
          if (measurement) setSnapshot({ ...measurement, lowAmplitude: transient.lowAmplitude, ...detection, bassOnset: bassSinceUi, onset: onsetSinceUi });
          setBandReadings(Object.fromEntries(AUDIO_BANDS.map(band => [band, {
            level: signals.current[band].level,
            dbfs: 20 * Math.log10(Math.max(1e-6, transient.bandAmplitudes?.[band] ?? 0)),
            lastTime: detection.bandDetections[band].lastTime,
          }])) as BandReadings);
          bassSinceUi = onsetSinceUi = false; nextUiAt = now + 100;
        }
      } catch { setFailure(true); setEnabled(false); }
    };
    const timer = setInterval(tick, TRANSIENT_INTERVAL_MS);
    const events = ["playing", "pause", "waiting", "seeking", "seeked", "emptied", "loadstart", "ratechange", "ended", "error"];
    events.forEach(event => element.addEventListener(event, reset));
    document.addEventListener("visibilitychange", reset);
    const unregister = registerStop(() => {
      clearInterval(timer); operation.current++;
      signals.current = createEmptyAudioSignals();
      setSnapshot(null); setBassPulse(null); setBandReadings(null); setEnabled(false); setStarting(false);
    });
    return () => {
      clearInterval(timer); unregister();
      signals.current = createEmptyAudioSignals();
      events.forEach(event => element.removeEventListener(event, reset));
      document.removeEventListener("visibilitychange", reset);
    };
  }, [enabled, run, audio, analysisGraph, registerStop, trackId, getStatus, bandOptions]);

  async function start(track: PlaybackTrack) {
    if (starting || getStatus() !== "active" || !audio.current) return;
    explicitlyStopped.current = false;
    const revision = ++operation.current;
    setStarting(true); setFailure(false); setSnapshot(null); setBassPulse(null);
    try {
      // Initialize/resume directly from the user gesture, without replacing the player.
      analysisGraph.connect(audio.current);
      await analysisGraph.resume();
      if (revision !== operation.current || getStatus() !== "active") return;
      setEnabled(true);
      setRun(value => value + 1);
      if (playback.track?.id !== track.id || audio.current.paused || audio.current.ended) await playback.toggle(track);
    } catch {
      if (revision === operation.current) { setFailure(true); setEnabled(false); }
    } finally { if (revision === operation.current) setStarting(false); }
  }
  function stop() {
    explicitlyStopped.current = true;
    operation.current++;
    signals.current = createEmptyAudioSignals();
    setBandReadings(null); setEnabled(false); setStarting(false);
  }
  // Used by ordinary Play without creating another graph or starting audio.
  function enableForPlayback() {
    if (!audio.current || getStatus() !== "active" || explicitlyStopped.current) return;
    try { analysisGraph.connect(audio.current); setEnabled(true); }
    catch { signals.current = createEmptyAudioSignals(); setFailure(true); setEnabled(false); }
  }
  const state = failure ? "failed" : !enabled ? "idle" : playback.error ? "playbackFailed"
    : playback.ended ? "ended" : playback.waiting ? "waiting" : !playback.playing ? "paused" : "running" as const;
  return { bandOptions, bandReadings, updateBand, resetBands: () => setBandOptions(DEFAULT_BAND_OPTIONS), enabled, starting, snapshot, bassPulse, bassOptions, setBassOptions, start, stop, enableForPlayback, state: state as typeof state, signals };
}

export function LiveAnalysisProvider({ children }: { children: ReactNode }) {
  const value = useLiveAnalysisRuntime();
  return <AudioSignalsContext.Provider value={value.signals}>
    <LiveAnalysisContext.Provider value={value}>{children}</LiveAnalysisContext.Provider>
  </AudioSignalsContext.Provider>;
}

export function useLiveAnalysis() {
  const value = useContext(LiveAnalysisContext);
  if (!value) throw new Error("Live analysis requires LiveAnalysisProvider");
  return value;
}

export function useAudioSignals() {
  const value = useContext(AudioSignalsContext);
  if (!value) throw new Error("Audio signals require LiveAnalysisProvider");
  return value;
}
