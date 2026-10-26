import "server-only";
import { cookies, headers } from "next/headers";
import { localeCookie } from "./config";
import { resolveLocale } from "./resolve-locale";

// Call from Server Components, metadata or actions. No shared preference cache.
export async function getRequestLocale() {
  const cookieValue = (await cookies()).get(localeCookie)?.value;
  return resolveLocale(cookieValue, (await headers()).get("accept-language"));
}
