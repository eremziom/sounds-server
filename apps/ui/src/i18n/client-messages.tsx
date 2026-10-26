import "server-only";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type Messages from "../../messages/en.json";
import { timeZone } from "./config";
import { loadMessages } from "./messages";
import { pickNamespaces } from "./catalog";
import { formats } from "./formats";

// Callers must explicitly select what crosses the server/client boundary.
export async function ClientMessages({
  namespaces,
  children,
}: {
  namespaces: readonly (keyof typeof Messages)[];
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = pickNamespaces(await loadMessages(locale), namespaces);
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} formats={formats} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
