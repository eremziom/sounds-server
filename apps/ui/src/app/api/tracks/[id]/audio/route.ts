import { getAuthCookies } from "@/lib/auth-cookies";
import { proxyTrack } from "@/api/track-proxy";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return proxyTrack(request, "audio", (await context.params).id, await getAuthCookies());
}
export const HEAD = GET;
