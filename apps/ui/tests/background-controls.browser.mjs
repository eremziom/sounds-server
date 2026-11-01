import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";

const api = createServer((request, response) => {
  if (request.url !== "/auth/me" || !request.headers.authorization) return response.writeHead(401).end();
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({
    id: 1, isActive: true, sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    roles: [{ key: "USER" }],
  }));
});
api.listen(0, "127.0.0.1");
await once(api, "listening");

try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, fill, origin }) => {
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    // Observe actual shader updates, rather than only checking input values.
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.backgroundUniforms = {};
      const names = new WeakMap();
      const proto = WebGL2RenderingContext.prototype;
      const getLocation = proto.getUniformLocation;
      proto.getUniformLocation = function(program, name) {
        const location = getLocation.call(this, program, name);
        if (location) names.set(location, name);
        return location;
      };
      for (const method of ['uniform1f', 'uniform1i', 'uniform3f', 'uniform3fv']) {
        const original = proto[method];
        proto[method] = function(location, ...values) {
          const name = names.get(location);
          if (name) window.backgroundUniforms[name] = method === 'uniform3fv' ? Array.from(values[0]) : values;
          return original.call(this, location, ...values);
        };
      }
    ` });
    const accessToken = `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.signature`;
    await send("Network.setCookies", { cookies: [
      { name: "accessToken", value: accessToken, url: origin, path: "/", httpOnly: true },
      { name: "locale", value: "pl", url: origin, path: "/" },
    ] });
    await send("Page.navigate", { url: `${origin}/` });
    await waitFor("document.querySelector('a[href=\"/animations\"]') && window.backgroundUniforms.uCount");
    await evaluate("window.backgroundCanvas = document.querySelector('[data-application-background] canvas'); document.querySelector('a[href=\"/animations\"]').click()");
    await waitFor("location.pathname === '/animations' && document.querySelector('input[name=speed]')");
    assert.equal(await evaluate("document.querySelectorAll('input[type=number]').length"), 17);
    assert.equal(await evaluate("document.querySelectorAll('input[type=color]').length"), 3);

    await fill({ speed: "1.25", threadCount: "8" });
    await waitFor("backgroundUniforms.uCount[0] === 8 && document.querySelector('input[name=speed]').value === '1.25'");
    // Frequency is sent directly to a uniform; speed controls the accumulated phase.
    await fill({ frequency: "9.2" });
    await waitFor("backgroundUniforms.uFrequency[0] === 9.2");
    await evaluate(`(() => {
      const input = document.querySelector('input[type=range][aria-label="Częstotliwość"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '7.4');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor("backgroundUniforms.uFrequency[0] === 7.4 && document.querySelector('input[name=frequency]').value === '7.4'");
    await evaluate(`(() => {
      const input = document.querySelector('input[type=color]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '#00ff00');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await waitFor("backgroundUniforms.uColors[0] === 0 && backgroundUniforms.uColors[1] === 1 && backgroundUniforms.uColors[2] === 0");

    await evaluate("document.querySelector('input[name=threadCount]').focus()");
    await fill({ threadCount: "25" });
    assert.equal(await evaluate("backgroundUniforms.uCount[0]"), 8, "Out-of-range draft does not reach the renderer");
    await evaluate("document.querySelector('input[name=threadCount]').blur()");
    await waitFor("document.querySelector('input[name=threadCount]').value === '8'");

    await evaluate("document.querySelector('a[href=\"/\"]').click()");
    await waitFor("location.pathname === '/' && !document.querySelector('input[name=speed]')");
    await evaluate("document.querySelector('a[href=\"/animations\"]').click()");
    await waitFor("document.querySelector('input[name=speed]')?.value === '1.25'");
    assert.equal(await evaluate("document.querySelector('[data-application-background] canvas') === backgroundCanvas"), true, "Editing and navigation preserve the canvas");

    await evaluate("Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Przywróć domyślne').click()");
    await waitFor("backgroundUniforms.uCount[0] === 4 && backgroundUniforms.uFrequency[0] === 5.8 && document.querySelector('input[name=speed]').value === '0.5'");
    assert.equal(await evaluate("document.querySelector('input[type=color]').value"), "#a855f7");
  });
  console.log("Background controls OK: live shader updates, limits, persistent canvas/settings and reset.");
} finally {
  await new Promise((resolve) => api.close(resolve));
}
