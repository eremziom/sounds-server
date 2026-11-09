"use client";

import { useMediaRuntime } from "./media-runtime";
import { InfiniteZoomCanvas } from "../infinite-zoom/infinite-zoom-canvas";

export function ApplicationBackground() {
  const { animationHost } = useMediaRuntime();

  return (
    <div ref={animationHost} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" data-application-background data-animation-host>
      <InfiniteZoomCanvas />
      <div
        data-application-background-dimmer
        style={{
          position: "absolute",
          insetBlock: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "100%",
          maxWidth: 1200,
          zIndex: 1,
          backgroundColor: "var(--background)",
          opacity: 0.8,
          maskImage: "linear-gradient(to right, transparent 0%, black 10%, black 90%, transparent 100%)",
        }}
      />
    </div>
  );
}
