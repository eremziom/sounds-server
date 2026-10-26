import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

test("request languages preserve route guards, redirects and private HTML/RSC", { timeout: 60000 }, async () => {
  const catalogs = Object.fromEntries(await Promise.all(["en", "pl", "es"].map(async (locale) => [
    locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")),
  ])));
  const api = createServer((request, response) => {
    const role = request.headers.authorization?.replace("Bearer ", "");
    if (request.url !== "/auth/me" || !["USER", "ARTIST", "ADMIN"].includes(role)) {
      response.writeHead(401).end();
      return;
    }
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ id: 1, isActive: true, roles: [{ key: role }] }));
  });
  api.listen(0, "127.0.0.1");
  await once(api, "listening");

  const portReservation = createServer();
  portReservation.listen(0, "127.0.0.1");
  await once(portReservation, "listening");
  const port = portReservation.address().port;
  await new Promise((resolve) => portReservation.close(resolve));

  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, API_URL: `http://127.0.0.1:${api.address().port}` },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  next.stdout.on("data", (chunk) => { output += chunk; });
  next.stderr.on("data", (chunk) => { output += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  async function fetchRoute(path, headers) {
    let response = await fetch(`${origin}${path}`, { headers, redirect: "manual" });
    const location = response.headers.get("location");
    // Next normalizes the _rsc cache key before handling RSC requests.
    if (response.status === 307 && location) {
      const target = new URL(location, origin);
      if (target.origin === origin && target.pathname === path) {
        await response.text();
        response = await fetch(target, { headers, redirect: "manual" });
      }
    }
    return response;
  }

  function assertPrivate(response) {
    const cacheControl = response.headers.get("cache-control") ?? "";
    assert.match(cacheControl, /private/);
    assert.match(cacheControl, /no-store/);
    assert.doesNotMatch(cacheControl, /s-maxage/);
  }

  function assertLocale(body, locale, rsc) {
    if (rsc) assert.ok(body.includes(`"locale":"${locale}"`), `Client locale: ${locale}`);
    else assert.match(body, new RegExp(`<html[^>]*lang="${locale}"`));
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`${origin}/login`)).ok;
      } catch { /* Wait for the production server to listen. */ }
      if (ready || next.exitCode !== null) break;
      await setTimeout(100);
    }
    assert.ok(ready, output);

    const variants = ["en", "pl", "es"].flatMap((locale) => [
      { locale, rsc: false }, { locale, rsc: true },
    ]);
    for (const { locale, rsc } of variants) {
      for (const role of [undefined, "USER", "ARTIST", "ADMIN", "invalid"]) {
        const headers = { Cookie: `locale=${locale}`, "Accept-Language": "de-DE" };
        if (role) headers.Cookie += `; accessToken=${role}`;
        if (rsc) headers.RSC = "1";

        for (const path of ["/login", "/register", "/access-denied"]) {
          const response = await fetchRoute(path, headers);
          assert.equal(response.status, 200, `${path}: ${role}, RSC=${rsc}`);
          assertPrivate(response);
          const body = await response.text();
          assertLocale(body, locale, rsc);
          if (!rsc) {
            assert.ok(body.includes(catalogs[locale].common.language.label));
            assert.match(body, /<select[^>]*name="locale"/);
            for (const name of ["English", "Polski", "Español"]) assert.ok(body.includes(name));
            assert.match(body, new RegExp(`<option(?=[^>]*value="${locale}")(?=[^>]*selected="")[^>]*>`));
          }
          if (path !== "/register") {
            const messages = catalogs[locale];
            const heading = path === "/login" ? messages.auth.login.title : messages.errors.accessDenied.title;
            assert.ok(body.includes(heading), `${path}: ${locale}, RSC=${rsc}`);
            assert.ok(body.includes(path === "/login" ? messages.metadata.login.title : messages.metadata.accessDenied.title));
          }
        }

        for (const [path, allowedRoles, heading] of [
          ["/", ["USER", "ARTIST"], "Strona główna aplikacji Sounds"],
          ["/admin", ["ADMIN"], "Panel administracyjny"],
        ]) {
          const response = await fetchRoute(path, headers);
          const body = await response.text();
          const context = `${path}: ${role}, RSC=${rsc}`;
          if (allowedRoles.includes(role)) {
            assert.equal(response.status, 200, context);
            assertPrivate(response);
            assertLocale(body, locale, rsc);
            assert.ok(body.includes(heading), context);
            assert.ok(!body.includes("NEXT_REDIRECT"), context);
          } else {
            const target = !role || role === "invalid" ? "/login" : "/access-denied";
            assert.ok(
              response.headers.get("location") === target || body.includes(`NEXT_REDIRECT;replace;${target};`),
              `Expected redirect to ${target}: ${context}`,
            );
            // Metadata can include the admin title; the guarded page body must not render.
            assert.ok(!body.includes(path === "/" ? heading : "Tutaj pojawią się narzędzia"), context);
            const destination = await fetchRoute(target, headers);
            assert.equal(destination.status, 200, context);
            const destinationBody = await destination.text();
            const messages = catalogs[locale];
            assert.ok(destinationBody.includes(target === "/login" ? messages.auth.login.title : messages.errors.accessDenied.title), context);
            assertLocale(destinationBody, locale, rsc);
          }
        }
      }
    }
    // Reuse exactly the same URL while alternating users/languages to catch cache leaks.
    for (const rsc of [false, true]) {
      for (const [cookie, language, locale] of [
        ["locale=pl", "es-MX", "pl"],
        ["locale=es", "pl-PL", "es"],
        ["locale=en", "pl-PL", "en"],
        [undefined, "de-DE, es-MX;q=0.8, pl-PL;q=0.9", "pl"],
        ["locale=invalid", "es-MX", "es"],
        [undefined, "pl;q=0, es;q=0.8", "es"],
        [undefined, "broken;q=bad", "en"],
        ["locale=de", "de-DE", "en"],
        [undefined, undefined, "en"],
        ["locale=pl", undefined, "pl"],
      ]) {
        const headers = {};
        if (cookie) headers.Cookie = cookie;
        if (language) headers["Accept-Language"] = language;
        if (rsc) headers.RSC = "1";
        const response = await fetchRoute("/login", headers);
        assert.equal(response.status, 200);
        assertPrivate(response);
        const body = await response.text();
        assertLocale(body, locale, rsc);
        assert.ok(body.includes(catalogs[locale].auth.login.title), `Negotiated content: ${locale}`);
      }
    }
    // Exercise the real Server Action over HTTP, including untrusted input.
    const manifest = JSON.parse(await readFile(new URL("../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
    const actionId = Object.entries(manifest.node).find(([, action]) => action.exportedName === "setLocale")?.[0];
    assert.ok(actionId, "Built setLocale action must exist");
    for (const value of ["pl", "es", "en", "de", "pl-PL", "../../pl", null, {}]) {
      const response = await fetch(`${origin}/login?returnTo=%2Fadmin`, {
        method: "POST",
        headers: {
          "Next-Action": actionId,
          "Content-Type": "text/plain;charset=UTF-8",
          Origin: origin,
          Cookie: "locale=en; accessToken=USER; refreshToken=keep-session",
          "Accept-Language": "es-MX",
        },
        body: JSON.stringify([value]),
        redirect: "manual",
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("location"), null);
      const body = await response.text();
      const saved = ["en", "pl", "es"].includes(value);
      assert.ok(body.includes(`"success":${saved}`), `Action result: ${JSON.stringify(value)}`);
      const cookies = response.headers.getSetCookie();
      if (saved) {
        assert.equal(cookies.length, 1, "Only the language cookie may change");
        assert.match(cookies[0], new RegExp(`^locale=${value};`));
        for (const attribute of [/Path=\//i, /SameSite=lax/i, /Secure/i, /HttpOnly/i, /Max-Age=31536000/i]) {
          assert.match(cookies[0], attribute);
        }
        const page = await fetchRoute("/login", { Cookie: `locale=${value}`, "Accept-Language": "es-MX" });
        const html = await page.text();
        assertLocale(html, value, false);
        assert.ok(html.includes(catalogs[value].auth.login.title));
      } else assert.deepEqual(cookies, [], "Invalid locales cannot change cookies");
    }
  } finally {
    next.kill();
    if (next.exitCode === null) await once(next, "exit");
    await new Promise((resolve) => api.close(resolve));
  }
});
