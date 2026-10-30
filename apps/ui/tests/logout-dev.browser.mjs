import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { startChromium } from "./helpers/chromium.mjs";

// Render-only regression against an already running dev server. Fake cookies
// live in a disposable browser profile; no auth action or API mutation is sent.
const origin = new URL(process.env.UI_DEV_URL ?? "http://localhost:3001").origin;
const browser = await startChromium();
try {
  const { send, listeners } = browser;
  const errors = [];
  listeners.set("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") errors.push(event.args.map((arg) => arg.value ?? arg.description).join(" "));
  });
  listeners.set("Runtime.exceptionThrown", (event) => errors.push(JSON.stringify(event)));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Network.setCookies", { cookies: [
    { name: "accessToken", value: "render-preview", url: origin, path: "/", httpOnly: true },
    { name: "refreshToken", value: "a".repeat(64), url: origin, path: "/", httpOnly: true },
  ] });
  await send("Page.navigate", { url: `${origin}/login` });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const result = await send("Runtime.evaluate", {
      expression: "Boolean(document.querySelector('form[data-auth-logout] button[data-logout-scope=all]') && Object.keys(document.querySelector('form[data-auth-logout]')).some(key=>key.startsWith('__reactProps$')))",
      returnByValue: true,
    });
    if (result.result.value) { ready = true; break; }
    await delay(100);
  }
  assert.ok(ready, "Start the UI dev server before running this render-only test");
  await delay(300);
  assert.deepEqual(errors, [], "No development React warnings or hydration errors");
  console.log("Development logout controls: hydrated without reserved-name/formAction warnings; no action invoked.");
} finally {
  await browser.close();
}
