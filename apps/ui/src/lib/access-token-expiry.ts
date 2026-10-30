import "server-only";

// Scheduling metadata only. The API still verifies the signature and authorizes
// every request; decoding this claim never establishes an authenticated session.
export function readAccessTokenExpiry(token: string | undefined): number | null {
  try {
    const parts = token?.split(".");
    if (parts?.length !== 3) return null;
    const payload: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || !("exp" in payload)) return null;
    const expiry = payload.exp;
    return typeof expiry === "number" && Number.isSafeInteger(expiry) && expiry > 0 &&
      Number.isSafeInteger(expiry * 1000) ? expiry * 1000 : null;
  } catch {
    return null;
  }
}
