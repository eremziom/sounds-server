import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { withAuthBrowser } from "./helpers/auth-browser.mjs";
import { authSession } from "./helpers/auth-fixtures.mjs";

// HTTP fixture tests the real UI/BFF/session. It intentionally does not load model weights.
const auth = authSession({ accessToken: `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url")}.signature` });
const t = JSON.parse(await readFile(new URL("../messages/en.json", import.meta.url), "utf8")).app.creator;
const png = await readFile(new URL("../public/infinite-zoom/samples/forest/backdrop.png", import.meta.url));
const packages = new Map();
const tone = await readFile(new URL("../../api/src/audio/fixtures/tone.mp3", import.meta.url));
let project, revisions = [], jobs = [], artifacts = [], messages = [], conflict = false, roles = ["USER"], writes = 0, packageReads = 0, apiError;
const api = createServer((req, res) => {
  void (async () => {
    res.setHeader("Content-Type", "application/json");
    const json = (data, status = 200) => { res.writeHead(status); res.end(JSON.stringify(data)); };
    if (req.url === "/auth/refresh") return json(auth);
    assert.equal(req.headers.authorization, `Bearer ${auth.accessToken}`);
    assert.equal(req.headers.cookie, undefined);
    if (req.url === "/auth/me") return json({ ...auth.user, roles: roles.map(key => ({ key })), permissions: [], sessionExpiresAt: auth.refreshTokenExpiresAt });
    if (req.url === "/tracks") return json([{ id: 1, ownerId: 1, author: "Test", title: "Creator audio", description: null, genre: null, subgenre: null, publicationDate: "2026-01-01", bpm: null, hasAudio: true }]);
    if (req.url === "/tracks/1/audio") { res.setHeader("Content-Type", "audio/mpeg"); res.setHeader("Content-Length", tone.length); return res.end(tone); }
    const parts = req.url.split("?")[0].split("/").filter(Boolean);
    if (parts[0] !== "artworks" || parts[1] !== "projects") return json({}, 404);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    if (parts.length === 2) {
      if (req.method === "POST") { project = { id: randomUUID(), title: body.title, activeRevisionId: null, revision: null }; return json(project, 201); }
      return json(project ? [project] : []);
    }
    if (parts[2] !== project?.id) return json({}, 404);
    if (parts.length === 3) return json(project);
    if (parts[3] === "artifacts") {
      if (parts[5] === "file") {
        if (packages.has(parts[4])) { packageReads++; return json(packages.get(parts[4])); }
        res.setHeader("Content-Type", "image/png"); return res.end(png);
      }
      return json(artifacts);
    }
    function save(snapshot, restoredFromId = null) {
      const revision = { id: randomUUID(), parentId: project.activeRevisionId, restoredFromId, createdAt: new Date().toISOString(), snapshot, validation: { ready: true, staleArtifactIds: [] } };
      revisions.unshift(revision); project = { ...project, activeRevisionId: revision.id, revision }; return revision;
    }
    if (parts[3] === "revisions") {
      if (req.method === "POST") {
        writes++;
        if (conflict || body.baseRevisionId !== project.activeRevisionId) return json({ code: "ARTWORK_REVISION_CONFLICT", message: "private backend details" }, 409);
        return json(save(body.snapshot), 201);
      }
      return json(parts[4] ? revisions.find(item => item.id === parts[4]) : revisions);
    }
    if (parts[3] === "restore") return json(save(revisions.find(item => item.id === body.revisionId).snapshot, body.revisionId), 201);
    if (parts[3] === "messages") {
      if (req.method === "POST") { const message = { id: randomUUID(), text: body.text, role: "user", createdAt: new Date().toISOString() }; messages.unshift(message); return json(message, 201); }
      return json(messages);
    }
    if (parts[3] === "jobs") {
      if (parts[5] === "cancel") { const job = jobs.find(item => item.id === parts[4]); job.state = "cancelled"; job.phase = "cancelled"; return json(job, 201); }
      if (parts[5] === "retry") { const job = jobs.find(item => item.id === parts[4]); job.state = "queued"; job.phase = "queued"; job.attempt++; return json(job, 201); }
      if (req.method === "POST") {
        const job = { ...body, id: randomUUID(), projectId: project.id, state: "queued", attempt: 0, progress: 0, phase: "queued", cancelRequested: false, result: null, errorCode: null };
        jobs.unshift(job); return json(job, 201);
      }
      return json(jobs);
    }
    return json({}, 404);
  })().catch(error => { apiError = error; res.writeHead(500).end("{}"); });
});
api.listen(0, "127.0.0.1"); await once(api, "listening");
try {
  await withAuthBrowser(`http://127.0.0.1:${api.address().port}`, async ({ send, evaluate, waitFor, origin }) => {
    await send("Page.bringToFront"); await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.addScriptToEvaluateOnNewDocument", { source: `
      const getContext=HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext=function(kind,attrs){return getContext.call(this,kind,kind==='webgl2'?{...attrs,preserveDrawingBuffer:true}:attrs);};
    ` });
    await send("Network.setCookies", { cookies: [
      { name: "accessToken", value: auth.accessToken, url: origin, path: "/", httpOnly: true },
      { name: "refreshToken", value: auth.refreshToken, url: origin, path: "/", httpOnly: true },
      { name: "locale", value: "en", url: origin, path: "/" },
    ] });
    const button = label => `[...document.querySelectorAll('[data-artwork-creator] button')].find(el=>el.textContent===${JSON.stringify(label)})`;
    const click = expression => send("Runtime.evaluate", { userGesture: true, expression: `${expression}.click()` });
    const input = async (selector, text) => {
      await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.focus();el.select();})()`);
      await send("Input.insertText", { text });
    };
    await send("Page.navigate", { url: `${origin}/library` });
    await waitFor("document.querySelector('[data-track-id=\"1\"] button')");
    await waitFor("document.querySelector('[data-infinite-zoom-canvas]')?.dataset.visualStatus==='ready'");
    await evaluate("document.querySelector('[data-persistent-media] audio').loop=true");
    await click("document.querySelector('[data-track-id=\"1\"] button')");
    await waitFor("!document.querySelector('[data-persistent-media] audio').paused && document.querySelector('[data-infinite-zoom-canvas]').dataset.visualStatus==='running'");
    await evaluate("window.creatorAudio=document.querySelector('[data-persistent-media] audio');creatorAudio.loop=true;window.creatorCanvas=document.querySelector('[data-infinite-zoom-canvas]');window.creatorGL=creatorCanvas.getContext('webgl2')");
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-infinite-zoom-controls]')");
    await click("document.querySelector('a[href=\"/animations/create\"]')"); await waitFor("document.querySelector('[data-artwork-creator]')");
    assert.equal(await evaluate("creatorAudio===document.querySelector('audio') && !creatorAudio.paused && creatorCanvas===document.querySelector('[data-infinite-zoom-canvas]')"), true);
    await input("#creator-title", "Garden UI fixture"); await click(button(t.create));
    await waitFor("document.querySelector('textarea[name=intent]')");
    const entries = { intent: "Night garden", composition: "Layered gate with a clear passage", motionPlan: "Drone follows an arc behind the pillar", lightingPlan: "Many leaf veins in three groups with distinct flowing colors", blackoutPlan: "Black environment, independent lamps from first frame, smooth reveal", qaPlan: "Record trajectory, occlusion, zoom, pause, Reset and uncertain edges" };
    for (const [field, text] of Object.entries(entries)) await input(`textarea[name=${field}]`, text);
    assert.equal(await evaluate("document.querySelector('[data-creator-generate]').disabled"), true);
    await click(button(t.save)); await waitFor("!document.querySelector('[data-creator-generate]').disabled");
    assert.equal(revisions.length, 1); assert.equal(revisions[0].snapshot.brief.guidelinesVersion, "1.7");
    await input("textarea[name=note]", "Keep the gate silhouette"); await click(button(t.addNote));
    await waitFor("document.querySelector('[data-artwork-creator]').innerText.includes('Keep the gate silhouette')");
    await click(button(t.generate)); await waitFor("document.querySelector('[data-creator-job]')");
    assert.equal(jobs[0].arguments.prompt, "Night garden"); assert.deepEqual(jobs[0].inputIds, []);
    await waitFor(`!${button(t.cancel)}.disabled`); await click(button(t.cancel));
    await waitFor(`document.querySelector('[data-creator-job]').innerText.includes(${JSON.stringify(t.states.cancelled)})`);
    assert.equal(await evaluate("!creatorAudio.paused && creatorCanvas.getContext('webgl2')===creatorGL"), true, "Cancellation preserves playing music and WebGL context");
    await click(button(t.retry)); await waitFor(`document.querySelector('[data-creator-job]').innerText.includes(${JSON.stringify(t.states.queued)})`);
    assert.equal(jobs[0].attempt, 1);
    const image = { id: randomUUID(), kind: "image", mimeType: "image/png", width: 3840, height: 2160, registrationId: randomUUID(), inputs: [], createdAt: new Date().toISOString() };
    artifacts.push(image); jobs[0].state = "succeeded"; jobs[0].progress = 100; jobs[0].phase = "succeeded";
    await waitFor(button(t.apply)); await click(button(t.apply)); await waitFor("document.querySelector('[data-creator-layers] article')");
    assert.equal(project.revision.snapshot.layers[0].imageArtifactId, image.id);
    const staleBuild = { ...jobs[0], id: randomUUID(), tool: "buildPreviewPackage", baseRevisionId: randomUUID(), state: "queued", phase: "queued", result: null };
    jobs.push(staleBuild);
    await waitFor(`document.querySelectorAll('[data-creator-job]').length===2`);
    assert.equal(await evaluate("document.querySelector('[data-creator-build-preview]').disabled"), false, "A queued preview for an older revision cannot block preparing the current revision");
    await click(button(t.buildPreview));
    await waitFor(`document.querySelectorAll('[data-creator-job]').length===3`);
    assert.equal(await evaluate("document.querySelector('[data-creator-build-preview]').disabled"), true, "The current revision cannot enqueue duplicate pending previews");
    assert.ok(await evaluate(`document.querySelector('[data-draft-preview]').textContent.includes(${JSON.stringify(t.previewQueued)})`));
    const build = jobs[0], reportId = randomUUID();
    assert.equal(build.tool, "buildPreviewPackage"); assert.equal(build.baseRevisionId, project.activeRevisionId);
    const uri = `/infinite-zoom/jobs/${build.id}/${image.id}.png`;
    const envelope = { published: false, visualAcceptance: false, snapshotCandidate: structuredClone(project.revision.snapshot),
      manifest: { schemaVersion: 2, id: `project-${project.id}`, version: `job-${build.id}`, canvas: { width: 3840, height: 2160 },
        assets: [{ id: image.id, kind: "image", uri, width: 3840, height: 2160, critical: true }],
        layers: [{ id: "source", zIndex: 0, imageAssetId: image.id }], coverage: { baseLayerId: "source" }, anchors: [] }, assetBindings: [{ artifactId: image.id, uri }] };
    packages.set(reportId, envelope);
    artifacts.push({ id: reportId, kind: "report", mimeType: "application/json", width: null, height: null, inputs: [] });
    build.state = "succeeded"; build.progress = 100; build.result = { baseRevisionId: build.baseRevisionId, outputs: [{ name: "package", artifactId: reportId }] };
    await waitFor("!document.querySelector('[data-creator-show-preview]').disabled");
    assert.equal(staleBuild.state, "queued", "An older queued job cannot block opening a ready preview");
    jobs.splice(jobs.indexOf(staleBuild), 1);
    await click("document.querySelector('[data-player-toggle]')");
    await waitFor("creatorAudio.paused && creatorCanvas.dataset.visualStatus==='paused'");
    await evaluate("window.parkedPixels=creatorCanvas.toDataURL();window.parkedTick=creatorCanvas.dataset.simulationTick");
    await click(button(t.showPreview)); await waitFor("document.querySelector('[data-iz-end-draft]') && document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='immersive'");
    assert.equal(await evaluate("creatorAudio.paused && creatorCanvas.dataset.simulationTick===parkedTick && creatorCanvas.getContext('webgl2')===creatorGL"), true, "Preview never starts paused music or advances the clock");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await waitFor("document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='background'");
    assert.ok(await evaluate("!!document.querySelector('[data-iz-end-draft]')"), "Display mode does not end or restart draft");
    const beforeModeReads=packageReads;
    // Reject any accidental reload of the package while changing display mode.
    envelope.snapshotCandidate.brief.intent = "Mode switch must not reload this envelope";
    await click("document.querySelector('[data-creator-preview-immersive]')");
    await waitFor("document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='immersive'");
    assert.equal(await evaluate("creatorAudio.paused && creatorCanvas.dataset.simulationTick===parkedTick && creatorCanvas.getContext('webgl2')===creatorGL && !document.querySelector('[data-draft-preview] [role=alert]')"),true,"Immersive button preserves the paused draft and its context");
    assert.equal(packageReads,beforeModeReads,"Immersive button does not reload the package");
    envelope.snapshotCandidate = structuredClone(project.revision.snapshot);
    await click("document.querySelector('[data-iz-end-draft]')"); await waitFor("!document.querySelector('[data-iz-end-draft]')");
    assert.equal(await evaluate("creatorCanvas.toDataURL()===parkedPixels && creatorCanvas.dataset.simulationTick===parkedTick"), true, "Paused return restores exact journey pixels and clock");
    envelope.snapshotCandidate.brief.intent = "Unaccepted replacement";
    await click(button(t.showPreview)); await waitFor("document.querySelector('[data-draft-preview] [role=alert]')");
    assert.equal(await evaluate("creatorCanvas.toDataURL()===parkedPixels && creatorAudio.paused && !document.querySelector('[data-iz-end-draft]')"), true, "Invalid draft cannot replace valid journey or manipulate audio");
    envelope.snapshotCandidate = structuredClone(project.revision.snapshot);
    await click(button(t.showPreview)); await waitFor("document.querySelector('[data-iz-end-draft]')");
    await click("document.querySelector('[data-player-toggle]')"); await waitFor("!creatorAudio.paused && Number(creatorCanvas.dataset.simulationTick)>Number(parkedTick)+5");
    // Route teardown returns from an active immersive draft in the same host.
    await evaluate("window.next.router.push('/animations')"); await waitFor("document.querySelector('[data-infinite-zoom-controls]') && !document.querySelector('[data-iz-end-draft]')");
    assert.equal(await evaluate("document.querySelector('[data-infinite-zoom-layout]').dataset.mode==='background' && !creatorAudio.paused && creatorCanvas.getContext('webgl2')===creatorGL"), true);
    await click("document.querySelector('a[href=\"/animations/create\"]')"); await waitFor("document.querySelector('#creator-project')");
    await evaluate(`(()=>{const el=document.querySelector('#creator-project');el.value=${JSON.stringify(project.id)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor("document.querySelector('textarea[name=intent]')");
    await input("textarea[name=intent]", "Conflict edit"); conflict = true;
    await click(button(t.save)); await waitFor("document.querySelector('[data-creator-error]')");
    assert.equal(await evaluate("document.querySelector('textarea[name=intent]').value"), "Conflict edit");
    assert.equal(await evaluate("document.querySelector('[data-creator-error]').textContent"), t.conflict);
    assert.equal(writes, 3, "No automatic conflict retry"); conflict = false;
    await click(button(t.discard)); await click(button(t.reload)); await waitFor(`!${button(t.reload)}.disabled`);
    const oldId = revisions.at(-1).id;
    await evaluate(`${button(t.compare)}.click()`); await waitFor("document.querySelector('[data-creator-comparison]')");
    // Restore the first plan; source selection remains in the immutable history.
    await evaluate(`(()=>{const list=document.querySelector('[data-artwork-creator] ol');[...list.querySelectorAll('button')].filter(el=>el.textContent===${JSON.stringify(t.restore)}).at(-1).click();})()`);
    await waitFor("!document.querySelector('[data-creator-layers]').querySelector('article')");
    assert.equal(project.revision.restoredFromId, oldId); assert.equal(messages.length, 1); assert.equal(artifacts.length, 2);
    const before = await evaluate("creatorCanvas.dataset.simulationTick");
    await click("document.querySelector('[data-artwork-creator] a[href=\"/animations\"]')"); await waitFor("document.querySelector('[data-infinite-zoom-controls]')");
    assert.equal(await evaluate("!creatorAudio.paused && creatorAudio===document.querySelector('audio') && creatorCanvas===document.querySelector('[data-infinite-zoom-canvas]') && creatorGL===creatorCanvas.getContext('webgl2')"), true);
    assert.ok(Number(await evaluate("creatorCanvas.dataset.simulationTick")) >= Number(before));
    await click("document.querySelector('a[href=\"/animations/create\"]')"); await waitFor("document.querySelector('#creator-project')");
    await evaluate(`(()=>{const select=document.querySelector('#creator-project');select.value=${JSON.stringify(project.id)};select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor("document.querySelector('textarea[name=intent]')");
    await send("Page.reload"); await waitFor("document.querySelector('textarea[name=intent]')?.value==='Night garden'");
    assert.equal(await evaluate("document.querySelector('[data-artwork-creator]').innerText.includes('Keep the gate silhouette')"), true);
    assert.equal(await evaluate("document.querySelectorAll('audio').length"), 1);
    assert.equal(await evaluate("document.querySelectorAll('[data-infinite-zoom-canvas]').length"), 1);
    for (const locale of ["pl", "es"]) {
      await send("Network.setCookie", { name: "locale", value: locale, url: origin, path: "/" });
      await send("Page.reload"); await waitFor(`document.documentElement.lang===${JSON.stringify(locale)} && document.querySelector('textarea[name=intent]')`);
    }
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    assert.equal(await evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth"), true, "No horizontal overflow on mobile");
    const directory = new URL("../../../planning/artwork-creator/reports/evidence/kre04-2026-11-13/", import.meta.url);
    await mkdir(directory, { recursive: true });
    const mobile = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(new URL("creator-mobile.png", directory), Buffer.from(mobile.data, "base64"));
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Network.setCookie", { name: "locale", value: "pl", url: origin, path: "/" });
    await send("Page.reload"); await waitFor("document.documentElement.lang==='pl' && document.querySelector('textarea[name=intent]')");
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(new URL("creator.png", directory), Buffer.from(screenshot.data, "base64"));
    // The same page-level guard as /animations rejects admin-only sessions.
    roles = ["ADMIN"]; await send("Page.navigate", { url: `${origin}/animations/create` }); await waitFor("location.pathname==='/access-denied'");
    await send("Network.deleteCookies", { name: "accessToken", url: origin });
    await send("Network.deleteCookies", { name: "refreshToken", url: origin });
    const privateAsset = await fetch(`${origin}/infinite-zoom/drafts/${project.id}/${image.id}.png`);
    assert.equal(privateAsset.status, 401); assert.equal(privateAsset.headers.get("cache-control"), "private, no-store");
    await send("Page.navigate", { url: `${origin}/animations/create` }); await waitFor("location.pathname==='/login'");
    if (apiError) throw apiError;
    await writeFile(new URL("browser-summary.json", directory), JSON.stringify({
      test: "apps/ui/tests/artwork-creator.browser.mjs", backend: "isolated HTTP fixture", modelInference: false,
      projectCreated: true, planSaved: true, enqueue: true, cancelRetry: true, imageApplied: true,
      conflictPreservesInput: true, compareRestore: true, notesAndResultsRetained: true,
      reloadRecoversProject: true, locales: ["en", "pl", "es"], mobileWidth: 390, noHorizontalOverflow: true,
      samePlayingAudioCanvasAndContextOnNavigation: true, samePlayingAudioOnCancellation: true,
      appRoleGuard: true, anonymousGuard: true, animatedDraftPreview: true, invalidDraftRetainsPixels: true,
      pausedPreviewRetainsClockAndMusic: true, pausedReturnRestoresPixels: true, modeSwitchRetainsDraft: true,
      routeCleanupRestoresScene: true, privateDraftAssetGuard: true, packageBuilder: "HTTP fixture", sourceAnimation: "single image; animated operators tested separately in WebGL fixture",
    }, null, 2) + "\n");
    console.log("KRE-04 UI fixture: project/plan, queued generation, cancel/retry, image choice, conflict, compare/restore, notes, reload, PL/EN/ES, mobile, guards and same playing audio/canvas/context OK. No model inference claimed.");
  });
} finally { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); }
