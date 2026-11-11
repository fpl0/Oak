// Confirm nonces for destructive endpoints (contracts §11.6): single-use, 60 seconds, bound to the
// `(action, target)` pair, kept in memory only.
import { randomBytes } from "node:crypto";
import type { ConfirmAction, ConfirmNonce } from "@oak/api";

export const NONCE_TTL_MS = 60_000;
/**
 * Outstanding nonces kept at most. The UI asks for one per confirm dialog; a script hammering
 * `POST /api/confirm` evicts the oldest instead of growing the server's memory without bound.
 */
export const MAX_OUTSTANDING_NONCES = 256;

interface Entry {
  action: ConfirmAction;
  target: string;
  expiresAt: number;
}

export class ConfirmStore {
  readonly #nonces = new Map<string, Entry>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  issue(action: ConfirmAction, target: string): ConfirmNonce {
    this.#sweep();
    // A Map iterates in insertion order: the first key is the oldest nonce.
    while (this.#nonces.size >= MAX_OUTSTANDING_NONCES) {
      const oldest = this.#nonces.keys().next().value;
      if (oldest === undefined) break;
      this.#nonces.delete(oldest);
    }
    const nonce = randomBytes(24).toString("base64url");
    const expiresAt = this.now().getTime() + NONCE_TTL_MS;
    this.#nonces.set(nonce, { action, target, expiresAt });
    return { nonce, expiresAt: new Date(expiresAt).toISOString() };
  }

  /**
   * Consumes the nonce if it matches. A nonce is single-use: it is removed on any presentation, even a
   * mismatched one, so it cannot be probed.
   */
  consume(nonce: string | null | undefined, action: ConfirmAction, target: string): boolean {
    if (nonce === null || nonce === undefined || nonce === "") return false;
    const entry = this.#nonces.get(nonce);
    if (entry === undefined) return false;
    this.#nonces.delete(nonce);
    if (entry.expiresAt <= this.now().getTime()) return false;
    // Exact match: `*` is the target of the actions that apply to everything (reset, import), not a wildcard.
    return entry.action === action && entry.target === target;
  }

  #sweep(): void {
    const t = this.now().getTime();
    for (const [k, v] of this.#nonces) if (v.expiresAt <= t) this.#nonces.delete(k);
  }

  get size(): number {
    return this.#nonces.size;
  }
}
