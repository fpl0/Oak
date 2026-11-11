// Browser backend: a module Web Worker, killed and respawned on timeout (1.5 s; 5 s in capstone mode).
// Vite needs `define: { "process.env.NODE_ENV": … }` for @strudel/core's errorLogger (spike S1).
import { isReady, isResponse } from "../protocol/wire.ts";
import type { GraderHost, GraderHostOptions } from "../types.ts";
import { type Backend, backendShell, HostCore } from "./core.ts";

export interface BrowserHostOptions extends GraderHostOptions {
  /**
   * Creates the worker. Default: `new Worker(new URL("../worker.ts", import.meta.url), { type: "module" })`.
   */
  spawn?: () => Worker;
  /** Keep a second realm booted for the request after a kill (default true). */
  spare?: boolean;
}

function defaultSpawn(): Worker {
  return new Worker(new URL("../worker.ts", import.meta.url), { type: "module", name: "oak-grader" });
}

function spawnWebWorker(make: () => Worker): Backend {
  const worker = make();
  const { backend, handlers } = backendShell(
    (msg) => worker.postMessage(msg),
    async () => {
      // terminate() is synchronous in browsers: the thread stops at once.
      worker.terminate();
    },
  );
  worker.addEventListener("message", (ev: MessageEvent) => {
    const msg: unknown = ev.data;
    if (isReady(msg)) handlers.ready(msg);
    else if (isResponse(msg)) handlers.message(msg);
  });
  worker.addEventListener("error", (ev: ErrorEvent) => {
    ev.preventDefault();
    handlers.crashed(`grader worker error: ${ev.message}`);
  });
  worker.addEventListener("messageerror", () => handlers.crashed("grader worker message error"));
  return backend;
}

/** One grader realm for the app: learner code, live analysis for the roll and the staff, in-browser checks. */
export function createBrowserGraderHost(options: BrowserHostOptions): GraderHost {
  const make = options.spawn ?? defaultSpawn;
  return new HostCore("web-worker", () => spawnWebWorker(make), options);
}
