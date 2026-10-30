import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { timeZone } from "@/i18n/config";
import { formats } from "@/i18n/formats";
import { LanguageSwitcher } from "@/components/language-switcher";
import { AuthControls } from "@/components/auth/auth-controls";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.default");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const language = await getTranslations("common.language");
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} timeZone={timeZone} formats={formats} messages={{
          errors: { page: messages.errors.page },
          common: { actions: messages.common.actions },
          auth: { session: messages.auth.session },
        }}>
          <SiteHeader>
            <div id="application-navigation" className="mr-auto" />
            <LanguageSwitcher label={language("label")} changeFailed={language("changeFailed")} />
            <AuthControls />
          </SiteHeader>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
