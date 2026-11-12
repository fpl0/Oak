// Idempotency keys for writes that must count once (Wave 3, docs/design/wave3.md §5.2): `steps.attempt` and
// `srs.review`. Make one key per learner action (one Check, one finished set) and reuse it on a retry of that
// same action; the server answers a repeat with the stored response.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** A fresh key: `crypto.randomUUID()` where available, else 22 random URL-safe characters. */
export function idempotencyKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(22);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}
