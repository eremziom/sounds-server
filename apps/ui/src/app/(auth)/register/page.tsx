import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthBackground } from "@/components/auth/auth-background";
import { RegisterForm } from "@/components/auth/register-form";
import { ClientMessages } from "@/i18n/client-messages";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.register");
  return { title: t("title"), description: t("description") };
}

export default async function RegisterPage() {
  const t = await getTranslations("auth");
  return (
    <>
      <AuthBackground />
      <section className="relative z-10 space-y-4">
        <h1 className="text-3xl font-semibold">{t("register.title")}</h1>
        <ClientMessages namespaces={["auth", "validation", "errors"]}>
          <RegisterForm />
        </ClientMessages>
        <p>
          {t("register.hasAccount")}{" "}
          <Link href="/login" className="underline underline-offset-4">
            {t("login.action")}
          </Link>
        </p>
      </section>
    </>
  );
}
