# Route access

`(auth)` routes (`/login`, `/register`) are public, including for signed-in users.
`(app)` requires a `USER` or `ARTIST` role; `(admin)/admin` requires `ADMIN`.
Roles are additive: `ADMIN` alone does not grant access to `(app)`.
Missing/invalid sessions redirect to `/login`; insufficient roles redirect to
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
The local active/refreshing/ended controller is groundwork only: no background
refresh POST, timer or cross-tab/server coordination is wired yet. Access expiry
still redirects to login. The future renewal adapter must use a shared server
coordinator, write cookies and handle session termination; the UI controller
alone never authorizes requests or changes cookies.

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
automatic refresh remains pending.

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
Automatic refresh remains pending; without a valid access cookie protected pages
redirect to login.

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
Automatic refresh remains pending. Real API/browser tests use an isolated disposable PostgreSQL database.

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
the fetchSessionUser adapter continues to redirect guards to login for either.
503 and malformed session responses produce rendering errors without protected
content, raw backend text or an automatic refresh attempt.

The preparation-stage decisions for these forms (server/client boundary,
Server Actions, safe action results and translations) are recorded in
[AUTH.md](AUTH.md). Existing layout/page guards remain the access boundary;
future protected actions must also perform their own checks.
