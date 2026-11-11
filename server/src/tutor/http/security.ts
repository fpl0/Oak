// Localhost hardening (contracts §11.1). The server holds the API key and the learner's data, and
// any web page the learner visits can send requests to 127.0.0.1, so "it only listens on
// loopback" is not enough.
//
//  1. Host allowlist   -> stops DNS rebinding: an attacker's domain that resolves to 127.0.0.1
//                         still sends its own Host.
//  2. No CORS, ever    -> every OPTIONS is refused, so cross-origin script can never send a custom
//                         header or a JSON body.
//  3. Origin allowlist -> every non-GET must carry an allowlisted Origin (browsers send Origin on
//                         every POST, same-origin included).
//  4. X-Oak: 1         -> a header a cross-origin "simple request" (form post, no-cors fetch)
//                         cannot set. Media GETs are exempt, because <audio src> cannot set
//                         headers; they must be `Sec-Fetch-Site: same-origin` instead.
//
// The tutor sub-app applies this to its own routes. The integrator applies the same middleware to
// the whole of /api: applying it twice is harmless.
import type { MiddlewareHandler } from "hono";

export interface SecurityOptions {
  /** Exact Host header values, with port: `127.0.0.1:8787`, `localhost:8787`. */
  allowedHosts: readonly string[];
  /** Exact Origin values: `http://127.0.0.1:8787`, `http://localhost:8787`. */
  allowedOrigins: readonly string[];
  /** Which requests are media GETs (rule 4). Default: the three routes of contracts §11.1. */
  isMediaGet?: (path: string) => boolean;
}

export type DenyReason = "host" | "preflight" | "origin" | "fetch-site" | "x-oak";

export const OAK_HEADER = "x-oak";
export const DEFAULT_PORT = 8787;
export const VITE_DEV_PORT = 5173;

/** The allowlist for a server on `port`. In dev, pass the Vite port too: its proxy keeps the Host. */
export function localSecurity(
  port: number = DEFAULT_PORT,
  extraPorts: readonly number[] = [],
): SecurityOptions {
  const ports = [port, ...extraPorts.filter((p) => p !== port)];
  return {
    allowedHosts: ports.flatMap((p) => [`127.0.0.1:${p}`, `localhost:${p}`]),
    allowedOrigins: ports.flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`]),
  };
}

const MEDIA_GETS = [
  /\/audio\/[^/]+$/,
  /\/audio\/[^/]+\/peaks$/,
  /\/album\/tracks\/[^/]+\/versions\/[^/]+\/audio$/,
];

export function isMediaGetPath(path: string): boolean {
  return MEDIA_GETS.some((re) => re.test(path));
}

/** The whole decision, as a pure function of the request. `null` lets it through. */
export function checkRequest(req: Request, opts: SecurityOptions): DenyReason | null {
  const h = req.headers;
  const host = (h.get("host") ?? "").toLowerCase();
  if (!opts.allowedHosts.includes(host)) return "host";
  if (req.method === "OPTIONS") return "preflight";

  const safe = req.method === "GET" || req.method === "HEAD";
  const origin = h.get("origin");
  if (origin !== null) {
    if (!opts.allowedOrigins.includes(origin)) return "origin";
  } else if (!safe) {
    return "origin";
  }

  const site = h.get("sec-fetch-site");
  const path = new URL(req.url).pathname;
  if (req.method === "GET" && (opts.isMediaGet ?? isMediaGetPath)(path)) {
    return site === "same-origin" ? null : "fetch-site";
  }
  // Browsers that send Fetch Metadata tell us where the request came from; believe them. `none`
  // is a navigation the user typed, which only a GET can be.
  if (site !== null && site !== "same-origin" && !(site === "none" && safe)) return "fetch-site";
  if (h.get(OAK_HEADER) !== "1") return "x-oak";
  return null;
}

/** Hono middleware for `checkRequest`. A refused request gets a 403 and no CORS header. */
export function oakSecurity(
  opts: SecurityOptions,
  onDeny?: (reason: DenyReason, req: Request) => void,
): MiddlewareHandler {
  return async (c, next) => {
    const deny = checkRequest(c.req.raw, opts);
    if (deny !== null) {
      onDeny?.(deny, c.req.raw);
      return c.json({ error: "forbidden", reason: deny }, 403);
    }
    await next();
  };
}

/**
 * For endpoints a local process calls, not a browser (the CLI backend's MCP endpoint): only the
 * Host rule applies, and a request that names an Origin is refused outright, since no browser
 * page has any business there. Such an endpoint must authenticate its caller itself.
 */
export function hostOnly(opts: Pick<SecurityOptions, "allowedHosts">): MiddlewareHandler {
  return async (c, next) => {
    const h = c.req.raw.headers;
    if (!opts.allowedHosts.includes((h.get("host") ?? "").toLowerCase()))
      return c.json({ error: "forbidden", reason: "host" }, 403);
    if (c.req.method === "OPTIONS") return c.json({ error: "forbidden", reason: "preflight" }, 403);
    if (h.get("origin") !== null) return c.json({ error: "forbidden", reason: "origin" }, 403);
    await next();
  };
}
