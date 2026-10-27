import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire, register } from "node:module";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withRegistrationBrowser } from "./helpers/register-browser.mjs";

async function main() {
  const root = fileURLToPath(new URL("../../..", import.meta.url));
  const apiDirectory = path.join(root, "apps/api");
  const requireApi = createRequire(path.join(apiDirectory, "package.json"));
  requireApi("dotenv").config({
    path: path.join(apiDirectory, ".env"),
    quiet: true,
  });
  register(new URL("./helpers/server-only-loader.mjs", import.meta.url));
  const auth = await import("../src/api/auth.ts");
  const { Pool } = requireApi("pg");
  const databaseName = `sounds_ui_auth_test_${randomUUID().replaceAll("-", "")}`;
  assert.ok(
    process.env.DATABASE_URL,
    "DATABASE_URL must be configured for the isolated API test",
  );
  const testUrl = new URL(process.env.DATABASE_URL);
  testUrl.pathname = `/${databaseName}`;
  const admin = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  let created = false,
    app,
    prisma,
    db;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    process.env.DATABASE_URL = testUrl.toString();
    process.env.JWT_SECRET = randomUUID();
    process.env.JWT_EXPIRES_IN = "15m";
    process.env.REFRESH_SESSION_DAYS = "30";
    execFileSync(
      process.execPath,
      [
        path.join(apiDirectory, "node_modules/prisma/build/index.js"),
        "migrate",
        "deploy",
      ],
      { cwd: apiDirectory, env: process.env, stdio: "pipe" },
    );
    db = new Pool({ connectionString: testUrl.toString() });
    await db.query(
      await readFile(path.join(apiDirectory, "prisma/seed-rbac.sql"), "utf8"),
    );
    const { NestFactory } = requireApi("@nestjs/core");
    const { AppModule } = requireApi(
      path.join(apiDirectory, "dist/src/app.module.js"),
    );
    const { PrismaService } = requireApi(
      path.join(apiDirectory, "dist/src/prisma/prisma.service.js"),
    );
    const { createApiValidationPipe } = requireApi(
      path.join(apiDirectory, "dist/src/common/api-validation.pipe.js"),
    );
    app = await NestFactory.create(AppModule, { logger: false });
    app.useGlobalPipes(createApiValidationPipe());
    await app.listen(0, "127.0.0.1");
    prisma = app.get(PrismaService);
    const options = { apiUrl: await app.getUrl() };
    const input = {
      username: "ui-auth-tester",
      email: "ui-auth@example.com",
      password: "Secret123!",
    };
    const registered = await auth.register(input, options);
    assert.ok(
      registered.ok,
      "Real API registration must pass session validation",
    );
    assert.equal(registered.data.user.username, input.username);
    assert.deepEqual(registered.data.user.roles, [{ key: "USER" }]);
    const me = await auth.getSessionUser(registered.data.accessToken, options);
    assert.ok(me.ok, "Real API session profile must validate");
    assert.equal(me.data.id, registered.data.user.id);
    const duplicate = await auth.register(input, options);
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.error.body.code, "EMAIL_ALREADY_IN_USE");
    const wrong = await auth.login(
      { login: input.username, password: "Wrong123!" },
      options,
    );
    assert.equal(wrong.status, 401);
    assert.equal(wrong.error.body.code, "AUTH_INVALID_CREDENTIALS");
    const invalid = await auth.register(
      { ...input, username: "x", password: "short" },
      options,
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.error.body.code, "VALIDATION_FAILED");
    assert.ok(
      invalid.error.body.fieldErrors.some(
        (error) => error.code === "LENGTH" && error.params.min === 3,
      ),
    );
    assert.ok(!JSON.stringify(invalid).includes("short"));
    const loggedIn = await auth.login(
      { login: input.username, password: input.password },
      options,
    );
    assert.ok(loggedIn.ok, "Real API login must validate");
    const refreshed = await auth.refresh(registered.data.refreshToken, options);
    assert.ok(refreshed.ok, "Real API refresh must validate");
    assert.equal(
      refreshed.data.refreshTokenExpiresAt,
      registered.data.refreshTokenExpiresAt,
    );
    assert.ok((await auth.logout(refreshed.data.refreshToken, options)).ok);
    assert.equal(
      (await auth.getSessionUser(refreshed.data.accessToken, options)).status,
      401,
    );
    assert.ok((await auth.logoutAll(loggedIn.data.accessToken, options)).ok);
    assert.equal(
      (await auth.getSessionUser(loggedIn.data.accessToken, options)).status,
      401,
    );
    await withRegistrationBrowser(options.apiUrl, async ({ send, open, fill, submit, waitFor, evaluate, origin }) => {
      for (const locale of ["en", "pl", "es"]) {
        await open(locale);
        const email = `ui-browser-${locale}@example.com`;
        await fill({ username: `browser-${locale}`, email, password: "Secret123!", confirmPassword: "Secret123!" });
        await submit();
        await waitFor("location.pathname==='/' && document.querySelector('h1')?.textContent.includes('Sounds')");
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.equal(cookies.find((cookie) => cookie.name === "locale").value, locale);
        const access = cookies.find((cookie) => cookie.name === "accessToken");
        assert.ok(access.httpOnly && access.secure && access.sameSite === "Lax");
        assert.ok((await auth.getSessionUser(access.value, options)).ok);
        assert.ok(!(await evaluate("document.documentElement.outerHTML")).includes(access.value));
        await send("Page.reload");
        await waitFor(`location.pathname==='/' && document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('h1')?.textContent.includes('Sounds')`);
        await open(locale);
        await fill({ username: `browser-${locale}`, email, password: "Secret123!", confirmPassword: "Secret123!" });
        await submit();
        const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
        await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(messages.errors.emailAlreadyInUse)})`);
        console.log(`Real UI → Next action → NestJS/PostgreSQL registration, session and duplicate email: ${locale} OK`);
      }
    });
    console.log(
      "UI auth client against real NestJS/PostgreSQL: register, login, me, refresh, logout, logout-all, validation and HTTP error codes passed.",
    );
  } finally {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (db) await db.end();
    if (created) {
      assert.match(databaseName, /^sounds_ui_auth_test_[a-f0-9]{32}$/);
      await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
    }
    await admin.end();
    console.log(
      "Isolated test database removed. Application database unchanged.",
    );
  }
}
main().catch((error) => {
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : `Auth API integration failed (${error.code ?? error.name}); connection details omitted.`,
  );
  process.exitCode = 1;
});
