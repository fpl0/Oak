// End to end, hermetic: the real backend, the real MCP endpoint, the core's turn runner and fake
// ports, with the fake `claude` (testing/fake-claude.ts) in place of the CLI.
import { afterEach, describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { LEARNER_CODE } from "../../testing/fixtures.ts";
import { lastSession } from "./session.ts";
import { flag, type Harness, LESSON_THREAD, PARENT_API_KEY, startHarness } from "./testing/harness.ts";

const PLAIN = { fixture: "plain-resume.jsonl" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let h: Harness;
afterEach(() => h?.stop());

const records = async (lane = "chat") => {
  const all = h.ports.conversations.allBackendRecords();
  return all.filter((r) => r.conversationId.endsWith(`:${lane}`) && r.backend === "claude-cli");
};

describe("a plain turn", () => {
  test("streams the recorded reply; meta first, usage, done last; one session record", async () => {
    h = startHarness({ runs: [PLAIN] });
    const { events, result, text } = await h.turn();

    expect(events[0]?.type).toBe("meta");
    expect(events.at(-1)).toMatchObject({
      type: "done",
      data: { backend: "claude-cli", stopReason: "end_turn" },
    });
    expect(text).toStartWith("I can't give you the passing code yet");
    expect(text.length).toBeGreaterThan(200);
    expect(result).toMatchObject({ ok: true, error: null, text });
    expect(events.filter((e) => e.type === "status").map((e) => e.data)).toEqual([
      { phase: "thinking", label: "Thinking" },
      { phase: "writing", label: "Writing" },
    ]);
    // No tool ran, so no tool event was made up from the stream.
    expect(events.some((e) => e.type === "tool_start" || e.type === "tool_result")).toBe(false);

    // Tokens are counted; a subscription turn has no dollar figure.
    expect(result.usage).toMatchObject({
      backend: "claude-cli",
      requests: 1,
      inputTokens: 4,
      outputTokens: 220,
      cacheReadInputTokens: 3357,
      cacheCreationInputTokens: 506,
      costUsd: null,
      includedInPlan: true,
      servedBy: ["claude-opus-5-5"],
    });
    expect(h.ports.usage.rows).toHaveLength(1);

    const [start] = h.starts();
    expect(h.starts()).toHaveLength(1);
    expect(flag(start?.argv ?? [], "--session-id")).toMatch(UUID);
    expect(start?.argv).not.toContain("--resume");
    expect(flag(start?.argv ?? [], "--effort")).toBe("medium");
    expect(flag(start?.argv ?? [], "--model")).toBe("claude-opus-5-5");
    // The CLI ran in the dedicated directory, created on demand.
    expect(start?.cwd).toBe(realpathSync(h.cwd));

    const recs = await records();
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({
      excluded: false,
      record: { v: 1, sessionId: flag(start?.argv ?? [], "--session-id"), resumable: true, seeded: false },
    });
    // Oak's transcript is the source of truth: the runner appended both sides of the turn.
    const stored = await h.ports.conversations.timeline(LESSON_THREAD);
    expect(stored.map((e) => [e.role, e.backend, e.excluded])).toEqual([
      ["user", null, false],
      ["assistant", "claude-cli", false],
    ]);
    expect(h.registry.size).toBe(0);
  });

  test("the volatile context travels inside the user turn, on stdin, never in the command line", async () => {
    h = startHarness({ runs: [PLAIN] });
    await h.turn({ userText: "Why does my arpeggio sound unfinished?" });
    const [start] = h.starts();
    const stdin = start?.stdin ?? "";
    expect(stdin).toStartWith('<oak_context v="1">');
    expect(stdin).toContain("hint_rung: 0 of 4");
    expect(stdin).toContain("<learner_code>");
    expect(stdin.trimEnd()).toEndWith(
      "<learner_message>\nWhy does my arpeggio sound unfinished?\n</learner_message>",
    );
    const argv = (start?.argv ?? []).join("\n");
    // (Boolean form: a failure should not print the whole system prompt.)
    expect(argv.includes("hint_rung: 0 of 4")).toBe(false);
    expect(argv.includes("arpeggio sound unfinished")).toBe(false);
    expect(argv.includes(LEARNER_CODE)).toBe(false);
    // The system prompt is the frozen prefix and nothing else.
    expect(flag(start?.argv ?? [], "--system-prompt")).toStartWith("# Oak's tutor");
  });

  test("the server's API key never reaches the child", async () => {
    h = startHarness({ runs: [PLAIN] });
    const { result } = await h.turn();
    // The fake exits 64 if it sees a credential; a completed turn is the proof, and so is its log.
    expect(result.ok).toBe(true);
    expect(h.starts()[0]?.credentials).toEqual([]);
    expect(JSON.stringify(h.starts())).not.toContain(PARENT_API_KEY);
  });
});

describe("continuity", () => {
  test("later turns of a conversation resume the session; a new lane gets its own", async () => {
    h = startHarness({ runs: [PLAIN] });
    await h.turn();
    await h.turn({ userText: "And the second note?" });
    await h.turn({ kind: "hint", userText: "" });
    const [a, b, c] = h.starts().map((s) => s.argv);
    const session = flag(a ?? [], "--session-id");
    expect(flag(b ?? [], "--resume")).toBe(session);
    expect(b).not.toContain("--session-id");
    // Nothing is replayed into a resumed session: the CLI already holds the history.
    expect(h.starts()[1]?.stdin).not.toContain("<oak_notes>");
    // The hint lane is another conversation with another effort: never the chat's session.
    expect(flag(c ?? [], "--session-id")).toMatch(UUID);
    expect(flag(c ?? [], "--session-id")).not.toBe(session);
    expect(flag(c ?? [], "--effort")).toBe("low");
    const sessions = (await records()).map((r) => (r.record as { sessionId: string }).sessionId);
    expect<(string | undefined)[]>(sessions).toEqual([session, session]);
  });

  test("a session that cannot be resumed is started again from Oak's transcript", async () => {
    h = startHarness({ runs: [PLAIN, { failResume: true }, PLAIN] });
    await h.turn({ userText: "Why does my arpeggio sound unfinished?" });
    const { result, events, text } = await h.turn({ userText: "And the second note?" });

    expect(result.ok).toBe(true);
    expect(events.filter((e) => e.type === "error")).toEqual([]);
    expect(text).toStartWith("I can't give you the passing code yet");
    const [first, failed, again] = h.starts();
    expect(h.starts()).toHaveLength(3);
    expect(flag(failed?.argv ?? [], "--resume")).toBe(flag(first?.argv ?? [], "--session-id"));
    const fresh = flag(again?.argv ?? [], "--session-id");
    expect(fresh).toMatch(UUID);
    expect(fresh).not.toBe(flag(first?.argv ?? [], "--session-id"));

    // The new session opens with a compact replay of what Oak stored, then the turn itself.
    const stdin = again?.stdin ?? "";
    expect(stdin).toStartWith("<oak_notes>\nEarlier in this conversation");
    expect(stdin).toContain("- learner: Why does my arpeggio sound unfinished?");
    expect(stdin).toContain("- tutor: I can't give you the passing code yet");
    expect(stdin.indexOf("</oak_notes>")).toBeLessThan(stdin.indexOf('<oak_context v="1">'));
    expect(stdin).toContain("<learner_message>\nAnd the second note?\n</learner_message>");
    // The failed attempt had no session to replay into.
    expect(failed?.stdin).not.toContain("<oak_notes>");

    expect(lastSession((await records()).map((r) => r.record))).toEqual({
      v: 1,
      sessionId: fresh as string,
      resumable: true,
      seeded: true,
    });
    expect(h.logs.join("\n")).toContain("could not be resumed");
    // The next turn resumes the new session.
    await h.turn({ userText: "Thanks." });
    expect(flag(h.starts()[3]?.argv ?? [], "--resume")).toBe(fresh);
  });

  test("a conversation that came from the other backend is seeded from the transcript", async () => {
    h = startHarness({ runs: [PLAIN] });
    const prep = await h.turn(); // creates the conversation
    expect(prep.result.ok).toBe(true);
    // Drop this backend's memory, as if the first turn had been answered by the API backend.
    const other = startHarness({ runs: [PLAIN] });
    try {
      const id = (await h.ports.conversations.timeline(LESSON_THREAD))[0]?.conversationId as string;
      const convo = await h.ports.conversations.find({
        ...LESSON_THREAD,
        day: id.split(":")[2] as string,
        lane: "chat",
      });
      await other.ports.conversations.create({
        id,
        key: convo?.key as never,
        effort: "medium",
        prefixVersion: "x",
      });
      for (const e of await h.ports.conversations.timeline(LESSON_THREAD)) {
        const { conversationId: _c, seq: _s, at: _a, ...rest } = e;
        await other.ports.conversations.append(id, { ...rest, backend: e.backend ? "anthropic-api" : null });
      }
      await other.turn({ userText: "Next question." });
      const [start] = other.starts();
      expect(flag(start?.argv ?? [], "--session-id")).toMatch(UUID);
      expect(start?.stdin).toStartWith("<oak_notes>");
      expect(start?.stdin).toContain("- learner: Just tell me the exact code that passes.");
    } finally {
      other.stop();
    }
  });
});
