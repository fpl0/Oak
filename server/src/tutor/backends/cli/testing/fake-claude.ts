#!/usr/bin/env bun
// A stand-in for the `claude` binary. Test code only: the tests select it through `claudePath`,
// so the real CLI is never started and nothing leaves the machine.
//
// It does three things a script of canned lines could not:
//  1. it REFUSES a command line that differs from the one spike S8 verified (exit 64), so a
//     regression in argv.ts fails every end-to-end test;
//  2. it makes real MCP requests to the endpoint named in `--mcp-config`, with the turn token it
//     was given, so tool calls run through Oak's real executors and redaction;
//  3. it replays recorded stream-json (testing/fixtures/*.jsonl, ported from spike S8 with session
//     IDs and paths scrubbed), with the session ID of this invocation filled in.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { FakeLogEntry, FakeRun, Scenario } from "./scenario.ts";

const dir = process.env.OAK_FAKE_CLAUDE;
if (!dir) die("OAK_FAKE_CLAUDE is not set", 70);
const scenario = JSON.parse(readFileSync(join(dir, "scenario.json"), "utf8")) as Scenario;
const logPath = join(dir, "log.jsonl");
const args = process.argv.slice(2);
const credentials = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"].filter((k) => process.env[k] !== undefined);

function die(message: string, code: number): never {
  process.stderr.write(`fake-claude: ${message}\n`);
  process.exit(code);
}
function log(entry: FakeLogEntry): void {
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}
const write = (s: string) => new Promise<void>((done) => process.stdout.write(s, () => done()));
const forever = () => new Promise<never>(() => void setInterval(() => {}, 1_000));

// --- the two detection commands ------------------------------------------------------------------
if (args[0] === "--version" || (args[0] === "auth" && args[1] === "status")) {
  log({ type: "probe", argv: args, credentials });
  const spec = args[0] === "--version" ? scenario.version : scenario.auth;
  if (spec?.hang) await forever();
  if (args[0] === "--version") await write(`${scenario.version?.stdout ?? "2.1.322 (Claude Code)"}\n`);
  else {
    const auth = scenario.auth;
    await write(
      `${auth?.raw ?? JSON.stringify(auth?.json ?? { loggedIn: true, authMethod: "claude.ai" })}\n`,
    );
  }
  process.exit(spec?.exitCode ?? 0);
}

// --- `claude -p`: the command line must be exactly the verified one --------------------------------
const VALUED = new Set([
  "--output-format",
  "--model",
  "--effort",
  "--system-prompt",
  "--tools",
  "--mcp-config",
  "--allowedTools",
  "--setting-sources",
  "--permission-mode",
  "--permission-prompts",
  "--session-id",
  "--resume",
  "--json-schema",
]);
const BARE = new Set([
  "-p",
  "--verbose",
  "--include-partial-messages",
  "--strict-mcp-config",
  "--disable-slash-commands",
]);
const flags = new Map<string, string>();
for (let i = 0; i < args.length; i++) {
  const a = args[i] as string;
  if (flags.has(a)) die(`flag given twice: ${a}`, 64);
  if (BARE.has(a)) flags.set(a, "");
  else if (VALUED.has(a) && i + 1 < args.length) flags.set(a, args[++i] as string);
  else die(`unknown or incomplete argument: ${a}`, 64);
}
const need = (flag: string, value?: string) => {
  if (!flags.has(flag)) die(`missing ${flag}`, 64);
  if (value !== undefined && flags.get(flag) !== value) die(`${flag} must be ${JSON.stringify(value)}`, 64);
};
for (const f of BARE) need(f);
need("--output-format", "stream-json");
need("--tools", "");
need("--setting-sources", "");
need("--permission-mode", "dontAsk");
need("--permission-prompts", "none");
need("--model");
need("--system-prompt");
if (!["low", "medium", "high"].includes(flags.get("--effort") ?? "")) die("bad --effort", 64);
if (flags.has("--session-id") === flags.has("--resume"))
  die("need exactly one of --session-id, --resume", 64);
const sessionId = flags.get("--session-id") ?? (flags.get("--resume") as string);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(sessionId))
  die("bad session id", 64);
if (credentials.length > 0) die(`credentials in the environment: ${credentials.join(", ")}`, 64);
if (flags.has("--mcp-config") !== flags.has("--allowedTools"))
  die("--mcp-config and --allowedTools go together", 64);

