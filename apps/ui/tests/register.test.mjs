import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire, register } from "node:module";
import { readFile } from "node:fs/promises";
import { createTranslator } from "next-intl";
import { readRegisterValues, validateRegistration } from "../src/components/auth/register-validation.ts";
import { authSession } from "./helpers/auth-fixtures.mjs";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { registerAction } = await import("../src/app/(auth)/actions.ts");
const valid = { username: "Tester", email: "test@example.com", password: "Secret123!", confirmPassword: "Secret123!" };
const data = (values) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};
const requireApi = createRequire(new URL("../../api/package.json", import.meta.url));
const { length: isLength, isEmail, matches } = requireApi("class-validator");

async function context(locale) {
  const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
  const writes = [];
  globalThis.__authTestContext = {
    locale, translator: createTranslator({ locale, messages }),
    cookies: () => ({ set: (...args) => writes.push(args) }),
  };
  return { messages, writes };
}

test("registration matches DTO length, email and complexity rules including Unicode", () => {
  for (const username of ["ab", "abc", "x".repeat(30), "x".repeat(31), "😀😀", "😀😀😀", "❤️".repeat(30), "e\u0301".repeat(16)]) {
    assert.equal(!validateRegistration({ ...valid, username }).username, isLength(username, 3, 30), username);
  }
  for (const password of ["Aa1!xxx", "Aa1!xxxx", "Aa1!" + "😀".repeat(46), "Aa1!" + "😀".repeat(47), "aa1!xxxx", "AA1!xxxx", "Aaaa!!!!", "Aaaa1234", "Aa1!\nxxxx", " Secret123! "]) {
    assert.equal(!validateRegistration({ ...valid, password, confirmPassword: password }).password,
      isLength(password, 8, 50) && matches(password, /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).+$/), password);
  }
  for (const email of ["test@example.com", "test+tag@example.com", "żółw@example.com", "x@localhost", "bad", "test@example.com ", "a..b@example.com"]) {
    assert.equal(!validateRegistration({ ...valid, email }).email, isEmail(email), email);
  }
  assert.equal(validateRegistration({ ...valid, confirmPassword: "different" }).confirmPassword.key, "passwordMismatch");
  assert.equal(validateRegistration({ ...valid, email: "" }).email.key, "required");
});

test("FormData accepts only single string fields without modifying credentials", () => {
  const form = data({ ...valid, password: " Secret123! ", role: "ADMIN", locale: "es", "$ACTION_ID": "extra" });
  assert.deepEqual(readRegisterValues(form), { ...valid, password: " Secret123! " });
  form.append("email", "other@example.com");
  form.set("username", new Blob(["Tester"]), "name.txt");
  assert.equal(readRegisterValues(form).email, "");
  assert.equal(readRegisterValues(form).username, "");
});

test("registration rejects @ names in every locale before calling the API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error("Must not call API"); };
  try {
    for (const locale of ["en", "pl", "es"]) {
      const { messages, writes } = await context(locale);
      for (const username of ["a@b", "name@example.com", "@name", "name@", "name@\n"]) {
        assert.equal(validateRegistration({ ...valid, username }).username.key, "usernameNoAt");
        const result = await registerAction({}, data({ ...valid, username }));
        assert.deepEqual(result.fieldErrors.username, [messages.validation.usernameNoAt]);
      }
      assert.deepEqual(writes, []);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("server validation uses request locale and rejects invalid input before calling API", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw Error("Must not call API"); };
  try {
    for (const locale of ["en", "pl", "es"]) {
      const { messages, writes } = await context(locale);
      const result = await registerAction({ locale: "invalid", values: { password: "untrusted" } }, data({ ...valid, email: "bad", confirmPassword: "wrong", locale: "invalid" }));
      assert.equal(result.locale, locale);
      assert.equal(result.fieldErrors.email[0], messages.validation.email);
      assert.equal(result.fieldErrors.confirmPassword[0], messages.validation.passwordMismatch);
      assert.deepEqual(result.values, { username: valid.username, email: "bad" });
      assert.ok(!JSON.stringify(result).includes(valid.password));
      assert.deepEqual(writes, []);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("successful action sends only API fields, writes tokens and redirects without returning session", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const { writes } = await context("pl");
    globalThis.fetch = async (url, init) => {
      assert.ok(url.endsWith("/auth/register"));
      assert.deepEqual(JSON.parse(init.body), { username: valid.username, email: valid.email, password: valid.password });
      return Response.json(authSession(), { status: 201 });
    };
    await assert.rejects(registerAction({}, data({ ...valid, roles: "ADMIN", isActive: "false" })), (error) => error.message === "NEXT_REDIRECT" && error.path === "/");
    assert.deepEqual(writes.map(([name]) => name), ["accessToken", "refreshToken"]);
    assert.ok(writes.every(([, , options]) => options.httpOnly && options.sameSite === "lax"));
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});

test("API failures return safe translated registration errors without writing cookies", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const locale of ["en", "pl", "es"]) {
      const { messages, writes } = await context(locale);
      for (const [status, body, expected] of [
        [409, { code: "EMAIL_ALREADY_IN_USE", message: valid.password }, messages.errors.emailAlreadyInUse],
        [409, { code: "UNKNOWN", message: valid.password }, messages.errors.unexpected],
        [409, { message: valid.password }, messages.errors.emailAlreadyInUse],
        [400, { code: "VALIDATION_FAILED", fieldErrors: [{ field: "email", code: "EMAIL", value: valid.password }] }, messages.errors.invalidInput],
        [503, { code: "INTERNAL_ERROR", message: valid.password }, messages.errors.serviceUnavailable],
        [201, { accessToken: "bad", password: valid.password }, messages.errors.unexpected],
      ]) {
        globalThis.fetch = async () => Response.json(body, { status });
        const result = await registerAction({}, data(valid));
        assert.equal(result.status, "error");
        assert.equal(result.message, expected);
        if (status === 400) assert.deepEqual(result.fieldErrors.email, [messages.validation.email]);
        assert.ok(!JSON.stringify(result).includes(valid.password));
      }
      globalThis.fetch = async () => { throw new TypeError("private network details"); };
      assert.equal((await registerAction({}, data(valid))).message, messages.errors.serviceUnavailable);
      assert.deepEqual(writes, []);
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__authTestContext; }
});
