# Sounds

pnpm workspace containing the NestJS API and Next.js frontend for Sounds.
The UI supports English, Polish and Spanish at shared URLs. Registration and
login use Server Actions, validate credentials and set HttpOnly session cookies.
Login routes USER/ARTIST to the app and ADMIN-only accounts to the admin panel.
Sign-out revokes the current session or all devices and clears local auth cookies.
The protected runtime refreshes access tokens one minute before their actual
expiry and checks again when the tab resumes. Protected operations and the
admin-to-app link wait for renewal before dispatch. The API tolerates overlapping
refreshes for five seconds, returning the same token pair to concurrent tabs.
Rejected renewal ends the runtime, stops media and clears cookies before login.
Temporary API failures block the UI with an explicit retry. Sign-out notifies
other tabs through BroadcastChannel so they stop media and return to login.

## Structure

```text
apps/
  api/
    src/                 # Backend source and generated Prisma Client
    test/                # End-to-end tests
    prisma/              # Schema, migrations and RBAC seed
    scripts/             # Auth session integration checks
    package.json         # Backend dependencies and scripts
    prisma.config.ts
    nest-cli.json
    tsconfig.json
    tsconfig.build.json
    eslint.config.mjs
  ui/                    # Next.js frontend, catalogs and i18n checks
package.json             # Workspace commands
pnpm-workspace.yaml      # Workspace packages and dependency build permissions
pnpm-lock.yaml           # Shared dependency lockfile
.prettierrc              # Shared formatting settings
```

## Setup

Use pnpm with support for the workspace `allowBuilds` setting (the migration
was verified with pnpm 12.9.1). Run commands from the repository root:

```bash
pnpm install --frozen-lockfile
```

Create `apps/api/.env` using the example in `apps/api/.env.example`:

```bash
DATABASE_URL="postgresql://postgres:<password>@HOST:PORT/DATABASE"
JWT_SECRET="<strong-random-secret>"
JWT_EXPIRES_IN="1d"
AUTH_PROXY_SECRET="<same-random-secret-in-api-and-ui>"
```

Also create `apps/ui/.env` from `apps/ui/.env.example`. Set `AUTH_PROXY_SECRET`
to the same random value (at least 32 characters) in both applications; use a
different value from `JWT_SECRET`. Restart API and UI after changing it.

When migrating an existing checkout, move your root `.env` to `apps/api/.env`.
The API loads its environment from its own working directory, including when
started through the root scripts.

Apply database migrations, generate Prisma Client and seed the RBAC roles and
permissions:

```bash
pnpm prisma:migrate
pnpm prisma:generate
pnpm seed:rbac
```

The RBAC seed is idempotent. Prisma commands are executed inside `apps/api`.
For other Prisma operations, use `pnpm --filter api exec prisma <command>`.

`tracks:create` belongs to ARTIST. ADMIN alone cannot create tracks; an account
holding both roles can create through ARTIST. The upload-access migration revokes
only the legacy ADMIN grant, and re-seeding also removes it from existing data.
`GET /auth/me` returns deduplicated `permissions` read from current database roles,
independently of JWT role claims, with `Cache-Control: private, no-store`.

`GET /tracks/upload-config` requires an active session and `tracks:create`.
It returns `maxFileBytes` from the active audio storage limit and a `formats` array
of `{ extension, mimeType }` pairs for MP3/WAV, without storage paths or keys.
Responses use `private, no-store`. The UI validates the profile/configuration
on the server; creation visibility uses `tracks:create`, while every API request
still authorizes against current database permissions. Run
`pnpm --filter api test:upload-access` to check the migration, seed and live
permissions using a temporary PostgreSQL database and temporary audio storage.

## Development

```bash
pnpm dev                 # API (3000) and UI (3001) with file watching
pnpm dev:api             # API only
pnpm dev:ui              # UI only
pnpm build               # Build workspace applications
pnpm start:prod          # Run the compiled API
```

The existing `start`, `start:dev` and `start:debug` commands also remain
available from the repository root. To run a command directly for the backend:

```bash
pnpm --filter api build
pnpm --filter api exec jest --runInBand
```

## Authentication limits

