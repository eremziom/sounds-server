import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import { createTranslator } from "next-intl";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { initialAuthState } from "../src/components/auth/form-state.ts";

register("./helpers/auth-environment-loader.mjs", import.meta.url);
const { setAuthCookies, clearAuthCookies, getAuthCookies } =
  await import("../src/lib/auth-cookies.ts");
const { getAuthActionError } = await import("../src/lib/auth-action-state.ts");

function cookieStore() {
  const values = new Map([
    ["locale", { value: "pl", options: { maxAge: 31536000, path: "/" } }],
  ]);
  const writes = [];
  const store = {
    get(name) {
      return values.get(name);
    },
    set(name, value, options) {
      writes.push({ name, value, options });
      values.set(name, { value, options });
    },
  };
  globalThis.__authTestContext = { cookies: () => store };
  return { values, writes };
}

test("token writes use independent API expiry dates and preserve every locale cookie setting", async () => {
  const previous = process.env.NODE_ENV;
  try {
    for (const environment of ["development", "production"]) {
      process.env.NODE_ENV = environment;
      const { values, writes } = cookieStore();
      const language = values.get("locale");
      const session = authSession();
      await setAuthCookies(session);
      assert.deepEqual(
        writes.map((write) => write.name),
        ["accessToken", "refreshToken"],
      );
      for (const [index, field] of ["accessToken", "refreshToken"].entries()) {
        assert.equal(writes[index].value, session[field]);
        assert.deepEqual(writes[index].options, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: environment === "production",
          expires: new Date(session[`${field}ExpiresAt`]),
        });
        assert.ok(!Object.hasOwn(writes[index].options, "domain"));
      }
      assert.deepEqual(await getAuthCookies(), {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      });
      await clearAuthCookies();
      assert.deepEqual(
        writes.slice(2).map((write) => write.name),
        ["accessToken", "refreshToken"],
      );
      for (const write of writes.slice(2)) {
        assert.equal(write.value, "");
        assert.equal(write.options.maxAge, 0);
        assert.equal(write.options.expires.getTime(), 0);
        assert.equal(write.options.httpOnly, true);
        assert.equal(write.options.secure, environment === "production");
        assert.equal(write.options.path, "/");
        assert.equal(write.options.sameSite, "lax");
      }
      assert.strictEqual(values.get("locale"), language);
    }
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    delete globalThis.__authTestContext;
  }
});

test("invalid session data is rejected before either token can be written", async () => {
  for (const bad of [
    authSession({ refreshToken: "bad" }),
    authSession({ accessTokenExpiresAt: "invalid" }),
    authSession({ refreshTokenExpiresAt: "2000-01-01T00:00:00Z" }),
  ]) {
    const { writes } = cookieStore();
    await assert.rejects(setAuthCookies(bad), /Invalid authentication session/);
    assert.deepEqual(writes, []);
  }
  const { writes } = cookieStore();
  assert.deepEqual(await getAuthCookies(), {
    accessToken: undefined,
    refreshToken: undefined,
  });
  assert.deepEqual(writes, []);
  delete globalThis.__authTestContext;
});

test("action error helper returns request-localized state with no credential or raw API data", async () => {
  for (const locale of ["en", "pl", "es"]) {
    const messages = JSON.parse(
      await readFile(
        new URL(`../messages/${locale}.json`, import.meta.url),
        "utf8",
      ),
    );
    const translator = createTranslator({ locale, messages });
    globalThis.__authTestContext = { locale, translator };
    assert.deepEqual(initialAuthState(locale), {
      status: "idle",
      locale,
      fieldErrors: {},
    });
    const state = await getAuthActionError(
      {
        kind: "http",
        status: 401,
        body: {
          code: "AUTH_INVALID_CREDENTIALS",
          message: "private-password-token",
        },
      },
      "login",
    );
    assert.deepEqual(state, {
      status: "error",
      locale,
      message: messages.errors.invalidCredentials,
      fieldErrors: {},
    });
    assert.ok(!JSON.stringify(state).includes("private-password-token"));
  }
  delete globalThis.__authTestContext;
});
