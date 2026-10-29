Sounds frontend built with Next.js App Router, React and next-intl.

## Getting Started

From the repository root, run the development server:

```bash
pnpm dev:ui
```

Open [http://localhost:3001/login](http://localhost:3001/login) for the public UI.
Protected pages validate sessions against `API_URL` (default port 3000).

The agreed Server Action flow, module boundaries, form result contract and
translation setup for auth forms are described in [AUTH.md](AUTH.md).

Backend HTTP calls live in `src/api/`, grouped by domain (`auth.ts` currently
contains session verification). These modules use `server-only`. Session/access
policy and cookie helpers belong in `src/lib/`; Server Actions orchestrate them
from `src/app/(auth)/actions.ts`. `src/api/` is
application code, distinct from Next.js HTTP routes under `src/app/api/`.

The auth API module supports login, register, refresh, logout, logout-all and
session verification. `src/api/client.ts` returns typed success/failure results,
preserves HTTP status and strips raw backend error text/input values. It disables
caching/redirects and enforces a 5s timeout through response-body reads.
Session responses validate token formats, UTC expiry timestamps and user/roles,
returning only a safe user DTO. See [AUTH.md](AUTH.md) for the full contract.

Server Actions can use `setAuthCookies`, `getAuthCookies`, `clearAuthCookies` from
`src/lib/auth-cookies.ts`; writes require an action/Route Handler context. Only
token cookies are modified. For failures, `getAuthActionError` from
`src/lib/auth-action-state.ts` produces translated form state with the request
locale; `initialAuthState(locale)` is safe to import into a client form. Never
return the successful API session (which contains tokens) to a Client Component.

Registration is implemented at `/register`: username, email, password and password
confirmation, password visibility, client/server validation, pending/errors and
automatic sign-in followed by `/`. Login at `/login` accepts username or email,
validates login length 3–100 and password requirements on client/server, and sets
the same session cookies. USER/ARTIST → `/`, ADMIN alone → `/admin`, other roles
→ `/access-denied`; API roles decide, with app priority for combined roles.
No returnTo parameter is implemented. Wrong passwords, missing and inactive
accounts share one safe localized message. Background renewal is described below.
Validation uses the same validator version and password regex
as CreateUserDto, including Unicode length rules, without trimming credentials.
The form receives auth/validation/errors through ClientMessages, preserves input
on language changes and hides server errors from a different request locale.
Passwords are cleared on submission and never returned by the action.

Stage 7 groundwork puts app/admin under one `(protected)` layout without changing
URLs. ApplicationRuntime owns the client session and exposes useApplicationSession.
It composes MediaRuntime, which owns the persistent audio element, animation host,
useMediaRuntime and media cleanup outside the sections' loading boundaries.
Navigation and cookie changes preserve the instances;
switching accounts or leaving the protected area stops and releases them.
The client session controller supports active/refreshing/ended. The POST Server
Action `refreshAction()` reads the HttpOnly refresh cookie, calls the API, writes
both rotated cookies and returns only success and the new access expiry timestamp
(or `{ ok: false }`). The runtime schedules renewal one minute before the actual
expiry, checks on visibility/focus/pageshow and renews even while idle. Initial
expiry comes from the server-decoded JWT `exp` after API session verification;
only the timestamp reaches the client. Every renewal uses the API response's
expiry; there is no hardcoded token lifetime. For renewed tokens lasting one
minute or less, renewal is scheduled halfway through the remaining lifetime to
avoid an immediate rotation loop.

The protected layout includes a small session footer showing the access token's
remaining lifetime, updated every second. It resets to the new expiry after a
successful refresh and displays renewal/session-end status in en/pl/es. This is
the access token countdown; the refresh session's absolute lifetime is separate.

`useApplicationSession().ensureFresh()` checks the same deadline before a
protected client request and resolves after cookie rotation. It shares in-flight
work through the existing session controller and returns false after session end.
`useApplicationSession().runProtected(() => operation())` performs that check and
waits before invoking a request/Server Action exactly once. It returns
`{ executed: false }` when renewal fails/the session ends, or
`{ executed: true, value }` with the operation's result. Operation exceptions
propagate; HTTP responses (including 401/403) are returned without refresh/retry.
Call Server Actions inside a React transition as usual.

The admin-to-app link uses `ProtectedLink`: prefetch is disabled, and client
navigation waits for cookie rotation before calling the Next router. New protected
links should use this component; programmatic navigation/requests must go through
`runProtected`. Modified clicks/new tabs, browser history and full document loads
retain normal Next/server guard behavior. Language preference and sign-out actions
retain their existing independent flows. The current product has no protected
client data requests; server-side data/role checks remain unchanged.
The API serializes rotation in PostgreSQL and returns the same pair for the
previous/replacement refresh token within a fixed five-second overlap. Requests
inside that overlap do not extend it or create another token. The encrypted result
lives in one nullable AuthSession field, shared across API instances; no frontend
session store or cross-tab lock is added. Reuse of a consumed token after the
overlap still revokes the session. Apply migrations and regenerate Prisma Client
before starting the updated API.
Cookie cleanup/redirect on session loss and cross-tab sign-out notifications
remain pending. A cold load with an expired access cookie still
uses the existing login redirect.
Build first, then run `pnpm --filter ui test:runtime` from the repository root
for the audio/animation lifecycle regression in en/pl/es. This uses generated
silent audio and Web Animations, not a finished music player or streaming service.

The header shows sign-out controls whenever either auth cookie exists, including
when access has expired or the API is down. Current sign-out uses the server-side
refresh cookie; all-device sign-out uses the access cookie and API authentication,
without an ADMIN or app-role requirement. Both run as POST Server Actions and
clear only the two token cookies, preserving locale, then redirect to /login.
An API failure still clears local cookies and shows a translated local-only
notice (auth.logout.localOnly / auth.logoutAll.localOnly). The URL contains only
an allowlisted technical outcome, never backend text or tokens. The all-device
button is offered when an access cookie exists. Pending disables both buttons.

Build the UI first, then run `pnpm test:auth-api` from the repository root
to exercise the UI client and browser registration/login/logout against real NestJS/PostgreSQL
in en/pl/es in a disposable database.
It requires the API DATABASE_URL and CREATE DATABASE privilege, and does not
modify application data. This database check is separate from `pnpm verify:i18n`.

Pages live in `src/app/`; development changes update automatically.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Translations (stages 2–7)

The UI uses `next-intl` 4.14.9 with shared URLs for English (`en`), Polish (`pl`)
and Spanish (`es`). Catalogs live in `messages/{en,pl,es}.json`; English defines
the key structure. Use nested semantic keys such as `auth.login.title`.

Run from the repository root:

```bash
pnpm --filter ui check:messages
pnpm --filter ui test
pnpm --filter ui exec tsc --noEmit
# Unit tests, catalog validation and TypeScript together:
pnpm devtest:ui
```

The catalog check also runs before every UI build and test run. It rejects
missing/extra keys, empty values, invalid ICU and mismatched parameters or
rich-text tags. Update all three catalogs in the same change. Locale-specific
plural categories may differ; ICU messages must include `other`.
The three emergency English strings must also match the English source catalog;
this is checked before builds and tests.

`src/i18n/messages.ts` loads catalogs on the server through explicit imports.
Missing/blank translated values fall back to English with a warning containing
only the locale and key. This runtime fallback does not relax the build check.
`src/i18n/types.d.ts` supplies typed keys and locales; `typecheck.ts` verifies
that invalid keys fail compilation.

For server rendering, use `getTranslations` from `next-intl/server`. Small
interactive components should receive translated labels as props. Components
needing translation hooks can be wrapped in the server-side `ClientMessages`
component with an explicit `namespaces` selection, e.g. `["auth", "validation"]`;
only these namespaces are sent to the client. Do not import the catalog loader
into client components.

Request language is resolved by `src/i18n/locale.ts`: a valid `locale` cookie
(`en`, `pl`, `es`) wins over `Accept-Language`, then falls back to English.
Browser preferences support regional tags (`pl-PL`, `es-MX`), case-insensitive
matching and quality weights. Unsupported/malformed entries and `q=0` are
ignored; equal weights preserve header order. A wildcard alone uses English.
Invalid cookies fall through to browser preferences. Rendering never writes
the cookie.

The shared header contains a keyboard-accessible language selector: English,
Polski, Español. Its label/error are translated on the server and passed as
props, so the client receives only the two strings it needs. The selected value
comes from the same next-intl locale as `html lang`.

`src/i18n/actions.ts` validates the selection and sets only the `locale` cookie
with `Path=/`, `SameSite=Lax`, `HttpOnly`, a one-year max age and `Secure` in
production. The Server Action cookie update re-renders the current page/layouts
and updates the client locale without navigation. Path, query, fragment and
session cookies are preserved. Pending saves ignore further changes while
retaining keyboard focus. A failed save announces a translated error and allows
retrying. The saved cookie takes precedence over the browser language on reload
or when reopening a shared URL.

Server pages, metadata and future actions should use `getLocale()` or
`getTranslations()` from `next-intl/server`; they share this request configuration.
The root layout sets `html lang` and provides the same locale/time zone/formats
to client components. It sends only `errors.page` and `common.actions` for the
client error boundary. Use `ClientMessages` with explicit namespaces elsewhere.

All current pages, access checks, loading and not-found states use the selected
language. Page titles and descriptions are localized; existing URLs are shared
without language prefixes, URL parameters or rewrites. Cache Components is
disabled and partial prefetching removed so the initial HTML uses the request
language. Login and registration use the existing auth/validation/error keys;
auth.login.placeholder and auth.register.placeholder were removed from en/pl/es.
The remaining auth work belongs to `docs/ui-auth-plan.md`.

`app/error.tsx` uses the root provider's selected language and the installed
Next.js `retry()` prop to re-fetch after an error; it never displays exception
details. `app/global-error.tsx` replaces the entire document if the root layout
fails. Since request context/providers may be unavailable, it uses English,
`lang="en"`, and only the three strings in `messages/emergency.en.json`.
A test checks that this minimal emergency catalog matches the English source.

`src/i18n/formats.ts` defines shared named Intl formats: `releaseDate`, `decimal`
and `bpm`. They are configured for both server `getFormatter()` and client
`useFormatter()`. Plain code may call `formatDate`, `formatNumber` or
`formatCalendarDate` from `src/i18n/format.ts`, always passing the resolved locale.
All dates use UTC; `formatCalendarDate` validates YYYY-MM-DD values and preserves
their calendar day. For future relative dates, pass the same explicit `now` from
the server to the client. There are no date/number/count views yet; do not add
sample data solely for formatting. Use complete ICU messages with parameters,
plural rules and `t.rich` for rich text rather than concatenating sentences.

### API errors

The additive API contract is documented in [API errors](../api/ERRORS.md).
`src/i18n/api-errors.ts` maps stable API codes to catalog messages and translates
field rules, without displaying or parsing the backend's free-form `message`.
The pure `translateApiError(failure, operation, t)` works with next-intl translators.
Server Actions should use `getApiErrorMessages(failure, operation)` from
`src/i18n/api-error-messages.ts`; it automatically uses the current request locale.

```ts
const messages = await getApiErrorMessages(
  { kind: "http", status: response.status, body: parsedErrorBody },
  "register",
);
// messages.message: safe translated summary
// messages.fieldErrors.email: translated validation messages, if present
```

Classify request timeouts as `{kind: "timeout"}`, network failures as
`{kind: "network"}` and invalid JSON/success payloads as `{kind: "invalid-response"}`.
All receive safe localized messages. Unknown codes, mismatched code/status pairs
and codes for another operation fall back to `errors.unexpected`. Legacy responses
without a code use only known operation/status combinations (e.g. login 401 or
registration 409); their free-form text is never interpreted. Do not infer a
username conflict from registration 409.

The mapper accepts only known auth form fields, safe numeric length bounds and
supported validation rules. It drops unknown fields and arbitrary parameters,
including token/password values. Missing user, inactive account and wrong password
share `AUTH_INVALID_CREDENTIALS` and one message. Registration and login use this
mapper. Existing page-level unexpected errors
continue to use the safe translated error boundary.

All pages render dynamically. HTML/RSC responses must remain `private` and
`no-store`; any future reverse proxy/CDN must forward `Cookie`/`Accept-Language`
and respect these directives, without overriding them with a shared URL cache.
Catalog modules may be reused by locale; user language/session values must never
be stored globally or in a shared cache. Run `pnpm --filter ui build`, then
`pnpm --filter ui test:routing` to check HTML/RSC locale isolation and RBAC.

The workspace allows install scripts for `@parcel/watcher` and `@swc/core`,
which are dependencies of the chosen next-intl version. On Windows the native
SWC module needs access to its user cache during builds and server startup.

## Full i18n verification

Run from the repository root:

```bash
pnpm verify:i18n
```

This is the common local/pre-release/CI procedure. It runs UI lint, catalog checks,
all UI unit tests, TypeScript, a production build, HTML/RSC tests, browser checks
and the API Jest suite (including the error contract). It stops at the first
failure and requires no running API/database. The test suites use isolated mock
APIs, Next servers on temporary ports, and an isolated browser profile. After the
UI build, pnpm test:auth-api separately verifies registration/login with real
NestJS/PostgreSQL in an isolated disposable database. The runtime browser suite
separately checks timed and resume renewal against a mock API in en/pl/es,
including cookie replacement and uninterrupted audio/animation.

Requirements: Node.js 22.6+, the workspace dependencies/Prisma Client from the
root setup, and Chrome, Edge or Chromium. The browser test uses Node's built-in
WebSocket and the browser's debugging protocol; it does not install browser
automation dependencies. If automatic discovery fails, configure the absolute
browser executable path, for example in PowerShell:

```powershell
$env:BROWSER_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm verify:i18n
```

To run only the browser check against the last production build:

```bash
pnpm --filter ui test:browser
```

`tests/routing.integration.mjs` covers all role/locale combinations for both
cookie and browser-header selection, HTML and RSC, invalid/missing sessions,
fallbacks, private/no-store headers, sequential users at shared URLs, 404s,
absence of language-prefixed routes and the language action with/without a session.

`tests/i18n.browser.mjs` checks keyboard/focus, translated labels, URL/query/hash,
history length and back/forward after a language change, persistent preferences,
anonymous visitors, session preservation, save errors/retry, all page metadata,
loading/API error/404 states, retry after recovery and no hydration errors.
It saves 320px screenshots to `apps/ui/.tmp/i18n/` for visual review and removes
its temporary browser profile. Browsers must be preinstalled in CI; configure
`BROWSER_PATH` there if needed. No hosting or CI provider is assumed.

`tests/register.browser.mjs` and `tests/login.browser.mjs` cover localized client
validation, API errors, password visibility, focus, pending, language changes,
HttpOnly cookies and protected navigation. Login additionally checks all role
redirects, username/email, network/timeout failures and public RSC navigation while
signed in. Shared browser setup lives in `tests/helpers/auth-browser.mjs`.
Screenshots at 320px are saved to `.tmp/registration/` and `.tmp/login/`.

`tests/auth-forms.browser.mjs` completes stage 5 for both forms in en/pl/es:
Tab/Enter/Space keyboard interaction, visible focus, translated labels and
descriptions in Chrome's accessibility tree, local-error retranslation without
remounting, and a language change while a successful auth response is held.
It checks one auth POST, current destination language, fresh-cookie private RSC,
protected Link navigation, 401/403 guard policy, fail-closed API errors and long
multi-field messages at 320px. Screenshots live in `.tmp/auth-forms/`.
The pending live region sits outside the busy form so its announcement is not
deferred. Accessibility checks inspect Chrome's tree and live-region semantics;
they do not automate speech output from a separate screen reader.

`tests/logout.browser.mjs` covers current/all sign-out, refresh-only sign-out after
access expiry, pending, language changes on success/failure, 320px notices,
local cookie removal during an API outage, back navigation, protected RSC and
Origin/Host rejection. It also sends the same captured action with a trusted
Origin to confirm the rejection is caused by Origin protection. Screenshots:
.tmp/logout/. The real API suite checks revoked access/refresh tokens and that
current sign-out preserves a second session while all-device sign-out revokes it.

To check development-only React warnings with an existing dev server, run
`node tests/logout-dev.browser.mjs` from apps/ui (UI_DEV_URL defaults to
http://localhost:3001). It renders controls in a disposable browser profile with
fake cookies and does not invoke sign-out. Button names are reserved by React
for function formAction; pending labels use useFormStatus().action instead.

### Updating text and adding a language

Use semantic nested keys and update `messages/en.json`, `pl.json` and `es.json`
in the same PR. Keep interpolation names and rich-text tags identical. Use full
sentences; add ICU plural/select variants instead of concatenating fragments.
For emergency messages, update `emergency.en.json` alongside the English source.
Run `pnpm verify:i18n` before release. Fallbacks never justify incomplete catalogs.

To add a language, add its full catalog, extend `locales` in `src/i18n/config.ts`,
the explicit loader in `src/i18n/messages.ts`, the native display name in
`LanguageSwitcher` and the test matrices. Keep English as the base/default;
do not create language routes or translate role/permission/API identifiers.
Check complete text, metadata, keyboard focus, screen-reader labels and narrow
layouts in every language. Current terminology uses Sign in / Logowanie /
Iniciar sesión and Admin panel / Panel administracyjny / Panel de administración.

## Next.js resources

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
