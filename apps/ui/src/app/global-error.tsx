"use client";

import { defaultLocale } from "@/i18n/config";
import emergency from "../../messages/emergency.en.json";
import "./globals.css";

// The root layout/provider may have failed: no request APIs or i18n context here.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang={defaultLocale} className="dark">
      <body>
        <title>{emergency.title}</title>
        <main className="space-y-4 p-6" role="alert">
          <h1 className="text-3xl font-semibold">{emergency.title}</h1>
          <p>{emergency.description}</p>
          <button type="button" onClick={retry} className="rounded-md border px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {emergency.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
