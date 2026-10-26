This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Translations (stages 2–6)

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
language. Login and registration are still translated placeholders; their real
forms belong to `docs/ui-auth-plan.md` and must use the existing auth/validation
catalog keys when implemented.

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
share `AUTH_INVALID_CREDENTIALS` and one message. Real auth forms are still pending;
use this mapper when implementing them. Existing page-level unexpected errors
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

## Next.js resources

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
