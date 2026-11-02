import { analyzePcm } from "./audio-analysis";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = ({ data }) => {
  try {
    const result = analyzePcm(data.channels, data.sampleRate, progress => scope.postMessage({ type: "progress", progress }));
    scope.postMessage({ type: "result", result });
  } catch {
    scope.postMessage({ type: "error" });
  }
};
