// What a test tells the fake `claude` to do. Shared by fake-claude.ts (which reads it from
// `$OAK_FAKE_CLAUDE/scenario.json`) and harness.ts (which writes it). Test code only.

export interface ScriptedCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** One `claude -p` invocation. The n-th invocation takes the n-th run; the last run repeats. */
export interface FakeRun {
  /** A recording in `fixtures/`, replayed line by line. */
  fixture?: string;
  /** Events to replay instead of a fixture. */
  events?: Record<string, unknown>[];
  /**
   * Real `tools/call` requests against the endpoint named in `--mcp-config`, one at each tool-use
   * message of the recording; any left over are made just before the first text or the result.
   */
  calls?: ScriptedCall[];
  /** Replace the init event's tool list (default: what `tools/list` returned, as the real CLI does). */
  initTools?: string[];
  initPatch?: Record<string, unknown>;
  /** Wait after the init event, as the real CLI does while the first model call is on its way. */
  pauseAfterInitMs?: number;
  resultPatch?: Record<string, unknown>;
  /** Replace `result.structured_output` (and the result text) on a `--json-schema` run. */
  structuredOutput?: unknown;
  /** Leave the result event out, as a crashed process would. */
  dropResult?: boolean;
  /** Stop replaying after this many lines. */
  truncateAfter?: number;
  /** After this many lines, write nothing more and stay alive until killed. */
  hangAfter?: number;
  /** With `--resume`: fail the way a missing session file does (stderr, exit 1, no output). */
  failResume?: boolean;
  exitCode?: number;
  stderr?: string;
}

export interface Scenario {
  runs: FakeRun[];
  /** `claude --version`. */
  version?: { stdout?: string; exitCode?: number; hang?: boolean };
  /** `claude auth status`: the JSON it prints, or raw text. */
  auth?: { json?: unknown; raw?: string; exitCode?: number; hang?: boolean };
}

export type FakeLogEntry =
  | {
      type: "start";
      index: number;
      argv: string[];
      stdin: string;
      cwd: string;
      /** Names of Anthropic credential variables the child could see. Must stay empty. */
      credentials: string[];
    }
  | { type: "mcp"; index: number; method: string; name: string | null; status: number; body: string }
  | { type: "probe"; argv: string[]; credentials: string[] };
