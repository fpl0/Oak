// SPIKE S1 — GraderHost for Bun: one worker (or subprocess), FIFO queue, hard timeout with kill + respawn.
// Same interface for both backends so the server can swap them with one option.

import type { AnalyzeResult } from "./runtime.ts";
import type { GraderRequest, GraderResponse, WorkerInit, WorkerReady } from "./protocol.ts";

export type HostMode = "worker" | "subprocess";

export interface GraderHostOptions {
  mode?: HostMode;
  /** per-request wall clock budget; on expiry the backend is killed and respawned */
  timeoutMs?: number;
  /** neuter Function constructors / eval inside the realm after setup (default true) */
  lockdown?: boolean;
  /** spike-only raw eval requests */
  allowProbe?: boolean;
  /** how long a cold backend may take to report ready */
  bootTimeoutMs?: number;
}

interface Backend {
  ready: Promise<WorkerReady>;
  send(msg: WorkerInit | GraderRequest): void;
  /** resolves when the backend is really gone */
  kill(): Promise<void>;
  onMessage: ((msg: GraderResponse) => void) | null;
  onCrash: ((reason: string) => void) | null;
  dead: boolean;
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<GraderRequest, "id">;

export interface HostStats {
  spawns: number;
  kills: number;
  crashes: number;
  /** spawn() call -> 'ready' message, per spawn (ms) */
  spawnMs: number[];
  /** runtime import + evalScope + lockdown inside the backend, per spawn (ms) */
  initMs: number[];
  /** kill() call -> backend confirmed gone, per kill (ms) */
  killMs: number[];
}

export class GraderHost {
  readonly mode: HostMode;
  readonly timeoutMs: number;
  readonly stats: HostStats = { spawns: 0, kills: 0, crashes: 0, spawnMs: [], initMs: [], killMs: [] };
  lastReady: WorkerReady | null = null;

  private opts: Required<Omit<GraderHostOptions, "mode" | "timeoutMs">>;
  private backend: Backend | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private disposed = false;

  constructor(options: GraderHostOptions = {}) {
    this.mode = options.mode ?? "worker";
    this.timeoutMs = options.timeoutMs ?? 1500;
    this.opts = {
      lockdown: options.lockdown ?? true,
      allowProbe: options.allowProbe ?? false,
      bootTimeoutMs: options.bootTimeoutMs ?? 10_000,
    };
    this.spawn(); // prewarm
  }

  /** Resolves once the current backend is ready (useful to measure cold start). */
  async ready(): Promise<WorkerReady> {
    return await this.ensure().ready;
  }

  analyze(
    code: string,
    opts: { bars?: number; hapCap?: number; lint?: "off" | "strict"; fuel?: number; timeoutMs?: number } = {},
  ): Promise<GraderResponse & { result?: AnalyzeResult }> {
    const { timeoutMs, ...rest } = opts;
    return this.request({ kind: "analyze", code, ...rest }, timeoutMs) as Promise<GraderResponse & { result?: AnalyzeResult }>;
  }

  /** FIFO: one in-flight request per backend. */
  request(body: RequestBody, timeoutMs = this.timeoutMs): Promise<GraderResponse> {
    const run = () => this.run({ ...body, id: `r${++this.seq}` } as GraderRequest, timeoutMs);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.queue.catch(() => {});
    const b = this.backend;
    this.backend = null;
    if (b) await b.kill();
  }

  // -------------------------------------------------------------------------------------------

  private ensure(): Backend {
    if (!this.backend || this.backend.dead) this.spawn();
    return this.backend as Backend;
  }

  private spawn(): void {
    const t0 = performance.now();
    const backend = this.mode === "worker" ? spawnWorker() : spawnSubprocess();
    this.stats.spawns++;
    backend.ready = backend.ready.then((r) => {
      this.stats.spawnMs.push(performance.now() - t0);
      this.stats.initMs.push(r.initMs);
      this.lastReady = r;
      return r;
    });
    backend.ready.catch(() => {}); // surfaced to the request that awaits it
    backend.send({ kind: "init", lockdown: this.opts.lockdown, allowProbe: this.opts.allowProbe });
    this.backend = backend;
  }

  private async killAndRespawn(b: Backend): Promise<void> {
    const t0 = performance.now();
    this.stats.kills++;
    if (this.backend === b) this.backend = null;
    if (!this.disposed) this.spawn(); // start the replacement immediately, in parallel with the kill
    await b.kill();
    this.stats.killMs.push(performance.now() - t0);
  }

