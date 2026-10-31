"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { type Locale } from "@/i18n/config";
import Dock from "@/components/react-bits/Dock";

const languages: Locale[] = ["pl", "en", "es"];
const flags: Record<Locale, string> = { pl: "pl", en: "gb", es: "es" };

const languageNames: Record<Locale, string> = {
  en: "English",
  pl: "Polski",
  es: "Español",
};

export function LanguageSwitcher({
  label,
  changeFailed,
}: {
  label: string;
  changeFailed: string;
}) {
  const locale = useLocale();
  const id = useId();
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const region = useRef<HTMLDivElement>(null);
  const keyboardNavigation = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!region.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function reveal() {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }

  function scheduleClose() {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      if (!keyboardNavigation.current || !region.current?.contains(document.activeElement)) setOpen(false);
    }, 240);
  }

  function changeLanguage(value: string) {
    if (pending) return;
    clearTimeout(closeTimer.current);
    trigger.current?.focus({ preventScroll: true });
    setOpen(false);
    if (value === locale) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const result = await setLocale(value);
        setFailed(!result.success);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div
      ref={region}
      className="language-switcher"
      data-language-switcher
      aria-busy={pending}
      onPointerEnter={(event) => {
        keyboardNavigation.current = false;
        if (event.pointerType !== "touch") reveal();
      }}
      onPointerMove={() => { keyboardNavigation.current = false; }}
      onPointerLeave={scheduleClose}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          clearTimeout(closeTimer.current);
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        keyboardNavigation.current = true;
        if (event.key === "Escape") {
          event.preventDefault();
          clearTimeout(closeTimer.current);
          trigger.current?.focus();
          setOpen(false);
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        data-language-trigger
        className="language-trigger"
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={failed ? `${id}-error` : undefined}
        onClick={() => { clearTimeout(closeTimer.current); setOpen(!open); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            reveal();
            requestAnimationFrame(() => region.current?.querySelector<HTMLButtonElement>(`[data-locale="${locale}"]`)?.focus());
          }
        }}
      >
        {label}
      </button>
      <div id={id} className="language-dock-host" inert={!open}>
        <Dock
          items={languages.map((value) => ({
            // Local SVG flags render consistently, including on Windows.
            icon: <span aria-hidden="true" className="language-flag" style={{ backgroundImage: `url(/flags/${flags[value]}.svg)` }} />,
            label: languageNames[value],
            value,
            active: locale === value,
            disabled: pending,
            onClick: () => changeLanguage(value),
          }))}
          baseItemSize={30}
          magnification={45}
          panelHeight={30}
          position="top"
          distance={60}
          gap={10}
          roundness={1}
          bounce={false}
          autoHide
          revealed={open}
          ariaLabel={label}
          showLabels={false}
          showIndicators
          showBadges={false}
          className="language-dock"
          accentColor="#e879f9"
        />
      </div>
      {failed && <p id={`${id}-error`} role="alert" className="language-error text-sm text-destructive">{changeFailed}</p>}
    </div>
  );
}
