import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createTranslator } from "next-intl";
import { translateApiError } from "../src/i18n/api-errors.ts";

const http = (status, code, extra = {}) => ({ kind: "http", status, body: { code, ...extra } });
const catalogs = Object.fromEntries(await Promise.all(["en", "pl", "es"].map(async locale => [
  locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")),
])));

test("API codes produce localized safe messages in all languages regardless of server message", () => {
  for (const [locale, messages] of Object.entries(catalogs)) {
    const t = createTranslator({ locale, messages });
    for (const [failure, operation, key] of [
      [http(401, "AUTH_INVALID_CREDENTIALS"), "login", "errors.invalidCredentials"],
      [http(409, "EMAIL_ALREADY_IN_USE"), "register", "errors.emailAlreadyInUse"],
      [http(403, "ACCESS_DENIED"), "other", "errors.accessDenied.description"],
      [http(401, "AUTH_SESSION_INVALID"), "refresh", "auth.session.expired"],
      [http(401, "AUTH_REQUIRED"), "session", "auth.session.expired"],
      [http(500, "INTERNAL_ERROR"), "login", "errors.serviceUnavailable"],
      [{ kind: "timeout" }, "login", "errors.timeout"],
      [{ kind: "network" }, "login", "errors.serviceUnavailable"],
      [{ kind: "invalid-response" }, "login", "errors.unexpected"],
    ]) {
      if (failure.kind === "http") failure.body.message = "private-password-token";
      assert.deepEqual(translateApiError(failure, operation, t), { message: t(key), fieldErrors: {} });
    }
  }
});

test("validation uses allowlisted fields/rules and only safe numeric interpolation parameters", () => {
  for (const [locale, messages] of Object.entries(catalogs)) {
    const t = createTranslator({ locale, messages });
    const failure = http(400, "VALIDATION_FAILED", { message: ["private-password-token"], fieldErrors: [
      { field: "username", code: "LENGTH", params: { min: 3, max: 30, password: "private" } },
      { field: "username", code: "USERNAME_NO_AT" },
      { field: "email", code: "EMAIL" },
      { field: "password", code: "PASSWORD_COMPLEXITY" },
      { field: "login", code: "REQUIRED" },
      { field: "confirmPassword", code: "LENGTH", params: { min: "private", max: 50 } },
      { field: "email", code: "EMAIL" },
      { field: "__proto__", code: "EMAIL" },
      { field: "refreshToken", code: "REQUIRED" },
      null,
    ] });
    assert.deepEqual(translateApiError(failure, "register", t), {
      message: t("errors.invalidInput"),
      fieldErrors: {
        username: [t("validation.length", { min: 3, max: 30 }), t("validation.usernameNoAt")],
        email: [t("validation.email")], password: [t("validation.passwordComplexity")],
        login: [t("validation.required")], confirmPassword: [t("validation.invalid")],
      },
    });
    for (const params of [{ min: -1, max: 3 }, { min: 5, max: 3 }, { min: 1, max: Infinity }, { min: 1, max: 1e99 }]) {
      const mapped = translateApiError(http(400, "VALIDATION_FAILED", { fieldErrors: [{ field: "password", code: "LENGTH", params }] }), "register", t);
      assert.deepEqual(mapped.fieldErrors, { password: [t("validation.invalid")] });
    }
  }
});

test("unknown codes, mismatched status/operations and malformed bodies never expose backend details", () => {
  const t = createTranslator({ locale: "pl", messages: catalogs.pl });
  for (const [failure, operation] of [
    [http(409, "EMAIL_ALREADY_IN_USE"), "login"],
    [http(403, "AUTH_INVALID_CREDENTIALS"), "login"],
    [http(401, "new-code", { message: "Invalid credentials" }), "login"],
    [http(409, "toString"), "register"],
    [http(409, null), "register"],
    [{ kind: "http", status: 200, body: "private" }, "other"],
    [{ kind: "http", status: 401, body: null }, "login"],
    [{ kind: "http", status: 409, body: ["private"] }, "register"],
    [{ kind: "http", status: 401, body: { message: 42 } }, "login"],
    [{ kind: "http", status: 404, body: { message: "User not found" } }, "login"],
  ]) assert.deepEqual(translateApiError(failure, operation, t), { message: t("errors.unexpected"), fieldErrors: {} });
});

test("legacy fallback is limited to known operations/status and ignores free-text errors", () => {
  const t = createTranslator({ locale: "es", messages: catalogs.es });
  for (const [status, operation, key] of [
    [401, "login", "errors.invalidCredentials"], [409, "register", "errors.emailAlreadyInUse"],
    [401, "refresh", "auth.session.expired"], [403, "other", "errors.accessDenied.description"],
    [400, "register", "errors.invalidInput"], [503, "login", "errors.serviceUnavailable"],
    [409, "other", "errors.unexpected"],
  ]) {
    assert.deepEqual(translateApiError({ kind: "http", status, body: { message: "private-password-token", fieldErrors: [{ field: "password", code: "REQUIRED" }] } }, operation, t), {
      message: t(key), fieldErrors: {},
    });
  }
});
