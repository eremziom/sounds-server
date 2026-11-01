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
        threadCount={10}
        spread={0.5}
        speed={0.12}
        frequency={5.8}
        taper={0.15}
        position={0.5}
        pinch={0.5}
        nodes={3}
        angle={-9}
        glow={0.008}
        falloff={0.63}
        brightness={0.35}
        depth={0.5}
        pulses={0.75}
        fade={0.02}
        grain={0.02}
        mouseStrength={0.57}
        registerStop={registerStop}
      />
    </div>
  );
}
