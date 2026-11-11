// Browser host: a module Web Worker, killed and respawned on timeout (1.5 s; 5 s in capstone mode).
// DOM-only file: excluded from tsconfig.server.json. Import it as "@oak/grader/host/browser".
import type { GraderHost, GraderHostOptions } from "../types.ts";

export interface BrowserHostOptions extends GraderHostOptions {
  /**
   * Creates the worker. Default: `new Worker(new URL("../worker.ts", import.meta.url), { type: "module" })`.
   * Vite needs `define: { "process.env.NODE_ENV": ... }` for @strudel/core's errorLogger (spike S1).
   */
  spawn?: () => Worker;
}

/** One grader realm for the app: learner code, live analysis for the roll and the staff, in-browser checks. */
export function createBrowserGraderHost(options: BrowserHostOptions): GraderHost {
  throw new Error(
    `@oak/grader: createBrowserGraderHost is not implemented yet (${options.toolbox.length} tools)`,
  );
}
