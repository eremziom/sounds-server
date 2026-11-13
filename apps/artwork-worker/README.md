# Local artwork worker — KRE-02

The API persists jobs; a separate Node process supervises individual Python
operations. No model is loaded into NestJS. KRE-02 does not change the audio
runtime or publish scenes. Current acceptance and measurements are in
[the KRE-02 report](../../planning/artwork-creator/reports/KRE-02-2026-11-13.md).

Use the existing KRE-00 environments and weights, or reproduce their pinned
versions from `requirements-cpu.lock.txt`, `requirements-gpu.lock.txt` and
`profile-lock.json`. This implementation installs/downloads nothing on startup.
The model repositories, revisions, original licences and measured limitations
are recorded in the KRE-00 reports linked from the KRE-02 report.

From the repository root:

```powershell
pnpm --filter api exec prisma generate
pnpm --filter api build
pnpm --filter api prisma:migrate
py -B apps/artwork-worker/verify-profile.py
pnpm artwork:worker
```

The migration is already applied to the local development database for this
implementation. Configure `ARTWORK_JOB_ROOT` in `apps/api/.env` as an absolute
private path separate from both `ARTWORK_STORAGE_DIR` and `AUDIO_STORAGE_DIR`.
Defaults for the two Python executables and model directory point at the
existing `.local/kre00/venvs/` and `.local/kre00/models/` directories. Optional
overrides are documented in `apps/api/.env.example`.

`verify-profile.py` hashes the pinned model files and creates a local verification
marker. Model workers check the profile hash and file size/mtime against that
marker before loading. Run verification again after any model-file change.
The worker consumes the tested `image_ops.py`, `bounded_attention.py`,
`klein_loading.py` and DXGI inventory helper from `tools/artwork-creator/`;
they must be distributed with this repository. Their hashes are recorded in
result provenance. It does not execute the benchmark's fixed scene recipes.

Tested runtime: Windows x64, Node 25.8.2, Python 3.12 KRE-00 environments,
RX 7800 XT. The memory probe requires access to Windows WDDM counters. Normal
application processes can read them; the Codex sandbox required a separate
approved test invocation. Missing counters defer jobs rather than bypass admission.

Jobs are polled every 5 seconds. `--once` on the compiled API worker entry
performs one recovery/claim cycle. `ARTWORK_POLL_MS` can override the interval
within 250–30000 ms; the default remains 5000 ms. Starting two workers does not
allow two operations: one PostgreSQL session advisory lock covers recovery,
execution, commit and cleanup. Stopping the API leaves the worker independent;
stopping the worker leaves queued jobs durable. Interruptions produce a
retryable failed job, not an automatically applied partial result.

## KRE-03 production client

`production-client.mjs` exports `produceScene({apiUrl, headers, recipe, directory,
until, onProgress})` for an authenticated API session. It persists the plan,
idempotency requests and checkpoint locally without saving credentials. All
image, mask and package outputs come from registered API jobs. It exports a
self-contained immutable bundle after validating asset checksums; it does not
publish to the artwork library.

The pilot input is
`planning/artwork-creator/pilots/gate-drone/recipe.json`, with the scene-specific
brief beside it. Read the shared authoring guidelines before revising it.
Correct outputs through new registered operations, never by editing their PNGs
or the exported manifest. `registerMap` explicitly transfers a normalized
full-frame 16:9 map to another registered image; other tools require masks bound
to their exact image. A transfer does not establish visual alignment.
`deriveLightSelection` optionally accepts `detailRadius` (1–12 native pixels)
and `detailContrast` (1–64, default 8). It uses local white top-hat contrast to
select actual bright material ridges instead of entire flat surfaces. Inspect
the resulting mask in motion/zoom; this is not semantic material segmentation.
Long runs retain earlier coordinator markers in immutable revision history to
stay within the 100-decision snapshot limit, preserving authored user decisions.
Job provenance export follows pagination rather than truncating at 100 jobs.

From `apps/api`, after building:

```powershell
node scripts/artwork-production-pilot.cjs --until source
# Resume using the run directory printed above:
node scripts/artwork-production-pilot.cjs --directory D:/Sandbox/sounds-server/.local/kre03/runs/pilot-<timestamp>
```

This acceptance harness retains an isolated test database and private artifact
store for resume, runs real controllers/services and a separate worker, and uses
a fixture authorization guard. It is not a production server or the KRE-04 UI.
Memory deferral is not successful generation. The 20-minute client wait deadline
stops its worker while retaining the queued operation and checkpoint.

From the root, run the actual engine preview on the returned bundle:

```powershell
node tools/artwork-creator/production-preview.browser.mjs .local/kre03/runs/pilot-<timestamp>/bundle-<hash>
node --test apps/artwork-worker/production-client.test.mjs
```

The preview writes WebM motion, PNG captures and technical checks under `qa-*`.
Controlled normalized signals test audio bindings without adding an audio graph.
Review actual motion/zoom and material boundaries separately. Technical fixtures
are not production artwork acceptance. Current status and pilot limitations:
[KRE-03 report](../../planning/artwork-creator/reports/KRE-03-2026-11-13-closure.md).

## Checks

```powershell
pnpm --filter api test:artwork-jobs
.local/kre00/venvs/onnx/Scripts/python.exe -B -m unittest discover -s apps/artwork-worker -p test_tools.py
```

The integration test uses real small PNGs, processes, PostgreSQL and the engine
parser, with explicit fixture memory readings for deterministic CPU checks.
It never loads model weights in its default mode. From `apps/api`, run
`node scripts/test-artwork-jobs.cjs --models` for actual model adapters and
actual memory admission. Deferred Klein jobs are reported as deferred, never
as successful inference.

`node tools/artwork-creator/kre02.browser.mjs` from the root runs the same model
probe alongside the actual existing `/animations` page with fixture audio. Its
evidence is written under `.tmp/`. This is not artwork motion/zoom acceptance
or a sustained FPS benchmark.
