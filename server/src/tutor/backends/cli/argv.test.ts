import { describe, expect, test } from "bun:test";
import { buildPrefix, systemText } from "../../prompt/persona.ts";
import { CATALOG, SYLLABUS } from "../../testing/fixtures.ts";
import { LEARNER_TOOL_NAMES } from "../../tools/defs.ts";
import { argvBytes, buildArgv, expectedTools, MAX_ARGV_BYTES, mcpConfig, mcpToolName } from "./argv.ts";

const SESSION = "11111111-2222-4333-8444-555555555555";
const TOKEN = "a".repeat(64);
const mcp = { url: "http://127.0.0.1:8787/mcp/tutor", turnToken: TOKEN, toolNames: LEARNER_TOOL_NAMES };
const base = {
  claudePath: "claude",
  model: "claude-opus-5-5",
  effort: "medium",
  systemPrompt: "PERSONA",
} as const;

describe("buildArgv", () => {
  test("first turn of a session: exactly the command line verified in spike S8", () => {
    const argv = buildArgv({ ...base, session: { mode: "new", sessionId: SESSION }, mcp });
    expect(argv).toEqual([
      "claude",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      "claude-opus-5-5",
      "--effort",
      "medium",
      "--system-prompt",
      "PERSONA",
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      `{"mcpServers":{"oak":{"type":"http","url":"http://127.0.0.1:8787/mcp/tutor","headers":{"X-Oak-Turn":"${TOKEN}"}}}}`,
      "--allowedTools",
      "mcp__oak__compare_haps,mcp__oak__evaluate_strudel,mcp__oak__get_learner_progress,mcp__oak__get_lesson_context,mcp__oak__propose_code",
      "--setting-sources",
      "",
      "--disable-slash-commands",
      "--permission-mode",
      "dontAsk",
      "--permission-prompts",
      "none",
      "--session-id",
      SESSION,
    ]);
  });

  test("a later turn resumes: --resume instead of --session-id, nothing else changes", () => {
    const first = buildArgv({ ...base, session: { mode: "new", sessionId: SESSION }, mcp });
    const later = buildArgv({ ...base, session: { mode: "resume", sessionId: SESSION }, mcp });
    expect(later.slice(0, -2)).toEqual(first.slice(0, -2));
    expect(later.slice(-2)).toEqual(["--resume", SESSION]);
    expect(later).not.toContain("--session-id");
  });

  test("a structured turn: --json-schema, no MCP server and no allowed tools", () => {
    const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] };
    const argv = buildArgv({
      ...base,
      effort: "high",
      session: { mode: "new", sessionId: SESSION },
      mcp: null,
      jsonSchema: schema,
    });
    expect(argv).toEqual([
      "claude",
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--model",
      "claude-opus-5-5",
      "--effort",
      "high",
      "--system-prompt",
      "PERSONA",
      "--tools",
      "",
      "--strict-mcp-config",
      "--setting-sources",
      "",
      "--disable-slash-commands",
      "--permission-mode",
      "dontAsk",
      "--permission-prompts",
      "none",
      "--session-id",
      SESSION,
      "--json-schema",
      JSON.stringify(schema),
    ]);
  });

  test("the isolation flags are present on every route", () => {
    for (const m of [mcp, null]) {
      const argv = buildArgv({ ...base, session: { mode: "resume", sessionId: SESSION }, mcp: m });
      const at = (flag: string) => argv[argv.indexOf(flag) + 1];
      expect(at("--tools")).toBe("");
      expect(at("--setting-sources")).toBe("");
      expect(at("--permission-mode")).toBe("dontAsk");
      expect(at("--permission-prompts")).toBe("none");
      expect(argv).toContain("--strict-mcp-config");
      expect(argv).toContain("--disable-slash-commands");
      // Flags the spike did not verify, or showed to break the login, must not creep in.
      for (const banned of [
        "--bare",
        "--dangerously-skip-permissions",
        "--max-turns",
        "--betas",
        "--add-dir",
      ]) {
        expect(argv).not.toContain(banned);
      }
    }
  });

  test("the system prompt is the three prefix blocks joined, byte-identical for equal inputs", () => {
    const prefix = buildPrefix({ syllabus: SYLLABUS, catalog: CATALOG });
    const one = buildArgv({
      ...base,
      systemPrompt: systemText(prefix),
      session: { mode: "new", sessionId: SESSION },
      mcp,
    });
    const two = buildArgv({
      ...base,
      systemPrompt: systemText(buildPrefix({ syllabus: SYLLABUS, catalog: CATALOG })),
      session: { mode: "new", sessionId: SESSION },
      mcp,
    });
    expect(one).toEqual(two);
    const system = one[one.indexOf("--system-prompt") + 1] as string;
    expect(system).toBe(`${prefix.persona}\n\n${SYLLABUS}\n\n${CATALOG}`);
  });
});

describe("mcp wiring", () => {
  test("tool names carry the server prefix", () => {
    expect(mcpToolName("propose_code")).toBe("mcp__oak__propose_code");
  });

  test("the turn token cannot be overridden by an extra header", () => {
    const cfg = JSON.parse(mcpConfig({ ...mcp, headers: { "X-Oak": "1", "X-Oak-Turn": "forged" } }));
    expect(cfg.mcpServers.oak.headers).toEqual({ "X-Oak": "1", "X-Oak-Turn": TOKEN });
  });

  test("expectedTools: the allowed tools, plus StructuredOutput only on a structured run", () => {
    expect(expectedTools({ mcp })).toEqual(LEARNER_TOOL_NAMES.map(mcpToolName));
    expect(expectedTools({ mcp: null, jsonSchema: {} })).toEqual(["StructuredOutput"]);
    expect(expectedTools({ mcp: null })).toEqual([]);
  });

  test("argvBytes counts UTF-8 bytes, so the size guard holds for non-ASCII prefixes", () => {
    expect(argvBytes(["é", "ab"])).toBe(2 + 1 + 2 + 1);
    expect(MAX_ARGV_BYTES).toBeLessThan(1024 * 1024);
  });
});
