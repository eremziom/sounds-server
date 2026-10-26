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

## Translations (stage 2)

The UI uses `next-intl` 4.14.9 with shared URLs for English (`en`), Polish (`pl`)
and Spanish (`es`). Catalogs live in `messages/{en,pl,es}.json`; English defines
the key structure. Use nested semantic keys such as `auth.login.title`.

Run from the repository root:

```bash
pnpm --filter ui check:messages
pnpm --filter ui test
pnpm --filter ui exec tsc --noEmit
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

This stage prepares the catalogs and plugin. The request configuration currently
uses English; cookie/header detection, the language switcher and translating
existing pages are subsequent stages. Existing routes and rendering settings
remain in place. No language prefixes or rewrites are configured.

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
