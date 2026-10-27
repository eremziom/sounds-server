import assert from "node:assert/strict";
import { test } from "node:test";
import { register as registerLoader } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { authSession } from "./helpers/auth-fixtures.mjs";

registerLoader("./helpers/server-only-loader.mjs", import.meta.url);
const api = await import("../src/api/auth.ts");
const { ApiRequestError } = await import("../src/api/client.ts");

test("auth endpoints send only their allowed fields, with no-store, timeout and redirects disabled", async () => {
  const session = authSession();
  const options = {
    apiUrl: "http://api/base/",
    request: async (url, init) => {
      assert.equal(init.method, "POST");
      assert.equal(init.cache, "no-store");
      assert.equal(init.redirect, "error");
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.headers["Content-Type"], "application/json");
      const body = JSON.parse(init.body);
      if (url.endsWith("/register"))
        assert.deepEqual(body, {
          username: "User",
          email: "user@example.com",
          password: "Secret123!",
        });
      else if (url.endsWith("/login"))
        assert.deepEqual(body, { login: "User", password: "Secret123!" });
      else assert.deepEqual(body, { refreshToken: session.refreshToken });
      assert.ok(url.startsWith("http://api/base/auth/"));
      return Response.json(session, {
        status: url.endsWith("/refresh") ? 200 : 201,
      });
    },
  };
  assert.deepEqual(
    await api.register(
      {
        username: "User",
        email: "user@example.com",
        password: "Secret123!",
        locale: "pl",
        role: "ADMIN",
        confirmPassword: "private",
      },
      options,
    ),
    { ok: true, data: session },
  );
  assert.deepEqual(
    await api.login(
      { login: "User", password: "Secret123!", extra: "drop" },
      options,
    ),
    { ok: true, data: session },
  );
  assert.deepEqual(await api.refresh(session.refreshToken, options), {
    ok: true,
    data: session,
  });
});

test("204 logout responses are not parsed as JSON and logout-all uses the access token", async () => {
  const options = {
    apiUrl: "http://api",
    request: async (url, init) => {
      if (url.endsWith("/logout-all")) {
        assert.equal(init.headers.Authorization, "Bearer token");
        assert.equal(init.body, undefined);
      } else
        assert.deepEqual(JSON.parse(init.body), { refreshToken: "refresh" });
      return {
        status: 204,
        ok: true,
        json() {
          assert.fail("204 must never be parsed");
        },
      };
    },
  };
  assert.deepEqual(await api.logout("refresh", options), {
    ok: true,
    data: true,
  });
  assert.deepEqual(await api.logoutAll("token", options), {
    ok: true,
    data: true,
  });
});

