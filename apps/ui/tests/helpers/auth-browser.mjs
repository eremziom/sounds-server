import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { startChromium } from "./chromium.mjs";

export async function withAuthBrowser(apiUrl, run) {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const next = spawn(process.execPath, ["server.mjs", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("../..", import.meta.url), windowsHide: true,
    env: { ...process.env, API_URL: apiUrl, UI_ORIGIN: undefined }, stdio: ["ignore", "pipe", "pipe"],
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
      for (const [name, value] of Object.entries(values)) {
        // Real input events synchronize controlled React fields, including when
        // the server-rendered form has only just started hydrating.
        await evaluate(`(() => {
          const input = document.querySelector('input[name="'+${JSON.stringify(name)}+'"]');
          input.focus(); input.select();
        })()`);
        if (value) await send("Input.insertText", { text: value });
        else {
          await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
          await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
        }
      }
    };
    const submit = () => evaluate("document.querySelector('form:not([data-auth-logout]) button[type=submit]').click()");
    const signOut = async () => {
      // Exercise the visible menu and its confirmation, or the recovery toolbar
      // when session discovery is unavailable. Never click a hidden fallback.
      await waitFor("document.querySelector('[data-header-user-menu] [data-slot=dropdown-menu-trigger]')?.getClientRects().length || document.querySelector('form[data-auth-logout] button[data-logout-scope=current]')?.getClientRects().length");
      const menu = await evaluate("!!document.querySelector('[data-header-user-menu] [data-slot=dropdown-menu-trigger]')?.getClientRects().length");
      if (menu) {
        await evaluate("document.querySelector('[data-header-user-menu] [data-slot=dropdown-menu-trigger]').click()");
        await waitFor("document.querySelector('[data-user-menu-logout-item]')");
        await evaluate("document.querySelector('[data-user-menu-logout-item]').click()");
        await waitFor("document.querySelector('[role=alertdialog] [data-slot=alert-dialog-action]')");
        await evaluate("document.querySelector('[role=alertdialog] [data-slot=alert-dialog-action]').click()");
      } else {
        await waitFor("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]')?.getClientRects().length");
        await evaluate("document.querySelector('form[data-auth-logout] button[data-logout-scope=current]').click()");
      }
    };
    // Some supported actions have no visible control (all-device sign-out, or
    // sign-out with only a refresh cookie outside a recovery view). Test their
    // real HTTP boundary without adding controls to the product or test DOM.
    const logoutByPost = async (scope = "current") => {
      assert.ok(["current", "all"].includes(scope));
      const exportedName = scope === "all" ? "logoutAllAction" : "logoutAction";
      const manifest = JSON.parse(await readFile(new URL("../../.next/server/server-reference-manifest.json", import.meta.url), "utf8"));
      const id = Object.entries(manifest.node).find(([, action]) => action.exportedName === exportedName)?.[0];
      assert.ok(id, `Built ${exportedName} must exist`);
      const response = await evaluate(`(async () => {
        const response = await fetch(location.href, {
          method: 'POST', redirect: 'manual',
          headers: { 'Next-Action': ${JSON.stringify(id)}, 'Content-Type': 'text/plain;charset=UTF-8' },
          body: '[]',
        });
        await response.text();
        return { status: response.status, redirect: response.headers.get('x-action-redirect') };
      })()`);
      assert.ok([200, 303].includes(response.status));
      const target = response.redirect?.split(";")[0];
      assert.ok(["/logout?status=success", "/logout?status=local", "/logout?status=all-unconfirmed"].includes(target));
      await send("Page.navigate", { url: `${origin}${target}` });
      return target;
    };
    const choose = async (locale) => {
      await evaluate(`(() => {if(document.querySelector('[data-language-trigger]').getAttribute('aria-expanded')!=='true') document.querySelector('[data-language-trigger]').click();document.querySelector('[data-locale=\"'+${JSON.stringify(locale)}+'\"]').click();})()`);
      await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('[data-language-switcher]').getAttribute('aria-busy')!=='true'`);
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
    await run({ send, listeners, evaluate, waitFor, fill, submit, signOut, logoutByPost, choose, open, origin });
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
