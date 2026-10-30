import "server-only";
import { getTranslations } from "next-intl/server";
import { getAuthCookies } from "../../lib/auth-cookies";
import { LogoutControls } from "./logout-controls";

export async function AuthControls() {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (!accessToken && !refreshToken) return null;

  // Presence is enough to offer sign-out even for expired/invalid sessions.
  // The action and API authorize the operation; no session/token crosses to UI.
  const t = await getTranslations("auth");
  // All-device sign-out is temporarily hidden in the UI.
  return <LogoutControls action={t("logout.action")} pending={t("logout.pending")}
    all={t("logoutAll.action")} canLogoutAll={false} />;
}
