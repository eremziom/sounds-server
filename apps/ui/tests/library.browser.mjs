import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let roles = ["USER"], mode = "list", trackCalls = 0, refreshCalls = 0, audioCalls = 0;
const audioFile = await readFile(new URL("../../api/src/audio/fixtures/tone.mp3", import.meta.url));
let gate, release;
const session = authSession({
  accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature`,
});
const tracks = [
  { id: 1, ownerId: 1, author: "night-artist", title: "First recording", description: "Line one\nLine two", genre: "Electronic", subgenre: "Ambient", publicationDate: "2026-01-02", bpm: { bpmFrom: 90, bpmTo: 120 }, hasAudio: true },
  { id: 2, ownerId: null, title: "Historical track", description: null, genre: null, subgenre: null, publicationDate: "2020-02-29", bpm: { bpmFrom: 100, bpmTo: 100 }, hasAudio: false },
];
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    return res.end(JSON.stringify({ ...session, user: { ...session.user, roles: roles.map(key => ({ key })) } }));
  }
  if (req.headers.authorization !== `Bearer ${session.accessToken}`) return res.writeHead(401).end('{}');
  if (req.url === "/tracks/1/audio") {
    audioCalls++;
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioFile.length);
    return res.end(audioFile);
  }
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, permissions: [], roles: roles.map(key => ({ key })), sessionExpiresAt: session.refreshTokenExpiresAt }));
  if (req.url === "/tracks") {
    trackCalls++;
    if (gate) await gate;
    if (mode === "failure") return res.writeHead(503).end(JSON.stringify({ code: "INTERNAL_ERROR", message: "private backend details" }));
    if (mode === "forbidden") return res.writeHead(403).end('{}');
    return res.end(JSON.stringify(mode === "empty" ? [] : tracks));
  }
  res.writeHead(404).end('{}');
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    for (const locale of ["en", "pl", "es"]) {
      const t = JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), "utf8")).app.library;
      async function enter(nextRoles = ["USER"], nextMode = "list", access = true, path = "/library") {
        roles = nextRoles; mode = nextMode; gate = undefined;
        await send("Network.deleteCookies", { name: "accessToken", url: origin });
        await send("Network.setCookies", { cookies: [
          { name: "locale", value: locale, url: origin, path: "/" },
          { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
          ...(access ? [{ name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true }] : []),
        ] });
        await send("Page.navigate", { url: `${origin}${path}` });
      }
      for (const allowed of [["USER"], ["ARTIST"], ["USER", "ADMIN"], ["ARTIST", "ADMIN"]]) {
        await enter(allowed);
        await waitFor("document.querySelector('[data-track-id=\"2\"]')");
        const text = await evaluate("document.querySelector('[data-library]').innerText");
        for (const value of [t.title, t.trackTitle, t.genre, t.subgenre, t.bpm, t.publicationDate, "First recording", "Electronic", "Ambient", "Historical track", "90–120"]) assert.ok(text.includes(value), value);
        assert.equal(text.includes("Line one"), false, "descriptions stay out of the table");
        assert.ok(text.includes(t.author));
        assert.equal(await evaluate("document.querySelector('[data-track-id=\"1\"] td:nth-child(3)').textContent"), "night-artist");
        assert.equal(await evaluate("document.querySelector('[data-track-id=\"2\"] td:nth-child(3)').textContent"), "—");
        assert.equal(await evaluate("document.querySelectorAll('[data-library] th').length"), 7);
        const expectedDate = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Europe/Warsaw" }).format(new Date("2026-01-02T00:00:00Z"));
        assert.equal(await evaluate("document.querySelector('time').textContent"), expectedDate);
        assert.equal(await evaluate("document.querySelector('[data-track-id=\"1\"]').tagName"), "TR");
        assert.equal(await evaluate("document.querySelector('[data-track-id=\"2\"] button')"), null);
        assert.equal(await evaluate("document.querySelector('[data-track-id=\"1\"] a').hasAttribute('href')"), false);
        assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-track-id=\"1\"] a')).textDecorationLine"), "none");
        assert.deepEqual(await evaluate("Array.from(document.querySelectorAll('[data-track-id]'), n=>n.dataset.trackId)"), ["1", "2"]);
        assert.equal(await evaluate("document.querySelector('time').dateTime"), "2026-01-02");
        assert.equal(await evaluate("document.querySelectorAll('[data-library] button').length"), 1);
      }
      const beforeAudio = audioCalls;
      const widths = await evaluate("Array.from(document.querySelectorAll('[data-library] th'), cell => cell.getBoundingClientRect().width)");
      assert.equal(widths[0], 24, "play column keeps the button width");
      const proportions = [35, 15, 10, 15, 10, 15];
      const availableWidth = widths.slice(1).reduce((total, width) => total + width, 0);
      proportions.forEach((percent, index) => {
        assert.ok(Math.abs(widths[index + 1] - availableWidth * percent / 100) < 1, `column ${index + 1} takes ${percent}%`);
      });
      await send("Runtime.evaluate", { userGesture: true, expression: "document.querySelector('[data-persistent-media] audio').loop = true; document.querySelector('[data-track-id=\"1\"] button').click()" });
      await waitFor("document.querySelector('[data-track-id=\"1\"] button').getAttribute('aria-pressed') === 'true'");
      await waitFor("document.querySelector('[data-persistent-media] audio').readyState >= 2");
      assert.ok(audioCalls > beforeAudio, "play requests the authenticated audio endpoint");
      assert.equal(await evaluate("document.querySelector('[data-persistent-media] audio').getAttribute('src')"), "/api/tracks/1/audio");
      assert.equal(await evaluate("document.querySelector('[data-track-id=\"1\"] button').getAttribute('aria-label')"), t.pauseTrack.replace("{title}", tracks[0].title));
      await waitFor("!document.querySelector('[data-track-id=\"1\"] button').disabled");
      await evaluate("document.querySelector('[data-track-id=\"1\"] button').click()");
      await waitFor("document.querySelector('[data-track-id=\"1\"] button').getAttribute('aria-pressed') === 'false'");
      assert.equal(await evaluate("document.querySelector('[data-persistent-media] audio').paused"), true);
      for (const denied of [["ADMIN"], []]) {
        const before = trackCalls;
        await enter(denied);
        await waitFor("location.pathname==='/access-denied'");
        assert.equal(trackCalls, before, "guard must run before fetching tracks");
      }
      const beforeRefresh = refreshCalls;
      await enter(["USER"], "list", false, "/library?view=all");
      await waitFor("location.pathname==='/library' && location.search==='?view=all' && document.querySelector('[data-track-id]')");
      assert.equal(refreshCalls, beforeRefresh + 1);
      assert.equal(await evaluate("document.cookie.includes('Token')"), false);

      await enter(["USER"], "empty");
      await waitFor("document.querySelector('[data-library-empty]')");
      assert.equal(await evaluate("document.querySelector('[data-library-empty]').textContent"), t.empty);
      await enter(["USER"], "failure");
      await waitFor("document.querySelector('[data-library-error] button')");
      assert.equal(await evaluate("document.querySelector('[data-library-error] [role=alert]').textContent"), t.loadFailed);
      assert.equal(await evaluate("document.body.innerText.includes('private backend details')"), false);
      const beforeRetry = trackCalls;
      mode = "list";
      await evaluate("document.querySelector('[data-library-error] button').click()");
      await waitFor("document.querySelector('[data-track-id]')");
      assert.equal(trackCalls, beforeRetry + 1);

      await enter(["USER"], "list", true, "/");
      await waitFor("document.querySelector('a[href=\"/library\"]')");
      gate = new Promise(resolve => { release = resolve; });
      await evaluate("document.querySelector('a[href=\"/library\"]').click()");
      await waitFor("document.querySelector('[data-application-runtime] main [role=status]')");
      assert.equal(await evaluate("document.querySelector('main [role=status]').textContent"), t.loading);
      release(); gate = undefined;
      await waitFor("location.pathname==='/library' && document.querySelector('[data-track-id]')");
      assert.equal(await evaluate("!!document.querySelector('a[href=\"/library\"][data-active]')"), true);
      await enter(["USER"], "forbidden");
      await waitFor("location.pathname==='/access-denied'");
      console.log(`Library: ${locale} passed`);
    }
  });
} finally {
  release?.();
  await new Promise(resolve => api.close(resolve));
}
