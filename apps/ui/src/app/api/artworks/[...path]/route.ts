import { getAuthCookies } from "@/lib/auth-cookies";
import { proxyArtwork } from "@/api/artwork-proxy";

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxyArtwork(request, path, await getAuthCookies());
}
export const GET = handle;
export const POST = handle;
