// Claude CLI stream-json -> Oak's app-level protocol, for one process run.
//
// What is forwarded: text deltas, non-empty thinking deltas (none were seen live) and a status
// line. Tool events are NOT taken from the stream: they come from the MCP endpoint, in real time
// and with the server's own IDs. The translator also holds the two fail-closed checks of this
// backend (the tool surface in the init event, the iteration limit) and turns the way the process
// ended into a result or one error kind.
import {
  classifyCliExit,
  classifyHttpStatus,
  errorInfo,
  redactSecrets,
  type TutorErrorInfo,
  type TutorErrorKind,
} from "../../errors.ts";
import type { TutorEvent, UsageSummary } from "../../events.ts";
import { toolStatusLabel } from "../../tools/labels.ts";
import type { Emit, StopReason } from "../../types.ts";
import { addUsage, callUsage, emptyUsage, type WireUsage } from "../../usage.ts";
import { MCP_SERVER_NAME } from "./argv.ts";
import type { ProcessResult, StreamLine } from "./process.ts";

type Json = Record<string, unknown>;
type Phase = Extract<TutorEvent, { type: "status" }>["data"]["phase"];

const obj = (v: unknown): Json | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Json) : null;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** `error` on a synthetic assistant message, where the CLI reports an upstream failure in-band. */
const ASSISTANT_ERRORS: Record<string, TutorErrorKind> = {
  rate_limit: "rate_limit",
  authentication_failed: "auth",
  billing_error: "auth",
  invalid_request: "bad_request",
  server_error: "overloaded",
};

export interface TranslatorOptions {
  /** Exactly the tools the init event may list (argv.ts `expectedTools`). */
  expectedTools: readonly string[];
  /** Model calls allowed in this run. */
  maxIterations: number;
  model: string;
  emit: Emit;
  nowMs?: () => number;
}

export type Verdict =
  | { ok: true; stopReason: StopReason; structuredOutput: unknown; resultText: string | null }
  | { ok: false; error: TutorErrorInfo; detail: string };

export class StreamTranslator {
  readonly #opts: TranslatorOptions;
  #initSeen = false;
  #violation: { kind: TutorErrorKind; detail: string } | null = null;
  #result: Json | null = null;
  #assistantError: string | null = null;
  #rateLimit: Json | null = null;
  #calls: WireUsage[] = [];
  #shown = "";
  sessionId: string | null = null;
  /** Model calls started (`message_start` events). Zero means the model was never reached. */
  iterations = 0;

  constructor(opts: TranslatorOptions) {
    this.#opts = opts;
  }

  get sawResult(): boolean {
    return this.#result !== null;
  }

  /** One of this backend's own checks stopped the run (tool surface, API key, iteration limit). */
  get violated(): boolean {
    return this.#violation !== null;
  }

  #status(phase: Phase, label: string): void {
    const key = `${phase}:${label}`;
    if (key === this.#shown) return;
    this.#shown = key;
    this.#opts.emit({ type: "status", data: { phase, label } });
  }

