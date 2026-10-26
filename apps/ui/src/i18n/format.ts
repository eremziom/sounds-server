import { timeZone, type Locale } from "./config.ts";
import { formats } from "./formats.ts";

export function formatNumber(value: number, locale: Locale, options: Intl.NumberFormatOptions = formats.number.decimal) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatDate(
  value: Date | number,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = formats.dateTime.releaseDate,
) {
  return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(value);
}

// Calendar dates are YYYY-MM-DD, not timestamps in the browser's local zone.
export function formatCalendarDate(value: string, locale: Locale) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new RangeError("Expected a valid calendar date in YYYY-MM-DD format");
  }
  return formatDate(date, locale);
}
