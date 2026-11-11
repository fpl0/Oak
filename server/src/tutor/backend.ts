// The TutorBackend contract: what the two backends ('anthropic-api' and 'claude-cli') implement
// and what they are handed. Re-exported from types.ts.
import type { TutorErrorInfo } from "./errors.ts";
import type { TutorEvent, UsageSummary } from "./events.ts";
import type { ToolDef, ToolName } from "./tools/defs.ts";
import type { BackendId, Effort, Lane, Limits, ThreadKind, TranscriptEntry } from "./types.ts";

/** The three frozen system blocks, in render order. Never contains anything volatile. */
export interface Prefix {
  readonly persona: string;
  readonly syllabus: string;
  readonly catalog: string;
}

export interface ToolCall {
  /** The model's tool-use ID (API) or an ID the MCP endpoint makes up (CLI). */
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  /** JSON text, already redacted to the turn's rung. Hand it to the model unchanged. */
  content: string;
  isError: boolean;
}

export type ExecuteTool = (call: ToolCall, signal: AbortSignal) => Promise<ToolResult>;

/** The newest user turn, in parts, so each backend can place them where its transport allows. */
export interface UserTurn {
  /** The complete `<oak_context v="1">...</oak_context>` block, redacted. The only app-authored part. */
  oakContext: string;
  learnerCode: string | null;
  text: string;
}

/**
 * A backend's own memory of a conversation, opaque to everyone else. The API backend stores its
 * message params verbatim (thinking blocks and signatures included); the CLI backend stores its
 * session ID. Append-only.
 */
export interface BackendContinuity {
  /** Committed records of THIS backend for this conversation, oldest first, excluded ones left out. */
  readonly records: readonly unknown[];
  /**
   * Call at most once per turn with everything the turn added. `excluded: true` logs a refused,
   * truncated or aborted tail without ever replaying it.
   */
  commit(records: readonly unknown[], opts?: { excluded?: boolean }): Promise<void>;
}

export interface BackendTurn {
  conversationId: string;
  kind: ThreadKind;
  lane: Lane;
  model: string;
  effort: Effort;
  limits: Pick<Limits, "maxTokens" | "maxIterations">;
  prefix: Prefix;
  /** sha256 over tools + system. A conversation never changes its prefix. */
  prefixVersion: string;
  /** The full v1 tool list, name-sorted and frozen: byte-identical in every request. */
  tools: readonly ToolDef[];
  /** Runs a tool under this turn's server-side rung. Also emits `tool_start`, `tool_result`, `card`, `review`. */
  executeTool: ExecuteTool;
  /** Prior turns in app-level form. Use it to seed a conversation this backend has no records for. */
  transcript: readonly TranscriptEntry[];
  continuity: BackendContinuity;
  user: UserTurn;
  isFirstTurn: boolean;
}

export type StopReason = "end_turn" | "max_tokens" | "stop_sequence" | "other";

export type TurnOutcome =
  | {
      status: "completed";
      stopReason: StopReason;
      iterations: number;
      usage: UsageSummary;
      calls: UsageSummary[];
    }
  | {
      status: "failed";
      error: TutorErrorInfo;
      iterations: number;
      usage: UsageSummary;
      calls: UsageSummary[];
    };

export type StructuredCheck<T> = { ok: true; value: T } | { ok: false; problems: string[] };

/**
 * A turn whose product is one validated object (the reviews). Two delivery channels, one validator:
 *  - API: forced tool choice is not available, so the model calls `submitTool`; run the normal
 *    tool loop through `executeTool` and read `accepted()` after each tool round.
 *  - CLI: pass `jsonSchema` to `--json-schema`, read `result.structured_output`, call `validate`.
 * Either way a rejected object may be resubmitted `maxResubmits` times, with the problems as feedback.
 */
export interface StructuredTurn<T> extends BackendTurn {
  schemaName: string;
  jsonSchema: Readonly<Record<string, unknown>>;
  submitTool: ToolName;
  validate(raw: unknown, signal: AbortSignal): Promise<StructuredCheck<T>>;
  accepted(): T | undefined;
  maxResubmits: number;
  /** The single reminder to send when the model ends its turn without submitting. */
  reminder: string;
}

export interface WarmInput {
  prefix: Prefix;
  tools: readonly ToolDef[];
  model: string;
  /** Chat parameters: the warm-up primes the prefix the first chat turn will read. */
  effort: Effort;
}

export type Emit = (event: TutorEvent) => void;

/**
 * One way of reaching the model. Rules for implementers:
 *  - emit only `status`, `text`, `thinking`, `tool_start`, `tool_input` and `usage`; the turn
 *    runner emits `meta`, `done` and `error`, and `executeTool` emits the tool events;
 *  - never throw for an upstream failure in `runTurn`: return `{ status: "failed" }` built with
 *    errors.ts. `runStructured` throws a `TutorError` instead, because it has no partial result;
 *  - hand `ToolResult.content` to the model unchanged and send nothing that was not given to you:
 *    the redaction guarantee is that the prefix, `user`, `transcript` and tool results are all a
 *    backend ever sees.
 */
export interface TutorBackend {
  readonly id: BackendId;
  available(): Promise<{ ok: boolean; reason?: string }>;
  runTurn(input: BackendTurn, emit: Emit, signal: AbortSignal): Promise<TurnOutcome>;
  runStructured<T>(
    input: StructuredTurn<T>,
    signal: AbortSignal,
  ): Promise<{ value: T; usage: UsageSummary; calls?: UsageSummary[] }>;
  /** Prime the prompt cache at session start. Optional: the CLI caches by itself. */
  warm?(input: WarmInput, signal?: AbortSignal): Promise<void>;
}

/** Conventional `available().reason` codes; the health endpoint maps them to its enum. */
export const UNAVAILABLE = {
  missingKey: "missing_key",
  invalidKey: "invalid_key",
  unreachable: "unreachable",
  notInstalled: "not_installed",
  notLoggedIn: "not_logged_in",
} as const;
