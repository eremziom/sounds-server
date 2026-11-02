import type { AudioAnalysis } from "./audio-analysis";

export const MAX_ANALYSIS_BYTES = 50 * 1024 * 1024;
export const MAX_ANALYSIS_SECONDS = 600;
export type AnalysisFailure = "unsupported" | "limit" | "failed" | "denied" | "missing";
export class AudioAnalysisError extends Error {
  constructor(readonly kind: AnalysisFailure) { super(kind); }
}

// The metadata probe bounds duration before allocating decoded PCM. It never plays.
async function checkDuration(blob: Blob, signal: AbortSignal) {
  const url = URL.createObjectURL(blob);
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      const finish = (error?: Error) => {
        signal.removeEventListener("abort", abort);
        audio.onloadedmetadata = audio.onerror = null;
        if (error) reject(error); else resolve();
      };
      audio.onloadedmetadata = () => finish(!Number.isFinite(audio.duration) || audio.duration <= 0 || audio.duration > MAX_ANALYSIS_SECONDS ? new AudioAnalysisError("limit") : undefined);
      audio.onerror = () => finish(new AudioAnalysisError("failed"));
      signal.addEventListener("abort", abort, { once: true });
      audio.src = url;
      audio.load();
      if (signal.aborted) abort();
    });
  } finally {
    audio.onloadedmetadata = audio.onerror = null;
    audio.removeAttribute("src"); audio.load();
    URL.revokeObjectURL(url);
  }
}

async function readAudio(response: Response, signal: AbortSignal) {
  if (Number(response.headers.get("content-length")) > MAX_ANALYSIS_BYTES) {
    await response.body?.cancel();
    throw new AudioAnalysisError("limit");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AudioAnalysisError("failed");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ANALYSIS_BYTES) throw new AudioAnalysisError("limit");
      chunks.push(value as Uint8Array<ArrayBuffer>);
    }
    if (!size) throw new AudioAnalysisError("failed");
    return new Blob(chunks, { type: response.headers.get("content-type") ?? "audio/mpeg" });
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function analyzeAudioFile(response: Response, signal: AbortSignal, onProgress: (percent: number) => void): Promise<AudioAnalysis> {
  if (typeof OfflineAudioContext === "undefined" || typeof Worker === "undefined") throw new AudioAnalysisError("unsupported");
  const blob = await readAudio(response, signal);
  await checkDuration(blob, signal);
  signal.throwIfAborted();
  onProgress(5);
  // A consistent analysis rate; this is not the original file's sample rate.
  const context = new OfflineAudioContext(1, 1, 44100);
  const audio = await context.decodeAudioData(await blob.arrayBuffer());
  signal.throwIfAborted();
  if (audio.duration > MAX_ANALYSIS_SECONDS || audio.numberOfChannels > 2 || audio.length * audio.numberOfChannels * 4 > 192 * 1024 * 1024) throw new AudioAnalysisError("limit");
  onProgress(10);
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i).slice());
  const worker = new Worker(new URL("./audio-analysis.worker.ts", import.meta.url), { type: "module" });
  try {
    return await new Promise<AudioAnalysis>((resolve, reject) => {
      const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
      const finish = (result?: AudioAnalysis) => {
        signal.removeEventListener("abort", abort);
        if (result) resolve(result); else reject(new AudioAnalysisError("failed"));
      };
      worker.onmessage = ({ data }) => {
        if (data.type === "result") finish(data.result);
        else if (data.type === "error") finish();
        else if (data.type === "progress") onProgress(Math.round(10 + 90 * data.progress));
      };
      worker.onerror = event => { event.preventDefault(); finish(); };
      worker.onmessageerror = () => finish();
      signal.addEventListener("abort", abort, { once: true });
      worker.postMessage({ channels, sampleRate: audio.sampleRate }, channels.map(channel => channel.buffer));
      if (signal.aborted) abort();
    });
  } finally {
    worker.terminate();
  }
}
