# Route access

`(auth)` routes (`/login`, `/register`) are public, including for signed-in users.
`(app)` requires a `USER` or `ARTIST` role; `(admin)/admin` requires `ADMIN`.
Roles are additive: `ADMIN` alone does not grant access to `(app)`.
Missing/invalid sessions without a refresh cookie redirect to `/login`; insufficient roles redirect to
the public `/access-denied` page.

Both protected sections now live under `src/app/(protected)/`, with unchanged
URLs. Its shared layout verifies the session before mounting ApplicationRuntime;
section layouts and pages retain their own role checks. The runtime lives outside
section/page loading and error boundaries and owns a persistent audio element,
animation host and client session context. Its identity depends only on the
verified account ID, never pathname, token or locale. Changing accounts or leaving
the protected area tears down media; ordinary section navigation/cookie writes
preserve the instances. Animation engines using requestAnimationFrame/WebGL must
register their stop callback through useMediaRuntime and unregister on teardown.
The runtime calls POST Server Action `refreshAction()` one minute before the
actual access expiry and rechecks on visibility/focus/pageshow. It keeps renewing
while idle. The server supplies JWT expiry and the API-validated absolute
`sessionExpiresAt` timestamps; renewal returns the next access expiry and the
fixed session deadline (`refreshTokenExpiresAt` in the API). Token lifetime is
not hardcoded. Renewed tokens valid for at most a minute are scheduled halfway
through their remaining lifetime to avoid a rotation loop.
An independent deadline timer calls `session.end()` at the end of the session,
including during renewal or API recovery. Focus/visibility/pageshow and protected
requests check that deadline as well. Successful renewal cannot extend it, and
a late response cannot reactivate an ended runtime. Existing media cleanup,
cross-tab notification and queued cookie cleanup/login handle this termination.
The API remains the authority for every protected request, regardless of client
clock changes. `/auth/me` without a valid future deadline fails response parsing;
deploy the API contract update before the corresponding UI.
`useApplicationSession().ensureFresh()` exposes the deadline check for protected
client requests and shares pending renewal. `runProtected(operation)` waits for
that check before executing an operation once; failure/session end prevents
dispatch, and operation errors/401/403 do not trigger retries or refresh.
The admin-to-app `ProtectedLink` disables prefetch and waits before client
navigation. Use `ProtectedLink` for new protected links and `runProtected` for
programmatic protected navigation/data requests. Browser history, modified clicks,
locale/sign-out actions and document loads retain their existing behavior.
Concurrent tabs are handled by the API's five-second rotation overlap: both
receive the same tokens, backed by one encrypted result on AuthSession and the
existing PostgreSQL user lock. The window is fixed, not extended by duplicates;
revoked/expired sessions are checked before replaying the result. Reuse after
the overlap still revokes the session. No UI session store is introduced.
Rejected renewal ends the runtime and calls expireSessionAction to clear auth
cookies and redirect to login. Logout ends the local runtime on submit, while
the existing logout actions clear cookies and retain the logout result screen.
Within one tab, Next queues cleanup/logout after an in-flight refresh so a late
response cannot leave replacement cookies behind or reactivate the controller.
Uncertain refresh failures (network/timeout/API outage/403/invalid response)
instead block protected UI and stop media in `unavailable`, preserving cookies
and runtime instances for an explicit retry. No automatic retries run in that
state. Completed logout publishes a token-free `"logout"` message through
BroadcastChannel; other runtimes end and queue their existing cookie cleanup/login
flow without rebroadcasting. The source sends after cookie cleanup, so peer cleanup
cannot erase credentials before the source's revocation request. A pending refresh
in a receiver finishes before its final cookie cleanup. Automatic session loss
also notifies peers; an unavailable API does not. Old result-page visits do not
broadcast without a local logout intent. Communication is limited to the same
origin/browser profile and adds no persistent session store. A cold load
or navigation without a valid access cookie first attempts recovery if a refresh
cookie exists, through the public `/resume?returnTo=...` page. It mounts no
protected content/media and makes one POST `resumeSessionAction` call using
`refreshAction`, then verifies `/auth/me` and the destination's current roles.
Invalid refresh clears auth cookies and redirects to login; outages/rate limits
preserve cookies and offer a translated manual retry. No automatic retry runs.
The return target permits only `/` and `/admin` with user query parameters;
new protected routes must extend `session-resume.ts` and the action's role policy.
`server.mjs` replaces `x-sounds-request-target` with the actual incoming URL.
A reserved `__session_resumed` query marker prevents another recovery if the
destination guard rejects the renewed session; the authenticated runtime removes
it from browser history after mounting. `_rsc` is omitted from the return target.
The UI controller never authorizes API operations.

All languages use these same URLs and redirects. Request language is selected
from a valid `locale` cookie, then weighted `Accept-Language` (including regional
tags), then English. Language detection does not modify roles, sessions or route
guards. All current page content and metadata use the request language, including
login, registration, app/admin, access-denied, loading and not-found states.
The client error boundary uses the same locale and exposes only a safe message
and retry button. If the root layout itself fails, the standalone global error
document falls back to English without relying on request context/providers.

The root layout reads request language and dynamically renders `html lang` with
the same locale supplied to client components. Cache Components is disabled.
HTML/RSC responses are `private, no-store`; reverse proxies/CDNs must respect
these directives and forward the original cookies and browser language header.
Do not cache these responses by URL across users or languages. There is no CDN
configuration in this repository; preserve this policy when adding one.

