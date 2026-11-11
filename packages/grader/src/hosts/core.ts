// The host logic every backend shares (spike S1 host.ts, promoted): one realm, one request at a time
// (FIFO), a hard wall-clock limit per request with kill and respawn, and a warm spare so the request
// after a kill does not pay a cold start. Isomorphic: only setTimeout and performance.
//
// A timeout or a crash never rejects: `analyze` resolves to an `EvalFailure`, `grade`/`compare` to a
// `GradeResult` with status `error`, `lint` to the lint run on the host's own thread.
import type { GradeResult, LintContext, LintResult } from "@oak/content-kit";
import { lintOak } from "../lint/oak.ts";
import { compareBase, errorGradeResult, modeOf, type RequestBody } from "../protocol/wire.ts";
import {
  type CompareRequest,
  type EvalOptions,
  type EvalResult,
  type GradeRequest,
  type GraderErrorInfo,
  type GraderHost,
  type GraderHostOptions,
  type GraderInit,
  type GraderReady,
  type GraderRequest,
  type GraderResponse,
  type HostBackend,
  type HostStats,
  MODE_LIMITS,
} from "../types.ts";

/** One running realm (a Worker or a subprocess). */
export interface Backend {
  readonly ready: Promise<GraderReady>;
  send(msg: GraderInit | GraderRequest): void;
  /** Resolves when the backend is really gone. */
  kill(): Promise<void>;
  onMessage: ((msg: GraderResponse) => void) | null;
  onCrash: ((reason: string) => void) | null;
  dead: boolean;
}

export interface BackendHandlers {
  ready(msg: GraderReady): void;
  message(msg: GraderResponse): void;
  /** The backend died on its own (not killed by the host). */
  crashed(reason: string): void;
}

export interface HostCoreOptions extends GraderHostOptions {
  /** Keep a second realm booted, used at once after a kill (default true). */
  spare?: boolean;
  /** Disable `Function`/eval in the realm after set-up (default true; tests of the bare realm turn it off). */
  lockdown?: boolean;
  /** Consecutive failed boots after which the host stops spawning for a while (default 3). */
  bootFailureLimit?: number;
  /** The first pause after `bootFailureLimit` failed boots; it doubles up to 60 s (default 2 s). */
  bootCooldownMs?: number;
}

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

export class HostCore implements GraderHost {
  readonly backend: HostBackend;
  readonly stats: HostStats;
  lastReady: GraderReady | null = null;
  private current: Backend | null = null;
  private spare: Backend | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private seq = 0;
  private readonly nonce = Math.random().toString(36).slice(2, 10);
  private disposed = false;
  private readonly bootTimeoutMs: number;
  private readonly useSpare: boolean;
  private readonly lockdown: boolean;
  // Respawn storm guard: a realm that cannot boot (a broken install, a missing file) must not be spawned
  // again for every request and every spare top-up.
  private bootFailures = 0;
  private cooldownMs = 0;
  private coolUntil = 0;
  private readonly countedFailures = new WeakSet<Backend>();

  constructor(
    backend: HostBackend,
    private readonly spawnBackend: () => Backend,
    private readonly options: HostCoreOptions,
  ) {
    this.backend = backend;
    this.stats = { backend, spawns: 0, kills: 0, crashes: 0, spawnMs: [], killMs: [] };
    this.bootTimeoutMs = options.bootTimeoutMs ?? 10_000;
    this.useSpare = options.spare ?? true;
    this.lockdown = options.lockdown ?? true;
    this.current = this.spawn();
    // The warm spare boots once the first realm is up, so the two cold starts do not compete.
    this.current.ready.then(
      () => this.topUpSpare(),
      () => {},
    );
  }

  async ready(): Promise<GraderReady> {
    return await this.ensure().ready;
  }

