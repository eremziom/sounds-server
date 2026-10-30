import {
  createContext, useContext, useLayoutEffect, useRef, useState,
  type ReactNode, type RefObject,
} from "react";
import type { ApplicationSession } from "../../lib/application-session";

type MediaRuntimeContext = {
  audio: RefObject<HTMLAudioElement | null>;
  animationHost: RefObject<HTMLDivElement | null>;
  registerStop: (stop: () => void) => () => void;
};

const MediaContext = createContext<MediaRuntimeContext | null>(null);

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
  const audio = useRef<HTMLAudioElement>(null);
  const animationHost = useRef<HTMLDivElement>(null);
  const [stops] = useState(() => new Set<() => void>());
  const [media] = useState<MediaRuntimeContext>(() => ({
    audio,
    animationHost,
    registerStop(stop) {
      stops.add(stop);
      return () => { stops.delete(stop); };
    },
  }));

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
  }, [session, stops]);

  return (
    <MediaContext.Provider value={media}>
      <div data-persistent-media hidden={blocked}>
        <audio ref={audio} preload="none" />
        <div ref={animationHost} data-animation-host />
      </div>
      {children}
    </MediaContext.Provider>
  );
}