The shared language selector is available on public, app and admin pages. It
calls a Server Action that validates and writes only the `locale` cookie (one
year, `Path=/`, `SameSite=Lax`, `HttpOnly`, `Secure` in production). Cookie changes
re-render the current view without navigation, keeping the path, query, fragment
and session intact. Language errors are displayed beside the selector.

The server reads the `accessToken` cookie and validates it with `GET /auth/me`
in the NestJS API on each server render. Roles come from the API, never from
unverified JWT claims. Requests are not stored in the shared data cache.
API outages fail closed with an error instead of granting access.

`src/api/client.ts` centralizes no-store requests, a 5s timeout (including body
reads), redirect rejection and safe technical failures. `getSessionUser()` keeps
401/403 distinguishable even if an error body is invalid. The existing
`fetchSessionUser()` adapter preserves the current guards' null/redirect policy.
New auth actions should use the result/status directly when implementing refresh.

`src/lib/auth-cookies.ts` provides server-only token cookie helpers with HttpOnly,
SameSite=Lax, Path=/ and Secure in production. Expiries come from a validated API
session; clearing affects only the two tokens and preserves locale. Cookie writes
are allowed only in Server Actions/Route Handlers. The helpers and API functions
are implemented. Registration and login use these helpers in registerAction and
loginAction. logoutAction/logoutAllAction clear them after revocation attempts;
refreshAction rotates both cookies after a successful background renewal.

`src/lib/route-access.ts` contains shared role types, constants and role checks
that can be imported by client components. `src/api/auth.ts` contains
`fetchSessionUser` and response validation; it is marked `server-only` to prevent
API session checks from being imported into client components. `src/lib/auth.ts`
connects these server-side checks to cookies and redirects. Endpoint calls are
organized under `src/api/`; cookies/session policy remain in `src/lib/`.

Set `API_URL` in `apps/ui/.env.local` if the API is not at
`http://localhost:3000` (see `.env.example`). Successful registerAction sets both
token cookies with the API expiry timestamps and redirects to `/`. loginAction
sets the same cookies, then routes USER/ARTIST to `/`, ADMIN-only to `/admin`,
and other roles to `/access-denied`. App roles take priority for combined roles.
These decisions use the API response, not decoded JWT claims or submitted roles.
No returnTo destination is used. Both forms stay public for signed-in users.
Background renewal runs in the mounted protected runtime; without a valid access
cookie on initial page load, protected pages use the recovery flow above.

Layouts guard the section UI. Each protected page must also call
`requireRoles(APP_ROLES)` or `requireRoles(ADMIN_ROLES)` before fetching protected
data, since layouts can be reused during navigation. The helper is server-only
and deduplicates session validation within a render. Server Actions and Route
Handlers must perform their own checks. NestJS guards remain responsible for
authorizing API operations.

Run `pnpm --filter ui test` for session validation and role policy tests
(Node.js 22.6+ with TypeScript stripping).

After building the frontend, run `pnpm --filter ui test:routing` for HTTP tests
of public/protected pages and RSC requests. These start an isolated production
Next.js server and mock API on temporary ports; no database is needed.

The locale/role matrix runs twice for each HTML/RSC combination: once with the
locale cookie and once with a regional, weighted browser header. It also checks
language fallbacks, private responses for shared URLs, translated metadata/404,
absence of language-prefixed routes and the language action for anonymous and
authenticated visitors. The browser suite adds real client navigation and
back/forward, keyboard focus, URL preservation, anonymous preference persistence
and error/retry states. Run the entire release procedure from the repository root
with `pnpm verify:i18n`; see the UI README for browser requirements.

New text must be added to all catalogs; adding a locale must update the explicit
catalog loader, selector and test matrices. Locale selection never replaces API
guards. Browser tests cover registration/login in en/pl/es, validation, API errors,
language changes, cookies, role redirects, logout and protected navigation.
The runtime browser suite tests background timer/resume renewal against a mock API.
Real API/browser tests use an isolated disposable PostgreSQL database.

The shared header offers logout even with expired credentials or an API outage.
POST logoutAction uses the refresh cookie, so it needs no valid access token or
app role. logoutAllAction delegates active-session authentication to the API's
JWT guard; it adds no ADMIN or read-own permission requirement. Both clear only
auth cookies and redirect to /logout?status=success, local or all-unconfirmed.
The full-screen result view matches the loading screen convention. Success stays
visible for 2 seconds before replacing the route with /login. Unconfirmed server
revocation shows a translated notice until the user clicks OK. LoginPage does not
display logout notices. A missing/unknown status redirects to /login.
The temporary SIMULATE_LOGOUT_FAILURE switch in actions.ts is enabled only in
development; set it to false to restore real API logout calls locally.
Locale persists through sign-out and language changes while the POST is pending.
GET links never run logout. Default Server Action Origin/Host protection stays on.
Back navigation and subsequent protected RSC requests are checked after logout.

Stage 5 additionally checks protected RSC with freshly issued cookies, private
no-store responses and Link navigation after sign-in. Both public auth forms
remain available with a session. The getSessionUser result retains 401/403;
the fetchSessionUser adapter returns null to guards for either, allowing recovery
when a refresh cookie exists.
503 and malformed session responses produce rendering errors without protected
content, raw backend text or an automatic refresh attempt.

The preparation-stage decisions for these forms (server/client boundary,
Server Actions, safe action results and translations) are recorded in
[AUTH.md](AUTH.md). Existing layout/page guards remain the access boundary;
future protected actions must also perform their own checks.
