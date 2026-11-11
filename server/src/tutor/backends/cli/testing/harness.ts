// Everything an end-to-end test of the CLI backend needs, with nothing real behind it: the fake
// `claude` (fake-claude.ts), the real MCP endpoint on a loopback port, the real backend wired to
// both, and the core's fake ports. No network beyond 127.0.0.1, no real CLI, no `~/.oak`.
// Test code only.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import type { TutorEvent } from "../../../events.ts";
import { prepareTurn } from "../../../prepare.ts";
import { runTurn } from "../../../run.ts";
import { runReview } from "../../../run-review.ts";
import { type FakePorts, makePorts, type Overrides, override } from "../../../testing/fakes.ts";
import { GRADE, LEARNER_CODE, LESSON_ID, STEP_ID } from "../../../testing/fixtures.ts";
import type { TurnRequest } from "../../../types.ts";
import { type ClaudeCliBackend, type ClaudeCliDeps, createClaudeCliBackend } from "../index.ts";
import { createMcpEndpoint, type RecordedToolResult, TurnRegistry } from "../mcp.ts";
import type { FakeLogEntry, FakeRun, Scenario } from "./scenario.ts";

export const FAKE_CLAUDE = join(import.meta.dir, "fake-claude.ts");
/** Must never reach a child process: the fake refuses to run if it does. */
export const PARENT_API_KEY = "sk-ant-api03-parent-process-key-000000";
const MOUNT = "/mcp/tutor";

export type StartEntry = Extract<FakeLogEntry, { type: "start" }>;
export type McpEntry = Extract<FakeLogEntry, { type: "mcp" }>;

export interface Harness {
  ports: FakePorts;
  backend: ClaudeCliBackend;
  registry: TurnRegistry;
  mcpUrl: string;
  /** The directory the CLI was told to run in. */
  cwd: string;
  /** The base environment the backend was given (it points the fake at this harness's scenario). */
  env: Record<string, string | undefined>;
  /** Every tool result the endpoint returned to "the model", across all turns. */
  toolResults: RecordedToolResult[];
  /** Diagnostic lines the backend logged. */
  logs: string[];
  setRuns(runs: FakeRun[]): void;
  /** What the fake received, one entry per `claude -p` invocation. */
  starts(): StartEntry[];
  mcpLog(): McpEntry[];
  probes(): Extract<FakeLogEntry, { type: "probe" }>[];
  turn(over?: Overrides<TurnRequest>, signal?: AbortSignal, onEvent?: (e: TutorEvent) => void): Promise<Turn>;
  review(request: TurnRequest): Promise<Turn>;
  stop(): void;
}

export interface Turn {
  events: TutorEvent[];
  result: Awaited<ReturnType<typeof runTurn>>;
  /** The streamed text, as the panel would have assembled it. */
  text: string;
}

export const LESSON_THREAD = { subjectKind: "lesson", subjectId: LESSON_ID } as const;

export function request(over: Overrides<TurnRequest> = {}): TurnRequest {
  return override<TurnRequest>(
    {
      thread: LESSON_THREAD,
      kind: "chat",
      userText: "Just tell me the exact code that passes.",
      learnerCode: LEARNER_CODE,
      graderResult: GRADE,
      stepId: STEP_ID,
    },
    over,
  );
}

export function startHarness(scenario: Scenario, deps: Partial<ClaudeCliDeps> = {}): Harness {
  const dir = mkdtempSync(join(tmpdir(), "oak-cli-test-"));
  const cwd = join(dir, "tutor-cwd");
  const logPath = join(dir, "log.jsonl");
  const save = (s: Scenario) => writeFileSync(join(dir, "scenario.json"), JSON.stringify(s));
  let current = scenario;
  save(current);
  // A fresh checkout may have lost the execute bit; the backend starts the script directly.
  chmodSync(FAKE_CLAUDE, 0o755);

  const toolResults: RecordedToolResult[] = [];
  const registry = new TurnRegistry((r) => toolResults.push(r));
  const endpoint = createMcpEndpoint({ registry });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: new Hono().route(MOUNT, endpoint.app).fetch,
  });
  const mcpUrl = `http://127.0.0.1:${server.port}${MOUNT}`;

  const logs: string[] = [];
  const ports = makePorts();
  const env = { ...process.env, OAK_FAKE_CLAUDE: dir, ANTHROPIC_API_KEY: PARENT_API_KEY };
  const backend = createClaudeCliBackend({
    registry,
    mcpUrl,
    claudePath: FAKE_CLAUDE,
    cwd,
    env,
    log: (line) => logs.push(line),
    ...deps,
  });

  const entries = (): FakeLogEntry[] =>
    existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .split("\n")
          .filter((l) => l !== "")
          .map((l) => JSON.parse(l) as FakeLogEntry)
      : [];

  const collect = async (
    run: (emit: (e: TutorEvent) => void) => Promise<Turn["result"]>,
    onEvent?: (e: TutorEvent) => void,
  ): Promise<Turn> => {
    const events: TutorEvent[] = [];
    const result = await run((e) => {
      events.push(e);
      onEvent?.(e);
    });
    const text = events.map((e) => (e.type === "text" ? e.data.delta : "")).join("");
    return { events, result, text };
  };

  return {
    ports,
    backend,
    registry,
    mcpUrl,
    cwd,
    env,
    toolResults,
    logs,
    setRuns(runs) {
      current = { ...current, runs };
      save(current);
      // The fake counts invocations by its log; a new script starts counting again.
      rmSync(logPath, { force: true });
    },
    starts: () => entries().filter((e): e is StartEntry => e.type === "start"),
    mcpLog: () => entries().filter((e): e is McpEntry => e.type === "mcp"),
    probes: () => entries().filter((e) => e.type === "probe"),
    async turn(over = {}, signal = new AbortController().signal, onEvent) {
      const prep = await prepareTurn(request(over), ports);
      return collect((emit) => runTurn(prep, backend, emit, signal, ports), onEvent);
    },
    async review(req) {
      const prep = await prepareTurn(req, ports);
      return collect((emit) => runReview(prep, backend, emit, new AbortController().signal, ports));
    },
    stop() {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** The value of a flag in a recorded command line. */
export function flag(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i < 0 ? undefined : argv[i + 1];
}

/** Everything one invocation sent towards the model apart from the fixed system prompt. */
export function sentUpstream(h: Harness): string {
  return [...h.starts().map((s) => s.stdin), ...h.toolResults.map((r) => r.content)].join("\n");
}