  private async run(req: GraderRequest, timeoutMs: number): Promise<GraderResponse> {
    if (this.disposed) return fail(req.id, "internal", "host disposed", 0);
    const backend = this.ensure();
    try {
      await withTimeout(backend.ready, this.opts.bootTimeoutMs, "backend boot timed out");
    } catch (e) {
      await this.killAndRespawn(backend);
      return fail(req.id, "internal", (e as Error).message, 0);
    }
    const t0 = performance.now();
    return await new Promise<GraderResponse>((resolve) => {
      const finish = (res: GraderResponse) => {
        clearTimeout(timer);
        backend.onMessage = null;
        backend.onCrash = null;
        resolve(res);
      };
      const timer = setTimeout(() => {
        // The realm is stuck (while(true){}, huge allocation…): it cannot be asked to stop, only killed.
        void this.killAndRespawn(backend).then(() =>
          finish(fail(req.id, "timeout", `took longer than ${timeoutMs} ms: infinite loop or huge pattern?`, performance.now() - t0)),
        );
      }, timeoutMs);
      backend.onMessage = (msg) => {
        if (msg.id === req.id) finish(msg);
      };
      backend.onCrash = (reason) => {
        this.stats.crashes++;
        if (this.backend === backend) this.backend = null;
        finish(fail(req.id, "crashed", reason, performance.now() - t0));
      };
      backend.send(req);
    });
  }
}

const fail = (id: string, kind: "timeout" | "internal" | "crashed", message: string, ms: number): GraderResponse => ({
  id,
  ok: false,
  error: { kind, message },
  logs: [],
  ms,
});

function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---------------------------------------------------------------------------------------------
// Backend: Bun Worker
// ---------------------------------------------------------------------------------------------

function spawnWorker(): Backend {
  // `env: {}` -> the worker's process.env starts empty. `smol` -> smaller heap, more frequent GC.
  const worker = new Worker(new URL("./worker.ts", import.meta.url).href, {
    env: {},
    smol: true,
    name: "oak-grader",
  } as WorkerOptions);
  let resolveReady!: (r: WorkerReady) => void;
  let rejectReady!: (e: Error) => void;
  let closed!: () => void;
  const closedP = new Promise<void>((r) => {
    closed = r;
  });
  const backend: Backend = {
    ready: new Promise<WorkerReady>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    }),
    send: (msg) => worker.postMessage(msg),
    kill: async () => {
      backend.dead = true;
      worker.terminate();
      // Bun fires 'close' once the worker thread has actually exited.
      await Promise.race([closedP, new Promise<void>((r) => setTimeout(r, 2000))]);
    },
    onMessage: null,
    onCrash: null,
    dead: false,
  };
  worker.addEventListener("message", (ev: MessageEvent) => {
    const msg = ev.data as WorkerReady | GraderResponse;
    if ("kind" in msg && msg.kind === "ready") resolveReady(msg);
    else backend.onMessage?.(msg as GraderResponse);
  });
  worker.addEventListener("error", (ev: ErrorEvent) => {
    backend.dead = true;
    rejectReady(new Error(`worker error: ${ev.message}`));
    backend.onCrash?.(`worker error: ${ev.message}`);
  });
  worker.addEventListener("close", () => {
    const wasDead = backend.dead;
    backend.dead = true;
    closed();
    if (!wasDead) {
      rejectReady(new Error("worker closed"));
      backend.onCrash?.("worker closed unexpectedly");
    }
  });
  return backend;
}

// ---------------------------------------------------------------------------------------------
// Backend: subprocess (fallback; also the only backend with real memory isolation)
// ---------------------------------------------------------------------------------------------

function spawnSubprocess(): Backend {
  const entry = new URL("./proc.ts", import.meta.url).pathname;
  const proc = Bun.spawn([process.execPath, entry], {
    env: {}, // nothing inherited: no ANTHROPIC_API_KEY, no PATH, no HOME
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe", // kept only as a diagnostic tail for crash reports
  });
  let stderrTail = "";
  void (async () => {
    const dec = new TextDecoder();
    for await (const chunk of proc.stderr) stderrTail = (stderrTail + dec.decode(chunk, { stream: true })).slice(-2000);
  })();
  let resolveReady!: (r: WorkerReady) => void;
  let rejectReady!: (e: Error) => void;
  const backend: Backend = {
    ready: new Promise<WorkerReady>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    }),
    send: (msg) => {
      proc.stdin.write(`${JSON.stringify(msg)}\n`);
      proc.stdin.flush();
    },
    kill: async () => {
      backend.dead = true;
      proc.kill("SIGKILL");
      await proc.exited;
    },
    onMessage: null,
    onCrash: null,
    dead: false,
  };
  void (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        if (!line.trim()) continue;
        let msg: WorkerReady | GraderResponse;
        try {
          msg = JSON.parse(line);
        } catch {
          continue; // stray output from evaluated code; never trusted as protocol
        }
        if ("kind" in msg && msg.kind === "ready") resolveReady(msg);
        else backend.onMessage?.(msg as GraderResponse);
      }
    }
  })();
  void proc.exited.then((code) => {
    const wasDead = backend.dead;
    backend.dead = true;
    if (!wasDead) {
      const reason = `grader subprocess exited with code ${code} signal ${proc.signalCode ?? "-"}: ${stderrTail.trim().slice(-600)}`;
      rejectReady(new Error(reason));
      backend.onCrash?.(reason);
    }
  });
  return backend;
}
