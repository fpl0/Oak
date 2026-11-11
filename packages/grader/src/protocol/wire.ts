// The request/response protocol is the same for the browser Worker, the Bun Worker and the subprocess
// (types in ../types.ts: GraderInit, GraderReady, GraderRequest, GraderResponse). Workers carry messages
// by structured clone; the subprocess carries them as NDJSON, so a `Set` (`LintContext.unlocked`) is
// encoded explicitly. The same codec is safe for both.
import type { GradeResult, GradingMode } from "@oak/content-kit";
import type {
  CompareRequest,
  GraderErrorInfo,
  GraderInit,
  GraderReady,
  GraderRequest,
  GraderResponse,
} from "../types.ts";

const SET_TAG = "$oakSet";

export function encodeWire(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (v instanceof Set ? { [SET_TAG]: [...v] } : v));
}

export function decodeWire<T>(text: string): T {
  return JSON.parse(text, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v) && SET_TAG in v) {
      const items = (v as Record<string, unknown>)[SET_TAG];
      if (Array.isArray(items)) return new Set(items);
    }
    return v;
  }) as T;
}

/** A message from a backend: the ready handshake or a response. */
export type BackendMessage = GraderReady | GraderResponse;
export type HostMessage = GraderInit | GraderRequest;

export function isReady(msg: unknown): msg is GraderReady {
  return typeof msg === "object" && msg !== null && (msg as { kind?: unknown }).kind === "ready";
}
export function isResponse(msg: unknown): msg is GraderResponse {
  return typeof msg === "object" && msg !== null && typeof (msg as { id?: unknown }).id === "string";
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type RequestBody = DistributiveOmit<GraderRequest, "id">;

/** The grading mode a request runs in, for its wall-clock limit. */
export function modeOf(body: RequestBody): GradingMode {
  switch (body.kind) {
    case "analyze":
      return body.opts.mode;
    case "grade":
      return body.req.ctx.mode;
    case "compare":
      return "tutor";
    default:
      return "lesson";
  }
}

/** A `GradeResult` with status `error` for a request that did not run to an answer (timeout, crash). */
export function errorGradeResult(
  base: {
    exerciseId: string;
    exerciseVersion: number;
    attemptNo: number;
    firstAttempt: boolean;
    mode: GradingMode;
  },
  assist: GradeResult["assist"],
  error: GraderErrorInfo,
  ms: number,
): GradeResult {
  const id = error.kind === "timeout" ? "eval.timeout" : "eval.runtime";
  return {
    ...base,
    status: "error",
    score: 0,
    adjustedScore: 0,
    dims: {},
    constraints: [],
    diagnostics: [
      {
        id,
        severity: "error",
        params: error.kind === "timeout" ? { ms: Math.round(ms) } : { fn: error.kind, detail: error.message },
      },
    ],
    messages: [],
    assist,
  };
}

export function compareBase(req: CompareRequest): {
  exerciseId: string;
  exerciseVersion: number;
  attemptNo: number;
  firstAttempt: boolean;
  mode: GradingMode;
} {
  const ex = req.target.kind === "exercise" ? req.target.exercise : null;
  return {
    exerciseId: ex ? ex.id : "compare",
    exerciseVersion: ex ? ex.version : 0,
    attemptNo: 0,
    firstAttempt: false,
    mode: "tutor",
  };
}
