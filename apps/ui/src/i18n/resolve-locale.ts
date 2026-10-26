import { defaultLocale, isLocale, type Locale } from "./config.ts";

// Pure negotiation logic; never stores preferences outside the current request.
export function resolveLocale(
  cookieValue: unknown,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(cookieValue)) return cookieValue;

  const preferences = (acceptLanguage ?? "").split(",").flatMap((entry) => {
    const match = /^\s*([a-z]{1,8}(?:-[a-z0-9]{1,8})*)(?:\s*;\s*q=(0(?:\.\d{0,3})?|1(?:\.0{0,3})?))?\s*$/i.exec(entry);
    if (!match) return [];
    const locale = match[1].split("-")[0].toLowerCase();
    const quality = match[2] === undefined ? 1 : Number(match[2]);
    return isLocale(locale) && quality > 0 ? [{ locale, quality }] : [];
  });

  // Stable sorting preserves header order for languages with equal weights.
  preferences.sort((a, b) => b.quality - a.quality);
  return preferences[0]?.locale ?? defaultLocale;
}
