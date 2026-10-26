import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startChromium } from './helpers/chromium.mjs';

const uiDirectory = fileURLToPath(new URL('..', import.meta.url));
const screenshotDirectory = new URL('../.tmp/i18n/', import.meta.url);
await mkdir(screenshotDirectory, { recursive: true });

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server.address().port;
}
let apiMode = 'normal';
const api = createServer(async (req, res) => {
  if (apiMode === 'failure') return res.writeHead(503).end('private-server-details');
  if (apiMode === 'slow') await delay(900);
  const role = req.headers.authorization?.replace('Bearer ', '');
  if (!['USER', 'ADMIN', 'ARTIST'].includes(role)) return res.writeHead(401).end();
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ id: 1, isActive: true, roles: [{ key: role }] }));
});
const apiPort = await listen(api);
const reservation = createServer();
const port = await listen(reservation);
await new Promise(r => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: uiDirectory, env: { ...process.env, API_URL: `http://127.0.0.1:${apiPort}` }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
next.stdout.on('data', chunk => output += chunk);
next.stderr.on('data', chunk => output += chunk);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${origin}/login`)).ok) break; } catch {}
    if (next.exitCode !== null) throw Error(output);
    await delay(100);
    if (i === 99) throw Error(output);
  }
  browser = await startChromium();
  const { send, listeners } = browser;
  const errors = [];
  const allErrors = [];
  function recordError(error) {
    const serialized = JSON.stringify(error);
    errors.push(serialized);
    allErrors.push(serialized);
  }
  listeners.set('Runtime.exceptionThrown', recordError);
  listeners.set('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') recordError(params.args);
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw Error(`Timed out: ${expression}; state: ${JSON.stringify(await evaluate('({url:location.href,lang:document.documentElement.lang,body:document.body.innerText})'))}`);
  }
  async function key(key, code = key, virtualKeyCode = undefined) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKeyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode });
  }
  async function choose(locale) {
    await evaluate(`(() => { const select=document.querySelector('select[name=locale]'); select.value=${JSON.stringify(locale)}; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
    await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('select')?.value===${JSON.stringify(locale)} && document.querySelector('select').getAttribute('aria-disabled')!=='true'`);
  }
  async function screenshot(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`${name}.png`, screenshotDirectory), Buffer.from(shot.data, 'base64'));
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'es-MX' } });
  await send('Network.setCookies', { cookies: [
    { name: 'locale', value: 'en', url: origin, path: '/' },
    { name: 'accessToken', value: 'USER', url: origin, path: '/', httpOnly: true },
    { name: 'refreshToken', value: 'keep-session', url: origin, path: '/', httpOnly: true },
  ] });
  const url = `${origin}/login?returnTo=%2Fadmin&test=1#language-section`;
  await send('Page.navigate', { url });
  await waitFor('document.querySelector("select") && document.documentElement.lang==="en"');
  await delay(300);
  const historyLength = await evaluate('history.length');
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate('document.activeElement.tagName'), 'SELECT');
  assert.equal(await evaluate('document.activeElement.matches(":focus-visible")'), true);
  assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none');
  await key('ArrowDown', 'ArrowDown', 40);
  await waitFor('document.documentElement.lang==="pl" && !document.querySelector("select").disabled');
  assert.equal(await evaluate('location.href'), url);
  assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Logowanie');
  console.log('Keyboard selection, focus outline, Polish content and full URL: OK');
  assert.equal(await evaluate('document.activeElement.tagName'), 'SELECT', 'Saving keeps keyboard focus');
  await choose('es');
  assert.equal(await evaluate('history.length'), historyLength, 'Language changes must not add history entries');
  assert.equal(await evaluate('document.querySelector("label").textContent'), 'Idioma');
  assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Iniciar sesión');
  assert.equal(await evaluate('location.href'), url);
  await evaluate(`document.querySelector('a[href="/register"]').click()`);
  await waitFor('location.pathname==="/register" && document.querySelector("h1")?.textContent==="Crear una cuenta"');
  await choose('pl');
  await evaluate('history.back()');
  await waitFor(`location.href===${JSON.stringify(url)} && document.documentElement.lang==="pl" && document.querySelector('h1')?.textContent==="Logowanie"`);
  await evaluate('history.forward()');
  await waitFor('location.pathname==="/register" && document.documentElement.lang==="pl" && document.querySelector("h1")?.textContent==="Rejestracja"');
  await choose('es');
  console.log('Client navigation, back/forward and unchanged history length: OK');
  const cookies = (await send('Network.getCookies', { urls: [origin] })).cookies;
  const language = cookies.find(c => c.name === 'locale');
  assert.equal(language.value, 'es');
  assert.equal(language.secure, true);
  assert.equal(language.httpOnly, true);
  assert.equal(language.sameSite, 'Lax');
  assert.ok(language.expires > Date.now()/1000 + 360*86400);
  assert.equal(cookies.find(c => c.name === 'accessToken').value, 'USER');
  assert.equal(cookies.find(c => c.name === 'refreshToken').value, 'keep-session');
  await send('Page.navigate', { url });
  await waitFor('document.querySelector("h1")?.textContent==="Iniciar sesión" && document.querySelector("select")?.value==="es"');
  await send('Page.reload');
  await waitFor('document.querySelector("h1")?.textContent==="Iniciar sesión" && document.querySelector("select")?.value==="es"');
  assert.equal(await evaluate('location.href'), url);
  console.log('Cookie settings, session preservation, reload, translated label: OK');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await send('Page.navigate', { url: `${origin}/` });
  await waitFor('document.querySelector("select") && document.querySelector("h1")?.textContent.includes("Sounds")');
  await delay(200);
  await choose('pl');
  assert.equal(await evaluate('location.pathname'), '/');
  await send('Network.setCookie', { name: 'accessToken', value: 'ADMIN', url: origin, path: '/', httpOnly: true });
  await send('Page.navigate', { url: `${origin}/admin?tab=users#list` });
  await waitFor('document.querySelector("h1")?.textContent==="Panel administracyjny" && document.querySelector("select")');
  await delay(200);
  await choose('en');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'), '/admin?tab=users#list');
  console.log('Shared switcher on app/admin, query/hash preservation and narrow viewport: OK');
  assert.deepEqual(errors, [], 'No unexpected errors before simulating failures');
  // A failed save keeps the language, URL and session; the translated error is announced.
  listeners.set('Fetch.requestPaused', async ({ requestId, request }) => {
    await send(request.method === 'POST' ? 'Fetch.failRequest' : 'Fetch.continueRequest',
      request.method === 'POST' ? { requestId, errorReason: 'Failed' } : { requestId });
  });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await evaluate(`(() => { const select=document.querySelector('select'); select.value='es'; select.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await waitFor('!!document.querySelector("[role=alert]")');
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  assert.equal(await evaluate('document.querySelector("select").value'), 'en');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'), '/admin?tab=users#list');
  assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /Could not save/);
  await send('Fetch.disable');
  // Network errors from the deliberately failed request are expected.
  errors.length = 0;
  await choose('es');
  await waitFor('!document.querySelector("[role=alert]")');
  assert.equal(await evaluate('document.querySelector("label").textContent'), 'Idioma');
  console.log('Save failure, accessible translated error and retry: OK');
  assert.deepEqual(errors, [], 'No hydration errors or client exceptions');
  const catalogs = Object.fromEntries(await Promise.all(['en','pl','es'].map(async locale => [
    locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')),
  ])));
  for (const locale of ['en','pl','es']) {
    const m = catalogs[locale];
    await send('Network.setCookie', { name: 'locale', value: locale, url: origin, path: '/' });
    for (const [pathname, role, heading, metadata] of [
      ['/login', 'USER', m.auth.login.title, m.metadata.login],
      ['/register', 'USER', m.auth.register.title, m.metadata.register],
      ['/', 'USER', m.app.home.title, m.metadata.default],
      ['/admin', 'ADMIN', m.admin.home.title, m.metadata.admin],
      ['/access-denied', 'USER', m.errors.accessDenied.title, m.metadata.accessDenied],
      ['/missing-page', 'USER', m.errors.notFound.title, m.metadata.default],
    ]) {
      await send('Network.setCookie', { name: 'accessToken', value: role, url: origin, path: '/', httpOnly: true });
      await send('Page.navigate', { url: `${origin}${pathname}` });
      await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(heading)} && document.documentElement.lang===${JSON.stringify(locale)}`);
      await waitFor(`document.title===${JSON.stringify(metadata.title)} && document.querySelector('meta[name=description]')?.content===${JSON.stringify(metadata.description)}`);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${locale} ${pathname} at 320px`);
      assert.equal(await evaluate('document.querySelector("label").textContent'), m.common.language.label);
      assert.equal(await evaluate('document.querySelector("select").value'), locale);
      assert.ok(!(await evaluate('document.body.innerText')).match(/\b(?:auth|common|errors|metadata)\.[a-z]+\./), 'No raw message keys');
      await screenshot(`${locale}-${pathname.replaceAll('/', '') || 'home'}`);
    }
    await send('Network.setCookie', { name: 'accessToken', value: 'USER', url: origin, path: '/', httpOnly: true });
    apiMode = 'slow';
    await send('Page.navigate', { url: `${origin}/` });
    await waitFor(`Array.from(document.querySelectorAll('[role=status]')).some(el=>el.textContent===${JSON.stringify(m.common.status.checkingAccess)} || el.textContent===${JSON.stringify(m.common.status.loading)})`);
    await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(m.app.home.title)}`);
    apiMode = 'failure';
    await send('Page.navigate', { url: `${origin}/` });
    await waitFor(`document.querySelector('[role=alert] h1')?.textContent===${JSON.stringify(m.errors.page.title)}`);
    assert.equal(await evaluate('document.querySelector("[role=alert] button").textContent'), m.common.actions.retry);
    assert.ok(!(await evaluate('document.body.innerText')).includes('private-server-details'));
    await waitFor(`document.title===${JSON.stringify(m.errors.page.title)}`);
    await screenshot(`${locale}-error`);
    apiMode = 'normal';
    await evaluate('document.querySelector("[role=alert] button").click()');
    await waitFor(`document.querySelector('h1')?.textContent===${JSON.stringify(m.app.home.title)}`);
    console.log(`${locale}: all pages, metadata, 404, localized loading/error, retry and 320px layout: OK`);
  }
  assert.ok(!allErrors.some(error => /hydration|hydrated|#418|#423|#425/i.test(error)), 'No hydration errors during the entire test');
  // Anonymous visitors can persist their own language, and shared URLs use the recipient's preferences.
  for (const name of ['accessToken', 'refreshToken', 'locale']) await send('Network.deleteCookies', { name, url: origin });
  await send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'pl-PL,en;q=0.8' } });
  await send('Page.navigate', { url });
  await waitFor('document.documentElement.lang==="pl" && document.querySelector("h1")?.textContent==="Logowanie"');
  await delay(200);
  await choose('en');
  const anonymousCookies = (await send('Network.getCookies', { urls: [origin] })).cookies;
  assert.equal(anonymousCookies.find(c => c.name === 'locale').value, 'en');
  assert.ok(!anonymousCookies.some(c => ['accessToken','refreshToken'].includes(c.name)));
  await send('Page.reload');
  await waitFor('document.documentElement.lang==="en" && document.querySelector("h1")?.textContent==="Sign in"');
  assert.equal(await evaluate('location.href'), url);
  assert.ok(!allErrors.some(error => /hydration|hydrated|#418|#423|#425/i.test(error)), 'No hydration errors for anonymous visitors');
  console.log('Anonymous choice, shared URL recipient language and cookie precedence after reload: OK');
  console.log(`Hydration: OK. Screenshots: ${fileURLToPath(screenshotDirectory)}`);
} finally {
  try { await browser?.close(); }
  finally {
    next.kill();
    if (next.exitCode === null) await once(next, 'exit');
    await new Promise(r => api.close(r));
  }
}
