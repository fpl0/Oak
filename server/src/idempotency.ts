// Idempotent writes (docs/design/wave3.md §5.2). `steps.attempt` and `srs.review` carry an optional
// `idempotencyKey` (one per learner action, reused on a retry of that action). The first response is stored
// under (endpoint, key); a repeat with the same body gets that response back and counts nothing again (no
// attempt, evidence, rating, streak day or sung note); the same key with a different body is a 409 conflict.
// Two requests with one key at the same moment (two tabs, a double click) are serialised: the second waits for
// the first and answers its stored response. A request without a key behaves as in Wave 2.
import { createHash } from "node:crypto";
import type { Db } from "./db/index.ts";
import type { Repos } from "./db/repos/index.ts";
import { conflict } from "./errors.ts";

/** Keys are kept at least 24 hours: rows older than this are pruned when a new key is stored. */
export const IDEMPOTENCY_KEEP_MS = 48 * 3_600_000;

/** JSON with object keys sorted at every level, so equal bodies hash equally whatever their key order. */
export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
    .join(",")}}`;
}

export function bodyHash(scope: unknown): string {
  return createHash("sha256").update(stableJson(scope)).digest("hex");
}

const inflight = new WeakMap<Db, Map<string, Promise<unknown>>>();

/**
 * Runs `write` once per (endpoint, key). `scope` is what makes two requests "the same": the route params and
 * the body without its key.
 */
export async function idempotent<T>(
  d: { repos: Repos; clock: { now(): Date } },
  endpoint: string,
  key: string | undefined,
  scope: unknown,
  write: () => T | Promise<T>,
): Promise<T> {
  if (key === undefined) return write();
  const hash = bodyHash(scope);
  let running = inflight.get(d.repos.db);
  if (running === undefined) {
    running = new Map();
    inflight.set(d.repos.db, running);
  }
  const slot = `${endpoint}\u0000${key}`;
  for (;;) {
    const pending = running.get(slot);
    if (pending === undefined) break;
    await pending.catch(() => {});
  }
  const stored = d.repos.idempotency.get(endpoint, key);
  if (stored !== null) {
    if (stored.bodyHash !== hash)
      throw conflict("this idempotency key was already used for a different request");
    return stored.response as T;
  }
  const run = (async () => write())();
  running.set(slot, run);
  try {
    const result = await run;
    const now = d.clock.now();
    d.repos.idempotency.put(endpoint, key, hash, result, now.toISOString());
    d.repos.idempotency.prune(new Date(now.getTime() - IDEMPOTENCY_KEEP_MS).toISOString());
    return result;
  } finally {
    running.delete(slot);
  }
}
