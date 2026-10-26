import "server-only";
import { defaultLocale, isLocale } from "./config.ts";
import { withEnglishFallback } from "./catalog.ts";

// Explicit imports prevent untrusted values from becoming filesystem paths.
const dictionaries = {
  en: () => import("../../messages/en.json", { with: { type: "json" } }).then((m) => m.default),
  pl: () => import("../../messages/pl.json", { with: { type: "json" } }).then((m) => m.default),
  es: () => import("../../messages/es.json", { with: { type: "json" } }).then((m) => m.default),
};

export async function loadMessages(value: unknown) {
  const locale = isLocale(value) ? value : defaultLocale;
  const english = await dictionaries.en();
  if (locale === defaultLocale) return english;
  const translated = await dictionaries[locale]();
  return withEnglishFallback(english, translated, locale) as typeof english;
}
