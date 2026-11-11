// Bun backends behind `GraderHost` (spike S1 proved both, 450+ kills without a failure):
//   bun-worker      `new Worker(worker.ts, { env: {}, smol: true })`; terminate() is reliable in Bun 1.4.4.
//                   Shares the server's memory: the learner's own code, tests and content CI.
//   bun-subprocess  `Bun.spawn([bun, proc.bun.ts], { env: {} })`, NDJSON over stdio, SIGKILL on timeout,
//                   a watchdog thread in the child. The only backend with memory isolation: model-written
//                   code is always evaluated here (contracts §10.A, §11.4).
import { decodeWire, encodeWire, isReady, isResponse } from "../protocol/wire.ts";
import type { GraderHost, GraderHostOptions } from "../types.ts";
import { type Backend, backendShell, HostCore } from "./core.ts";
import { MAX_RSS_FLAG } from "./limits.ts";

export interface BunHostOptions extends GraderHostOptions {
  backend: "bun-worker" | "bun-subprocess";
  /** Keep a second realm booted for the request after a kill (default true). */
  spare?: boolean;
  /** Disable code generation in the realm after set-up (default true). */
  lockdown?: boolean;
  /**
   * bun-subprocess only: the child kills itself past this resident set size (default 1024 MB; a booted
   * realm uses about 150 MB). A worker shares the server's heap and cannot be bounded this way.
   */
  maxRssMb?: number;
  /** bun-subprocess only: the longest protocol line accepted from the child (default 64 MB). */
  maxLineBytes?: number;
}

export const DEFAULT_MAX_RSS_MB = 1024;
export const DEFAULT_MAX_LINE_BYTES = 64 * 1024 * 1024;

const WORKER_URL = new URL("../worker.ts", import.meta.url).href;
const PROC_PATH = new URL("../proc.bun.ts", import.meta.url).pathname;

function spawnWorker(): Backend {
  // `env: {}`: the worker's process.env starts empty. `smol`: a smaller heap, more frequent GC.
  const worker = new Worker(WORKER_URL, { env: {}, smol: true, name: "oak-grader" } as WorkerOptions);
  let closed!: () => void;
  const closedP = new Promise<void>((r) => {
    closed = r;
  });
  const { backend, handlers } = backendShell(
    (msg) => worker.postMessage(msg),
    async () => {
      worker.terminate();
      // Bun fires `close` once the worker thread has exited (3–60 ms measured).
      await Promise.race([closedP, new Promise<void>((r) => setTimeout(r, 2000))]);
    },
  );
  worker.addEventListener("message", (ev: MessageEvent) => {
    const msg: unknown = ev.data;
    if (isReady(msg)) handlers.ready(msg);
    else if (isResponse(msg)) handlers.message(msg);
  });
  worker.addEventListener("error", (ev: ErrorEvent) =>
    handlers.crashed(`grader worker error: ${ev.message}`),
  );
  worker.addEventListener("close", () => {
    closed();
    handlers.crashed("the grader worker exited");
  });
  return backend;
}

function spawnSubprocess(maxRssMb: number, maxLineBytes: number): Backend {
  const proc = Bun.spawn([process.execPath, PROC_PATH, `${MAX_RSS_FLAG}${maxRssMb}`], {
    env: {}, // nothing inherited: no ANTHROPIC_API_KEY, no PATH, no HOME
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe", // kept only as a tail for crash reports
  });
  let stderrTail = "";
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stderr)
      stderrTail = (stderrTail + dec.decode(chunk, { stream: true })).slice(-2000);
  })().catch(() => {});
  const { backend, handlers } = backendShell(
    (msg) => {
      try {
        proc.stdin.write(`${encodeWire(msg)}\n`);
        proc.stdin.flush();
      } catch {
        // the child is gone: its exit handler reports the crash
      }
    },
    async () => {
      proc.kill("SIGKILL");
      await proc.exited;
    },
  );
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      // A child that writes without newlines would grow this buffer without bound.
      if (buffer.length > maxLineBytes) {
        stderrTail += "\noak: the grader wrote an oversized protocol line";
        buffer = "";
        proc.kill("SIGKILL");
        break;
      }
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        if (!line.trim()) continue;
        let msg: unknown;
        try {
          msg = decodeWire(line);
        } catch {
          continue; // never trusted as protocol
        }
        if (isReady(msg)) handlers.ready(msg);
        else if (isResponse(msg)) handlers.message(msg);
      }
    }
  })().catch(() => {});
  void proc.exited.then((code) => {
    handlers.crashed(
      `the grader subprocess exited (code ${code}, signal ${proc.signalCode ?? "-"}): ${stderrTail.trim().slice(-600)}`,
    );
  });
  return backend;
}

export function createBunGraderHost(options: BunHostOptions): GraderHost & HostCore {
  const rss = options.maxRssMb ?? DEFAULT_MAX_RSS_MB;
  const line = options.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  const spawn = options.backend === "bun-worker" ? spawnWorker : () => spawnSubprocess(rss, line);
  return new HostCore(options.backend, spawn, options);
}