Login allows five failed attempts per account in a 15-minute window. After the
fourth failure the form warns that one attempt remains. A successful fifth attempt
resets the counter; a fifth failure blocks login for 15 minutes. Requests during
the block do not extend it. Username and email share the account counter.
Unknown or inactive accounts receive the same error codes and translated messages.

Separate source limits allow 100 login requests per minute, 20 registrations per
hour and 120 refresh requests per minute. Logout remains available. PostgreSQL
stores the counters across API restarts/instances; expired counters are removed
opportunistically, at most once per minute per instance. HTTP 429 responses include
`Retry-After` and `retryAfterSeconds`. UI messages are available in en/pl/es;
refresh throttling preserves cookies and offers explicit recovery.

UI scripts run `apps/ui/server.mjs`, which signs the source address from the HTTP
socket. Auth Server Actions forward that signature to the API, which verifies it
with `AUTH_PROXY_SECRET`; direct API calls use their socket address. Incoming
client signatures are replaced, and arbitrary `X-Forwarded-For` is ignored.
Behind a reverse proxy, explicitly list only its actual IP addresses in the UI's
`UI_TRUSTED_PROXIES` (comma-separated, empty by default). The trusted chain is
resolved from right to left. Start production UI with `pnpm --filter ui start`
after building; direct `next start`, standalone output and serverless hosting do
not run this custom entrypoint.

## Checks

```bash
pnpm devtest             # Backend lint, build and unit tests
pnpm devtest:ui          # UI catalogs, unit tests and TypeScript
pnpm verify:i18n         # Full i18n check, including production/browser tests and API tests
pnpm test                # Unit tests
pnpm test:cov            # Unit tests with coverage
pnpm test:e2e            # End-to-end tests (requires database configuration)
pnpm test:auth-sessions  # Auth integration checks (creates a temporary database)
pnpm --filter api test:audio-model # Audio model migration/integration checks (temporary database)
pnpm --filter api test:audio-storage # Compiled audio module/worker checks (temporary storage, no database)
pnpm test:auth-api       # Auth client + browser registration/login/logout against NestJS in a temporary database (build UI first)
pnpm format              # Format backend source and tests
```

Build output and test coverage are written to `apps/api/dist` and
`apps/api/coverage`. Backend dependencies belong in `apps/api/package.json`;
the root package manages the workspace commands.

`verify:i18n` is the shared pre-release/CI procedure: UI lint, catalog validation,
unit tests, TypeScript, production build, HTTP/RSC tests, browser checks and API
unit/HTTP-contract tests. It stops at the first failure. It uses mock API servers
on temporary ports and needs no running API/database. Node.js 22.6+ and an
installed Chrome/Edge/Chromium are required; browser tests use an isolated profile
and clean it up afterwards. Set `BROWSER_PATH` to an absolute executable path
if automatic detection does not find the browser. Run this command in CI after
installing the workspace dependencies and generating Prisma Client as above.

Changes to UI text must update all three catalogs in the same PR. Missing keys,
empty values, invalid ICU or changed interpolation arguments block tests and
builds. The emergency English catalog must also match its source messages.
See [UI documentation](apps/ui/README.md), [route access](apps/ui/ROUTING.md) and
the [API error contract](apps/api/ERRORS.md) for maintenance instructions.

## Track ownership and audio metadata

Track responses from list, detail, create and update include `ownerId` (nullable)
and `hasAudio` (boolean). Existing tracks keep their data, have no owner and report
`hasAudio: false` until audio metadata is attached. New tracks created through
`POST /tracks` get their owner from the authenticated session; `ownerId` is not an
accepted request field. Audio storage keys and file metadata are not exposed in
these responses.

