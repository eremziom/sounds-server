import "server-only";
import { getLocale } from "next-intl/server";
import { getApiErrorMessages } from "../i18n/api-error-messages.ts";
import type { ApiFailure, ApiOperation } from "../i18n/api-errors.ts";
import type { AuthActionState } from "../components/auth/form-state.ts";

// Return only translated messages and their request locale, never the API result.
export async function getAuthActionError(
  failure: ApiFailure,
  operation: ApiOperation,
): Promise<AuthActionState> {
  const locale = await getLocale();
  const messages = await getApiErrorMessages(failure, operation);
  return { status: "error", locale, ...messages };
}
