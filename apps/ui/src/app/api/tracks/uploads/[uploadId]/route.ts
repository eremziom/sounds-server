import { getAuthCookies } from "@/lib/auth-cookies";
import { proxyTrack } from "@/api/track-proxy";

export async function DELETE(request: Request, context: { params: Promise<{ uploadId: string }> }) {
  return proxyTrack(request, "cancel", (await context.params).uploadId, await getAuthCookies());
}
