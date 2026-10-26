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

## Translations (stages 2–4)

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
The root layout sets `html lang` and provides the same locale/time zone to
client components without sending catalogs globally. Use `ClientMessages`
with explicit namespaces wherever a client needs messages.

Login, access-denied and default metadata use the selected language. Other page
texts will be connected in stage 5. No language prefixes, URL parameters or
rewrites are configured. Cache Components is disabled and partial prefetching
removed so the initial HTML uses the request language.

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