test("session parsing rejects malformed tokens, dates and users while projecting only safe user fields", async () => {
  const session = authSession();
  const invalid = [
    { ...session, accessToken: "not-a-jwt" },
    { ...session, accessToken: "x".repeat(4000) },
    { ...session, refreshToken: "invalid" },
    { ...session, refreshToken: "A".repeat(64) },
    { ...session, accessTokenExpiresAt: "tomorrow" },
    { ...session, accessTokenExpiresAt: "2000-01-01T00:00:00Z" },
    { ...session, refreshTokenExpiresAt: "2000-01-01T00:00:00Z" },
    { ...session, refreshTokenExpiresAt: "2099-02-30T00:00:00Z" },
    { ...session, user: { ...session.user, id: 0 } },
    { ...session, user: { ...session.user, id: 1.5 } },
    { ...session, user: { ...session.user, isActive: false } },
    { ...session, user: { ...session.user, username: "" } },
    { ...session, user: { ...session.user, roles: [null] } },
    { ...session, user: { ...session.user, roles: ["ADMIN"] } },
  ];
  for (const body of invalid) {
    assert.equal(api.parseAuthSession(body), undefined);
    const result = await api.login(
      { login: "User", password: "Secret123!" },
      { request: async () => Response.json(body, { status: 201 }) },
    );
    assert.deepEqual(result, {
      ok: false,
      status: 201,
      error: { kind: "invalid-response" },
    });
  }
  const body = {
    ...session,
    password: "private",
    user: {
      ...session.user,
      password: "private",
      roles: [{ key: "USER", description: "drop" }],
    },
  };
  assert.deepEqual(api.parseAuthSession(body), session);
  // The backend caps session lifetime independently of the JWT expiry.
  const nearExpiry = {
    ...session,
    refreshTokenExpiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  assert.deepEqual(api.parseAuthSession(nearExpiry), nearExpiry);
});

test("HTTP errors preserve actual status but retain no free-form text or credential values", async () => {
  const response = {
    code: "VALIDATION_FAILED",
    message: "private-password-token",
    password: "private-password-token",
    fieldErrors: [
      {
        field: "username",
        code: "LENGTH",
        params: { min: 3, max: 30, password: "private-password-token" },
        value: "private-password-token",
      },
      {
        field: "password",
        code: "PASSWORD_COMPLEXITY",
        target: "private-password-token",
      },
      { field: "refreshToken", code: "REQUIRED" },
    ],
  };
  const result = await api.register(
    { username: "x", email: "bad", password: "private-password-token" },
    { request: async () => Response.json(response, { status: 400 }) },
  );
  assert.deepEqual(result, {
    ok: false,
    status: 400,
    error: {
      kind: "http",
      status: 400,
      body: {
        code: "VALIDATION_FAILED",
        fieldErrors: [
          { field: "username", code: "LENGTH", params: { min: 3, max: 30 } },
          { field: "password", code: "PASSWORD_COMPLEXITY" },
        ],
      },
    },
  });
  assert.ok(!JSON.stringify(result).includes("private-password-token"));
  const legacy = await api.login(
    { login: "User", password: "private" },
    {
      request: async () =>
        Response.json({ message: "private" }, { status: 401 }),
    },
  );
  assert.deepEqual(legacy.error.body, { message: "" });
});

test("401 and 403 remain distinguishable even for malformed error bodies and missing tokens avoid requests", async () => {
  for (const status of [401, 403]) {
    const result = await api.getSessionUser("token", {
      request: async () => new Response("not-json", { status }),
    });
    assert.equal(result.status, status);
    assert.equal(result.error.kind, "invalid-response");
    assert.equal(
      await api.fetchSessionUser(
        "token",
        "http://api",
        async () => new Response(null, { status }),
      ),
      null,
    );
  }
  for (const action of [api.getSessionUser, api.logoutAll]) {
    const result = await action(undefined, {
      request() {
        assert.fail("No token must not call API");
      },
    });
    assert.equal(result.status, 401);
  }
  await assert.rejects(
    api.fetchSessionUser("token", "http://api", async () => {
      throw new Error("private-network-details");
    }),
    (error) => {
      assert.ok(error instanceof ApiRequestError);
      assert.equal(error.failure.kind, "network");
      assert.ok(!JSON.stringify(error).includes("private-network-details"));
      assert.ok(!error.message.includes("private-network-details"));
      return true;
    },
  );
});

test("network, timeout, invalid JSON and unexpected success statuses are distinct", async () => {
  const input = { login: "User", password: "Secret123!" };
  assert.equal(
    (
      await api.login(input, {
        request: async () => {
          throw new TypeError("offline");
        },
      })
    ).error.kind,
    "network",
  );
  assert.equal(
    (
      await api.login(input, {
        request: async () => {
          throw new DOMException("expired", "TimeoutError");
        },
      })
    ).error.kind,
    "timeout",
  );
  assert.equal(
    (
      await api.login(input, {
        request: async () => new Response("bad-json", { status: 201 }),
      })
    ).error.kind,
    "invalid-response",
  );
  assert.equal(
    (
      await api.login(input, {
        request: async () => Response.json(authSession(), { status: 200 }),
      })
    ).error.kind,
    "invalid-response",
  );
  assert.equal(
    (await api.login(input, { apiUrl: "https://name:private@example.com" }))
      .error.kind,
    "invalid-response",
  );
});

test(
  "real HTTP requests reject redirects and time out on stalled response bodies",
  { timeout: 10000 },
  async () => {
    let mode = "success";
    const requests = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      requests.push({
        path: request.url,
        body: Buffer.concat(chunks).toString(),
      });
      if (mode === "redirect") {
        response.writeHead(302, { location: "/should-not-follow" }).end();
        return;
      }
      if (mode === "stall") {
        response.writeHead(201, { "Content-Type": "application/json" });
        response.flushHeaders();
        return;
      }
      response
        .writeHead(201, { "Content-Type": "application/json" })
        .end(JSON.stringify(authSession()));
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const options = { apiUrl: `http://127.0.0.1:${server.address().port}` };
    try {
      assert.equal(
        (await api.login({ login: "User", password: "Secret123!" }, options))
          .ok,
        true,
      );
      assert.equal(requests[0].path, "/auth/login");
      mode = "redirect";
      const before = requests.length;
      assert.equal(
        (await api.login({ login: "User", password: "Secret123!" }, options))
          .ok,
        false,
      );
      assert.equal(
        requests.length,
        before + 1,
        "Redirect destination must not be requested",
      );
      mode = "stall";
      const result = await api.login(
        { login: "User", password: "Secret123!" },
        { ...options, timeoutMs: 100 },
      );
      assert.equal(result.error.kind, "timeout");
      assert.equal(result.status, 201);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
