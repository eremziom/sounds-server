"use client";

import { useLayoutEffect, useRef } from "react";
import { useMediaRuntime, usePlayback } from "../application/media-runtime";
import { useAudioSignals, useLiveAnalysis } from "../application/live-analysis-runtime";
import { createBrowserVisualSession } from "./browser-session";
import { useInfiniteZoom } from "./infinite-zoom-provider";

export function InfiniteZoomCanvas() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useInfiniteZoom(), media = useMediaRuntime(), playback = usePlayback();
  const signals = useAudioSignals(), live = useLiveAnalysis();
  const liveRef = useRef(live);
  useLayoutEffect(() => { liveRef.current = live; }, [live]);
  useLayoutEffect(() => {
    if (!canvas.current || !media.audio.current) return;
    const session = createBrowserVisualSession({ canvas: canvas.current, audio: media.audio.current, bridge: runtime,
      signals, actualPlayback: playback.actualPlayback, enableAnalysis: () => liveRef.current.enableForPlayback(), analysisEnabled: () => liveRef.current.enabled });
    const disconnect = runtime.connect(session.connection);
    const unregister = media.registerStop(() => runtime.dispose());
    void session.prewarm().catch(() => { /* Status and explicit retry remain available. */ });
    return () => { unregister(); disconnect(); session.connection.dispose(); };
  }, [media, runtime, signals, playback.actualPlayback]);
  return <canvas ref={canvas} data-infinite-zoom-canvas className="absolute inset-0 h-full w-full" />;
}
