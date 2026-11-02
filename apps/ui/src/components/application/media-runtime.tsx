import {
  createContext, useContext, useLayoutEffect, useRef, useState,
  type ReactNode, type RefObject,
} from "react";
import { LiveAnalysisProvider } from "./live-analysis-runtime";
import type { ApplicationSession } from "../../lib/application-session";
import { useAudioPlayback } from "./use-audio-playback";
import { createLiveAudioGraph } from "../../lib/live-audio-analysis";

type MediaRuntimeContext = {
  audio: RefObject<HTMLAudioElement | null>;
  animationHost: RefObject<HTMLDivElement | null>;
  registerStop: (stop: () => void) => () => void;
  analysisGraph: ReturnType<typeof createLiveAudioGraph>;
};

const MediaContext = createContext<MediaRuntimeContext | null>(null);
const PlaybackContext = createContext<ReturnType<typeof useAudioPlayback> | null>(null);
export function usePlayback() {
  const playback = useContext(PlaybackContext);
  if (!playback) throw new Error("Playback requires MediaRuntime");
  return playback;
}

export function useMediaRuntime() {
  const media = useContext(MediaContext);
  if (!media) throw new Error("Media runtime requires the protected application layout");
  return media;
}

// Internal client component, composed by ApplicationRuntime.
export function MediaRuntime({ children, session, blocked = false }: {
  children: ReactNode;
  session: ApplicationSession;
  blocked?: boolean;
}) {
  const [analysisGraph] = useState(createLiveAudioGraph);
  const playback = useAudioPlayback(analysisGraph.resume);
  const { audio } = playback;
  const animationHost = useRef<HTMLDivElement>(null);
  const [stops] = useState(() => new Set<() => void>());
  const [media] = useState<MediaRuntimeContext>(() => ({
    audio,
    analysisGraph,
    animationHost,
    registerStop(stop) {
      stops.add(stop);
      return () => { stops.delete(stop); };
    },
  }));

  useLayoutEffect(() => () => analysisGraph.close(), [analysisGraph]);

  // Layout cleanup runs before host removal; detached elements no longer report
  // their running Web Animations through getAnimations().
  useLayoutEffect(() => {
    const element = audio.current;
    const host = animationHost.current;
    function stop() {
      element?.pause();
      element?.removeAttribute("src");
      element?.load();
      host?.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      // Engines using requestAnimationFrame/WebGL must register their own stop.
      for (const stopActivity of stops) {
        try { stopActivity(); } catch { /* Still stop the remaining activities. */ }
      }
    }
    const unsubscribe = session.subscribe(() => {
      if (session.getSnapshot() === "ended" || session.getSnapshot() === "unavailable") stop();
    });
    return () => {
      unsubscribe();
      stop();
    };
  }, [audio, session, stops]);

  return (
    <MediaContext.Provider value={media}>
      <PlaybackContext.Provider value={playback}>
        <div data-persistent-media hidden={blocked}>
          <audio ref={audio} preload="none" />
          <div ref={animationHost} data-animation-host />
        </div>
        <LiveAnalysisProvider>{children}</LiveAnalysisProvider>
      </PlaybackContext.Provider>
    </MediaContext.Provider>
  );
}