  #fail(kind: TutorErrorKind, detail: string, stop: (reason: string) => void): void {
    this.#violation ??= { kind, detail };
    stop(detail);
  }

  #init(ev: Json, stop: (reason: string) => void): void {
    this.#initSeen = true;
    this.sessionId = str(ev.session_id);
    const listed = Array.isArray(ev.tools) ? ev.tools.map(String) : null;
    const want = new Set(this.#opts.expectedTools);
    // Fail closed: one tool too many (a built-in such as Bash) and the model could act on the
    // learner's machine; one too few and the MCP wiring is broken. Either way, not a tutor turn.
    const got = new Set(listed ?? []);
    if (
      listed === null ||
      got.size !== want.size ||
      listed.length !== want.size ||
      !listed.every((t) => want.has(t))
    ) {
      this.#fail("internal", `unexpected tool surface: [${(listed ?? []).join(", ")}]`, stop);
      return;
    }
    // This backend is the subscription login. A CLI that found an API key somewhere would bill
    // per token while Oak says "included in your Claude plan".
    const keySource = str(ev.apiKeySource);
    if (keySource !== null && keySource !== "none") {
      this.#fail("auth", `the CLI is using an API key (apiKeySource: ${keySource})`, stop);
    }
  }

  #streamEvent(se: Json, stop: (reason: string) => void): void {
    const type = str(se.type);
    if (type === "message_start") {
      this.iterations++;
      if (this.iterations > this.#opts.maxIterations) {
        this.#fail("iteration_limit", `more than ${this.#opts.maxIterations} model calls`, stop);
        return;
      }
      this.#calls.push((obj(obj(se.message)?.usage) ?? {}) as WireUsage);
      this.#status("thinking", "Thinking");
    } else if (type === "message_delta") {
      // Carries the final counts of the call that message_start opened.
      const usage = obj(se.usage);
      if (usage && this.#calls.length > 0) this.#calls[this.#calls.length - 1] = usage as WireUsage;
    } else if (type === "content_block_start") {
      const block = obj(se.content_block);
      if (str(block?.type) === "tool_use") {
        const name = (str(block?.name) ?? "").replace(`mcp__${MCP_SERVER_NAME}__`, "");
        this.#status("tool", toolStatusLabel(name));
      }
    } else if (type === "content_block_delta") {
      const delta = obj(se.delta);
      const kind = str(delta?.type);
      if (kind === "text_delta") {
        const text = str(delta?.text) ?? "";
        if (text === "") return;
        this.#status("writing", "Writing");
        this.#opts.emit({ type: "text", data: { delta: text } });
      } else if (kind === "thinking_delta") {
        const thinking = str(delta?.thinking) ?? "";
        if (thinking !== "") this.#opts.emit({ type: "thinking", data: { delta: thinking } });
      }
    }
  }

  /** Feed one stream-json line. Unknown event types are ignored: the CLI adds them freely. */
  push(line: StreamLine, stop: (reason: string) => void): void {
    if (this.#violation) return;
    const type = str(line.type);
    if (type === "system" && line.subtype === "init") {
      this.#init(line, stop);
    } else if (type === "stream_event") {
      const se = obj(line.event);
      // Nothing from a model is forwarded before the tool surface has been checked.
      if (!this.#initSeen) this.#fail("internal", "stream event before init", stop);
      else if (se) this.#streamEvent(se, stop);
    } else if (type === "assistant") {
      const error = str(line.error) ?? str(obj(line.message)?.error);
      if (error !== null) this.#assistantError = error;
    } else if (type === "rate_limit_event") {
      this.#rateLimit = obj(line.rate_limit_info);
    } else if (type === "result") {
      this.#result = line;
    }
  }

  /**
   * Tokens of this run. `result.usage` is the CLI's own total; without a result (a killed run) the
   * per-call counts seen so far stand in. `total_cost_usd` is never read: it is a cumulative
   * list-price figure, and on a subscription it is not a bill (spike S8, gotcha 4).
   */
  usage(): UsageSummary {
    const model = this.#opts.model;
    const total = obj(this.#result?.usage);
    let usage: UsageSummary;
    if (total) usage = callUsage("claude-cli", total as WireUsage, model, this.iterations);
    else {
      usage = this.#calls
        .map((c) => callUsage("claude-cli", c, model))
        .reduce(addUsage, emptyUsage("claude-cli"));
    }
    const served = Object.keys(obj(this.#result?.modelUsage) ?? {});
    if (served.length > 0) usage.servedBy = served;
    else if (this.iterations === 0) usage.servedBy = [];
    return usage;
  }

  #retryAfterSec(): number | undefined {
    const at = this.#rateLimit?.resetsAt;
    if (typeof at !== "number") return undefined;
    const secs = Math.ceil(at - (this.#opts.nowMs ?? Date.now)() / 1000);
    return secs > 0 ? secs : undefined;
  }

  /** How the run ended. Called once, after the process has exited. */
  finish(proc: ProcessResult): Verdict {
    const failed = (kind: TutorErrorKind, detail: string, retryAfterSec?: number): Verdict => ({
      ok: false,
      error: errorInfo(kind, retryAfterSec),
      detail: redactSecrets(`${detail} (exit ${proc.exitCode}) ${proc.stderr.slice(-600)}`.trim()),
    });
    // A Stop wins over everything it caused, as in `classifyThrown`.
    if (proc.aborted) return failed("aborted", "stopped by the learner");
    if (this.#violation) return failed(this.#violation.kind, this.#violation.detail);
    if (proc.timedOut) return failed("network", "timed out");
    if (proc.spawnError) return failed("internal", `could not start claude: ${proc.spawnError.code ?? ""}`);
    if (proc.stopped) return failed("internal", proc.stopped);

    const result = this.#result;
    const base = { exitCode: proc.exitCode, aborted: false };
    if (result === null) {
      // A killed or crashed process leaves no result event (spike S8, gotcha 7).
      const kind = classifyCliExit({
        ...base,
        sawResult: false,
        resultIsError: false,
        resultSubtype: null,
        text: proc.stderr,
      });
      return failed(kind ?? "internal", "stream ended without a result event");
    }

    const subtype = str(result.subtype);
    const text = [str(result.result), JSON.stringify(result.errors ?? ""), proc.stderr].join(" ");
    const limited = str(this.#rateLimit?.status) === "rejected";
    const inBand = this.#assistantError;
    if (
      result.is_error === true ||
      (subtype !== null && subtype !== "success") ||
      inBand !== null ||
      limited
    ) {
      const status = typeof result.api_error_status === "number" ? result.api_error_status : 0;
      let kind: TutorErrorKind | null = null;
      if (limited) kind = "rate_limit";
      else if (status >= 400) kind = classifyHttpStatus(status);
      else if (inBand !== null && ASSISTANT_ERRORS[inBand]) kind = ASSISTANT_ERRORS[inBand];
      kind ??=
        classifyCliExit({ ...base, sawResult: true, resultIsError: true, resultSubtype: subtype, text }) ??
        "internal";
      return failed(
        kind,
        `error result (${subtype}, ${inBand})`,
        kind === "rate_limit" ? this.#retryAfterSec() : undefined,
      );
    }

    const stop = str(result.stop_reason);
    if (stop === "refusal") return failed("refusal", "refusal");
    // A structured answer is delivered through a tool call, so `tool_use` is a normal ending there.
    const stopReason: StopReason =
      stop === "end_turn" || stop === "tool_use"
        ? "end_turn"
        : stop === "max_tokens" || stop === "stop_sequence"
          ? stop
          : "other";
    return {
      ok: true,
      stopReason,
      structuredOutput: result.structured_output,
      resultText: str(result.result),
    };
  }
}
