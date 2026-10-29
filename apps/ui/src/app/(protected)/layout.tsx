import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ApplicationRuntime } from "@/components/application/application-runtime";
import Loading from "@/app/loading";
import { getAuthCookies } from "@/lib/auth-cookies";
import { readAccessTokenExpiry } from "@/lib/access-token-expiry";
import { getTranslations } from "next-intl/server";

async function AuthenticatedRuntime({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Changing accounts intentionally resets media. Navigation, locale changes and
  // replacement of token cookies for the same account must preserve the runtime.
  // Section/page guards still perform their own current role checks.
  const { accessToken } = await getAuthCookies();
  const t = await getTranslations("auth.session");
  const navigation = await getTranslations("common.navigation");
  return (
    <ApplicationRuntime
      key={user.id}
      accessTokenExpiresAt={readAccessTokenExpiry(accessToken)}
      footerLabels={{ expiresIn: t("expiresIn"), refreshing: t("resuming"), ended: t("expired") }}
      adminLabel={navigation("admin")}
    >
      {children}
    </ApplicationRuntime>
  );
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthenticatedRuntime>{children}</AuthenticatedRuntime>
    </Suspense>
  );
}
