"use client";

import { useId, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { setLocale } from "@/i18n/actions";
import { locales, type Locale } from "@/i18n/config";

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

  function changeLanguage(value: string) {
    if (pending || value === locale) return;
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
    <div className="flex flex-wrap items-center justify-end gap-2" aria-busy={pending}>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <select
        id={id}
        name="locale"
        value={locale}
        aria-disabled={pending}
        onChange={(event) => changeLanguage(event.target.value)}
        aria-describedby={failed ? `${id}-error` : undefined}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:cursor-wait aria-disabled:opacity-60"
      >
        {locales.map((value) => (
          <option key={value} value={value} lang={value}>{languageNames[value]}</option>
        ))}
      </select>
      {failed && <p id={`${id}-error`} role="alert" className="w-full text-right text-sm text-destructive">{changeFailed}</p>}
    </div>
  );
}
