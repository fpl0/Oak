// Endpoint security (contracts §11.1) and the CSP (§11.2). The same rules as the tutor's own
// middleware (server/src/tutor/http/security.ts), answered with Oak's error body:
//  1. Host allowlist on every /api request (DNS rebinding).
//  2. OPTIONS → 403; no CORS header is ever sent.
//  3. Origin allowlist on every non-GET (and on any request that carries an Origin).
//  4. `X-Oak: 1` on every /api request, except the three media GETs, which need `Sec-Fetch-Site: same-origin`.
//  5. /api/dev/* only with OAK_DEV=1 (404 otherwise, as if it did not exist).
import type { MiddlewareHandler } from "hono";
import { ApiError, errorResponse } from "./errors.ts";

export interface SecurityConfig {
  port: number;
  /** Extra ports allowed as Host and Origin (the Vite proxy in dev). */
  devPorts: readonly number[];
  dev: boolean;
}

export type DenyReason = "host" | "preflight" | "origin" | "fetch-site" | "x-oak";

export function allowedHosts(cfg: Pick<SecurityConfig, "port" | "devPorts">): string[] {
  return [cfg.port, ...cfg.devPorts].flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]);
}
export function allowedOrigins(cfg: Pick<SecurityConfig, "port" | "devPorts">): string[] {
  return allowedHosts(cfg).map((h) => `http://${h}`);
}

const MEDIA_GETS = [
  /^\/api\/audio\/[^/]+$/,
  /^\/api\/audio\/[^/]+\/peaks$/,
  /^\/api\/album\/tracks\/[^/]+\/versions\/[^/]+\/audio$/,
];
export function isMediaGet(method: string, path: string): boolean {
  return (method === "GET" || method === "HEAD") && MEDIA_GETS.some((re) => re.test(path));
}

/** The whole decision as a pure function of the request; `null` lets it through. */
export function checkApiRequest(req: Request, cfg: SecurityConfig): DenyReason | null {
  const h = req.headers;
  const host = (h.get("host") ?? "").toLowerCase();
  if (!allowedHosts(cfg).includes(host)) return "host";
  if (req.method === "OPTIONS") return "preflight";
  const safe = req.method === "GET" || req.method === "HEAD";
  const origin = h.get("origin");
  if (origin !== null) {
    if (!allowedOrigins(cfg).includes(origin)) return "origin";
  } else if (!safe) return "origin";
  const site = h.get("sec-fetch-site");
  const path = new URL(req.url).pathname;
  if (isMediaGet(req.method, path)) return site === "same-origin" ? null : "fetch-site";
  // Browsers that send Fetch Metadata say where a request came from; `none` (typed by the user) only for a GET.
  if (site !== null && site !== "same-origin" && !(site === "none" && safe)) return "fetch-site";
  if (h.get("x-oak") !== "1") return "x-oak";
  return null;
}

const isDevPath = (p: string): boolean => {
  const lower = p.toLowerCase();
  return lower === "/api/dev" || lower.startsWith("/api/dev/");
};
function decodedPath(p: string): string {
  try {
    return decodeURIComponent(p);
  } catch {
    return p;
  }
}

export function apiSecurity(
  cfg: SecurityConfig,
  onDeny?: (reason: DenyReason, req: Request) => void,
): MiddlewareHandler {
  return async (c, next) => {
    const path = new URL(c.req.url).pathname;
    const deny = checkApiRequest(c.req.raw, cfg);
    if (deny !== null) {
      onDeny?.(deny, c.req.raw);
      return errorResponse(new ApiError("forbidden", `request refused (${deny})`));
    }
    // The router matches on the DECODED path (`/api/%64ev/qa` reaches `/api/dev/qa`): check both forms.
    if (!cfg.dev && (isDevPath(path) || isDevPath(c.req.path) || isDevPath(decodedPath(path))))
      return errorResponse(new ApiError("not_found", "not found"));
    await next();
  };
}

/** Host check for everything outside /api (static files, sounds): DNS rebinding applies there too. */
export function hostOnly(cfg: SecurityConfig): MiddlewareHandler {
  return async (c, next) => {
    const host = (c.req.header("host") ?? "").toLowerCase();
    if (!allowedHosts(cfg).includes(host))
      return errorResponse(new ApiError("forbidden", "request refused (host)"));
    if (c.req.method === "OPTIONS")
      return errorResponse(new ApiError("forbidden", "request refused (preflight)"));
    await next();
  };
}

/** Contracts §11.2, sent on every HTML response. In dev, `connect-src` also allows Vite's websocket. */
export function contentSecurityPolicy(dev: boolean): string {
  const connect = dev ? "'self' ws://127.0.0.1:5173 ws://localhost:5173" : "'self'";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' data: blob:",
    "worker-src 'self' blob: data:",
    `connect-src ${connect}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Adds the CSP (and the usual hardening headers) to any HTML or SVG response. */
export function cspOnHtml(dev: boolean): MiddlewareHandler {
  const csp = contentSecurityPolicy(dev);
  return async (c, next) => {
    await next();
    const type = c.res.headers.get("content-type") ?? "";
    // SVG is a document too: opened on its own it runs its scripts with the page's origin.
    if (type.includes("text/html") || type.includes("image/svg+xml")) {
      // Copy first: a response built around a file or a fetch may carry immutable headers.
      c.res = new Response(c.res.body, c.res);
      c.res.headers.set("content-security-policy", csp);
      c.res.headers.set("x-content-type-options", "nosniff");
      c.res.headers.set("referrer-policy", "no-referrer");
      c.res.headers.set("x-frame-options", "DENY");
    }
  };
}
