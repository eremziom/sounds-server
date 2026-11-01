import "server-only";
import { getTranslations } from "next-intl/server";
import { getAuthCookies } from "../../lib/auth-cookies";
import { LogoutControls } from "./logout-controls";
import { HeaderMenu } from "../header-menu";
import { getCurrentUser } from "../../lib/auth";

export async function AuthControls() {
  const { accessToken, refreshToken } = await getAuthCookies();
  if (!accessToken && !refreshToken) return null;

  // Presence is enough to offer sign-out even for expired/invalid sessions.
  // The action and API authorize the operation; no session/token crosses to UI.
  const t = await getTranslations("auth");
  // Keep sign-out available when session discovery fails or credentials expire.
  const user = await getCurrentUser().catch(() => null);
  // All-device sign-out is temporarily hidden in the UI.
  return <>
    {user?.username && <HeaderMenu username={user.username}
      menuLabels={{ profile: t("menu.profile"), settings: t("menu.settings"), workshop: t("menu.workshop") }}
      logoutLabel={t("logout.action")} logoutPendingLabel={t("logout.pending")} />}
    <LogoutControls action={t("logout.action")} pending={t("logout.pending")}
      all={t("logoutAll.action")} canLogoutAll={false} />
  </>;
}
