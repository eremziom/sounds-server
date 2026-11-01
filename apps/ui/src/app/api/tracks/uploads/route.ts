import { getAuthCookies } from "@/lib/auth-cookies";
import { proxyTrack } from "@/api/track-proxy";

export async function POST(request: Request) {
  return proxyTrack(request, "upload", undefined, await getAuthCookies());
}
