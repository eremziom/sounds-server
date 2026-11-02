"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { WebThreadsProps } from "../react-bits/WebThreads";
import { DEFAULT_AUDIO_MAPPINGS, type AudioMapping } from "@/lib/audio-animation";

export const DEFAULT_BACKGROUND_SETTINGS = {
  colors: ["#a855f7", "#00008c"],
  coreColor: "#a12e2e",
  threadCount: 4,
  spread: 0.01,
  speed: 0.5,
  frequency: 5.8,
  taper: 0.3,
  position: 0.5,
  pinch: 0.5,
  nodes: 1,
  angle: -10,
  glow: 0.008,
  falloff: 0.63,
  brightness: 0.35,
  depth: 0.9,
  pulses: 0.75,
  fade: 0.02,
  grain: 0.02,
  mouseStrength: 0.57,
} satisfies WebThreadsProps;

export type BackgroundSettings = typeof DEFAULT_BACKGROUND_SETTINGS;
export type NumericBackgroundSetting = Exclude<keyof BackgroundSettings, "colors" | "coreColor">;

const BackgroundSettingsContext = createContext<{
  settings: BackgroundSettings;
  updateSettings: (patch: Partial<BackgroundSettings>) => void;
  resetSettings: () => void;
  audioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;
  mappings: AudioMapping[];
  setMappings: (mappings: AudioMapping[]) => void;
  decayMs: number;
  setDecayMs: (value: number) => void;
} | null>(null);

export function BackgroundSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_BACKGROUND_SETTINGS);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [mappings, setMappings] = useState(DEFAULT_AUDIO_MAPPINGS);
  const [decayMs, setDecayMs] = useState(220);

  return (
    <BackgroundSettingsContext.Provider value={{
      settings,
      updateSettings: (patch) => setSettings((current) => ({ ...current, ...patch })),
      resetSettings: () => setSettings(DEFAULT_BACKGROUND_SETTINGS),
      audioEnabled, setAudioEnabled, mappings, setMappings, decayMs, setDecayMs,
    }}>
      {children}
    </BackgroundSettingsContext.Provider>
  );
}

export function useBackgroundSettings() {
  const context = useContext(BackgroundSettingsContext);
  if (!context) throw new Error("Background settings require BackgroundSettingsProvider");
  return context;
}
