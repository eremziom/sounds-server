import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { authSession } from "./helpers/auth-fixtures.mjs";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

let session, refreshCalls = 0;
const deadline = new Date(Date.now() + 86_400_317).toISOString();
function pair(lifetime) {
  const exp = Math.floor((Date.now() + lifetime) / 1000);
  return authSession({
    accessToken: `header.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.signature`,
    accessTokenExpiresAt: new Date(exp * 1000).toISOString(),
    refreshTokenExpiresAt: deadline,
  });
}
const api = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/auth/refresh") {
    refreshCalls++;
    for await (const chunk of req) void chunk;
    await delay(1900); // Exercise both status transitions between clock ticks.
    session = pair(900_000);
    return res.end(JSON.stringify(session));
  }
  if (req.url === "/auth/me") return res.end(JSON.stringify({ ...session.user, sessionExpiresAt: deadline }));
  res.writeHead(404).end();
});
api.listen(0, "127.0.0.1");
await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, waitFor, evaluate, choose, origin }) => {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.countdownSamples={token:[]};
      new MutationObserver(()=>{
        for(const [key,selector] of [['token','[data-session-countdown]']]){
          const text=document.querySelector(selector)?.textContent;
          if(!text || !/^\\d+(?::\\d{2}){1,2}$/.test(text))continue;
          const seconds=text.split(':').reduce((value,part)=>value*60+Number(part),0);
          const entries=countdownSamples[key];
          if(entries.at(-1)?.seconds!==seconds)entries.push({seconds,time:performance.now()});
        }
      }).observe(document,{childList:true,characterData:true,subtree:true});
    ` });
    session = pair(62_000);
    await send("Network.setCookies", { cookies: [
      { name: "accessToken", value: session.accessToken, url: origin, path: "/", httpOnly: true },
      { name: "refreshToken", value: session.refreshToken, url: origin, path: "/", httpOnly: true },
    ] });
    await send("Page.navigate", { url: `${origin}/` });
    await waitFor("document.querySelector('[data-session-deadline-countdown]') && document.querySelector('[data-session-deadline-countdown]').textContent !== '—'");
    await delay(8500);
    assert.equal(refreshCalls, 1);
    const samples = await evaluate("countdownSamples");
    for (const [key, entries] of Object.entries(samples)) {
      assert.ok(entries.length >= 7, `${key} must keep ticking through renewal`);
      let reset = 0;
      for (let i = 1; i < entries.length; i++) {
        const previous = entries[i - 1], current = entries[i];
        if (key === "token" && current.seconds > previous.seconds) { reset = i; continue; }
        assert.equal(previous.seconds - current.seconds, 1, `${key} must not skip a displayed second`);
        // The first value after mount/token replacement may last a partial second.
        if (i > reset + 1) {
          const gap = current.time - previous.time;
          assert.ok(gap >= 750 && gap <= 1250, `${key} tick gap ${Math.round(gap)}ms`);
        }
      }
    }
    for (const [locale, pattern] of [["en", /^(\d+ days?|\d+h|\d+min)$/], ["pl", /^(\d+ (dzień|dni)|\d+h|\d+min)$/], ["es", /^(\d+ días?|\d+h|\d+min)$/]]) {
      if (locale !== "en") await choose(locale);
      const text = await evaluate("document.querySelector('[data-session-deadline-countdown]').textContent");
      assert.match(text, pattern);
      assert.equal(await evaluate("Math.abs(document.querySelector('[data-session-deadline-countdown]').getBoundingClientRect().top - document.querySelector('[data-session-countdown]').getBoundingClientRect().top) < 2"), true);
    }
    console.log("Token countdown keeps its one-second cadence across renewal; session duration shows one unit on the same line in en/pl/es.");
  });
} finally {
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
}
