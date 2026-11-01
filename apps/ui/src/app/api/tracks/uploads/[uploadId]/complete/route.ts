import { getAuthCookies } from "@/lib/auth-cookies";
import { proxyTrack } from "@/api/track-proxy";

export async function POST(request: Request, context: { params: Promise<{ uploadId: string }> }) {
  return proxyTrack(request, "complete", (await context.params).uploadId, await getAuthCookies());
}
