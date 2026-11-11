// SPIKE S1 — request/response protocol shared by the Bun Worker, the subprocess fallback and (later) the browser Worker.
import type { AnalyzeResult, GraderErrorKind, LogLine } from "./runtime.ts";
import type { LintDiagnostic } from "./lint.ts";

export type GraderRequest =
  | { id: string; kind: "ping" }
  | { id: string; kind: "analyze"; code: string; bars?: number; hapCap?: number; lint?: "off" | "strict"; fuel?: number }
  /** spike-only: evaluate and return a JSON-able value (security probes). Refused unless the worker was started with allowProbe. */
  | { id: string; kind: "probe"; code: string; shadow?: boolean; transpile?: boolean; importBan?: boolean };

export type GraderErrorPayload = {
  kind: GraderErrorKind | "timeout" | "internal" | "crashed";
  message: string;
  lint?: LintDiagnostic[];
};

export type GraderResponse =
  | { id: string; ok: true; result: AnalyzeResult | unknown; logs: LogLine[]; ms: number }
  | { id: string; ok: false; error: GraderErrorPayload; logs: LogLine[]; ms: number };

export interface WorkerInit {
  kind: "init";
  /** neuter Function constructors / eval after setup */
  lockdown: boolean;
  allowProbe?: boolean;
}

export interface WorkerReady {
  kind: "ready";
  initMs: number;
  lockdown: { neutered: string[]; failed: string[] } | null;
  stubbedMethods: string[];
}
