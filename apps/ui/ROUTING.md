# Route access

`(auth)` routes (`/login`, `/register`) are public, including for signed-in users.
`(app)` requires a `USER` or `ARTIST` role; `(admin)/admin` requires `ADMIN`.
Roles are additive: `ADMIN` alone does not grant access to `(app)`.
Missing/invalid sessions redirect to `/login`; insufficient roles redirect to
the public `/access-denied` page.

The server reads the `accessToken` cookie and validates it with `GET /auth/me`
in the NestJS API on each server render. Roles come from the API, never from
unverified JWT claims. Requests are not stored in the shared data cache.
API outages fail closed with an error instead of granting access.

`src/lib/route-access.ts` contains shared role types, constants and role checks
that can be imported by client components. `src/lib/session-api.ts` contains
`fetchSessionUser` and response validation; it is marked `server-only` to prevent
API session checks from being imported into client components. `src/lib/auth.ts`
connects these server-side checks to cookies and redirects.

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
