// The one place the `claude` command line is assembled (spike S8, "The command line that works").
// Every flag here was exercised live in the spike; nothing else is passed. What the flags buy:
//   --tools ""                 no built-in tools at all (no Bash, Read, Edit, WebFetch)
//   --strict-mcp-config        the learner's own MCP servers are ignored
//   --setting-sources ""       no user/project/local settings: no hooks, plugins or memory files
//   --disable-slash-commands   nothing in the prompt can start a command
//   --permission-mode dontAsk  with --permission-prompts none: what is not allowed is denied, silently
// (`--bare` would be simpler but never reads the claude.ai login.)
import type { Effort } from "../../types.ts";

export const MCP_SERVER_NAME = "oak";
export const TURN_HEADER = "X-Oak-Turn";
/** The only tool the CLI lists in a `--json-schema` run (seen live in spike S8, scenario E). */
export const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

/** How the CLI names an MCP tool, in `--allowedTools` and in its init event. */
export function mcpToolName(name: string): string {
  return `mcp__${MCP_SERVER_NAME}__${name}`;
}

export interface McpWiring {
  /** Full URL of Oak's MCP endpoint, e.g. `http://127.0.0.1:8787/mcp/tutor`. */
  url: string;
  /** The per-turn token. It binds every tool call to this turn's server-side rung. */
  turnToken: string;
  /** Bare tool names, in the order they are listed. */
  toolNames: readonly string[];
  /** Extra fixed headers, for a mount point behind the `X-Oak: 1` rule (contracts §11.1). */
  headers?: Readonly<Record<string, string>>;
}

export interface ArgvInput {
  claudePath: string;
  model: string;
  effort: Effort;
  /** Persona, syllabus and catalog as one string (`systemText(prefix)`). Never anything volatile. */
  systemPrompt: string;
  /** `new`: first turn of a CLI session (`--session-id`). `resume`: every later turn (`--resume`). */
  session: { mode: "new" | "resume"; sessionId: string };
  /** `null` for a structured turn: no MCP server and no allowed tools. */
  mcp: McpWiring | null;
  /** A structured turn: the object comes back in `result.structured_output`. */
  jsonSchema?: Readonly<Record<string, unknown>>;
}

/** The names the init event must list for this invocation, and nothing else. */
export function expectedTools(input: Pick<ArgvInput, "mcp" | "jsonSchema">): string[] {
  const tools = input.mcp ? input.mcp.toolNames.map(mcpToolName) : [];
  if (input.jsonSchema) tools.push(STRUCTURED_OUTPUT_TOOL);
  return tools;
}

export function mcpConfig(mcp: McpWiring): string {
  const headers = { ...mcp.headers, [TURN_HEADER]: mcp.turnToken };
  return JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { type: "http", url: mcp.url, headers } } });
}

/** The prompt is not here: it goes in on stdin, so it never shows in a process listing. */
export function buildArgv(input: ArgvInput): string[] {
  const argv = [
    input.claudePath,
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--model",
    input.model,
    "--effort",
    input.effort,
    "--system-prompt",
    input.systemPrompt,
    "--tools",
    "",
    "--strict-mcp-config",
  ];
  if (input.mcp) {
    argv.push("--mcp-config", mcpConfig(input.mcp));
    argv.push("--allowedTools", input.mcp.toolNames.map(mcpToolName).join(","));
  }
  argv.push(
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--permission-mode",
    "dontAsk",
    "--permission-prompts",
    "none",
  );
  argv.push(input.session.mode === "new" ? "--session-id" : "--resume", input.session.sessionId);
  if (input.jsonSchema) argv.push("--json-schema", JSON.stringify(input.jsonSchema));
  return argv;
}

/**
 * The system prompt travels as one argument. macOS allows about 1 MiB for arguments and
 * environment together, so a prefix anywhere near that must fail here, with a reason, instead of
 * as an opaque E2BIG from the spawn.
 */
export const MAX_ARGV_BYTES = 512 * 1024;

export function argvBytes(argv: readonly string[]): number {
  return argv.reduce((n, a) => n + Buffer.byteLength(a, "utf8") + 1, 0);
}
