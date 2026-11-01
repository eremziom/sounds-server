"use client";

import WebThreads from "../react-bits/WebThreads";
import { useMediaRuntime } from "./media-runtime";

export function ApplicationBackground() {
  const { registerStop } = useMediaRuntime();

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" data-application-background>
      <WebThreads
        colors={["#a855f7", "#00008c"]}
        coreColor="#a12e2e"
        threadCount={4}
        spread={0.01}
        speed={0.5}
        frequency={5.8}
        taper={0.3}
        position={0.5}
        pinch={0.5}
        nodes={1}
        angle={-10}
        glow={0.008}
        falloff={0.63}
        brightness={0.35}
        depth={0.9}
        pulses={0.75}
        fade={0.02}
        grain={0.02}
        mouseStrength={0.57}
        registerStop={registerStop}
      />
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
