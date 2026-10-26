# Route access

`(auth)` routes (`/login`, `/register`) are public, including for signed-in users.
`(app)` requires a `USER` or `ARTIST` role; `(admin)/admin` requires `ADMIN`.
Roles are additive: `ADMIN` alone does not grant access to `(app)`.
Missing/invalid sessions redirect to `/login`; insufficient roles redirect to
the public `/access-denied` page.

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

`src/lib/route-access.ts` contains shared role types, constants and role checks
that can be imported by client components. `src/api/auth.ts` contains
`fetchSessionUser` and response validation; it is marked `server-only` to prevent
API session checks from being imported into client components. `src/lib/auth.ts`
connects these server-side checks to cookies and redirects. Endpoint calls are
organized under `src/api/`; cookies/session policy remain in `src/lib/`.

Set `API_URL` in `apps/ui/.env.local` if the API is not at
`http://localhost:3000` (see `.env.example`). When implementing login/register,
set the returned `accessToken` from a Server Action or Route Handler in an
`HttpOnly` cookie with `SameSite=Lax`, `Path=/`, `Secure` in production and an
expiry matching `accessTokenExpiresAt`. Authentication forms and automatic
token refresh are not implemented yet; without this cookie protected pages
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
guards. UI auth forms and their real login/logout/refresh flows remain pending.

The preparation-stage decisions for these forms (server/client boundary,
Server Actions, safe action results and translations) are recorded in
[AUTH.md](AUTH.md). Existing layout/page guards remain the access boundary;
future protected actions must also perform their own checks.
