import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { childEnv, ensureCwd, runClaude, type SpawnFn, type StreamLine } from "./process.ts";

const enc = new TextEncoder();

interface FakeProc {
  spawn: SpawnFn;
  kills: (number | undefined)[];
  spawned: { argv: string[]; cwd: string; env: Record<string, string>; stdin: string }[];
}

/** A process made of streams. `hang` keeps stdout open until it is killed; `stubborn` ignores SIGTERM. */
function fakeProc(opts: {
  chunks: (string | Uint8Array)[];
  stderr?: string;
  exitCode?: number;
  hang?: boolean;
  stubborn?: boolean;
  /** Called after each chunk has been handed over, before the next one. */
  between?: (index: number) => void | Promise<void>;
}): FakeProc {
  const kills: (number | undefined)[] = [];
  const spawned: FakeProc["spawned"] = [];
  const spawn: SpawnFn = (argv, o) => {
    spawned.push({ argv, ...o });
    const exit = Promise.withResolvers<number | null>();
    const dead = Promise.withResolvers<void>();
    const stdout = new ReadableStream<Uint8Array>({
      async start(ctl) {
        for (const [i, c] of opts.chunks.entries()) {
          ctl.enqueue(typeof c === "string" ? enc.encode(c) : c);
          await new Promise((r) => setTimeout(r, 0));
          await opts.between?.(i);
        }
        if (opts.hang) await dead.promise;
        ctl.close();
        exit.resolve(opts.hang ? 143 : (opts.exitCode ?? 0));
      },
    });
    const stderr = new ReadableStream<Uint8Array>({
      start(ctl) {
        if (opts.stderr) ctl.enqueue(enc.encode(opts.stderr));
        ctl.close();
      },
    });
    return {
      stdout,
      stderr,
      exited: exit.promise,
      kill(signal) {
        kills.push(signal);
        if (!opts.stubborn || signal === 9) dead.resolve();
      },
    };
  };
  return { spawn, kills, spawned };
}

async function run(proc: FakeProc, over: Partial<Parameters<typeof runClaude>[0]> = {}) {
  const lines: StreamLine[] = [];
  const result = await runClaude({
    argv: ["claude", "-p"],
    stdin: "PROMPT",
    cwd: "/tmp",
    env: { A: "1" },
    spawn: proc.spawn,
    timeoutMs: 5_000,
    signal: new AbortController().signal,
    onLine: (l) => lines.push(l),
    ...over,
  });
  return { lines, result };
}

