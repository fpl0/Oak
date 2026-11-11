// Is there a usable `claude` on this machine? Two cheap commands: `claude --version` (installed)
// and `claude auth status` (prints JSON with `loggedIn`). The answer is cached for a minute,
// because backend selection asks on every turn and on every health check, and it never throws:
// "no CLI" is an ordinary state of the app, not an error.
import { UNAVAILABLE } from "../../types.ts";
import { bunSpawn, type SpawnFn } from "./process.ts";

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
  /** The process could not be started (no such binary). */
  missing: boolean;
}

export type ExecFn = (
  argv: string[],
  opts: { cwd: string; env: Record<string, string>; timeoutMs: number },
) => Promise<ExecResult>;

const MAX_STDOUT = 65_536;

/** Run a short command to completion. Built on the same spawn seam as the turns, so tests share one fake. */
export function execWith(spawn: SpawnFn = bunSpawn): ExecFn {
  return async (argv, opts) => {
    let proc: ReturnType<SpawnFn>;
    try {
      proc = spawn(argv, { cwd: opts.cwd, env: opts.env, stdin: "" });
    } catch {
      return { exitCode: null, stdout: "", timedOut: false, missing: true };
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill(9);
      } catch {
        // Already gone.
      }
    }, opts.timeoutMs);
    try {
      const [stdout, , exitCode] = await Promise.all([
        new Response(proc.stdout).text().catch(() => ""),
        new Response(proc.stderr).text().catch(() => ""),
        proc.exited,
      ]);
      return { exitCode, stdout: stdout.slice(0, MAX_STDOUT), timedOut, missing: false };
    } finally {
      clearTimeout(timer);
    }
  };
}

export interface CliStatus {
  ok: boolean;
  /** One of the `UNAVAILABLE` codes when not ok. */
  reason?: string;
  version: string | null;
  /** `authMethod` as the CLI reports it (`claude.ai` for a subscription login). For Settings only. */
  authMethod: string | null;
}

export interface DetectorDeps {
  claudePath: string;
  /** Resolved lazily: the directory may not exist before the first check. */
  cwd: () => Promise<string>;
  env: () => Record<string, string>;
  exec?: ExecFn;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}

export interface Detector {
  status(): Promise<CliStatus>;
  available(): Promise<{ ok: boolean; reason?: string }>;
  /** Forget the cached answer (after the learner logs in, or a turn fails with `auth`). */
  reset(): void;
}

export const DETECT_TIMEOUT_MS = 4_000;
export const DETECT_CACHE_MS = 60_000;

function parseAuth(stdout: string): { loggedIn: boolean; authMethod: string | null } | null {
  // Tolerate a banner line before the JSON: take the outermost braces.
  const from = stdout.indexOf("{");
  const to = stdout.lastIndexOf("}");
  if (from < 0 || to <= from) return null;
  try {
    const v = JSON.parse(stdout.slice(from, to + 1)) as { loggedIn?: unknown; authMethod?: unknown };
    return {
      loggedIn: v.loggedIn === true,
      authMethod: typeof v.authMethod === "string" ? v.authMethod : null,
    };
  } catch {
    return null;
  }
}

export function createDetector(deps: DetectorDeps): Detector {
  const exec = deps.exec ?? execWith();
  const timeoutMs = deps.timeoutMs ?? DETECT_TIMEOUT_MS;
  const cacheMs = deps.cacheMs ?? DETECT_CACHE_MS;
  const now = deps.now ?? Date.now;
  let cached: { at: number; value: Promise<CliStatus> } | null = null;

  async function probe(): Promise<CliStatus> {
    const off = (reason: string, version: string | null = null): CliStatus => ({
      ok: false,
      reason,
      version,
      authMethod: null,
    });
    try {
      const opts = { cwd: await deps.cwd(), env: deps.env(), timeoutMs };
      const ver = await exec([deps.claudePath, "--version"], opts);
      if (ver.missing) return off(UNAVAILABLE.notInstalled);
      if (ver.timedOut) return off(UNAVAILABLE.unreachable);
      if (ver.exitCode !== 0) return off(UNAVAILABLE.notInstalled);
      const version = ver.stdout.trim().split("\n")[0]?.slice(0, 80) ?? null;

      const auth = await exec([deps.claudePath, "auth", "status"], opts);
      if (auth.missing) return off(UNAVAILABLE.notInstalled);
      if (auth.timedOut) return off(UNAVAILABLE.unreachable, version);
      // The exit code is not trusted either way: the JSON is the documented answer.
      const parsed = parseAuth(auth.stdout);
      if (!parsed?.loggedIn) return off(UNAVAILABLE.notLoggedIn, version);
      return { ok: true, version, authMethod: parsed.authMethod };
    } catch {
      return off(UNAVAILABLE.unreachable);
    }
  }

  async function status(): Promise<CliStatus> {
    const t = now();
    // One probe at a time: the promise is cached, so concurrent callers share the two spawns.
    if (cached === null || t - cached.at >= cacheMs) cached = { at: t, value: probe() };
    return cached.value;
  }

  return {
    status,
    async available() {
      const s = await status();
      return s.ok ? { ok: true } : { ok: false, reason: s.reason ?? UNAVAILABLE.unreachable };
    },
    reset() {
      cached = null;
    },
  };
}
