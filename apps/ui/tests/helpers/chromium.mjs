import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function browserPath() {
  if (process.env.BROWSER_PATH) assert.ok(path.isAbsolute(process.env.BROWSER_PATH), "BROWSER_PATH must be absolute.");
  const candidates = process.env.BROWSER_PATH ? [process.env.BROWSER_PATH] : [
    `${process.env.PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
    `${process.env["PROGRAMFILES(X86)"]}/Microsoft/Edge/Application/msedge.exe`,
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  const executable = candidates.find((candidate) => existsSync(candidate));
  assert.ok(executable, "Install Chrome/Edge/Chromium or set BROWSER_PATH to its executable (absolute path).");
  return executable;
}

export async function startChromium() {
  const executable = browserPath();
  const profile = await mkdtemp(path.join(tmpdir(), "sounds-i18n-"));
  const browser = spawn(executable, [
    "--headless=new", "--no-first-run", "--no-default-browser-check",
    "--disable-background-networking", "--disable-component-update", "--disable-sync",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let output = "";
  let spawnError;
  browser.on("error", (error) => { spawnError = error; });
  browser.stderr.on("data", (chunk) => { output += chunk; });
  let socket;
  const pending = new Map();
  const listeners = new Map();
  let counter = 0;
  async function close() {
    socket?.close();
    if (browser.exitCode === null && browser.pid) {
      const exited = once(browser, "exit");
      browser.kill();
      await exited;
    }
    // Delete only the new mkdtemp directory, after verifying its absolute parent/name.
    const resolved = path.resolve(profile);
    assert.equal(path.dirname(resolved), path.resolve(tmpdir()));
    assert.ok(path.basename(resolved).startsWith("sounds-i18n-"));
    await rm(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  try {
    let debugPort;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      debugPort = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(output)?.[1];
      if (debugPort || browser.exitCode !== null) break;
      await delay(100);
    }
    assert.ok(debugPort, `Browser did not start: ${output}`);
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const promise = pending.get(message.id);
        if (!promise) return;
        pending.delete(message.id);
        clearTimeout(promise.timer);
        if (message.error) promise.reject(Error(JSON.stringify(message.error)));
        else promise.resolve(message.result);
      } else {
        Promise.resolve(listeners.get(message.method)?.(message.params)).catch((error) => {
          // Report event-handler errors to the next command instead of losing a rejection.
          spawnError = error;
        });
      }
    });
    socket.addEventListener("close", () => {
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(Error("Browser connection closed"));
      }
      pending.clear();
    });
    function send(method, params = {}, sessionId) {
      if (spawnError) return Promise.reject(spawnError);
      return new Promise((resolve, reject) => {
        const id = ++counter;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error(`Browser command timed out: ${method}`));
        }, 10000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    }
    return { send, listeners, close };
  } catch (error) {
    await close();
    throw error;
  }
}
