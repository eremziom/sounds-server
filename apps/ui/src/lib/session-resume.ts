// Only existing protected destinations are accepted. Never allow an auth page
// (including the recovery page itself) to become the recovery destination.
export const RESUMED_PARAM = "__session_resumed";

export function resumeTarget(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") ||
      value.startsWith("//") || /[\\\x00-\x20\x7f]/.test(value)) return "/";
  const url = new URL(value, "https://local.invalid");
  if (url.origin !== "https://local.invalid" || !["/", "/admin"].includes(url.pathname)) return "/";
  url.searchParams.delete(RESUMED_PARAM);
  url.searchParams.delete("_rsc");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resumedTarget(value: unknown): string {
  const url = new URL(resumeTarget(value), "https://local.invalid");
  url.searchParams.set(RESUMED_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
}
