import { getAuthCookies } from "@/lib/auth-cookies";
import { proxyArtwork } from "@/api/artwork-proxy";

export async function GET(request: Request, context: { params: Promise<{ projectId: string; file: string }> }) {
  const { projectId, file } = await context.params;
  const match = /^([a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\.png$/i.exec(file);
  if (!match) return new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const response = await proxyArtwork(request, ["projects", projectId, "artifacts", match[1], "file"], await getAuthCookies());
  if (response.ok && response.headers.get("content-type") !== "image/png")
    return new Response(null, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  return response;
}
