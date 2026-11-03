// @ts-check
import { request as httpRequest } from "node:http";
import { defineConfig } from "astro/config";

const API_TARGET = "http://127.0.0.1:8000";

/**
 * Dev-only proxy: /api/* → Flask on :8000 (CloudFront does this in production).
 * Vite's `server.proxy` is not enough here: Astro's dev trailing-slash middleware runs first and
 * answers 404 for `/api/me` (no trailing slash) under `trailingSlash: "always"`. This middleware
 * is moved to the front of the stack after Astro installs its own.
 * @returns {import("vite").Plugin}
 */
function apiProxy() {
  const target = new URL(API_TARGET);
  return {
    name: "oci-dev-api-proxy",
    apply: "serve",
    configureServer(server) {
      return () => {
        server.middlewares.stack.unshift({
          route: "",
          /** @type {import("vite").Connect.NextHandleFunction} */
          handle(req, res, next) {
            if (!req.url || !req.url.startsWith("/api/")) return next();
            const upstream = httpRequest(
              { hostname: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, host: target.host } },
              (/** @type {import("node:http").IncomingMessage} */ up) => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); },
            );
            upstream.on("error", () => { res.writeHead(502, { "Content-Type": "application/json" }); res.end('{"error":"API not reachable on :8000"}'); });
            req.pipe(upstream);
          },
        });
      };
    },
  };
}

// Static site served from S3/CloudFront; the Flask JSON API lives under /api on the same domain.
export default defineConfig({
  output: "static",
  trailingSlash: "always",
  build: { format: "directory" },
  devToolbar: { enabled: false },
  vite: {
    plugins: [apiProxy()],
  },
});
