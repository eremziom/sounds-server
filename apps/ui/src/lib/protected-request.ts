import type { ApplicationSession } from "./application-session.ts";

export type ProtectedRequestResult<T> =
  | { executed: false }
  | { executed: true; value: T };

// Check before dispatch, never retry afterwards: a failed mutation may already
// have taken effect. HTTP responses (including 401/403) belong to the caller.
export function createProtectedRequest(
  session: ApplicationSession,
  ensureFresh: () => Promise<boolean>,
) {
  return async function runProtected<T>(request: () => Promise<T> | T): Promise<ProtectedRequestResult<T>> {
    if (session.getSnapshot() === "ended" || session.getSnapshot() === "unavailable") return { executed: false };
    if (!await ensureFresh() || session.getSnapshot() === "ended") {
      return { executed: false };
    }
    return { executed: true, value: await request() };
  };
}