  async analyze(code: string, opts: EvalOptions, signal?: AbortSignal): Promise<EvalResult> {
    const res = await this.request({ kind: "analyze", code, opts }, signal);
    if (res.ok && res.kind === "analyze") return res.result;
    const error = res.ok
      ? { kind: "internal" as const, message: `unexpected response ${res.kind}` }
      : res.error;
    return { ok: false, error, logs: [], lint: null, ms: res.ms };
  }

  async grade(req: GradeRequest, signal?: AbortSignal): Promise<GradeResult> {
    const res = await this.request({ kind: "grade", req }, signal);
    if (res.ok && res.kind === "grade") return res.result;
    const { ctx } = req;
    return errorGradeResult(
      {
        exerciseId: ctx.exerciseGlobalId,
        exerciseVersion: req.exercise.version,
        attemptNo: ctx.attemptNo,
        firstAttempt: ctx.firstAttempt,
        mode: ctx.mode,
      },
      { rung: ctx.rung, tutorHints: ctx.tutorHints, extraReplays: ctx.extraReplays, revealed: false },
      this.errorOf(res),
      res.ms,
    );
  }

  async compare(req: CompareRequest, signal?: AbortSignal): Promise<GradeResult> {
    const res = await this.request({ kind: "compare", req }, signal);
    if (res.ok && res.kind === "compare") return res.result;
    return errorGradeResult(
      compareBase(req),
      { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
      this.errorOf(res),
      res.ms,
    );
  }

  /** The lint is pure and fast: when the realm cannot answer, it runs on this thread. */
  async lint(code: string, ctx: LintContext): Promise<LintResult> {
    const res = await this.request({ kind: "lint", code, ctx });
    if (res.ok && res.kind === "lint") return res.result;
    return lintOak(code, ctx, this.options.toolbox);
  }

  async ping(): Promise<GraderResponse> {
    return await this.request({ kind: "ping" });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.queue.catch(() => {});
    const gone = [this.current, this.spare].filter((b): b is Backend => b !== null);
    this.current = null;
    this.spare = null;
    await Promise.all(gone.map((b) => b.kill()));
  }

  // ---------------------------------------------------------------------------------------------

  private errorOf(res: GraderResponse): GraderErrorInfo {
    return res.ok ? { kind: "internal", message: `unexpected response ${res.kind}` } : res.error;
  }

  /** FIFO: one request in flight per realm. */
  request(body: RequestBody, signal?: AbortSignal): Promise<GraderResponse> {
    const id = `${this.nonce}-${++this.seq}`;
    const run = () => this.run({ ...body, id } as GraderRequest, this.timeoutFor(body), signal);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  private timeoutFor(body: RequestBody): number {
    return this.options.timeoutMs ?? MODE_LIMITS[modeOf(body)].timeoutMs;
  }

  private coolingDown(): boolean {
    return this.bootFailures >= (this.options.bootFailureLimit ?? 3) && performance.now() < this.coolUntil;
  }

  private bootFailed(b: Backend): void {
    if (this.countedFailures.has(b)) return;
    this.countedFailures.add(b);
    this.bootFailures++;
    if (this.bootFailures >= (this.options.bootFailureLimit ?? 3)) {
      const first = this.options.bootCooldownMs ?? 2000;
      this.cooldownMs = this.cooldownMs === 0 ? first : Math.min(60_000, this.cooldownMs * 2);
      this.coolUntil = performance.now() + this.cooldownMs;
    }
  }

  private spawn(): Backend {
    const t0 = performance.now();
    const b = this.spawnBackend();
    this.stats.spawns++;
    const ready = b.ready.then((r) => {
      this.stats.spawnMs.push(performance.now() - t0);
      this.lastReady = r;
      this.bootFailures = 0;
      this.cooldownMs = 0;
      return r;
    });
    // A crash before `ready` is a failed boot; the error itself reaches the request that awaits it.
    ready.catch(() => this.bootFailed(b));
    b.send({ kind: "init", toolbox: this.options.toolbox as GraderInit["toolbox"], lockdown: this.lockdown });
    return b;
  }

  private ensure(): Backend {
    if (this.current && !this.current.dead) return this.current;
    if (this.spare && !this.spare.dead) {
      this.current = this.spare;
      this.spare = null;
    } else {
      this.current = this.spawn();
    }
    this.topUpSpare();
    return this.current;
  }

  private topUpSpare(): void {
    if (this.coolingDown() || this.bootFailures > 0) return; // no spare while boots are failing
    if (this.useSpare && !this.disposed && (!this.spare || this.spare.dead)) this.spare = this.spawn();
  }

  private async killAndReplace(b: Backend): Promise<void> {
    const t0 = performance.now();
    this.stats.kills++;
    if (this.current === b) this.current = null;
    // The replacement starts in parallel with the kill (not while boots are failing).
    if (!this.disposed && !this.coolingDown()) this.ensure();
    await b.kill();
    this.stats.killMs.push(performance.now() - t0);
  }

  private async run(req: GraderRequest, timeoutMs: number, signal?: AbortSignal): Promise<GraderResponse> {
    const fail = (kind: GraderErrorInfo["kind"], message: string, ms: number): GraderResponse => ({
      id: req.id,
      ok: false,
      error: { kind, message },
      ms,
    });
    if (this.disposed) return fail("internal", "the grader host was disposed", 0);
    if (signal?.aborted) return fail("internal", "aborted", 0);
    if (this.coolingDown() && !(this.current && !this.current.dead))
      return fail(
        "crashed",
        `the grader failed to start ${this.bootFailures} times in a row; retrying in ${Math.ceil((this.coolUntil - performance.now()) / 1000)} s`,
        0,
      );
    const backend = this.ensure();
    try {
      await withTimeout(backend.ready, this.bootTimeoutMs, "the grader did not start in time");
    } catch (e) {
      this.bootFailed(backend);
      await this.killAndReplace(backend);
      return fail("internal", (e as Error).message, 0);
    }
    const t0 = performance.now();
    return await new Promise<GraderResponse>((resolve) => {
      let settled = false;
      const finish = (res: GraderResponse) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        backend.onMessage = null;
        backend.onCrash = null;
        resolve(res);
      };
      // A stuck realm (`while(true){}`, a huge allocation) cannot be asked to stop, only killed.
      const kill = (kind: "timeout" | "internal", message: string) => {
        void this.killAndReplace(backend).then(() => finish(fail(kind, message, performance.now() - t0)));
      };
      const timer = setTimeout(
        () => kill("timeout", `took longer than ${timeoutMs} ms: an endless loop or a huge pattern?`),
        timeoutMs,
      );
      const onAbort = () => kill("internal", "aborted");
      signal?.addEventListener("abort", onAbort, { once: true });
      backend.onMessage = (msg) => {
        if (msg.id === req.id) finish(msg);
      };
      backend.onCrash = (reason) => {
        this.stats.crashes++;
        if (this.current === backend) this.current = null;
        finish(fail("crashed", reason, performance.now() - t0));
      };
      backend.send(req);
    });
  }
}

/** Wires a backend's ready promise and callbacks. Transports call `handlers` as messages arrive. */
export function backendShell(
  send: Backend["send"],
  kill: (b: Backend) => Promise<void>,
): { backend: Backend; handlers: BackendHandlers } {
  let resolveReady!: (r: GraderReady) => void;
  let rejectReady!: (e: Error) => void;
  const ready = new Promise<GraderReady>((res, rej) => {
    resolveReady = res;
    rejectReady = rej;
  });
  ready.catch(() => {});
  const backend: Backend = {
    ready,
    send,
    kill: async () => {
      backend.dead = true;
      await kill(backend);
    },
    onMessage: null,
    onCrash: null,
    dead: false,
  };
  return {
    backend,
    handlers: {
      ready: (msg) => resolveReady(msg),
      message: (msg) => backend.onMessage?.(msg),
      crashed: (reason) => {
        const wasDead = backend.dead;
        backend.dead = true;
        if (!wasDead) {
          rejectReady(new Error(reason));
          backend.onCrash?.(reason);
        }
      },
    },
  };
}
