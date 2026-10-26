import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveLocale } from "../src/i18n/resolve-locale.ts";

test("valid locale cookies take precedence over browser preferences", () => {
  for (const locale of ["en", "pl", "es"]) {
    assert.equal(resolveLocale(locale, "es-MX, pl;q=0.9, en;q=0.8"), locale);
  }
  for (const invalid of [undefined, null, "", "de", "pl-PL", "PL", "../../pl", 1, {}]) {
    assert.equal(resolveLocale(invalid, "pl-PL"), "pl");
  }
});

test("browser negotiation handles regions, case, weights and equal-weight order", () => {
  for (const [header, expected] of [
    ["pl-PL, en-US;q=0.8", "pl"],
    ["es-MX", "es"],
    ["EN-us", "en"],
    ["de-DE, es;q=0.7, pl;q=0.9, en;q=0.1", "pl"],
    ["pl;q=0.5, es", "es"],
    ["es;q=0.8, pl;q=0.8", "es"],
    ["pl;q=0, es;q=0.001", "es"],
    [" pl-PL ; q=0.7 , es-MX;q=0.9 ", "es"],
    ["*, pl;q=0.8", "pl"],
    ["pl;q=invalid, es;q=0.5", "es"],
  ]) assert.equal(resolveLocale(undefined, header), expected, header);
});

test("unsupported or malformed preferences safely fall back to English", () => {
  for (const header of [
    undefined, null, "", "de-DE, fr", "*", "pl;q=0, es;q=0", "pl_PL",
    "pl;q=2", "pl;q=-1", "pl;q=.9", "pl;q=0.1234", "es;q=1.1",
    "pl;unknown=1", "pl;q=0.8;q=0.9", "../../pl", "constructor",
  ]) assert.equal(resolveLocale("invalid", header), "en", String(header));
});
