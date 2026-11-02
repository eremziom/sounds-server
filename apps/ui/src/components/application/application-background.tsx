"use client";

import WebThreads from "../react-bits/WebThreads";
import { useMediaRuntime } from "./media-runtime";
import { useBackgroundSettings } from "./background-settings";
import { useState } from "react";
import { createAudioModulator } from "@/lib/audio-animation";
import { useAudioSignals } from "./live-analysis-runtime";

export function ApplicationBackground() {
  const { registerStop } = useMediaRuntime();
  const { settings, audioEnabled, mappings, decayMs } = useBackgroundSettings();
  const signals = useAudioSignals();
  const [apply] = useState(createAudioModulator);
  function modulate(dt: number) {
    return apply(settings, mappings, signals.current, audioEnabled, decayMs, dt, performance.now());
  }

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0" data-application-background>
      <WebThreads
        {...settings}
        registerStop={registerStop}
        modulate={modulate}
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
