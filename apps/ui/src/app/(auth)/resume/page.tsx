import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getAuthCookies } from "@/lib/auth-cookies";
import { resumeTarget } from "@/lib/session-resume";
import { SessionResume } from "@/components/auth/session-resume";

export default async function ResumePage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[]; mode?: string | string[] }>;
}) {
  if (!(await getAuthCookies()).refreshToken) redirect("/login");
  const t = await getTranslations();
  const params = await searchParams;
  return <SessionResume chooseHome={params.mode === "login"} target={resumeTarget(params.returnTo)} labels={{
    resuming: t("auth.session.resuming"),
    unavailable: t("auth.session.unavailable"),
    rateLimited: t("errors.rateLimited"),
    retry: t("common.actions.retry"),
  }} />;
}
