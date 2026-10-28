import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { startChromium } from "./chromium.mjs";

export async function withAuthBrowser(apiUrl, run) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("../..", import.meta.url), windowsHide: true,
    env: { ...process.env, API_URL: apiUrl }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  next.stdout.on("data", (chunk) => output += chunk);
  next.stderr.on("data", (chunk) => output += chunk);
  let browser;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { if ((await fetch(`${origin}/register`)).ok) break; } catch {}
      assert.equal(next.exitCode, null, output);
      if (attempt === 99) throw Error(output);
      await delay(100);
    }
    browser = await startChromium();
    const { send, listeners } = browser;
    const errors = [];
    listeners.set("Runtime.exceptionThrown", (error) => errors.push(error));
    listeners.set("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error") errors.push(event);
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    // Deliberately differ from the chosen language to catch native validation popups.
    await send("Network.setExtraHTTPHeaders", { headers: { "Accept-Language": "de-DE" } });
    const evaluate = async (expression) => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const waitFor = async (expression) => {
      for (let attempt = 0; attempt < 120; attempt++) {
        if (await evaluate(`Boolean(${expression})`)) return;
        await delay(100);
      }
      throw Error(`Timeout: ${expression}; ${await evaluate("document.body.innerText")}`);
    };
    const fill = async (values) => {
      await evaluate(`(() => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        for (const [name, value] of Object.entries(${JSON.stringify(values)})) {
          const input = document.querySelector('input[name="'+name+'"]');
          set.call(input, value);
          input.dispatchEvent(new Event('input', {bubbles:true}));
        }
      })()`);
    };
    const submit = () => evaluate("document.querySelector('form:not([data-auth-logout]) button[type=submit]').click()");
    const choose = async (locale) => {
      await evaluate(`(() => {const select=document.querySelector('select[name=locale]');select.value=${JSON.stringify(locale)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
      await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('select').getAttribute('aria-disabled')!=='true'`);
    };
    const open = async (locale, pathname = "/register") => {
      await send("Network.deleteCookies", { name: "accessToken", url: origin });
      await send("Network.deleteCookies", { name: "refreshToken", url: origin });
      await send("Network.setCookie", { name: "locale", value: locale, url: origin, path: "/" });
      await send("Page.navigate", { url: `${origin}${pathname}` });
      const field = pathname.startsWith("/login") ? "login" : "username";
      await waitFor(`document.querySelector('input[name=${field}]') && document.documentElement.lang===${JSON.stringify(locale)}`);
      await delay(150);
    };
    await run({ send, listeners, evaluate, waitFor, fill, submit, choose, open, origin });
    assert.deepEqual(errors, [], "No browser exceptions, hydration or translation errors");
    assert.doesNotMatch(output, /Cannot specify a "name" prop.*formAction/, "No reserved button name warning in server output");
  } finally {
    await browser?.close();
    if (next.exitCode === null) {
      next.kill();
      await once(next, "exit");
    }
  }
}
