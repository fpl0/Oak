// What can go wrong on the CLI backend, end to end with the fake `claude`: a Stop, a tool surface
// that is not Oak's, a process that dies, an error result, a missing binary.
import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import type { TutorErrorKind } from "../../errors.ts";
import { STEP_ID } from "../../testing/fixtures.ts";
import { createClaudeCliBackend, DEFAULT_CWD } from "./index.ts";
import { TurnRegistry } from "./mcp.ts";
import { lastSession } from "./session.ts";
import { flag, type Harness, LESSON_THREAD, startHarness } from "./testing/harness.ts";
import type { FakeRun } from "./testing/scenario.ts";

const PLAIN = { fixture: "plain-resume.jsonl" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let h: Harness;
afterEach(() => h?.stop());

const records = async (lane = "chat") => {
  const all = h.ports.conversations.allBackendRecords();
  return all.filter((r) => r.conversationId.endsWith(`:${lane}`) && r.backend === "claude-cli");
};

describe("failures", () => {
  test("Stop mid-stream: the process is killed, the turn ends as aborted, the session is retired", async () => {
    h = startHarness({ runs: [{ fixture: "plain-resume.jsonl", hangAfter: 20 }, PLAIN] });
    const stop = new AbortController();
    const t0 = performance.now();
    const { events, result, text } = await h.turn({}, stop.signal, (e) => {
      if (e.type === "text") stop.abort();
    });
    expect(performance.now() - t0).toBeLessThan(5_000);
    expect(result).toMatchObject({ ok: false, error: { kind: "aborted", message: "Stopped." } });
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "aborted" } });
    expect(text.length).toBeGreaterThan(0);
    expect(h.registry.size).toBe(0);

    // The stopped turn is an excluded tail in Oak's transcript and its CLI session is never resumed.
    const stored = await h.ports.conversations.entries(`lesson:${LESSON_THREAD.subjectId}:2026-11-11:chat`, {
      includeExcluded: true,
    });
    expect(stored.map((e) => e.excluded)).toEqual([true, true]);
    expect(lastSession((await records()).map((r) => r.record))).toMatchObject({ resumable: false });
    await h.turn({ userText: "Again." });
    const [aborted, next] = h.starts().map((s) => s.argv);
    expect(flag(next ?? [], "--session-id")).toMatch(UUID);
    expect(flag(next ?? [], "--session-id")).not.toBe(flag(aborted ?? [], "--session-id"));
    expect(h.starts()[1]?.stdin).not.toContain("<oak_notes>"); // nothing but the failed tail to replay
  });

  test("an aborted signal before the start spawns nothing", async () => {
    h = startHarness({ runs: [PLAIN] });
    const stop = new AbortController();
    stop.abort();
    const { result } = await h.turn({}, stop.signal);
    expect(result.error?.kind).toBe("aborted");
    expect(h.starts()).toEqual([]);
  });

  test("an init event that lists a built-in tool fails closed: killed, nothing shown, no tool run", async () => {
    const five = [
      "compare_haps",
      "evaluate_strudel",
      "get_learner_progress",
      "get_lesson_context",
      "propose_code",
    ];
    h = startHarness({
      runs: [
        {
          fixture: "tool-turn.jsonl",
          initTools: [...five.map((t) => `mcp__oak__${t}`), "Bash"],
          pauseAfterInitMs: 400,
          calls: [{ name: "get_lesson_context", arguments: { lesson_id: "U03.L02", step_id: STEP_ID } }],
        },
      ],
    });
    const t0 = performance.now();
    const { events, result, text } = await h.turn();
    expect(performance.now() - t0).toBeLessThan(5_000);
    expect(result).toMatchObject({ ok: false, error: { kind: "internal" } });
    expect(events.map((e) => e.type)).toEqual(["meta", "error"]);
    expect(text).toBe("");
    expect(h.toolResults).toEqual([]);
    expect(h.mcpLog().filter((m) => m.method === "tools/call")).toEqual([]);
    expect(h.logs.join("\n")).toContain("unexpected tool surface");
    expect(h.logs.join("\n")).toContain("Bash");
    // The learner reads fixed copy, never the diagnostic.
    expect(JSON.stringify(events)).not.toContain("Bash");
  });

  const CLOSED: [string, FakeRun, TutorErrorKind][] = [
    ["a missing tool", { initTools: ["mcp__oak__compare_haps"] }, "internal"],
    ["an API key in use", { initPatch: { apiKeySource: "ANTHROPIC_API_KEY" } }, "auth"],
  ];
  test.each(CLOSED)("fails closed on %s", async (_name, patch, kind) => {
    h = startHarness({ runs: [{ fixture: "plain-resume.jsonl", pauseAfterInitMs: 400, ...patch }] });
    const { events, result } = await h.turn();
    expect(result.error?.kind).toBe(kind);
    expect(events.map((e) => e.type)).toEqual(["meta", "error"]);
  });

  test("a non-zero exit without a result event is an error, classified from stderr", async () => {
    h = startHarness({ runs: [{ events: [], exitCode: 1, stderr: "Error: something broke\n" }] });
    const crashed = await h.turn();
    expect(crashed.result).toMatchObject({ ok: false, error: { kind: "internal" } });
    expect(crashed.events.at(-1)).toMatchObject({ type: "error", data: { kind: "internal" } });
    expect(h.logs.join("\n")).toContain(
      "stream ended without a result event (exit 1) Error: something broke",
    );

    h.setRuns([{ events: [], exitCode: 1, stderr: "Not logged in · Please run /login\n" }]);
    const loggedOut = await h.turn({ userText: "Again." });
    expect(loggedOut.result.error?.kind).toBe("auth");
    expect(JSON.stringify(loggedOut.events)).not.toContain("/login");
  });

  test("a stream that ends without a result event is not a completed turn", async () => {
    h = startHarness({ runs: [{ fixture: "plain-resume.jsonl", dropResult: true }] });
    const { result, events, text } = await h.turn();
    expect(text.length).toBeGreaterThan(0); // the text did stream
    expect(result.ok).toBe(false);
    expect(result.error?.kind).toBe("internal");
    expect(events.at(-1)?.type).toBe("error");
    // What was counted before the cut is still logged.
    expect(result.usage.outputTokens).toBeGreaterThan(0);
  });

  test.each([
    [
      {
        is_error: true,
        subtype: "error_during_execution",
        result: "Claude AI usage limit reached|1794618000",
      },
      "rate_limit",
    ],
    [
      { is_error: true, subtype: "error_during_execution", api_error_status: 529, result: "API Error" },
      "overloaded",
    ],
    [{ is_error: true, subtype: "error_max_turns", result: "" }, "iteration_limit"],
    [{ stop_reason: "refusal" }, "refusal"],
  ] as const)("an error result %j ends the turn as %s", async (resultPatch, kind) => {
    h = startHarness({ runs: [{ fixture: "plain-resume.jsonl", resultPatch }] });
    const { result, events } = await h.turn();
    expect(result.error?.kind).toBe(kind);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind } });
    expect(JSON.stringify(events.at(-1))).not.toContain("usage limit reached|");
  });

  test("a missing claude binary: not available, and a turn fails without throwing", async () => {
    h = startHarness({ runs: [PLAIN] }, { claudePath: "/nonexistent/bin/claude" });
    expect(await h.backend.available()).toEqual({ ok: false, reason: "not_installed" });
    const { result } = await h.turn();
    expect(result).toMatchObject({ ok: false, error: { kind: "internal" } });
  });

  test("available(): the fake CLI reports a login", async () => {
    h = startHarness({ runs: [PLAIN] });
    expect(await h.backend.available()).toEqual({ ok: true });
    expect(await h.backend.detector.status()).toMatchObject({
      version: "2.1.322 (Claude Code)",
      authMethod: "claude.ai",
    });
    expect(h.probes().every((p) => p.credentials.length === 0)).toBe(true);
  });

  test("building a backend starts nothing; the default directory is ~/.oak/tutor-cwd", () => {
    const backend = createClaudeCliBackend({
      registry: new TurnRegistry(),
      mcpUrl: "http://127.0.0.1:1/mcp",
    });
    expect(backend.id).toBe("claude-cli");
    // The CLI caches its prefix by itself, so there is nothing to warm.
    expect(backend.warm).toBeUndefined();
    expect(DEFAULT_CWD).toBe(join(homedir(), ".oak", "tutor-cwd"));
  });
});
