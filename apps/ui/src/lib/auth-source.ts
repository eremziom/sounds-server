import "server-only";
import { headers } from "next/headers";

export async function authSource() {
  return (await headers()).get("x-sounds-client-source") ?? undefined;
}
