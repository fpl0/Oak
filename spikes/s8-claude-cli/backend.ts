// Claude CLI tutor backend: one `claude -p` process per turn, stream-json out, translated into
// Oak's app-level TutorEvents. Built-in tools are off; the only tools are Oak's, over MCP.
import { mkdirSync } from "node:fs";
import type { TutorEvent } from "../s6-tutor/events.ts";
import { TOOL_NAMES } from "../s6-tutor/request.ts";

export interface CliTurn {
  prompt: string;
  system: string;
  /** New conversation: pass sessionId. Later turns: pass resume with the same id. */
  sessionId?: string;
  resume?: string;
  mcpUrl: string;
  turnToken: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  jsonSchema?: object;
  /** Skip MCP + tool flags entirely (structured-output route). */
  noTools?: boolean;
  extraArgs?: string[];
  timeoutMs?: number;
}

export interface CliResult {
  events: (TutorEvent & { atMs: number })[];
  raw: unknown[];
  init: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  text: string;
  firstTextMs: number | null;
  firstEventMs: number | null;
  totalMs: number;
  exitCode: number;
  stderr: string;
  argv: string[];
}

// An empty working directory: no project CLAUDE.md, no repo for the CLI to look at.
export const CLI_CWD = "/private/tmp/claude-501/-Users-fpl0-Code-Oak/7d084df9-a37c-4d71-b85d-5b42ed9919ed/scratchpad/oak-tutor-cwd";

export function buildArgv(t: CliTurn): string[] {
  const argv = [
    "claude", "-p",
    "--output-format", "stream-json", "--verbose", "--include-partial-messages",
    "--model", t.model ?? "claude-opus-5-5",
    "--effort", t.effort ?? "medium",
    "--system-prompt", t.system,
    "--tools", "", // no built-in tools at all (no Bash/Read/Edit/WebFetch)
    "--strict-mcp-config", // ignore the user's own MCP servers
    "--setting-sources", "", // ignore user/project/local settings (hooks, plugins, memory)
    "--disable-slash-commands",
    "--permission-mode", "dontAsk",
    "--permission-prompts", "none",
  ];
  if (!t.noTools) {
    const mcp = { mcpServers: { oak: { type: "http", url: t.mcpUrl, headers: { "X-Oak-Turn": t.turnToken } } } };
    argv.push("--mcp-config", JSON.stringify(mcp));
    argv.push("--allowedTools", TOOL_NAMES.map((n) => `mcp__oak__${n}`).join(","));
  }
  if (t.sessionId) argv.push("--session-id", t.sessionId);
  if (t.resume) argv.push("--resume", t.resume);
  if (t.jsonSchema) argv.push("--json-schema", JSON.stringify(t.jsonSchema));
  if (t.extraArgs) argv.push(...t.extraArgs);
  return argv;
}

export async function runCliTurn(t: CliTurn, onEvent?: (e: TutorEvent) => void): Promise<CliResult> {
  mkdirSync(CLI_CWD, { recursive: true });
  const argv = buildArgv(t);
  const t0 = performance.now();
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // this backend is for the logged-in CLI; never mix credentials
  const proc = Bun.spawn(argv, { cwd: CLI_CWD, stdin: new Blob([t.prompt]), stdout: "pipe", stderr: "pipe", env });
  const timer = setTimeout(() => proc.kill(), t.timeoutMs ?? 180_000);

  const out: CliResult = {
    events: [], raw: [], init: null, result: null, text: "", firstTextMs: null, firstEventMs: null,
    totalMs: 0, exitCode: -1, stderr: "", argv,
  };
  const emit = (e: TutorEvent) => {
    out.events.push({ ...e, atMs: Math.round(performance.now() - t0) });
    onEvent?.(e);
  };

  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of proc.stdout) {
    buf += dec.decode(chunk, { stream: true });
    for (;;) {
      const i = buf.indexOf("\n");
      if (i < 0) break;
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let ev: Record<string, any>;
      try { ev = JSON.parse(line); } catch { continue; }
      out.raw.push(ev);
      if (out.firstEventMs === null) out.firstEventMs = Math.round(performance.now() - t0);
      if (ev.type === "system" && ev.subtype === "init") out.init = ev;
      else if (ev.type === "stream_event") {
        const se = ev.event;
        if (se?.type === "content_block_delta" && se.delta?.type === "text_delta") {
          if (out.firstTextMs === null) out.firstTextMs = Math.round(performance.now() - t0);
          out.text += se.delta.text;
          emit({ type: "text", data: { delta: se.delta.text } });
        } else if (se?.type === "content_block_delta" && se.delta?.type === "thinking_delta" && se.delta.thinking) {
          emit({ type: "thinking", data: { delta: se.delta.thinking } });
        }
      } else if (ev.type === "result") out.result = ev;
    }
  }
  out.stderr = await new Response(proc.stderr).text();
  out.exitCode = await proc.exited;
  clearTimeout(timer);
  out.totalMs = Math.round(performance.now() - t0);
  return out;
}