interface Mcp {
  url: string;
  headers: Record<string, string>;
}
let mcp: Mcp | null = null;
if (flags.has("--mcp-config")) {
  const cfg = JSON.parse(flags.get("--mcp-config") as string) as {
    mcpServers?: Record<string, { type?: string; url?: string; headers?: Record<string, string> }>;
  };
  const names = Object.keys(cfg.mcpServers ?? {});
  const oak = cfg.mcpServers?.oak;
  if (names.length !== 1 || !oak || oak.type !== "http" || !oak.url || !oak.headers?.["X-Oak-Turn"]) {
    die("bad --mcp-config", 64);
  }
  mcp = { url: oak.url, headers: oak.headers };
  const allowed = (flags.get("--allowedTools") as string).split(",");
  if (allowed.some((t) => !t.startsWith("mcp__oak__"))) die("a non-Oak tool is allowed", 64);
}

const stdin = await Bun.stdin.text();
const index = existsSync(logPath)
  ? readFileSync(logPath, "utf8")
      .split("\n")
      .filter((l) => l.includes('"type":"start"')).length
  : 0;
log({ type: "start", index, argv: args, stdin, cwd: process.cwd(), credentials });
const run: FakeRun = scenario.runs[Math.min(index, scenario.runs.length - 1)] ?? {};

if (run.failResume && flags.has("--resume")) {
  process.stderr.write(`No conversation found with session ID: ${sessionId}\n`);
  process.exit(1);
}

// --- MCP, as the real CLI does it: initialize, list, then call on the model's behalf --------------
let rpcId = 0;
async function rpc(
  method: string,
  params: Record<string, unknown>,
  name: string | null = null,
): Promise<string> {
  if (!mcp) die(`the scenario needs MCP (${method}) but there is no --mcp-config`, 65);
  const res = await fetch(mcp.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...mcp.headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const body = await res.text();
  log({ type: "mcp", index, method, name, status: res.status, body });
  return body;
}

let listed: string[] = [];
if (mcp) {
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "fake-claude", version: "0" },
  });
  const list = JSON.parse(await rpc("tools/list", {})) as { result?: { tools?: { name: string }[] } };
  listed = (list.result?.tools ?? []).map((t) => `mcp__oak__${t.name}`);
}
if (flags.has("--json-schema")) listed.push("StructuredOutput");

const pending = [...(run.calls ?? [])];
async function callNext(all = false): Promise<void> {
  while (pending.length > 0) {
    const call = pending.shift() as NonNullable<FakeRun["calls"]>[number];
    await rpc("tools/call", { name: call.name, arguments: call.arguments }, call.name);
    if (!all) return;
  }
}

// --- replay ----------------------------------------------------------------------------------------
type Ev = Record<string, unknown> & {
  event?: Record<string, unknown>;
  message?: { content?: { type?: string }[] };
};
const source = run.fixture
  ? readFileSync(join(import.meta.dir, "fixtures", run.fixture), "utf8")
      .split("\n")
      .filter((l) => l !== "")
  : (run.events ?? []).map((e) => JSON.stringify(e));
let written = 0;
for (const raw of source) {
  if (run.truncateAfter !== undefined && written >= run.truncateAfter) break;
  if (run.hangAfter !== undefined && written >= run.hangAfter) await forever();
  let ev = JSON.parse(raw.replaceAll("SESSION_ID", sessionId)) as Ev;
  if (ev.type === "system" && ev.subtype === "init") {
    ev = { ...ev, tools: run.initTools ?? listed, ...run.initPatch };
  } else if (ev.type === "assistant" && ev.message?.content?.some((b) => b.type === "tool_use")) {
    if (!flags.has("--json-schema")) await callNext();
  } else if (ev.type === "stream_event" && ev.event?.type === "content_block_start") {
    if ((ev.event.content_block as { type?: string } | undefined)?.type === "text") await callNext(true);
  } else if (ev.type === "result") {
    await callNext(true);
    if (run.dropResult) continue;
    if (run.structuredOutput !== undefined) {
      ev = { ...ev, structured_output: run.structuredOutput, result: JSON.stringify(run.structuredOutput) };
    }
    ev = { ...ev, ...run.resultPatch };
  }
  await write(`${JSON.stringify(ev)}\n`);
  written++;
  if (ev.subtype === "init" && run.pauseAfterInitMs) await Bun.sleep(run.pauseAfterInitMs);
}
await callNext(true);
if (run.stderr) process.stderr.write(run.stderr);
process.exit(run.exitCode ?? 0);
