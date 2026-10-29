import type { Locale } from "../../i18n/config.ts";
import type { ApiErrorMessages } from "../../i18n/api-errors.ts";

export type AuthActionState = {
  status: "idle" | "error";
  locale: Locale;
  message?: string;
  lastLoginAttempt?: boolean;
  fieldErrors: ApiErrorMessages["fieldErrors"];
  values?: Partial<Record<"username" | "email" | "login", string>>;
};

export function initialAuthState(locale: Locale): AuthActionState {
  return { status: "idle", locale, fieldErrors: {} };
}
