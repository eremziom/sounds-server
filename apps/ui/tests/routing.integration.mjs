import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout } from "node:timers/promises";
import { test } from "node:test";

test("route guards enforce roles for documents and RSC navigation", { timeout: 30000 }, async () => {
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

    for (const rsc of [false, true]) {
      for (const role of [undefined, "USER", "ARTIST", "ADMIN", "invalid"]) {
        const headers = {};
        if (role) headers.Cookie = `accessToken=${role}`;
        if (rsc) headers.RSC = "1";

        for (const path of ["/login", "/register", "/access-denied"]) {
          const response = await fetchRoute(path, headers);
          assert.equal(response.status, 200, `${path}: ${role}, RSC=${rsc}`);
          await response.text();
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
          }
        }
      }
    }
  } finally {
    next.kill();
    if (next.exitCode === null) await once(next, "exit");
    await new Promise((resolve) => api.close(resolve));
  }
});
