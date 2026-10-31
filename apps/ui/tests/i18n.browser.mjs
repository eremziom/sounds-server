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
  res.end(JSON.stringify({ id: 1, isActive: true, sessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(), roles: [{ key: role }] }));
});
const apiPort = await listen(api);
const reservation = createServer();
const port = await listen(reservation);
await new Promise(r => reservation.close(r));
const origin = `http://127.0.0.1:${port}`;
const next = spawn(process.execPath, ['server.mjs', '--hostname', '127.0.0.1', '--port', String(port)], {
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
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: virtualKeyCode, ...(key === 'Enter' ? { text: '\r' } : {}) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: virtualKeyCode });
  }
  async function choose(locale) {
    await evaluate(`(() => { if(document.querySelector('[data-language-trigger]').getAttribute('aria-expanded')!=='true') document.querySelector('[data-language-trigger]').click(); document.querySelector('[data-locale=\"'+${JSON.stringify(locale)}+'\"]').click(); })()`);
    await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('[data-locale=\"'+${JSON.stringify(locale)}+'\"]').getAttribute('aria-pressed')==='true' && document.querySelector('[data-language-switcher]').getAttribute('aria-busy')!=='true'`);
    assert.equal(await evaluate('document.querySelector(".language-dock").hasAttribute("data-hidden")'), true, 'Selecting a language closes the dock');
    assert.equal(await evaluate('document.querySelectorAll(".language-dock .dock-dot").length'), 1);
    assert.equal(await evaluate('document.querySelector(".dock-dot").closest("[data-locale]").dataset.locale'), locale, 'Indicator follows the saved language');
    assert.equal(await evaluate('document.querySelector("[data-language-trigger]").dataset.currentLanguage'), locale, 'Trigger follows the saved language');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".language-current-flag")).backgroundImage.includes("/flags/'+({en:'gb',pl:'pl',es:'es'}[locale])+'.svg")'), true, 'Trigger displays the selected flag');
  }
  async function screenshot(name) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(new URL(`${name}.png`, screenshotDirectory), Buffer.from(shot.data, 'base64'));
  }
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setExtraHTTPHeaders', { headers: { 'Accept-Language': 'es-MX' } });
  await send('Network.setCookies', { cookies: [
    { name: 'locale', value: 'en', url: origin, path: '/' },
    { name: 'accessToken', value: 'USER', url: origin, path: '/', httpOnly: true },
    { name: 'refreshToken', value: 'keep-session', url: origin, path: '/', httpOnly: true },
  ] });
  const url = `${origin}/register?returnTo=%2Fadmin&test=1#language-section`;
  await send('Page.navigate', { url });
  await waitFor('document.querySelector("[data-language-trigger]") && document.documentElement.lang==="en"');
  await delay(300);
  assert.equal(await evaluate('document.querySelector(".language-dock").hasAttribute("data-hidden")'), true);
  const triggerBox = await evaluate('(() => { const r=document.querySelector("[data-language-trigger]").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...triggerBox });
  await waitFor('!document.querySelector(".language-dock").hasAttribute("data-hidden")');
  await delay(600);
  assert.equal(await evaluate('document.querySelectorAll(".language-flag").length'), 3);
  assert.equal(await evaluate('Array.from(document.querySelectorAll(".language-flag")).every(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })'), true, 'All flags occupy visible space');
  await evaluate(`Promise.all(Array.from(document.querySelectorAll('.language-flag'), async el => {
    const image = new Image();
    image.src = getComputedStyle(el).backgroundImage.slice(5, -2);
    await image.decode();
  }))`);
  await screenshot('dock-open-desktop');
  // The upstream dock adds an invisible hover bridge below its magnified tiles.
  const hoverEdge = await evaluate('(() => { const el=document.querySelector(".language-dock"); const r=el.getBoundingClientRect(); return {x:r.left+4,y:r.top+4,outY:r.bottom+parseFloat(getComputedStyle(el).getPropertyValue("--dock-reach"))+4}; })()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverEdge.x, y: hoverEdge.y });
  await delay(600);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hoverEdge.x, y: hoverEdge.outY });
  await delay(650);
  assert.equal(await evaluate('document.querySelector(".language-dock").hasAttribute("data-hidden")'), true, 'Invisible hover bridge must not keep the dock open');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...triggerBox });
  await waitFor('!document.querySelector(".language-dock").hasAttribute("data-hidden")');
  await delay(600);
  // Hover must close even if focus was already left on the trigger. No clicks.
  await evaluate('document.querySelector("[data-language-trigger]").focus()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 300 });
  await delay(650);
  assert.equal(await evaluate('document.querySelector(".language-dock").hasAttribute("data-hidden")'), true, 'Old trigger focus must not keep a hover dock open');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...triggerBox });
  await waitFor('!document.querySelector(".language-dock").hasAttribute("data-hidden")');
  await delay(600);
  const currentFlag = await evaluate('(() => { const r=document.querySelector("[data-locale=en]").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...currentFlag });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...currentFlag });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...currentFlag });
  await waitFor('document.querySelector(".language-dock").hasAttribute("data-hidden")');
  assert.equal(await evaluate('document.documentElement.lang'), 'en', 'Selecting the current language also closes the dock');
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 300 });
  await delay(650);
  assert.equal(await evaluate('document.querySelector(".language-dock").hasAttribute("data-hidden")'), true);
  console.log('Hover reveal and automatic hide: OK');
  const historyLength = await evaluate('history.length');
  await evaluate('document.body.tabIndex=-1; document.body.focus(); document.body.removeAttribute("tabindex")');
  await key('Tab', 'Tab', 9);
  assert.equal(await evaluate('document.activeElement.matches("[data-language-trigger]")'), true);
  assert.equal(await evaluate('document.activeElement.matches(":focus-visible")'), true);
  assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'none');
  await key('ArrowDown', 'ArrowDown', 40);
  await waitFor('document.activeElement.dataset.locale==="en"');
  await key('ArrowLeft', 'ArrowLeft', 37);
  assert.equal(await evaluate('document.activeElement.dataset.locale'), 'pl', 'ArrowLeft focuses Polish');
  await key('Enter', 'Enter', 13);
  await waitFor('document.documentElement.lang==="pl" && !document.querySelector("[data-language-trigger]").disabled');
  assert.equal(await evaluate('location.href'), url);
  assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Rejestracja');
  console.log('Keyboard selection, focus outline, Polish content and full URL: OK');
  assert.equal(await evaluate('document.activeElement.matches("[data-language-trigger]")'), true, 'Selecting restores focus to the trigger');
  assert.equal(await evaluate('document.querySelector(".language-dock").hasAttribute("data-hidden")'), true, 'Keyboard selection closes the dock');
  await evaluate('document.querySelector("[data-language-trigger]").click()');
  await delay(500);
  await screenshot('dock-open-pl');
  const preview = await send('Page.captureScreenshot', { format: 'png', clip: { x: 780, y: 0, width: 500, height: 130, scale: 2 } });
  await writeFile(new URL('dock-preview.png', screenshotDirectory), Buffer.from(preview.data, 'base64'));
  await choose('es');
  assert.equal(await evaluate('history.length'), historyLength, 'Language changes must not add history entries');
  assert.equal(await evaluate('document.querySelector("[data-language-trigger]").getAttribute("aria-label")'), 'Idioma: Español');
  assert.equal(await evaluate('document.querySelector("h1").textContent'), 'Crear una cuenta');
  assert.equal(await evaluate('location.href'), url);
  await evaluate(`document.querySelector('a[href="/login"]').click()`);
  await waitFor('location.pathname==="/" && document.querySelector("h1")?.textContent.includes("Sounds")');
  await choose('pl');
  await evaluate('history.back()');
  await waitFor(`location.href===${JSON.stringify(url)} && document.documentElement.lang==="pl" && document.querySelector('h1')?.textContent==="Rejestracja"`);
  await evaluate('history.forward()');
  await waitFor('location.pathname==="/" && document.documentElement.lang==="pl" && document.querySelector("h1")?.textContent.includes("Sounds")');
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
  await waitFor('document.querySelector("h1")?.textContent==="Crear una cuenta" && document.querySelector("[data-locale][aria-pressed=true]")?.dataset.locale==="es"');
  await send('Page.reload');
  await waitFor('document.querySelector("h1")?.textContent==="Crear una cuenta" && document.querySelector("[data-locale][aria-pressed=true]")?.dataset.locale==="es"');
  assert.equal(await evaluate('location.href'), url);
  console.log('Cookie settings, session preservation, reload, translated label: OK');
  await send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await send('Page.navigate', { url: `${origin}/` });
  await waitFor('document.querySelector("[data-language-trigger]") && document.querySelector("h1")?.textContent.includes("Sounds")');
  await delay(200);
  await choose('pl');
  assert.equal(await evaluate('location.pathname'), '/');
  await send('Network.setCookie', { name: 'accessToken', value: 'ADMIN', url: origin, path: '/', httpOnly: true });
  await send('Page.navigate', { url: `${origin}/admin?tab=users#list` });
  await waitFor('document.querySelector("h1")?.textContent==="Panel administracyjny" && document.querySelector("[data-language-trigger]")');
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
  await evaluate(`(() => { if(document.querySelector('[data-language-trigger]').getAttribute('aria-expanded')!=='true') document.querySelector('[data-language-trigger]').click(); document.querySelector('[data-locale=es]').click(); })()`);
  await waitFor('!!document.querySelector("[role=alert]")');
  assert.equal(await evaluate('document.documentElement.lang'), 'en');
  assert.equal(await evaluate('document.querySelector("[data-locale][aria-pressed=true]").dataset.locale'), 'en');
  assert.equal(await evaluate('location.pathname+location.search+location.hash'), '/admin?tab=users#list');
  assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /Could not save/);
  await send('Fetch.disable');
  // Network errors from the deliberately failed request are expected.
  errors.length = 0;
  await choose('es');
  await waitFor('!document.querySelector("[role=alert]")');
  assert.equal(await evaluate('document.querySelector("[data-language-trigger]").getAttribute("aria-label")'), 'Idioma: Español');
  console.log('Save failure, accessible translated error and retry: OK');
  assert.deepEqual(errors, [], 'No hydration errors or client exceptions');
  const catalogs = Object.fromEntries(await Promise.all(['en','pl','es'].map(async locale => [
    locale, JSON.parse(await readFile(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')),
  ])));
  for (const locale of ['en','pl','es']) {
    const m = catalogs[locale];
    await send('Network.setCookie', { name: 'locale', value: locale, url: origin, path: '/' });
    for (const [pathname, role, heading, metadata] of [
      ['/login', 'invalid', m.auth.login.title, m.metadata.login],
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
      await waitFor('document.documentElement.scrollWidth <= innerWidth');
      if (pathname === '/access-denied') assert.equal(await evaluate('document.querySelectorAll("a, button, select, header").length'), 0);
      else {
        assert.equal(await evaluate('document.querySelector("[data-language-trigger]").getAttribute("aria-label").startsWith('+JSON.stringify(m.common.language.label+': ')+')'), true);
        assert.equal(await evaluate('document.querySelector("[data-language-trigger]").dataset.currentLanguage'), locale);
        assert.equal(await evaluate('document.querySelector("[data-locale][aria-pressed=true]").dataset.locale'), locale);
      }
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
  await waitFor('document.documentElement.lang==="pl" && document.querySelector("h1")?.textContent==="Rejestracja"');
  await delay(200);
  await choose('en');
  const anonymousCookies = (await send('Network.getCookies', { urls: [origin] })).cookies;
  assert.equal(anonymousCookies.find(c => c.name === 'locale').value, 'en');
  assert.ok(!anonymousCookies.some(c => ['accessToken','refreshToken'].includes(c.name)));
  await send('Page.reload');
  await waitFor('document.documentElement.lang==="en" && document.querySelector("h1")?.textContent==="Create an account"');
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
