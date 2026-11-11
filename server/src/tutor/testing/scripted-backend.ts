// A TutorBackend that plays a script instead of calling a model. It records everything a real
// backend would be able to send upstream (prefix, user turn, transcript, tool results), which is
// exactly the surface the redaction tests scan. Test code only.
import { renderUserTurn } from "../context.ts";
import type { TutorErrorKind } from "../errors.ts";
import { errorInfo, TutorError } from "../errors.ts";
import type { TutorEvent, UsageSummary } from "../events.ts";
import { prefixBytes } from "../prompt/persona.ts";
import type {
  BackendId,
  BackendTurn,
  Emit,
  StructuredTurn,
  ToolResult,
  TurnOutcome,
  TutorBackend,
} from "../types.ts";
import { callUsage, sumUsage } from "../usage.ts";

export type ScriptStep =
  | { text: string }
  | { thinking: string }
  | { tool: { name: string; input: unknown; id?: string; announce?: boolean } }
  | { emit: TutorEvent }
  | { fail: TutorErrorKind }
  | { throws: unknown };

const WIRE = {
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 1_000,
  cache_creation_input_tokens: 0,
};

export class ScriptedBackend implements TutorBackend {
  readonly id: BackendId;
  script: ScriptStep[];
  /** For runStructured: the objects the "model" delivers, in order. */
  deliveries: unknown[] = [];
  /** `tool`: deliver through the submit tool (API channel). `direct`: through validate (CLI channel). */
  channel: "tool" | "direct" = "tool";
  isAvailable: { ok: boolean; reason?: string } = { ok: true };

  readonly turns: BackendTurn[] = [];
  readonly toolResults: { name: string; input: unknown; result: ToolResult }[] = [];

  constructor(id: BackendId = "anthropic-api", script: ScriptStep[] = []) {
    this.id = id;
    this.script = script;
  }

  async available(): Promise<{ ok: boolean; reason?: string }> {
    return this.isAvailable;
  }

  #usage(n = 1): { usage: UsageSummary; calls: UsageSummary[] } {
    const calls = Array.from({ length: n }, () => callUsage(this.id, WIRE, "claude-opus-5-5"));
    return { usage: sumUsage(this.id, calls), calls };
  }

  async runTurn(input: BackendTurn, emit: Emit, signal: AbortSignal): Promise<TurnOutcome> {
    this.turns.push(input);
    let n = 0;
    let iterations = 1;
    for (const step of this.script) {
      if (signal.aborted)
        return { status: "failed", error: errorInfo("aborted"), iterations, ...this.#usage(iterations) };
      if ("text" in step) emit({ type: "text", data: { delta: step.text } });
      else if ("thinking" in step) emit({ type: "thinking", data: { delta: step.thinking } });
      else if ("emit" in step) emit(step.emit);
      else if ("throws" in step) throw step.throws;
      else if ("fail" in step) {
        await input.continuity.commit([{ turn: this.turns.length, failed: step.fail }], { excluded: true });
        return { status: "failed", error: errorInfo(step.fail), iterations, ...this.#usage(iterations) };
      } else {
        const id = step.tool.id ?? `tu_${this.turns.length}_${++n}`;
        if (step.tool.announce) emit({ type: "tool_start", data: { toolUseId: id, name: step.tool.name } });
        const result = await input.executeTool({ id, name: step.tool.name, input: step.tool.input }, signal);
        this.toolResults.push({ name: step.tool.name, input: step.tool.input, result });
        iterations++;
      }
    }
    await input.continuity.commit([{ turn: this.turns.length, user: renderUserTurn(input.user) }]);
    return { status: "completed", stopReason: "end_turn", iterations, ...this.#usage(iterations) };
  }

  async runStructured<T>(
    input: StructuredTurn<T>,
    signal: AbortSignal,
  ): Promise<{ value: T; usage: UsageSummary; calls?: UsageSummary[] }> {
    this.turns.push(input);
    let n = 0;
    for (const raw of this.deliveries.slice(0, input.maxResubmits + 1)) {
      n++;
      if (this.channel === "tool") {
        const call = { id: `tu_s_${n}`, name: input.submitTool, input: raw };
        const result = await input.executeTool(call, signal);
        this.toolResults.push({ name: input.submitTool, input: raw, result });
        const value = input.accepted();
        if (value !== undefined) return { value, ...this.#usage(n) };
      } else {
        const check = await input.validate(raw, signal);
        if (check.ok) return { value: check.value, ...this.#usage(n) };
      }
    }
    throw new TutorError("iteration_limit");
  }

  /** Everything this backend was given and could have sent to a model, as one searchable string. */
  upstreamText(opts: { prefix?: boolean } = {}): string {
    const parts: string[] = [];
    for (const t of this.turns) {
      if (opts.prefix !== false) parts.push(prefixBytes(t.prefix, t.tools));
      parts.push(renderUserTurn(t.user), JSON.stringify(t.transcript));
      parts.push(JSON.stringify(t.continuity.records));
    }
    for (const r of this.toolResults) parts.push(r.result.content);
    return parts.join("\n");
  }
}
