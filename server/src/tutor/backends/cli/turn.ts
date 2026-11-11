// One model turn on the CLI, shared by the streamed turns and the structured ones: open the
// per-turn MCP token, build the command line, run the process through the translator, close the
// token, and start over once from Oak's transcript if the session could not be resumed.
import { errorInfo } from "../../errors.ts";
import type { UsageSummary } from "../../events.ts";
import { systemText } from "../../prompt/persona.ts";
import { LEARNER_TOOL_NAMES } from "../../tools/defs.ts";
import type { BackendTurn, Emit } from "../../types.ts";
import { addUsage } from "../../usage.ts";
import { type ArgvInput, argvBytes, buildArgv, expectedTools, MAX_ARGV_BYTES } from "./argv.ts";
import type { RecordedToolResult, TurnRegistry } from "./mcp.ts";
import { runClaude, type SpawnFn } from "./process.ts";
import { freshPlan, resumeFailed, type SessionPlan } from "./session.ts";
import { StreamTranslator, type Verdict } from "./translate.ts";

/** What a backend instance is wired to. Resolved lazily, so settings can change between turns. */
export interface CliRuntime {
  claudePath: string;
  spawn: SpawnFn | undefined;
  cwd(): Promise<string>;
  env(): Record<string, string>;
  mcpUrl(): string;
  mcpHeaders: Readonly<Record<string, string>> | undefined;
  registry: TurnRegistry;
  makeSessionId(): string;
  /** Diagnostics for the server log. Already scrubbed; never carries a prompt or a reply. */
  log(line: string): void;
}

export interface RunSpec {
  input: BackendTurn;
  plan: SessionPlan;
  /** The stdin prompt for a plan. Asked again with a fresh plan when `--resume` fails. */
  prompt(plan: SessionPlan): string;
  /** Present on a structured turn: no MCP server, no tools, the answer in `structured_output`. */
  jsonSchema?: Readonly<Record<string, unknown>>;
  emit: Emit;
  signal: AbortSignal;
  timeoutMs: number;
}

export interface RunReport {
  /** The plan that was finally run: not the one passed in when the session had to be restarted. */
  plan: SessionPlan;
  verdict: Verdict;
  usage: UsageSummary;
  iterations: number;
  toolResults: readonly RecordedToolResult[];
}

async function once(
  rt: CliRuntime,
  spec: RunSpec,
  plan: SessionPlan,
): Promise<RunReport & { clean: boolean }> {
  const { input } = spec;
  // The CLI gets the five learner tools. Reviews do not use the submit tools here: their channel
  // is `--json-schema`, which runs without any tool at all.
  const tools = input.tools.filter((t) => LEARNER_TOOL_NAMES.includes(t.name));
  const handle = spec.jsonSchema
    ? null
    : rt.registry.open({ tools, executeTool: input.executeTool, signal: spec.signal });
  // The token is revoked the moment the turn is over in Oak's eyes (a Stop, a failed check), not
  // when the process has finished dying: no tool may run in between.
  const revoke = () => handle?.close();
  spec.signal.addEventListener("abort", revoke, { once: true });
  try {
    const argvInput: ArgvInput = {
      claudePath: rt.claudePath,
      model: input.model,
      effort: input.effort,
      systemPrompt: systemText(input.prefix),
      session: { mode: plan.mode, sessionId: plan.sessionId },
      mcp: handle
        ? {
            url: rt.mcpUrl(),
            turnToken: handle.token,
            toolNames: tools.map((t) => t.name),
            ...(rt.mcpHeaders ? { headers: rt.mcpHeaders } : {}),
          }
        : null,
      ...(spec.jsonSchema ? { jsonSchema: spec.jsonSchema } : {}),
    };
    const argv = buildArgv(argvInput);
    const translator = new StreamTranslator({
      expectedTools: expectedTools(argvInput),
      maxIterations: input.limits.maxIterations,
      model: input.model,
      emit: spec.emit,
    });
    if (argvBytes(argv) > MAX_ARGV_BYTES) {
      const verdict: Verdict = {
        ok: false,
        error: errorInfo("bad_request"),
        detail: "the system prompt is too large for a command line",
      };
      return { plan, verdict, usage: translator.usage(), iterations: 0, toolResults: [], clean: false };
    }
    const proc = await runClaude({
      argv,
      stdin: spec.prompt(plan),
      cwd: await rt.cwd(),
      env: rt.env(),
      ...(rt.spawn ? { spawn: rt.spawn } : {}),
      timeoutMs: spec.timeoutMs,
      signal: spec.signal,
      onLine: (line, stop) => {
        translator.push(line, stop);
        if (translator.violated) revoke();
      },
    });
    return {
      plan,
      verdict: translator.finish(proc),
      usage: translator.usage(),
      iterations: translator.iterations,
      toolResults: handle ? [...handle.results] : [],
      clean:
        !translator.violated && !proc.aborted && !proc.timedOut && !proc.spawnError && proc.stopped === null,
    };
  } finally {
    // The token dies with the process: a late or replayed tool call finds no turn.
    spec.signal.removeEventListener("abort", revoke);
    revoke();
  }
}

export async function runOnSession(rt: CliRuntime, spec: RunSpec): Promise<RunReport> {
  const first = await once(rt, spec, spec.plan);
  const failed = resumeFailed({
    plan: first.plan,
    errorKind: first.verdict.ok ? null : first.verdict.error.kind,
    clean: first.clean,
    iterations: first.iterations,
    toolCalls: first.toolResults.length,
  });
  if (!failed) return first;
  // Nothing was shown and nothing ran, so starting again is invisible to the learner.
  rt.log(
    `claude-cli: session could not be resumed, restarting from the transcript (${detailOf(first.verdict)})`,
  );
  const again = await once(rt, spec, freshPlan(spec.input.transcript, rt.makeSessionId));
  return { ...again, usage: addUsage(first.usage, again.usage) };
}

export function detailOf(verdict: Verdict): string {
  return verdict.ok ? "ok" : `${verdict.error.kind}: ${verdict.detail}`;
}
