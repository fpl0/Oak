// The `claude-cli` backend: one `claude -p` process per turn, on the learner's own Claude login.
// No built-in tools; Oak's tools over a local MCP endpoint, bound to the turn by a token.
//
// Where the pieces are: argv.ts (the command line), process.ts (the child), translate.ts
// (stream-json -> TutorEvents, fail-closed checks, error kinds), mcp.ts (the tool endpoint),
// session.ts (continuity), turn.ts (one run), structured.ts (reviews), detect.ts (is it there?).
import { homedir } from "node:os";
import { redactSecrets } from "../../errors.ts";
import type { BackendTurn, Emit, StructuredTurn, TurnOutcome, TutorBackend } from "../../types.ts";
import { createDetector, type Detector, type ExecFn, execWith } from "./detect.ts";
import type { TurnRegistry } from "./mcp.ts";
import { childEnv, DEFAULT_CWD, ensureCwd, type SpawnFn } from "./process.ts";
import { newSessionId, planSession, renderPrompt, sessionRecord } from "./session.ts";
import { runStructuredCli } from "./structured.ts";
import { type CliRuntime, detailOf, runOnSession } from "./turn.ts";

export { createMcpEndpoint, type McpEndpointOptions, TurnRegistry } from "./mcp.ts";
export { DEFAULT_CWD } from "./process.ts";

export interface ClaudeCliDeps {
  /** The registry of the mounted MCP endpoint (`createMcpEndpoint().registry`). */
  registry: TurnRegistry;
  /** Where that endpoint is reachable from this machine, e.g. `http://127.0.0.1:8787/mcp/tutor`. */
  mcpUrl: string | (() => string);
  /** Fixed extra headers for the endpoint, e.g. `{ "X-Oak": "1" }` when it is mounted under `/api`. */
  mcpHeaders?: Readonly<Record<string, string>>;
  /** Default `claude`, found on the PATH. */
  claudePath?: string;
  /**
   * The CLI's working directory: where its session files are keyed and the only directory it could
   * see. Default `~/.oak/tutor-cwd`, created on demand. A function is asked before every run, so
   * it can read a setting. `~/` is expanded.
   */
  cwd?: string | (() => string | Promise<string>);
  /** Base environment of the child. The Anthropic credentials are removed from it in any case. */
  env?: Record<string, string | undefined>;
  spawn?: SpawnFn;
  exec?: ExecFn;
  /** One process run of a streamed turn. Default 3 minutes. */
  timeoutMs?: number;
  /** One process run of a review (effort high, one long answer). Default 6 minutes. */
  structuredTimeoutMs?: number;
  newSessionId?: () => string;
  /** Server-log sink for diagnostics. Lines are scrubbed of credentials and the turn token. */
  log?: (line: string) => void;
}

export const TURN_TIMEOUT_MS = 180_000;
export const STRUCTURED_TIMEOUT_MS = 360_000;

export interface ClaudeCliBackend extends TutorBackend {
  readonly id: "claude-cli";
  /** For Settings -> Tutor: version, auth method, and `reset()` after the learner logs in. */
  readonly detector: Detector;
}

export function createClaudeCliBackend(deps: ClaudeCliDeps): ClaudeCliBackend {
  const claudePath = deps.claudePath ?? "claude";
  const cwd = async (): Promise<string> => {
    const dir = (typeof deps.cwd === "function" ? await deps.cwd() : deps.cwd) ?? DEFAULT_CWD;
    return ensureCwd(dir.startsWith("~/") ? `${homedir()}${dir.slice(1)}` : dir);
  };
  const env = () => childEnv(deps.env ?? process.env);
  const log = (line: string) => deps.log?.(redactSecrets(line));

  const rt: CliRuntime = {
    claudePath,
    spawn: deps.spawn,
    cwd,
    env,
    mcpUrl: () => (typeof deps.mcpUrl === "function" ? deps.mcpUrl() : deps.mcpUrl),
    mcpHeaders: deps.mcpHeaders,
    registry: deps.registry,
    makeSessionId: deps.newSessionId ?? newSessionId,
    log,
  };
  const detector = createDetector({
    claudePath,
    cwd,
    env,
    exec: deps.exec ?? execWith(deps.spawn),
  });

  async function runTurn(input: BackendTurn, emit: Emit, signal: AbortSignal): Promise<TurnOutcome> {
    const report = await runOnSession(rt, {
      input,
      plan: planSession(input.continuity, input.transcript, rt.makeSessionId),
      prompt: (plan) => renderPrompt(input.user, plan),
      emit,
      signal,
      timeoutMs: deps.timeoutMs ?? TURN_TIMEOUT_MS,
    });
    const { verdict, usage, iterations } = report;
    // One record per turn. A turn that did not complete retires its session (session.ts).
    await input.continuity.commit([sessionRecord(report.plan, verdict.ok)]);
    const calls = usage.requests > 0 ? [usage] : [];
    if (verdict.ok) {
      emit({ type: "usage", data: usage });
      return { status: "completed", stopReason: verdict.stopReason, iterations, usage, calls };
    }
    if (verdict.error.kind !== "aborted") log(`claude-cli: turn failed (${detailOf(verdict)})`);
    // The login may have expired since the last probe: ask again before the next selection.
    if (verdict.error.kind === "auth") detector.reset();
    return { status: "failed", error: verdict.error, iterations, usage, calls };
  }

  return {
    id: "claude-cli",
    detector,
    available: () => detector.available(),
    runTurn,
    runStructured: <T>(input: StructuredTurn<T>, signal: AbortSignal) =>
      runStructuredCli(rt, deps.structuredTimeoutMs ?? STRUCTURED_TIMEOUT_MS, input, signal),
    // No `warm`: the CLI caches its prefix by itself, with a one-hour TTL (spike S8).
  };
}
