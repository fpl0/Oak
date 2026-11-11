// SPIKE S1 — transport-independent request handler (used by worker.ts and proc.ts).
import type { GraderRequest, GraderResponse, WorkerInit, WorkerReady } from "./protocol.ts";

type Runtime = typeof import("./runtime.ts");
let rt: Runtime | null = null;
let allowProbe = false;

export async function boot(init: WorkerInit): Promise<WorkerReady> {
  const t0 = performance.now();
  // @strudel/core prints "cannot use window: not in browser?" (console.warn) and "🌀 @strudel/core loaded 🌀"
  // (console.log) at import time. Mute the console around the dynamic import so server logs stay clean.
  const saved = { log: console.log, warn: console.warn };
  console.log = () => {};
  console.warn = () => {};
  try {
    rt = await import("./runtime.ts");
  } finally {
    console.log = saved.log;
    console.warn = saved.warn;
  }
  const info = await rt.initRealm();
  allowProbe = !!init.allowProbe;
  const lockdown = init.lockdown ? rt.lockDown() : null;
  return { kind: "ready", initMs: performance.now() - t0, lockdown, stubbedMethods: info.stubbedMethods };
}

export async function handle(req: GraderRequest): Promise<GraderResponse> {
  const t0 = performance.now();
  const done = () => performance.now() - t0;
  if (!rt) return { id: req.id, ok: false, error: { kind: "internal", message: "not booted" }, logs: [], ms: 0 };
  try {
    switch (req.kind) {
      case "ping":
        return { id: req.id, ok: true, result: "pong", logs: [], ms: done() };
      case "analyze": {
        const result = await rt.analyze(req.code, {
          ...(req.bars !== undefined && { bars: req.bars }),
          ...(req.hapCap !== undefined && { hapCap: req.hapCap }),
          ...(req.lint !== undefined && { lint: req.lint }),
          ...(req.fuel !== undefined && { fuel: req.fuel }),
        });
        return { id: req.id, ok: true, result, logs: result.logs, ms: done() };
      }
      case "probe": {
        if (!allowProbe) throw new Error("probe requests are disabled");
        const value = await rt.rawEval(req.code, {
          ...(req.shadow !== undefined && { shadow: req.shadow }),
          ...(req.transpile !== undefined && { transpile: req.transpile }),
          ...(req.importBan !== undefined && { importBan: req.importBan }),
        });
        // must be structured-cloneable / JSON-able
        return { id: req.id, ok: true, result: JSON.parse(JSON.stringify(value ?? null)), logs: [], ms: done() };
      }
    }
  } catch (e) {
    if (e instanceof rt.GraderError) {
      return {
        id: req.id,
        ok: false,
        error: { kind: e.kind, message: e.message, ...(e.lint.length && { lint: e.lint }) },
        logs: e.logs,
        ms: done(),
      };
    }
    const err = e as Error;
    return {
      id: req.id,
      ok: false,
      error: { kind: req.kind === "probe" ? "eval" : "internal", message: `${err?.name ?? "Error"}: ${err?.message ?? String(e)}` },
      logs: [],
      ms: done(),
    };
  }
}
