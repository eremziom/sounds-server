"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBackgroundSettings, type NumericBackgroundSetting } from "./background-settings";

const NUMERIC_CONTROLS = {
  threadCount: { min: 1, max: 24, step: 1 },
  spread: { min: 0, max: 1, step: 0.001 },
  speed: { min: 0, max: 5, step: 0.01 },
  frequency: { min: 0, max: 20, step: 0.1 },
  taper: { min: 0, max: 2, step: 0.01 },
  position: { min: 0, max: 1, step: 0.01 },
  pinch: { min: 0, max: 1, step: 0.01 },
  nodes: { min: 1, max: 6, step: 1 },
  angle: { min: -180, max: 180, step: 1 },
  glow: { min: 0, max: 0.1, step: 0.001 },
  falloff: { min: 0.05, max: 2, step: 0.01 },
  brightness: { min: 0, max: 2, step: 0.01 },
  depth: { min: 0, max: 1, step: 0.01 },
  pulses: { min: 0, max: 5, step: 0.01 },
  fade: { min: 0, max: 1, step: 0.01 },
  grain: { min: 0, max: 1, step: 0.01 },
  mouseStrength: { min: 0, max: 1, step: 0.01 },
} satisfies Record<NumericBackgroundSetting, { min: number; max: number; step: number }>;

export type BackgroundControlsLabels = {
  configuration: string;
  description: string;
  colors: string;
  color: string;
  coreColor: string;
  addColor: string;
  removeColor: string;
  reset: string;
  parameters: Record<NumericBackgroundSetting, string>;
};

function NumericControl({ label, name, value, onChange }: {
  label: string;
  name: NumericBackgroundSetting;
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const limits = NUMERIC_CONTROLS[name];

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-4">
        <input
          type="range"
          aria-label={label}
          {...limits}
          value={value}
          className="min-w-0 flex-1 accent-primary"
          onChange={(event) => {
            setDraft(null);
            onChange(event.currentTarget.valueAsNumber);
          }}
        />
        <Input
          id={id}
          name={name}
          type="number"
          {...limits}
          value={draft ?? value}
          className="w-24 shrink-0"
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            if (event.currentTarget.validity.valid && Number.isFinite(event.currentTarget.valueAsNumber)) {
              onChange(event.currentTarget.valueAsNumber);
            }
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
    </div>
  );
}

export function BackgroundControls({ labels }: { labels: BackgroundControlsLabels }) {
  const { settings, updateSettings, resetSettings } = useBackgroundSettings();
  const id = useId();

  return (
    <details open className="group mt-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg border px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <h2 className="text-lg">{labels.configuration}</h2>
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-6 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="max-w-xl text-sm text-muted-foreground">{labels.description}</p>
          </div>
          <Button type="button" variant="outline" onClick={resetSettings}>{labels.reset}</Button>
        </div>

        <fieldset className="space-y-4 rounded-lg border p-4">
          <legend className="px-2 text-sm">{labels.colors}</legend>
          <div className="flex flex-wrap gap-6">
            {settings.colors.map((color, index) => (
              <div key={index} className="space-y-2">
                <Label htmlFor={`${id}-color-${index}`}>{labels.color} {index + 1}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${id}-color-${index}`}
                    type="color"
                    value={color}
                    className="w-14 cursor-pointer p-1"
                    onChange={(event) => updateSettings({
                      colors: settings.colors.map((current, i) => i === index ? event.currentTarget.value : current),
                    })}
                  />
                  <span className="font-mono text-xs">{color}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${labels.removeColor} ${index + 1}`}
                    disabled={settings.colors.length === 1}
                    onClick={() => updateSettings({ colors: settings.colors.filter((_, i) => i !== index) })}
                  >
                    −
                  </Button>
                </div>
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor={`${id}-core`}>{labels.coreColor}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`${id}-core`}
                  type="color"
                  value={settings.coreColor}
                  className="w-14 cursor-pointer p-1"
                  onChange={(event) => updateSettings({ coreColor: event.currentTarget.value })}
                />
                <span className="font-mono text-xs">{settings.coreColor}</span>
              </div>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={settings.colors.length >= 6}
            onClick={() => updateSettings({ colors: [...settings.colors, "#ffffff"] })}
          >
            {labels.addColor}
          </Button>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(NUMERIC_CONTROLS) as NumericBackgroundSetting[]).map((name) => (
            <NumericControl
              key={name}
              name={name}
              label={labels.parameters[name]}
              value={settings[name]}
              onChange={(value) => updateSettings({ [name]: value })}
            />
          ))}
        </div>
      </div>
    </details>
  );
}
