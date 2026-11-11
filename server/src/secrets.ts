// The Anthropic API key (contracts §11.5): `ANTHROPIC_API_KEY` from `.env.local` (or the environment at
// start-up), or a key pasted in the app, stored at `<data>/secrets/anthropic.key` (dir 0700, file 0600).
// The key lives only in this process: never in a response, the database, a backup or a log line, and
// `process.env.ANTHROPIC_API_KEY` is deleted before any worker or child process is started.
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type KeySource = "env" | "pasted" | "none";

/** Checks a key with one minimal call; tests pass their own. Never logs the key. */
export type KeyValidator = (key: string) => Promise<"ready" | "invalid_key" | "unreachable">;

/** `GET /v1/models` costs no tokens: a 200 is a working key, 401/403 a bad one, anything else unreachable. */
export const anthropicKeyValidator: KeyValidator = async (key) => {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return "ready";
    if (res.status === 401 || res.status === 403) return "invalid_key";
    return "unreachable";
  } catch {
    return "unreachable";
  }
};

/** Anything shaped like an Anthropic API key. */
const KEY_SHAPE = /sk-ant-[A-Za-z0-9_-]{8,}/g;

/** `text` with the known key and every key-shaped token replaced by `[redacted]`. */
export function redactSecrets(text: string, known: string | null): string {
  let out = text;
  if (known !== null && known.length >= 8) out = out.split(known).join("[redacted]");
  return out.replace(KEY_SHAPE, "[redacted]");
}

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m === null) continue;
    let value = (m[2] ?? "").trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    out[m[1] as string] = value;
  }
  return out;
}

export class Secrets {
  #envKey: string | null;
  readonly #file: string;

  /**
   * Reads the key from `env` (and `.env.local` under `rootDir`) once, then deletes it from `env`, so
   * nothing spawned later inherits it.
   */
  constructor(
    readonly secretsDir: string,
    opts: { env?: Record<string, string | undefined>; rootDir?: string } = {},
  ) {
    this.#file = join(secretsDir, "anthropic.key");
    const env = opts.env ?? process.env;
    let key = env.ANTHROPIC_API_KEY?.trim() || null;
    if (key === null && opts.rootDir !== undefined) {
      const local = join(opts.rootDir, ".env.local");
      if (existsSync(local))
        key = parseEnvFile(readFileSync(local, "utf8")).ANTHROPIC_API_KEY?.trim() || null;
    }
    this.#envKey = key;
    delete env.ANTHROPIC_API_KEY;
  }

  /** The key now: a pasted key wins over the environment, so the learner can replace it without a restart. */
  anthropicKey(): string | null {
    return this.#pasted() ?? this.#envKey;
  }

  source(): KeySource {
    if (this.#pasted() !== null) return "pasted";
    return this.#envKey !== null ? "env" : "none";
  }

  #pasted(): string | null {
    try {
      const key = readFileSync(this.#file, "utf8").trim();
      return key === "" ? null : key;
    } catch {
      return null;
    }
  }

  savePasted(key: string): void {
    mkdirSync(this.secretsDir, { recursive: true, mode: 0o700 });
    chmodSync(this.secretsDir, 0o700);
    writeFileSync(this.#file, `${key.trim()}\n`, { mode: 0o600 });
    chmodSync(this.#file, 0o600);
  }

  /** Removes the pasted key. An environment key stays (it is not Oak's to delete). */
  deletePasted(): void {
    rmSync(this.#file, { force: true });
  }
}
