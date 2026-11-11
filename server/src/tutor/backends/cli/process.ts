// Running one `claude -p` process: spawn, prompt on stdin, stdout as JSON lines, stderr kept for
// classification, and the three ways a run is cut short (timeout, the learner's Stop, a caller's
// own decision such as a failed init check). Knows nothing about what the lines mean.
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * The CLI stores its sessions under `~/.claude/projects/<cwd>/`, and reads project files from the
 * directory it runs in. One dedicated, empty directory keeps Oak's sessions together and gives
 * the CLI no repository to look at (spike S8, gotcha 5).
 */
export const DEFAULT_CWD = join(homedir(), ".oak", "tutor-cwd");

export async function ensureCwd(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * The environment of every `claude` child. The CLI backend is for the logged-in CLI: an API key
 * in the server's environment belongs to the other backend and must not be picked up here, or a
 * turn shown as "included in your Claude plan" would be billed per token.
 */
export function childEnv(base: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined || k === "ANTHROPIC_API_KEY" || k === "ANTHROPIC_AUTH_TOKEN") continue;
    env[k] = v;
  }
  return env;
}

export interface SpawnedProcess {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number | null>;
  kill(signal?: number): void;
}

export interface SpawnOptions {
  cwd: string;
  env: Record<string, string>;
  stdin: string;
}

/** May throw synchronously (ENOENT for a missing binary), exactly like `Bun.spawn`. */
export type SpawnFn = (argv: string[], opts: SpawnOptions) => SpawnedProcess;

export const bunSpawn: SpawnFn = (argv, opts) => {
  const proc = Bun.spawn(argv, {
    cwd: opts.cwd,
    env: opts.env,
    stdin: new Blob([opts.stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  return { stdout: proc.stdout, stderr: proc.stderr, exited: proc.exited, kill: (s) => proc.kill(s) };
};

export type StreamLine = Record<string, unknown>;

export interface RunClaudeOptions {
  argv: string[];
  stdin: string;
  cwd: string;
  env: Record<string, string>;
  spawn?: SpawnFn;
  timeoutMs: number;
  /** How long a process gets to honour SIGTERM before SIGKILL. Default 2 s. */
  killGraceMs?: number;
  signal: AbortSignal;
  /**
   * Called for every JSON object line, in order. `stop(reason)` kills the process; no further
   * line is delivered after a stop, a timeout or an abort.
   */
  onLine(line: StreamLine, stop: (reason: string) => void): void;
}

export interface ProcessResult {
  exitCode: number | null;
  /** The tail of stderr. For classification and the server log only: never shown to the learner. */
  stderr: string;
  aborted: boolean;
  timedOut: boolean;
  /** The reason given to `stop`, if `onLine` asked for the kill. */
  stopped: string | null;
  /** Set when the process could not be started at all. */
  spawnError: { code: string | null; message: string } | null;
}

const KILL_GRACE_MS = 2_000;
const STDERR_TAIL = 16_384;
/** No stream-json line comes near this; a "line" that does is not the protocol. */
const MAX_LINE_BYTES = 16 * 1024 * 1024;
const SIGKILL = 9;

async function readTail(stream: ReadableStream<Uint8Array>): Promise<string> {
  const dec = new TextDecoder();
  let tail = "";
  try {
    for await (const chunk of stream) {
      tail = (tail + dec.decode(chunk, { stream: true })).slice(-STDERR_TAIL);
    }
  } catch {
    // A pipe that breaks when the process is killed has nothing more to say.
  }
  return tail;
}

export async function runClaude(opts: RunClaudeOptions): Promise<ProcessResult> {
  const result: ProcessResult = {
    exitCode: null,
    stderr: "",
    aborted: false,
    timedOut: false,
    stopped: null,
    spawnError: null,
  };
  if (opts.signal.aborted) return { ...result, aborted: true };

  let proc: SpawnedProcess;
  try {
    proc = (opts.spawn ?? bunSpawn)(opts.argv, { cwd: opts.cwd, env: opts.env, stdin: opts.stdin });
  } catch (e) {
    const err = e as { code?: unknown; message?: unknown };
    result.spawnError = {
      code: typeof err.code === "string" ? err.code : null,
      message: typeof err.message === "string" ? err.message : "spawn failed",
    };
    return result;
  }

  let cut = false;
  let hardKill: ReturnType<typeof setTimeout> | undefined;
  const kill = () => {
    if (cut) return;
    cut = true;
    try {
      proc.kill();
    } catch {
      // Already gone.
    }
    // SIGTERM is a request. A process that ignores it must not outlive the turn.
    hardKill = setTimeout(() => {
      try {
        proc.kill(SIGKILL);
      } catch {
        // Already gone.
      }
    }, opts.killGraceMs ?? KILL_GRACE_MS);
  };
  const onAbort = () => {
    result.aborted = true;
    kill();
  };
  opts.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    result.timedOut = true;
    kill();
  }, opts.timeoutMs);
  const stop = (reason: string) => {
    if (cut) return;
    result.stopped = reason;
    kill();
  };

  const stderr = readTail(proc.stderr);
  const dec = new TextDecoder();
  let buf = "";
  const deliver = (raw: string) => {
    const line = raw.trim();
    if (line === "" || cut) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // Not ours: the CLI may print a plain-text warning before the stream starts.
    }
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      opts.onLine(parsed as StreamLine, stop);
    }
  };
  try {
    for await (const chunk of proc.stdout) {
      if (cut) continue; // Keep draining so the pipe never blocks the dying process.
      buf += dec.decode(chunk, { stream: true });
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        deliver(line);
      }
      if (buf.length > MAX_LINE_BYTES) stop("oversized line");
    }
    // A last line without a newline is still a line (a process that exits right after writing it).
    deliver(buf + dec.decode());
  } catch {
    // Reading a pipe of a killed process may throw; the exit code below tells the story.
  }

  result.exitCode = await proc.exited;
  result.stderr = await stderr;
  clearTimeout(timer);
  clearTimeout(hardKill);
  opts.signal.removeEventListener("abort", onAbort);
  return result;
}
