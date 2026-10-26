import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createFormatter } from "next-intl";
import { formatCalendarDate, formatDate, formatNumber } from "../src/i18n/format.ts";
import { formats } from "../src/i18n/formats.ts";
import { timeZone } from "../src/i18n/config.ts";

test("dates and numbers use the same explicit locale and UTC on server and client", () => {
  const date = new Date("2026-01-02T00:30:00Z");
  for (const [locale, expectedDate, expectedNumber] of [
    ["en", "January 2, 2026", "12,345.5"],
    ["pl", "2 stycznia 2026", "12 345,5"],
    ["es", "2 de enero de 2026", "12.345,5"],
  ]) {
    assert.equal(formatDate(date, locale), expectedDate);
    assert.equal(formatNumber(12345.5, locale).replace(/\s/g, " "), expectedNumber);
    const formatter = createFormatter({ locale, timeZone, formats });
    assert.equal(formatter.dateTime(date, "releaseDate"), expectedDate);
    assert.equal(formatter.number(12345.5, "decimal"), formatNumber(12345.5, locale));
    assert.equal(formatter.number(128.25, "bpm"), locale === "en" ? "128.3" : "128,3");
  }
});

test("calendar dates keep their day and reject invalid or ambiguous inputs", () => {
  assert.equal(formatCalendarDate("2024-02-29", "pl"), "29 lutego 2024");
  assert.equal(formatCalendarDate("2026-01-02", "es"), "2 de enero de 2026");
  for (const value of ["2025-02-29", "2026-02-30", "2026-13-01", "2026-1-2", "invalid", "2026-01-02T00:00:00Z"]) {
    assert.throws(() => formatCalendarDate(value, "en"), RangeError, value);
  }
});

test("emergency English messages match the catalog without requiring an i18n provider", async () => {
  const read = async (file) => JSON.parse(await readFile(new URL(`../messages/${file}`, import.meta.url), "utf8"));
  const en = await read("en.json");
  assert.deepEqual(await read("emergency.en.json"), {
    ...en.errors.page, retry: en.common.actions.retry,
  });
});
