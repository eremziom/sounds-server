import { readFile } from "node:fs/promises";
import { locales, defaultLocale } from "../src/i18n/config.ts";
import { validateCatalogs } from "./message-validation.mjs";

const catalogs = {};
const namespaces = ["common", "auth", "app", "admin", "errors", "validation", "metadata"];
try {
  for (const locale of locales) {
    catalogs[locale] = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  }
  const errors = validateCatalogs(catalogs, defaultLocale);
  for (const locale of locales) {
    const keys = Object.keys(catalogs[locale]).sort();
    if (keys.join() !== [...namespaces].sort().join()) errors.push(`${locale}: unexpected root namespaces`);
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(`Translations OK: ${locales.join(", ")} (keys, values, ICU syntax and arguments).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Translation validation failed.");
  process.exitCode = 1;
}
