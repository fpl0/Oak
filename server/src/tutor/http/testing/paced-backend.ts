// A TutorBackend that plays a script WITH TIME IN IT: it can wait between deltas (so a heartbeat
// has room to appear) and it records the abort signal it was given (so a test can see a client
// disconnect arrive). The model-free reference backend without pacing is
// ../../testing/scripted-backend.ts. Test code only.
import { errorInfo, TutorError } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import type {
  BackendId,
  BackendTurn,
  Emit,
  StructuredTurn,
  TurnOutcome,
  TutorBackend,
  WarmInput,
} from "../../types.ts";
import { callUsage, sumUsage } from "../../usage.ts";

export type PacedStep =
  | { text: string }
  /** Milliseconds of silence. Ends early when the turn is aborted. */
  | { wait: number }
  /** Silence until the test resolves the promise, or the turn is aborted. */
  | { until: Promise<unknown> }
  | { tool: { name: string; input: unknown } };

const WIRE = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1_000 };

export class PacedBackend implements TutorBackend {
  readonly id: BackendId;
  steps: PacedStep[];
  isAvailable: { ok: boolean; reason?: string } = { ok: true };
  availableCalls = 0;
  /** Set to make `warm` reject. */
  warmError: unknown = null;
  readonly warmCalls: WarmInput[] = [];
  readonly turns: BackendTurn[] = [];
  /** Per turn: when it started and ended, by a shared counter, to prove turns did not interleave. */
  readonly spans: { conversationId: string; start: number; end: number }[] = [];
  #tick = 0;
  #abortSeen!: () => void;
  /** Resolves when any turn's signal fires. */
  readonly aborted = new Promise<void>((resolve) => {
    this.#abortSeen = resolve;
  });

  constructor(id: BackendId = "anthropic-api", steps: PacedStep[] = []) {
    this.id = id;
    this.steps = steps;
  }

  async available(): Promise<{ ok: boolean; reason?: string }> {
    this.availableCalls++;
    return this.isAvailable;
  }

  async warm(input: WarmInput): Promise<void> {
    this.warmCalls.push(input);
    if (this.warmError !== null) throw this.warmError;
  }

  #usage(n: number): { usage: UsageSummary; calls: UsageSummary[] } {
    const calls = Array.from({ length: n }, () => callUsage(this.id, WIRE, "claude-opus-5-5"));
    return { usage: sumUsage(this.id, calls), calls };
  }

  async runTurn(input: BackendTurn, emit: Emit, signal: AbortSignal): Promise<TurnOutcome> {
    this.turns.push(input);
    const span = { conversationId: input.conversationId, start: ++this.#tick, end: 0 };
    this.spans.push(span);
    const gone = new Promise<void>((resolve) => {
      if (signal.aborted) resolve();
      else signal.addEventListener("abort", () => resolve(), { once: true });
    });
    void gone.then(() => this.#abortSeen());
    let n = 0;
    try {
      for (const step of this.steps) {
        if (signal.aborted) break;
        if ("text" in step) emit({ type: "text", data: { delta: step.text } });
        else if ("wait" in step) await Promise.race([Bun.sleep(step.wait), gone]);
        else if ("until" in step) await Promise.race([step.until, gone]);
        else await input.executeTool({ id: `tu_${this.turns.length}_${++n}`, ...step.tool }, signal);
      }
      if (signal.aborted) {
        await input.continuity.commit([{ aborted: true }], { excluded: true });
        return { status: "failed", error: errorInfo("aborted"), iterations: 1, ...this.#usage(1) };
      }
      await input.continuity.commit([{ turn: this.turns.length }]);
      return { status: "completed", stopReason: "end_turn", iterations: n + 1, ...this.#usage(n + 1) };
    } finally {
      span.end = ++this.#tick;
    }
  }

  async runStructured<T>(_input: StructuredTurn<T>): Promise<{ value: T; usage: UsageSummary }> {
    throw new TutorError("internal", { detail: "PacedBackend does not write reviews" });
  }
}
