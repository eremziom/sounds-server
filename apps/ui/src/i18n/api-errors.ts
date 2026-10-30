export type ApiOperation = "login" | "register" | "refresh" | "session" | "logout" | "other";
export type ApiFailure =
  | { kind: "http"; status: number; body: unknown }
  | { kind: "timeout" | "network" | "invalid-response" };

type MessageKey =
  | "errors.invalidCredentials" | "errors.emailAlreadyInUse"
  | "errors.accessDenied.description" | "errors.invalidInput"
  | "errors.serviceUnavailable" | "errors.timeout" | "errors.unexpected"
  | "errors.loginLocked" | "errors.rateLimited"
  | "auth.session.expired" | "validation.required" | "validation.email"
  | "validation.length" | "validation.usernameNoAt" | "validation.passwordComplexity" | "validation.invalid";

type Message = { key: MessageKey; values?: { min: number; max: number } };
const formFields = ["username", "email", "password", "confirmPassword", "login"] as const;
type FormField = (typeof formFields)[number];
export type ApiErrorMessages = { message: string; fieldErrors: Partial<Record<FormField, string[]>> };
type Translate = (key: MessageKey, values?: { min: number; max: number }) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function generalMessage(failure: ApiFailure, operation: ApiOperation): MessageKey {
  if (failure.kind === "timeout") return "errors.timeout";
  if (failure.kind === "network") return "errors.serviceUnavailable";
  if (failure.kind !== "http") return "errors.unexpected";
  const { status, body } = failure;
  const session = ["session", "refresh", "logout"].includes(operation);
  if (isRecord(body) && Object.hasOwn(body, "code")) {
    switch (body.code) {
      case "AUTH_INVALID_CREDENTIALS":
      case "AUTH_LAST_LOGIN_ATTEMPT":
        if (status === 401 && operation === "login") return "errors.invalidCredentials";
        break;
      case "AUTH_LOGIN_LOCKED":
        if (status === 429 && operation === "login") return "errors.loginLocked";
        break;
      case "AUTH_RATE_LIMITED":
        if (status === 429) return "errors.rateLimited";
        break;
      case "EMAIL_ALREADY_IN_USE":
        if (status === 409 && operation === "register") return "errors.emailAlreadyInUse";
        break;
      case "AUTH_REQUIRED":
      case "AUTH_SESSION_INVALID":
        if (status === 401 && session) return "auth.session.expired";
        break;
      case "ACCESS_DENIED":
        if (status === 403) return "errors.accessDenied.description";
        break;
      case "VALIDATION_FAILED":
      case "INVALID_REQUEST":
        if (status === 400) return "errors.invalidInput";
        break;
      case "INTERNAL_ERROR":
        if (status >= 500 && status <= 599) return "errors.serviceUnavailable";
        break;
    }
    // Unknown/malformed codes or a code for another operation must never be guessed.
    return "errors.unexpected";
  }
  // Compatibility for older API versions: only known operation/status combinations.
  // Never inspect the free-form message or English ValidationPipe messages.
  if (!isRecord(body) || !(typeof body.message === "string" ||
      (Array.isArray(body.message) && body.message.every((entry) => typeof entry === "string")))) {
    return "errors.unexpected";
  }
  if (status === 401 && operation === "login") return "errors.invalidCredentials";
  if (status === 409 && operation === "register") return "errors.emailAlreadyInUse";
  if (status === 401 && session) return "auth.session.expired";
  if (status === 403) return "errors.accessDenied.description";
  if (status === 400 && ["login", "register"].includes(operation)) return "errors.invalidInput";
  if (status >= 500 && status <= 599) return "errors.serviceUnavailable";
  return "errors.unexpected";
}

function fieldMessage(error: Record<string, unknown>): Message {
  if (error.code === "REQUIRED") return { key: "validation.required" };
  if (error.code === "EMAIL" && error.field === "email") return { key: "validation.email" };
  if (error.code === "USERNAME_NO_AT" && error.field === "username") return { key: "validation.usernameNoAt" };
  if (error.code === "PASSWORD_COMPLEXITY" && error.field === "password") return { key: "validation.passwordComplexity" };
  if (error.code === "LENGTH" && isRecord(error.params)) {
    const { min, max } = error.params;
    if (typeof min === "number" && Number.isSafeInteger(min) && min >= 0 &&
        typeof max === "number" && Number.isSafeInteger(max) && max >= min && max <= 1_000_000) {
      return { key: "validation.length", values: { min, max } };
    }
  }
  return { key: "validation.invalid" };
}

export function translateApiError(failure: ApiFailure, operation: ApiOperation, t: Translate): ApiErrorMessages {
  const fieldErrors: ApiErrorMessages["fieldErrors"] = {};
  if (failure.kind === "http" && failure.status === 400 && isRecord(failure.body) &&
      failure.body.code === "VALIDATION_FAILED" && Array.isArray(failure.body.fieldErrors)) {
    for (const error of failure.body.fieldErrors.slice(0, 50)) {
      if (!isRecord(error) || !formFields.some((field) => field === error.field)) continue;
      const field = error.field as FormField;
      const message = fieldMessage(error);
      const translated = t(message.key, message.values);
      const messages = fieldErrors[field] ??= [];
      if (!messages.includes(translated)) messages.push(translated);
    }
  }
  return { message: t(generalMessage(failure, operation)), fieldErrors };
}
