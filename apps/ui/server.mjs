import { createServer } from "node:http";
import { clientAddress, signSource } from "./server-source.mjs";

const dev = process.argv.includes("--dev");
process.env.NODE_ENV = dev ? "development" : "production";
const option = (name, fallback) => process.argv[process.argv.indexOf(name) + 1] || fallback;
const port = Number(process.argv.includes("--port") ? option("--port") : process.env.PORT || 3001);
const hostname = process.argv.includes("--hostname") ? option("--hostname") : "0.0.0.0";
const { default: next } = await import("next");

let handle;
let secret;
let trustedProxies;
const server = createServer((request, response) => {
  delete request.headers["x-sounds-client-source"];
  const address = clientAddress(request, trustedProxies);
  if (address) request.headers["x-sounds-client-source"] = signSource(address, secret);
  void handle(request, response).catch(() => {
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});
const app = next({ dev, hostname, port, httpServer: server });
await app.prepare();
// prepare() loads Next's .env files. This is a server-only shared signing key,
// separate from JWT_SECRET, and is never sent to the browser.
secret = process.env.AUTH_PROXY_SECRET;
if (!secret || secret.length < 32 || secret.startsWith("<")) throw new Error("Configure AUTH_PROXY_SECRET (at least 32 random characters) in API and UI environments");
trustedProxies = (process.env.UI_TRUSTED_PROXIES ?? "").split(",").map((ip) => ip.trim()).filter(Boolean);
handle = app.getRequestHandler();
server.listen(port, hostname, () => console.log(`UI ready on port ${port}`));
