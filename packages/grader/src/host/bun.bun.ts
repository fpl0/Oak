// Bun hosts: a Worker thread or a subprocess behind one interface (spike S1 proved both).
// Bun-only file: excluded from tsconfig.app.json. Import it as "@oak/grader/host/bun".
import type { GraderHost, GraderHostOptions } from "../types.ts";

export interface BunHostOptions extends GraderHostOptions {
  /**
   * `bun-worker`: `new Worker(worker.ts, { env: {}, smol: true })`; `terminate()` is reliable in Bun 1.4.4.
   * Shares the server's memory, so use it for the learner's own code, tests and content CI.
   * `bun-subprocess`: `Bun.spawn([process.execPath, proc.bun.ts], { env: {} })`, NDJSON over stdio,
   * SIGKILL on timeout, a watchdog thread in the child that exits when the parent dies. The only backend
   * with memory isolation: model-written code is always evaluated here (contracts §10.A).
   */
  backend: "bun-worker" | "bun-subprocess";
}

export function createBunGraderHost(options: BunHostOptions): GraderHost {
  throw new Error(`@oak/grader: createBunGraderHost(${options.backend}) is not implemented yet`);
}
