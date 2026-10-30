import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";
import { ClientMessages } from "@/i18n/client-messages";
import { redirect } from "next/navigation";
import { checkLoginSession } from "@/lib/login-session";
import { RESUMED_PARAM } from "@/lib/session-resume";
import { SessionCheckRetry } from "@/components/auth/session-check-retry";
import Hyperspeed from "@/components/ui/hyperspeed";

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
  const navigation = await getTranslations("common.navigation");
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-0">
        <Hyperspeed
          curve="racing"
          curvature={1}
          speed={1}
          boost={2.5}
          fov={53}
          boostFov={131}
          lanes={4}
          roadWidth={10}
          medianWidth={2}
          density={40}
          trailLength={1.3}
          lightSize={1}
          poles={6}
          dust={100}
          glow={0.45}
          reflections={0.5}
          roadOpacity={0.1}
          steer={0.25}
          tailColors={["#d856bf", "#6750a2", "#c247ac"]}
          headColors={["#03b3c3", "#0e5ea5", "#324555"]}
          poleColors={["#03b3c3"]}
          interactive
        />
      </div>
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
        <Link href="/" className="inline-block underline underline-offset-4">
          {navigation("backHome")}
        </Link>
      </section>
    </>
  );
}
