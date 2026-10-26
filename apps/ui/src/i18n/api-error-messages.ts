import "server-only";
import { getTranslations } from "next-intl/server";
import { translateApiError, type ApiFailure, type ApiOperation } from "./api-errors";

// Future form actions use the same request language as the page/layout.
export async function getApiErrorMessages(failure: ApiFailure, operation: ApiOperation) {
  return translateApiError(failure, operation, await getTranslations());
}
