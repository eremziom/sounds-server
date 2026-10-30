import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { ClientMessages } from "@/i18n/client-messages";
import { redirect } from "next/navigation";
import { checkLoginSession } from "@/lib/login-session";
import { RESUMED_PARAM } from "@/lib/session-resume";
import { SessionCheckRetry } from "@/components/auth/session-check-retry";
import { AuthBackground } from "@/components/auth/auth-background";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.login");
  return { title: t("title"), description: t("description") };
}

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await checkLoginSession(RESUMED_PARAM in await searchParams);
  if (session.destination) redirect(session.destination);
  if (session.unavailable) {
    const t = await getTranslations();
    return <SessionCheckRetry message={t(session.rateLimited ? "errors.rateLimited" : "auth.session.unavailable")}
      retry={t("common.actions.retry")} />;
  }
  const t = await getTranslations("auth");
  return (
    <>
      <AuthBackground />
      <section className="relative z-10 space-y-4">
        <h1 className="text-3xl font-semibold">{t("login.title")}</h1>
        <ClientMessages namespaces={["auth", "validation", "errors"]}>
          <LoginForm />
        </ClientMessages>
        <p>
          {t("login.noAccount")}{" "}
          <Link href="/register" className="underline underline-offset-4">
            {t("register.action")}
          </Link>
        </p>
      </section>
    </>
  );
}
