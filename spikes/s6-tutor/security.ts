// Localhost hardening for every /api route. The server holds the API key, and any web page the
// learner visits can POST to 127.0.0.1, so "it only listens on loopback" is not enough.
//
//  1. Host allowlist   -> defeats DNS rebinding (attacker domain resolving to 127.0.0.1 sends its own Host).
//  2. No CORS at all   -> preflights are refused, so cross-origin JS can never send custom headers / JSON.
//  3. Origin allowlist -> unsafe methods MUST carry an allowlisted Origin (browsers always send Origin
//                         on POST, including same-origin); GETs may omit it but then Sec-Fetch-Site,
//                         when present, must be same-origin/none.
//  4. X-Oak: 1         -> a custom header a cross-origin "simple request" (form post, no-cors fetch) cannot set.
//  5. JSON only        -> unsafe methods must be application/json (form-encodable types are refused).
import type { MiddlewareHandler } from 'hono';

export interface SecurityOpts {
  /** Exact Host header values, with port: ["127.0.0.1:8787", "localhost:8787"]. */
  allowedHosts: readonly string[];
  /** Exact Origin values: ["http://127.0.0.1:8787", "http://localhost:8787"] (+ the Vite origin in dev). */
  allowedOrigins: readonly string[];
}

export type DenyReason = 'host' | 'preflight' | 'origin' | 'fetch-site' | 'x-oak' | 'content-type';

export function localOrigins(port: number): SecurityOpts {
  return {
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`],
    allowedOrigins: [`http://127.0.0.1:${port}`, `http://localhost:${port}`],
  };
}

export function check(req: Request, opts: SecurityOpts): DenyReason | null {
  const h = req.headers;
  const host = (h.get('host') ?? '').toLowerCase();
  if (!opts.allowedHosts.includes(host)) return 'host';
  if (req.method === 'OPTIONS') return 'preflight';

  const origin = h.get('origin');
  const unsafe = req.method !== 'GET' && req.method !== 'HEAD';
  if (origin !== null) {
    if (!opts.allowedOrigins.includes(origin)) return 'origin';
  } else if (unsafe) {
    return 'origin';
  }
  const site = h.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin' && !(site === 'none' && !unsafe)) return 'fetch-site';

  if (h.get('x-oak') !== '1') return 'x-oak';

  if (unsafe) {
    const ct = (h.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
    if (ct !== 'application/json') return 'content-type';
  }
  return null;
}

export function security(opts: SecurityOpts): MiddlewareHandler {
  return async (c, next) => {
    const deny = check(c.req.raw, opts);
    if (deny) {
      // No Access-Control-* headers are ever emitted, so a cross-origin page cannot even read this body.
      return c.json({ error: 'forbidden', reason: deny }, 403);
    }
    await next();
  };
}
