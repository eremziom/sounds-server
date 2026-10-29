import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire, register } from "node:module";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

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
    // All role mutations below affect only the disposable database created above.
    const loginAccounts = [];
    for (const [name, roles, target] of [
      ["user", ["USER"], "/"], ["artist", ["ARTIST"], "/"],
      ["admin", ["ADMIN"], "/admin"], ["combined", ["USER", "ARTIST", "ADMIN"], "/"],
      ["no-role", [], "/access-denied"], ["inactive", ["USER"], null],
    ]) {
      const account = { username: `login-${name}`, email: `login-${name}@example.com`, password: "Secret123!" };
      const result = await auth.register(account, options);
      assert.ok(result.ok);
      const userId = result.data.user.id;
      await prisma.userRole.deleteMany({ where: { userId } });
      for (const key of roles) {
        const role = await prisma.role.findUniqueOrThrow({ where: { key } });
        await prisma.userRole.create({ data: { userId, roleId: role.id } });
      }
      if (name === "inactive") await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
      loginAccounts.push({ ...account, target });
    }
    await withAuthBrowser(options.apiUrl, async ({ send, open, fill, submit, waitFor, evaluate, origin }) => {
      // Two real tabs share cookies, but have separate schedulers/pending work.
      const combined = loginAccounts.find((account) => account.username === "login-combined");
      const tabLogin = await auth.login({ login: combined.username, password: combined.password }, options);
      assert.ok(tabLogin.ok);
      await send("Network.setCookies", { cookies: [
        { name: "accessToken", value: tabLogin.data.accessToken, url: origin, path: "/", httpOnly: true },
        { name: "refreshToken", value: tabLogin.data.refreshToken, url: origin, path: "/", httpOnly: true },
        { name: "locale", value: "en", url: origin, path: "/" },
      ] });
      await send("Page.navigate", { url: `${origin}/admin` });
      await waitFor("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
      const { targetId } = await send("Target.createTarget", { url: `${origin}/admin` });
      const { sessionId: secondTab } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Runtime.enable", {}, secondTab);
      const evaluateSecond = async (expression) => {
        const response = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, secondTab);
        assert.equal(response.exceptionDetails, undefined);
        return response.result.value;
      };
      for (let attempt = 0; ; attempt++) {
        if (await evaluateSecond("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'")) break;
        assert.ok(attempt < 100, "Second tab must mount the protected runtime");
        await delay(100);
      }
      const { SessionsService } = requireApi(path.join(apiDirectory, "dist/src/auth/sessions.service.js"));
      const sessions = app.get(SessionsService);
      const originalRefresh = sessions.refresh.bind(sessions);
      const submittedTokens = [];
      const rotationResults = [];
      let releaseRefresh;
      const refreshGate = new Promise((resolve) => { releaseRefresh = resolve; });
      sessions.refresh = async (token) => {
        submittedTokens.push(token);
        await refreshGate;
        const result = await originalRefresh(token);
        rotationResults.push(result);
        return result;
      };
      try {
        const expiry = Date.parse(tabLogin.data.accessTokenExpiresAt);
        // Accelerate the browser clocks into the renewal window while the API
        // keeps its real clock. Hold responses so both requests use old cookies.
        const trigger = `Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'}); window.realNow=Date.now; Date.now=()=>${expiry - 30_000}; window.dispatchEvent(new Event('focus'))`;
        await evaluate(trigger);
        await evaluateSecond(trigger);
        for (let attempt = 0; submittedTokens.length < 2; attempt++) {
          assert.ok(attempt < 100, "Both tabs must start renewal before either response returns");
          await delay(100);
        }
        assert.deepEqual(submittedTokens, [tabLogin.data.refreshToken, tabLogin.data.refreshToken]);
        await evaluate("Date.now=realNow");
        await evaluateSecond("Date.now=realNow");
        releaseRefresh();
        for (let attempt = 0; ; attempt++) {
          const firstActive = await evaluate("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
          const secondActive = await evaluateSecond("document.querySelector('[data-application-runtime]')?.dataset.sessionStatus==='active'");
          if (rotationResults.length === 2 && firstActive && secondActive) break;
          assert.ok(attempt < 100, "Both tabs must resume after rotation");
          await delay(100);
        }
        assert.deepEqual(rotationResults[0], rotationResults[1]);
        const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        const access = cookies.find((cookie) => cookie.name === "accessToken");
        const refresh = cookies.find((cookie) => cookie.name === "refreshToken");
        assert.equal(access.value, rotationResults[0].accessToken);
        assert.equal(refresh.value, rotationResults[0].refreshToken);
        assert.ok(access.httpOnly && refresh.httpOnly);
        assert.ok((await auth.getSessionUser(access.value, options)).ok);
        const next = await auth.refresh(refresh.value, options);
        assert.ok(next.ok, "The cookie left by two tabs must remain usable");
        assert.equal(next.data.refreshToken, refresh.value);
        await evaluate("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]').click()");
        for (let attempt = 0; ; attempt++) {
          if (await evaluateSecond("location.pathname==='/login' && !!document.querySelector('input[name=login]')")) break;
          assert.ok(attempt < 100, "The other tab must receive logout and leave the protected runtime");
          await delay(100);
        }
        await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]')");
        const afterLogout = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.ok(!afterLogout.some((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)));
        assert.equal((await auth.getSessionUser(access.value, options)).status, 401);
        assert.equal((await auth.refresh(refresh.value, options)).status, 401);
        console.log("Two real tabs: UI logout revokes the API session, clears cookies and redirects the peer tab OK");
        console.log("Two real tabs: concurrent Next actions return the same pair, preserve valid HttpOnly cookies and keep both runtimes active OK");
      } finally {
        releaseRefresh();
        sessions.refresh = originalRefresh;
        await send("Target.closeTarget", { targetId });
      }
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
        const registrationRefresh = cookies.find((cookie) => cookie.name === "refreshToken").value;
        await evaluate("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]').click()");
        await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]') && !document.querySelector('form[data-auth-logout]')");
        assert.equal((await auth.getSessionUser(access.value, options)).status, 401);
        assert.equal((await auth.refresh(registrationRefresh, options)).status, 401);
        await open(locale);
        await fill({ username: `browser-${locale}`, email, password: "Secret123!", confirmPassword: "Secret123!" });
        await submit();
        const messages = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8"));
        await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(messages.errors.emailAlreadyInUse)})`);
        console.log(`Real UI → Next action → NestJS/PostgreSQL registration, session and duplicate email: ${locale} OK`);

        for (const login of [`browser-${locale}`, email]) {
          await open(locale, "/login");
          await fill({ login, password: "Secret123!" });
          await submit();
          await waitFor(`location.pathname==='/' && document.querySelector('h1')?.textContent===${JSON.stringify(messages.app.home.title)}`);
          assert.equal(await evaluate("document.documentElement.lang"), locale);
        }
        for (const [login, password] of [
          [email, "Wrong123!"], ["nonexistent-account", "Secret123!"],
          ["login-inactive", "Secret123!"],
        ]) {
          await open(locale, "/login");
          await fill({ login, password });
          await submit();
          await waitFor(`document.querySelector('[role=alert]')?.textContent.includes(${JSON.stringify(messages.errors.invalidCredentials)})`);
          assert.equal(await evaluate("document.querySelector('input[name=password]').value"), "");
          const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
          assert.ok(!cookies.some((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)));
          assert.equal(cookies.find((cookie) => cookie.name === "locale").value, locale);
        }
        for (const account of loginAccounts.filter((account) => account.target)) {
          await open(locale, "/login?returnTo=%2F%2Fexample.com");
          await fill({ login: account.username, password: account.password });
          await submit();
          const target = account.target;
          const heading = target === "/" ? messages.app.home.title
            : target === "/admin" ? messages.admin.home.title : messages.errors.accessDenied.title;
          await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('h1')?.textContent===${JSON.stringify(heading)}`);
          const cookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
          assert.equal(cookies.find((cookie) => cookie.name === "locale").value, locale);
          const access = cookies.find((cookie) => cookie.name === "accessToken");
          assert.ok(access.httpOnly && access.secure && access.sameSite === "Lax");
          const current = await auth.getSessionUser(access.value, options);
          if (target === "/access-denied") assert.equal(current.status, 403);
          else assert.ok(current.ok);
          assert.ok(!(await evaluate("document.documentElement.outerHTML")).includes(access.value));
          const rsc = await evaluate(`fetch(${JSON.stringify(`${target}?stage5=real-api`)}, {headers:{RSC:'1'},cache:'no-store'}).then(async response => ({
            status:response.status, type:response.headers.get('content-type'), cache:response.headers.get('cache-control'), body:await response.text()
          }))`);
          assert.equal(rsc.status, 200);
          assert.match(rsc.type, /text\/x-component/);
          assert.match(rsc.cache, /private/);
          assert.match(rsc.cache, /no-store/);
          assert.ok(rsc.body.includes(JSON.stringify(heading)));
          assert.ok(!rsc.body.includes(access.value));
          await send("Page.reload");
          await waitFor(`location.pathname===${JSON.stringify(target)} && document.querySelector('h1')?.textContent===${JSON.stringify(heading)} && document.documentElement.lang===${JSON.stringify(locale)}`);
          const secondary = await auth.login({ login: account.username, password: account.password }, options);
          assert.ok(secondary.ok);
          const scope = account.username === "login-artist" ? "current" : "all";
          await evaluate(`document.querySelector('form[data-auth-logout] button[data-logout-scope=${scope}]').click()`);
          await waitFor("location.pathname==='/login' && document.querySelector('input[name=login]') && !document.querySelector('form[data-auth-logout]')");
          const afterLogout = (await send("Network.getCookies", { urls: [origin] })).cookies;
          assert.ok(!afterLogout.some((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)));
          assert.equal(afterLogout.find((cookie) => cookie.name === "locale").value, locale);
          assert.equal((await auth.getSessionUser(access.value, options)).status, 401);
          assert.equal((await auth.refresh(cookies.find((cookie) => cookie.name === "refreshToken").value, options)).status, 401);
          const otherSession = await auth.getSessionUser(secondary.data.accessToken, options);
          if (scope === "all") {
            assert.equal(otherSession.status, 401);
            assert.equal((await auth.refresh(secondary.data.refreshToken, options)).status, 401);
          } else {
            assert.ok(otherSession.ok, "Current logout must preserve the other session");
            await auth.logout(secondary.data.refreshToken, options);
          }
        }
        await open(locale, "/login");
        await fill({ login: email, password: "Secret123!" });
        await submit();
        await waitFor("location.pathname==='/' && document.querySelector('form[data-auth-logout]')");
        const expiredCookies = (await send("Network.getCookies", { urls: [origin] })).cookies;
        await send("Network.deleteCookies", { name: "accessToken", url: origin });
        await send("Page.navigate", { url: `${origin}/login` });
        await waitFor("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]')");
        await evaluate("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]').click()");
        await waitFor("location.pathname==='/login' && !document.querySelector('form[data-auth-logout]')");
        assert.equal((await auth.refresh(expiredCookies.find((cookie) => cookie.name === "refreshToken").value, options)).status, 401);
        const afterExpired = (await send("Network.getCookies", { urls: [origin] })).cookies;
        assert.ok(!afterExpired.some((cookie) => ["accessToken", "refreshToken"].includes(cookie.name)));
        assert.equal(afterExpired.find((cookie) => cookie.name === "locale").value, locale);
        console.log(`Real UI register/logout/login, username/email, inactive accounts, role redirects, current/all session revocation and expired-access logout: ${locale} OK`);
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