describe("runClaude", () => {
  test("the prompt goes in on stdin; argv, cwd and env are passed as given", async () => {
    const proc = fakeProc({ chunks: ['{"type":"result"}\n'] });
    await run(proc);
    expect(proc.spawned).toEqual([{ argv: ["claude", "-p"], cwd: "/tmp", env: { A: "1" }, stdin: "PROMPT" }]);
  });

  test("stdout is parsed line by line whatever the chunk boundaries", async () => {
    const bytes = enc.encode('{"n":1,"t":"é✓"}\n{"n":2}\r\n\n{"n":3}\n{"n":4}');
    // Cut inside a line, inside a multi-byte character, and between two lines.
    const cuts = [3, 13, 14, 20, 21, 30];
    const chunks: Uint8Array[] = [];
    let from = 0;
    for (const to of [...cuts, bytes.length]) {
      chunks.push(bytes.slice(from, to));
      from = to;
    }
    const { lines, result } = await run(fakeProc({ chunks }));
    expect(lines).toEqual([{ n: 1, t: "é✓" }, { n: 2 }, { n: 3 }, { n: 4 }]);
    expect(result).toMatchObject({
      exitCode: 0,
      aborted: false,
      timedOut: false,
      stopped: null,
      spawnError: null,
    });
  });

  test("lines that are not JSON objects are skipped, not fatal", async () => {
    const chunks = ['Warning: something\n[1,2]\n"text"\n42\nnull\n{"ok":true}\n{broken\n'];
    const { lines } = await run(fakeProc({ chunks }));
    expect(lines).toEqual([{ ok: true }]);
  });

  test("stderr and the exit code are captured", async () => {
    const { result, lines } = await run(fakeProc({ chunks: [], stderr: "Error: boom\n", exitCode: 3 }));
    expect(lines).toEqual([]);
    expect(result).toMatchObject({ exitCode: 3, stderr: "Error: boom\n" });
  });

  test("only the tail of a long stderr is kept", async () => {
    const { result } = await run(fakeProc({ chunks: [], stderr: `${"x".repeat(50_000)}THE END` }));
    expect(result.stderr.length).toBeLessThanOrEqual(16_384);
    expect(result.stderr).toEndWith("THE END");
  });

  test("timeout: the process is killed and the run is marked timed out", async () => {
    const proc = fakeProc({ chunks: ['{"n":1}\n'], hang: true });
    const { result, lines } = await run(proc, { timeoutMs: 40 });
    expect(lines).toEqual([{ n: 1 }]);
    expect(result).toMatchObject({ timedOut: true, aborted: false, exitCode: 143 });
    expect(proc.kills).toEqual([undefined]);
  });

  test("abort: killed at once; lines that arrive afterwards are not delivered", async () => {
    const stop = new AbortController();
    const proc = fakeProc({
      chunks: ['{"n":1}\n', '{"n":2}\n', '{"n":3}\n'],
      hang: true,
      between: (i) => {
        if (i === 0) stop.abort();
      },
    });
    const { result, lines } = await run(proc, { signal: stop.signal });
    expect(lines).toEqual([{ n: 1 }]);
    expect(result).toMatchObject({ aborted: true, timedOut: false, exitCode: 143 });
    expect(proc.kills).toEqual([undefined]);
  });

  test("an already aborted signal spawns nothing", async () => {
    const stop = new AbortController();
    stop.abort();
    const proc = fakeProc({ chunks: ['{"n":1}\n'] });
    const { result, lines } = await run(proc, { signal: stop.signal });
    expect(proc.spawned).toEqual([]);
    expect(lines).toEqual([]);
    expect(result.aborted).toBe(true);
  });

  test("stop() from onLine kills the process and ends delivery, even within one chunk", async () => {
    const proc = fakeProc({ chunks: ['{"n":1}\n{"n":2}\n{"n":3}\n'], hang: true });
    const lines: StreamLine[] = [];
    const result = await runClaude({
      argv: ["claude"],
      stdin: "",
      cwd: "/tmp",
      env: {},
      spawn: proc.spawn,
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      onLine: (l, stop) => {
        lines.push(l);
        if (l.n === 1) stop("fail closed");
      },
    });
    expect(lines).toEqual([{ n: 1 }]);
    expect(result).toMatchObject({ stopped: "fail closed", aborted: false, timedOut: false });
    expect(proc.kills).toEqual([undefined]);
  });

  test("a process that ignores SIGTERM is killed with SIGKILL after the grace period", async () => {
    const proc = fakeProc({ chunks: [], hang: true, stubborn: true });
    const { result } = await run(proc, { timeoutMs: 20, killGraceMs: 30 });
    expect(proc.kills).toEqual([undefined, 9]);
    expect(result.timedOut).toBe(true);
  });

  test("a binary that is not there: a spawn error, not an exception", async () => {
    const spawn: SpawnFn = () => {
      throw Object.assign(new Error("ENOENT: no such file or directory, posix_spawn 'claude'"), {
        code: "ENOENT",
      });
    };
    const { result } = await run({ spawn, kills: [], spawned: [] });
    expect(result.spawnError).toMatchObject({ code: "ENOENT" });
    expect(result.exitCode).toBeNull();
  });

  test("the real spawn reports a missing binary the same way", async () => {
    const lines: StreamLine[] = [];
    const result = await runClaude({
      argv: ["/nonexistent/bin/claude", "-p"],
      stdin: "",
      cwd: tmpdir(),
      env: {},
      timeoutMs: 5_000,
      signal: new AbortController().signal,
      onLine: (l) => lines.push(l),
    });
    expect(result.spawnError).not.toBeNull();
    expect(lines).toEqual([]);
  });
});

describe("the child's environment and directory", () => {
  test("Anthropic credentials are removed; everything else is kept", () => {
    const env = childEnv({
      PATH: "/usr/bin",
      HOME: "/home/x",
      ANTHROPIC_API_KEY: "sk-ant-api03-secret",
      ANTHROPIC_AUTH_TOKEN: "token",
      ANTHROPIC_MODEL: "kept",
      EMPTY: undefined,
    });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/x", ANTHROPIC_MODEL: "kept" });
  });

  test("the caller's environment object is not modified", () => {
    const base = { ANTHROPIC_API_KEY: "sk-ant-api03-secret", PATH: "/usr/bin" };
    childEnv(base);
    expect(base.ANTHROPIC_API_KEY).toBe("sk-ant-api03-secret");
  });

  test("the working directory is created on demand, nested, and is idempotent", async () => {
    const root = mkdtempSync(join(tmpdir(), "oak-cli-cwd-"));
    try {
      const dir = join(root, ".oak", "tutor-cwd");
      expect(await ensureCwd(dir)).toBe(dir);
      expect(existsSync(dir)).toBe(true);
      expect(await ensureCwd(dir)).toBe(dir);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
