import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const normalize = (ip) => ip.replace(/^::ffff:/, "");

export function clientAddress(request, trustedProxies = []) {
  let peer = normalize(request.socket.remoteAddress ?? "");
  const forwarded = request.headers["x-forwarded-for"];
  const chain = typeof forwarded === "string" ? forwarded.split(",").map((ip) => normalize(ip.trim())) : [];
  // Trust only explicitly configured proxy peers, walking the chain from right
  // to left. Direct clients cannot select a source by forging forwarding headers.
  while (trustedProxies.includes(peer) && chain.length) peer = chain.pop();
  return isIP(peer) ? peer : null;
}

export function signSource(address, secret, now = Date.now()) {
  const payload = `${now}.${Buffer.from(address).toString("base64url")}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
