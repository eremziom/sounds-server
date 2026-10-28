import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { LogoutResult } from "@/components/auth/logout-result";

export default async function LogoutPage({ searchParams }: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { status } = await searchParams;
  if (status !== "success" && status !== "local" && status !== "all-unconfirmed") {
    redirect("/login");
  }

  const t = await getTranslations("auth");
  const success = status === "success";
  const message = success ? t("logout.success")
    : status === "local" ? t("logout.localOnly") : t("logoutAll.localOnly");

  return <LogoutResult success={success} message={message} okLabel={t("logout.ok")} />;
}
