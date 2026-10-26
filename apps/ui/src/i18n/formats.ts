import { timeZone } from "./config.ts";

// Use the same named Intl options in server and client formatters.
export const formats = {
  dateTime: {
    releaseDate: { year: "numeric", month: "long", day: "numeric", timeZone },
  },
  number: {
    decimal: { maximumFractionDigits: 2 },
    bpm: { maximumFractionDigits: 1 },
  },
} satisfies {
  dateTime: Record<string, Intl.DateTimeFormatOptions>;
  number: Record<string, Intl.NumberFormatOptions>;
};
