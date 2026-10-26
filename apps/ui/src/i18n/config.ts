export const locales = ["en", "pl", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";
export const localeCookie = "locale";
export const timeZone = "UTC";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.some((locale) => locale === value);
}
