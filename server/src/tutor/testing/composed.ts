// The whole tutor as the server will run it, for end-to-end tests: `createDefaultTutor` on a real
// Bun.serve socket (127.0.0.1, ephemeral port), in-memory ports, the fake `claude` executable in
// place of the CLI and a cassette `fetch` in place of api.anthropic.com. Nothing leaves the
// machine and no real CLI is started. Test code only.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Cassette } from "../backends/api/cassettes/builders.ts";
import {
  CASSETTE_BASE_URL,
  CASSETTE_KEY,
  cassetteFetch,
  type WireRequest,
} from "../backends/api/cassettes/fake-fetch.ts";
import type { FakeLogEntry, FakeRun, Scenario } from "../backends/cli/testing/scenario.ts";
import { createDefaultTutor, type DefaultTutor, type DefaultTutorDeps } from "../compose.ts";
import { type ParsedSse, SseParser } from "../events.ts";
import type { TutorLogEntry } from "../service-types.ts";
import { type FakePorts, makePorts } from "./fakes.ts";

const FAKE_CLAUDE = join(import.meta.dir, "..", "backends", "cli", "testing", "fake-claude.ts");
/** Sits in the fake CLI's parent environment; the fake refuses to run if it ever sees it. */
export const PARENT_ENV_KEY = "sk-ant-api03-parent-environment-key-0000";

export type StartEntry = Extract<FakeLogEntry, { type: "start" }>;
export type McpEntry = Extract<FakeLogEntry, { type: "mcp" }>;

export interface ComposedOptions {
  /** What each `claude -p` invocation replays. */
  runs?: FakeRun[];
  auth?: Scenario["auth"];
  /** Serves the API backend. Without one, any API request fails the test's turn. */
  cassette?: Cassette;
  /** Default: no key, so `auto` selects the CLI. Pass `CASSETTE_KEY` to select the API. */
  apiKey?: DefaultTutorDeps["apiKey"];
  ports?: FakePorts;
  over?: Partial<DefaultTutorDeps>;
}

export interface SseResult {
  status: number;
  frames: ParsedSse[];
  events: string[];
  text: string;
  /** Everything the server wrote, exactly as it arrived. */
  raw: string;
}

export interface Composed {
  base: string;
  ports: FakePorts;
  tutor: DefaultTutor;
  logs: TutorLogEntry[];
  /** Every request the API backend sent, as serialised. */
  wire: WireRequest[];
  setRuns(runs: FakeRun[]): void;
  starts(): StartEntry[];
  mcpLog(): McpEntry[];
  /** Headers of a same-origin browser tab. */
  headers(): Record<string, string>;
  post(path: string, body?: unknown, headers?: Record<string, string>): Promise<Response>;
  get(path: string, headers?: Record<string, string>): Promise<Response>;
  /** POST a turn and read the stream to its end. */
  sse(path: string, body: unknown, signal?: AbortSignal): Promise<SseResult>;
  stop(): void;
}

export { CASSETTE_KEY };

export function startComposed(opts: ComposedOptions = {}): Composed {
  const dir = mkdtempSync(join(tmpdir(), "oak-composed-"));
  const logPath = join(dir, "log.jsonl");
  let scenario: Scenario = { runs: opts.runs ?? [], ...(opts.auth ? { auth: opts.auth } : {}) };
  const save = () => writeFileSync(join(dir, "scenario.json"), JSON.stringify(scenario));
  save();
  // A fresh checkout may have lost the execute bit; the backend starts the script directly.
  chmodSync(FAKE_CLAUDE, 0o755);

  const ports = opts.ports ?? makePorts();
  const logs: TutorLogEntry[] = [];
  const transport = cassetteFetch(opts.cassette ?? { name: "none", responses: [] });

  let handle: (req: Request, server: Bun.Server<undefined>) => Response | Promise<Response> = () =>
    new Response(null, { status: 503 });
  // The port is only known once the socket is bound, and the tutor needs it for its allowlist.
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: (req, srv) => handle(req, srv) });
  const port = server.port as number;
  const base = `http://127.0.0.1:${port}`;

  const tutor = createDefaultTutor({
    ports,
    port,
    apiKey: opts.apiKey ?? null,
    api: { fetch: transport.fetch, baseURL: CASSETTE_BASE_URL, maxRetries: 0 },
    cli: {
      claudePath: FAKE_CLAUDE,
      cwd: join(dir, "tutor-cwd"),
      env: { ...process.env, OAK_FAKE_CLAUDE: dir, ANTHROPIC_API_KEY: PARENT_ENV_KEY },
    },
    log: (e) => logs.push(e),
    heartbeatMs: 50,
    ...opts.over,
  });
  // Bun hands its server to fetch as the second argument; Hono exposes it as `c.env`.
  handle = (req, srv) => tutor.app.fetch(req, srv);

  const entries = (): FakeLogEntry[] =>
    existsSync(logPath)
      ? readFileSync(logPath, "utf8")
          .split("\n")
          .filter((l) => l !== "")
          .map((l) => JSON.parse(l) as FakeLogEntry)
      : [];
  const headers = () => ({ origin: base, "x-oak": "1", "content-type": "application/json" });

  const post: Composed["post"] = (path, body, h = headers()) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: h,
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });

  return {
    base,
    ports,
    tutor,
    logs,
    wire: transport.wire,
    setRuns(runs) {
      scenario = { ...scenario, runs };
      save();
      // The fake counts invocations by its log; a new script starts counting again.
      rmSync(logPath, { force: true });
    },
    starts: () => entries().filter((e): e is StartEntry => e.type === "start"),
    mcpLog: () => entries().filter((e): e is McpEntry => e.type === "mcp"),
    headers,
    post,
    get: (path, h = headers()) => fetch(`${base}${path}`, { headers: h }),
    async sse(path, body, signal) {
      const res = await fetch(`${base}${path}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
      const parser = new SseParser();
      const frames: ParsedSse[] = [];
      let raw = "";
      if (res.body) {
        const dec = new TextDecoder();
        for await (const chunk of res.body) {
          const text = dec.decode(chunk, { stream: true });
          raw += text;
          frames.push(...parser.push(text));
        }
      }
      const text = frames
        .map((f) => (f.event === "text" ? (f.data as { delta: string }).delta : ""))
        .join("");
      return { status: res.status, frames, events: frames.map((f) => f.event), text, raw };
    },
    stop() {
      server.stop(true);
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