The database now supports one `AudioFile` per track and unique storage keys.
Deleting a user preserves their tracks with `ownerId: null`; deleting a track
cascades to its audio metadata. Apply the migration with `pnpm prisma:migrate`
before running the updated API. Use the [audio cleanup command](#audio-cleanup)
to inspect and remove eligible orphan files.

`pnpm --filter api test:audio-model` verifies the migration against historical
records and exercises the model using a temporary database. It requires
`DATABASE_URL` and permission to create/drop test databases; application records
are not modified.

Audio storage uses `AUDIO_STORAGE_DIR`, an absolute path to a private directory
outside `public`, source and build directories. Local development uses
`D:/Sandbox/sounds-server/storage/audio` (ignored by Git). The API creates `tmp`
and `files` subdirectories and checks that they are writable at startup.
`AUDIO_MAX_FILE_BYTES` defaults to `52428800` (50 MiB) and limits bytes while
receiving the stream. On deployment, use a persistent disk/volume and back up
audio files together with the database. This version assumes one API instance.

Validation uses the bundled `mpg123-decoder` WebAssembly library and a WAV
structure/sample parser; no FFmpeg/ffprobe installation is required. MP3 frames
are checked for continuity, truncation and invalid Layer III side information,
then decoded incrementally. MPEG-1/2/2.5 Layer III with standard bitrates (including
VBR), leading ID3v2.2/2.3/2.4 and trailing ID3v1 tags are supported. Free-format
MP3, other MPEG layers and unrecognized trailing data/tags are outside this version.
Decoding does not prove bit-for-bit integrity of recordings without checksums;
some modified MP3 payloads remain decodable or can be concealed by the decoder.

Supported WAV: little-endian RIFF/WAVE with PCM 8/16/24/32-bit or IEEE float
32/64-bit samples, including `WAVE_FORMAT_EXTENSIBLE` with those subformats.
Compressed WAV, RF64 and big-endian RIFX are not supported. Invalid chunk sizes,
inconsistent sample layout, partial/empty sample data and non-finite float
samples are rejected. Original filenames and declared MIME types do not determine
the accepted format or the stored extension.

Validation runs in at most two worker threads per API instance with a 120-second
budget per file. Busy/unavailable validation returns `AUDIO_VALIDATION_UNAVAILABLE`
(503). Worker assets and the embedded decoder are checked at startup. The build
emits `src/audio/worker/*.cjs` to `dist/src/audio/worker` through TypeScript,
before startup in both build and watch mode (without an asynchronous asset-copy
step); deploy these assets
alongside the compiled API and production dependencies. File buffers stay bounded
during receipt and validation; decoded recordings are not retained in memory.

`POST /tracks/upload` accepts `multipart/form-data` with exactly one `file` and
one `metadata` field (JSON matching `CreateTrackDto`: required `title` and
`publicationDate` in `YYYY-MM-DD` format; optional `description`, `genre`,
`subgenre` and `bpm: { bpmFrom, bpmTo }`). Either part order is accepted. Metadata
is limited to 8 KiB; unknown fields, extra files and missing/invalid data are
rejected. JWT authentication and `tracks:create` are checked before file receipt.
The owner always comes from the authenticated session; client `ownerId` is rejected.

The API streams bytes to private temporary storage, validates content, commits
the file, then atomically creates `Track` and `AudioFile` using a Prisma nested
write. A successful response is HTTP 201 with the regular track response and
`hasAudio: true`; no storage details are returned. Request/validation failures
and disconnected transfers clean temporary files. Database failures remove the
committed file. A disconnect after a successful database commit preserves the
saved track and audio; clients must not automatically retry a mutation whose
response was lost. Cleanup failures are logged and return `AUDIO_STORAGE_FAILED`.
Process crashes can leave orphan files; use the audio cleanup command below.

Upload HTTP/filesystem tests run with `pnpm --filter api exec jest --runInBand
tracks/track-upload.service.spec.ts` using a temporary directory and mocked DB.
`test:audio-model` additionally checks atomic creation and rollback in PostgreSQL.

`GET /tracks/:id/audio` requires an active JWT session and `tracks:read` for every
request. Without `Range`, it streams the full recording with HTTP 200. One byte
range (`bytes=start-end`, `bytes=start-` or `bytes=-suffix`) returns HTTP 206 with
`Content-Range`, `Content-Length` and `Accept-Ranges: bytes`. End positions and
suffixes beyond the file are clamped; malformed, multiple or unsatisfiable ranges
return HTTP 416, `AUDIO_RANGE_INVALID` and `Content-Range: bytes */<size>`.
Audio responses use `Cache-Control: private, no-store` and the detected MIME type.
The API closes disk streams on completion, read errors and client disconnects.
Tracks without audio return 404; missing or inconsistent stored files return 503
with `AUDIO_STORAGE_FAILED`. Errors after streaming starts terminate the connection.

`DELETE /tracks/:id` accepts `tracks:delete-any` or `tracks:delete-own` plus ownership
of that track. Historical tracks with no owner require `tracks:delete-any`.
Permissions are loaded from the database, independently of token role names.
The API checks ownership and deletes the track (with cascading audio metadata)
in a database transaction, then removes its stored file. DB failure leaves the
file in place. If disk cleanup fails after commit, deletion still returns 200;
an error log records the track ID and storage key for later orphan cleanup.
Use the [audio cleanup command](#audio-cleanup) for remaining files; no automatic
sweep runs.

The two-stage upload contract is also available. `POST /tracks/uploads` receives
one multipart `file` and no metadata, validates it and returns HTTP 201 with
`{ uploadId, expiresAt }`. The private `AudioUpload` record survives restarts;
its 24-hour TTL starts after receipt/validation. No Track is visible at this point.
`POST /tracks/uploads/:uploadId/complete` takes `CreateTrackDto` JSON and returns
HTTP 201 with the track. Both endpoints require an active session and current
`tracks:create`. `DELETE /tracks/uploads/:uploadId` cancels an owned upload with
HTTP 204 even after create permission is revoked; it still requires an active
session. Missing/foreign/cancelled uploads return 404, consumed uploads 409 and
expired uploads cannot be completed (410). Cancellation is idempotent for a known
cancelled upload and never removes a completed track.

Validated pending files already live under private `files/`; only a completed
Track exposes an audio read route. Completion performs no filesystem move. A
conditional row update consumes the upload in the same transaction as the nested
Track/AudioFile insert; DB failure leaves the upload and file available for retry.
Concurrent complete/cancel/expiry operations serialize on that row. Cancellation
and expiry retire the record before unlinking, so a competing complete cannot
adopt a file being deleted. Failed unlink leaves the retired record/storage key
for retry. Upload registration failure removes its private file. Lost responses
may leave a pending upload for TTL cleanup or an already-created track; clients
must check the Library rather than automatically repeat a mutation.

The audio cleanup command uses the same conditional expiry transition as
`TemporaryUploadsService.expire`, waiting for competing complete/cancel row locks
and rechecking the predicate. Pending records and consumed keys are protected
from orphan deletion. Consumed records retain the 409 tombstone; AudioFile owns
their file lifecycle. Complete independently enforces expiry.

### Audio cleanup

Build the API first. The command loads `apps/api/.env` from the package working
directory; environment variables take precedence. Use the same `DATABASE_URL`
and absolute `AUDIO_STORAGE_DIR` as the API, pointing at the matching database
and private persistent volume. Keep backups of both together.

```powershell
pnpm --filter api build
# Read-only preview: does not change files or upload statuses.
pnpm --filter api cleanup:audio
# Explicitly apply expiry transitions and delete eligible files.
pnpm --filter api cleanup:audio --delete
# Optional longer file protection period (integer hours, minimum/default 24).
pnpm --filter api cleanup:audio --grace-hours 48
pnpm --filter api cleanup:audio --delete --grace-hours 48
```

The sweeper marks expired PENDING uploads EXPIRED, then examines only direct
children of `tmp/` and `files/` with generated UUID names (`.tmp`, `.mp3`, `.wav`).
File deletion requires all modification/change/creation timestamps to be at
least the grace period old. It removes abandoned temporary files, unreferenced
final files, and files of CANCELLED/EXPIRED uploads left by crashes or failed
unlink. Before deleting final files it checks AudioFile and AudioUpload again;
live PENDING uploads, all CONSUMED keys and AudioFile references are retained.
It rechecks file identity/timestamps immediately before unlink, skips unknown
names, nested directories and symbolic links, and rejects linked storage
directories. It neither removes upload history nor deletes Track/AudioFile rows.
A CONSUMED key without AudioFile is retained for manual investigation.

Output is JSON Lines: each event has `scope`, `key`, `action` and optional
`reason`/`applied`. A final `summary` includes mode and counts. In preview mode,
`expired` and `removed` count proposed operations; `applied` is false. Error events
identify a key without printing credentials or raw database errors. Exit status
is 1 on configuration, database or filesystem failure, including partial cleanup;
rerun after resolving it. Deletion is idempotent, with missing files tolerated.

Run this manually or configure the same command in your scheduler, for example
hourly with the API service account and access to its database and volume. No
background job or system schedule is installed by the application. The grace
period protects file creation/registration gaps; operations that can stay stalled
longer than that period should be stopped before cleanup, or use a longer grace.

`pnpm --filter api test:audio-cleanup` builds and tests preview, expiry, references,
orphans, grace periods, retries, concurrent completion, DB failure, path protection
and CLI arguments using an isolated PostgreSQL database and temporary directory.
It requires CREATE DATABASE permission and never targets application files.

`pnpm --filter api test:temporary-uploads` builds the API and verifies the new
contract over real HTTP, PostgreSQL and temporary storage, including restart,
owner checks, registration/transaction rollback, permission revocation, TTL,
complete/complete and complete/cancel races, and cleanup while completion holds
its row lock across expiry. It requires CREATE DATABASE permission and removes
only its isolated database and temporary directory.

Next.js proxies these operations under `/api/tracks/uploads` and GET/HEAD audio
under `/api/tracks/:id/audio`. See [UI README](apps/ui/README.md) for CSRF origin,
streaming limits, transport errors and `test:tracks-proxy`. The server-only
`getTracks` module validates uncached list responses. Library, upload form and
the persistent footer player are implemented through audio-upload stage 5.7.
Library row play/pause and footer controls share one audio element and playback
state across page/locale changes. See `pnpm --filter ui test:playback` for browser
coverage with an isolated audio API, including Range seeking and error recovery.
`pnpm --filter ui test:audio-upload` covers upload through the refreshed Library
to playback, including session termination and refresh outages in en/pl/es at
320px. It uses an isolated API and never writes application records or audio files.

Read/deletion HTTP tests use real JWT guards and temporary disk storage with a
mocked database: `pnpm --filter api exec jest --runInBand track-audio`.
`test:audio-model` also verifies deletion permissions, cascading metadata deletion
and rollback without invoking disk cleanup against temporary PostgreSQL.

### Audio upload acceptance checks

Run from the repository root with dependencies and Prisma Client installed.
The database checks need the API's `DATABASE_URL` and CREATE DATABASE permission;
they create and remove their own databases and temporary storage. Browser checks
need Chrome/Edge/Chromium (or an absolute `BROWSER_PATH`) and start isolated Next.js
servers against test APIs. Build UI before running its HTTP/browser checks.

```powershell
pnpm --filter api exec jest --runInBand
pnpm --filter ui test
pnpm --filter api exec eslint "{src,apps,libs,test}/**/*.ts"
pnpm --filter ui lint
pnpm --filter api exec tsc --noEmit
pnpm --filter api build
pnpm --filter ui build
pnpm --filter ui exec tsc --noEmit
pnpm --filter api test:audio-storage
pnpm --filter api test:audio-model
pnpm --filter api test:upload-access
pnpm --filter api test:temporary-uploads
pnpm --filter api test:audio-cleanup
pnpm --filter ui test:routing
pnpm --filter ui test:tracks-proxy
pnpm --filter ui test:browser
git diff --check
```

The browser suite includes upload, Library and playback acceptance checks in
en/pl/es, keyboard and 320px layouts, navigation/language changes, session endings
and refresh recovery. It uses test APIs; actual audio validation, persistence,
transactions and cleanup are covered by the API checks above. See the
[audio upload plan](docs/audio-upload-plan.md) for the acceptance criteria and
verification results.

Stage 7 passed on 2026-11-02: all 11 acceptance criteria confirmed, 273 API tests,
105 UI tests, all five audio API/storage/database checks, both HTTP integration
checks and all 14 browser scripts passed. TypeScript, lint, translations and both
production builds passed. Next.js commands required execution outside the sandbox
because it blocked access to the native SWC cache. Application data was not
modified by these checks. The Library visual refactor remains a separate stage 8.
