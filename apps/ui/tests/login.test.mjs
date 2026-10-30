import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire, register } from "node:module";
import { readFile } from "node:fs/promises";
import { createTranslator } from "next-intl";
import { readLoginValues, validateLogin } from "../src/components/auth/login-validation.ts";
import { authSession } from "./helpers/auth-fixtures.mjs";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { loginAction } = await import("../src/app/(auth)/actions.ts");
const valid = { login: "Tester", password: "Secret123!" };
const data = (values) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};
const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
const { length: isLength, matches } = requireApi("class-validator");

async function context(locale) {
  const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const writes = [];
  globalThis.__authTestContext = {
    locale, translator: createTranslator({ locale, messages }),
    cookies: () => ({ set: (...args) => writes.push(args) }),
  };
  return { messages, writes };
}

test("login validation matches LoginUserDto, including Unicode, username/email and exact password text", () => {
  for (const login of ["ab", "abc", "test@example.com", "x@not-an-email", "x".repeat(100), "x".repeat(101), "😀😀", "😀😀😀", "❤️".repeat(100), "e\u0301".repeat(51), " Tester "]) {
    assert.equal(!validateLogin({ ...valid, login }).login, isLength(login, 3, 100), login);
  }
  for (const password of ["Aa1!xxx", "Aa1!xxxx", "Aa1!" + "😀".repeat(46), "Aa1!" + "😀".repeat(47), "aa1!xxxx", "AA1!xxxx", "Aaaa!!!!", "Aaaa1234", "Aa1!\nxxxx", " Secret123! "]) {
    assert.equal(!validateLogin({ ...valid, password }).password,
      isLength(password, 8, 50) && matches(password, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/), password);
  }
  assert.deepEqual(validateLogin({ login: "", password: "" }), { login: { key: "required" }, password: { key: "required" } });
});

test("login reads only single string credentials and ignores roles, locale and redirect input", () => {
  const form = data({ ...valid, login: " Tester ", password: " Secret123! ", role: "ADMIN", locale: "es", returnTo: "https://example.com", "$ACTION_ID": "extra" });
  assert.deepEqual(readLoginValues(form), { login: " Tester ", password: " Secret123! " });
  form.append("login", "other");
  form.set("password", new Blob(["Secret123!"]), "password.txt");
  assert.deepEqual(readLoginValues(form), { login: "", password: "" });
});

test("login server validation uses request language and never calls API on invalid input", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error("Must not call API"); };
  try {
    for (const locale of ["en", "pl", "es"]) {
      const { messages, writes } = await context(locale);
      const result = await loginAction(data({ login: "ab", password: "short", locale: "invalid" }));
      assert.equal(result.locale, locale);
      assert.equal(result.message, messages.errors.invalidInput);
      assert.equal(result.fieldErrors.login[0], messages.validation.length.replace("{min}", "3").replace("{max}", "100"));
      assert.equal(result.fieldErrors.password[0], messages.validation.length.replace("{min}", "8").replace("{max}", "50"));
      assert.deepEqual(result.values, { login: "ab" });
      assert.ok(!JSON.stringify(result).includes("short"));
      assert.deepEqual(writes, []);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("login redirects using API roles with app priority, writes cookies and ignores submitted destination", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const [roles, target] of [
      [["USER"], "/"], [["ARTIST"], "/"], [["ADMIN"], "/admin"],
      [["ADMIN", "USER"], "/"], [["ADMIN", "ARTIST"], "/"],
      [["ADMIN", "USER", "ARTIST"], "/"], [[], "/access-denied"], [["OTHER"], "/access-denied"],
    ]) {
      const { writes } = await context("pl");
      const session = authSession();
      session.user.roles = roles.map((key) => ({ key }));
      globalThis.fetch = async (url, init) => {
        assert.ok(url.endsWith("/auth/login"));
        assert.deepEqual(JSON.parse(init.body), valid);
        return Response.json(session, { status: 201 });
      };
      await assert.rejects(loginAction(data({ ...valid, roles: "ADMIN", returnTo: "//example.com" })),
        (error) => error.message === "NEXT_REDIRECT" && error.path === target);
      assert.deepEqual(writes.map(([name]) => name), ["accessToken", "refreshToken"]);
      assert.ok(writes.every(([, , options]) => options.httpOnly && options.sameSite === "lax"));
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("login API errors are localized without exposing account details, tokens or passwords", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const locale of ["en", "pl", "es"]) {
      const { messages, writes } = await context(locale);
      for (const [status, body, expected] of [
        [401, { code: "AUTH_INVALID_CREDENTIALS", message: "account does not exist" }, messages.errors.invalidCredentials],
        [401, { code: "AUTH_INVALID_CREDENTIALS", message: "inactive account" }, messages.errors.invalidCredentials],
        [401, { message: valid.password }, messages.errors.invalidCredentials],
        [401, { code: "UNKNOWN", message: valid.password }, messages.errors.unexpected],
        [403, { code: "ACCESS_DENIED" }, messages.errors.accessDenied.description],
        [400, { code: "VALIDATION_FAILED", fieldErrors: [{ field: "login", code: "LENGTH", params: { min: 3, max: 100 }, value: valid.password }] }, messages.errors.invalidInput],
        [503, { code: "INTERNAL_ERROR", message: valid.password }, messages.errors.serviceUnavailable],
        [401, { code: "AUTH_LAST_LOGIN_ATTEMPT" }, messages.errors.invalidCredentials],
        [429, { code: "AUTH_LOGIN_LOCKED" }, messages.errors.loginLocked],
        [429, { code: "AUTH_RATE_LIMITED" }, messages.errors.rateLimited],
        [201, { accessToken: "private-token", password: valid.password }, messages.errors.unexpected],
      ]) {
        globalThis.fetch = async () => Response.json(body, { status });
        const result = await loginAction(data(valid));
        assert.equal(result.status, "error");
        assert.equal(result.message, expected);
        assert.equal(result.locale, locale);
        assert.equal(result.lastLoginAttempt, body.code === "AUTH_LAST_LOGIN_ATTEMPT" ? true : undefined);
        assert.deepEqual(result.values, { login: valid.login });
        assert.ok(!JSON.stringify(result).includes(valid.password));
        assert.ok(!JSON.stringify(result).includes("private-token"));
        if (status === 400) assert.ok(result.fieldErrors.login.length);
      }
      globalThis.fetch = async () => new Response("not JSON", { status: 401 });
      assert.equal((await loginAction(data(valid))).message, messages.errors.unexpected);
      globalThis.fetch = async () => { throw new TypeError("private connection details"); };
      assert.equal((await loginAction(data(valid))).message, messages.errors.serviceUnavailable);
      globalThis.fetch = async () => { throw new DOMException("private", "TimeoutError"); };
      assert.equal((await loginAction(data(valid))).message, messages.errors.timeout);
      assert.deepEqual(writes, []);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});
