import { describe, expect, test } from "bun:test";
import { LESSON_ID, STEP_ID } from "../../testing/fixtures.ts";
import {
  blocksOf,
  LESSON_CONVERSATION,
  LESSON_THREAD,
  lessonRequest,
  messagesOf,
  requestAt,
  rig,
  runOn,
  storedRecords,
  textOf,
  typesOf,
  wireMessages,
} from "./cassettes/harness.ts";
import {
  CARD_INPUT,
  fallbackServed,
  greedy,
  invalidToolInput,
  pauseTurn,
  proposeCode,
  proposeTruncatedJson,
  sequence,
  textOnly,
  toolTurn,
} from "./cassettes/scenarios.ts";

describe("a text-only turn", () => {
  test("stream events become tutor events, in order", async () => {
    const r = rig(textOnly());
    const { events, result } = await runOn(r);
    expect(typesOf(events)).toEqual([
      "meta",
      "status",
      "thinking",
      "thinking",
      "status",
      "text",
      "text",
      "usage",
      "done",
    ]);
    expect(events[0]).toMatchObject({
      data: { backend: "anthropic-api", model: "claude-opus-5-5", lane: "chat", rung: 0 },
    });
    expect(events.filter((e) => e.type === "status").map((e) => e.data)).toEqual([
      { phase: "thinking", label: "Thinking" },
      { phase: "writing", label: "Writing" },
    ]);
    expect(events.flatMap((e) => (e.type === "thinking" ? [e.data.delta] : [])).join("")).toBe(
      "The learner wants the answer. Ask first.",
    );
    expect(textOf(events)).toBe("Look at beat 3 of bar 1. Which number is the octave?");
    expect(events.at(-1)).toMatchObject({
      type: "done",
      data: { stopReason: "end_turn", backend: "anthropic-api", iterations: 1 },
    });
    expect(result).toMatchObject({ ok: true, text: "Look at beat 3 of bar 1. Which number is the octave?" });
    expect(r.wire).toHaveLength(1);
  });

  test("the turn is stored once, verbatim: user message as sent, assistant blocks with thinking and signature", async () => {
    const r = rig(textOnly());
    await runOn(r);
    const records = storedRecords(r);
    expect(records.map((x) => x.excluded)).toEqual([false, false]);
    // The user message is byte-for-byte what went over the wire.
    expect(JSON.stringify([records[0]?.record])).toBe(wireMessages(requestAt(r, 0)));
    expect(records[1]?.record).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "The learner wants the answer. Ask first.", signature: "sig-opaque==" },
        { type: "text", text: "Look at beat 3 of bar 1. Which number is the octave?", citations: null },
      ],
    });
    const entries = await r.ports.conversations.entries(LESSON_CONVERSATION);
    expect(entries.map((e) => [e.role, e.excluded, e.backend])).toEqual([
      ["user", false, null],
      ["assistant", false, "anthropic-api"],
    ]);
  });

  test("the next turn replays the stored records unchanged and appends to them", async () => {
    const r = rig(sequence("two-turns", textOnly(), textOnly(["Count from zero."])));
    await runOn(r);
    const first = storedRecords(r).map((x) => x.record);
    await runOn(r, lessonRequest({ userText: "So is it 7?" }));
    const second = messagesOf(requestAt(r, 1));
    expect(second.slice(0, 2)).toEqual(first as never);
    expect(second).toHaveLength(3);
    expect(JSON.stringify(second[2])).toContain("So is it 7?");
    // Append-only: the first turn's records are still there, untouched, followed by the second's.
    const all = storedRecords(r).map((x) => x.record);
    expect(all.slice(0, 2)).toEqual(first);
    expect(all).toHaveLength(4);
  });
});

describe("a tool-use turn", () => {
  test("get_lesson_context, then compare_haps, then text: three requests, each extending the last", async () => {
    const r = rig(toolTurn());
    const { events, result } = await runOn(r);
    expect(r.wire).toHaveLength(3);
    const [a, b, c] = r.wire.map((w) => messagesOf(w));
    expect(b?.slice(0, a?.length)).toEqual(a as never);
    expect(c?.slice(0, b?.length)).toEqual(b as never);
    expect(c?.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"]);

    // The assistant message goes back verbatim, thinking block and signature included.
    expect(c?.[1]?.content).toEqual([
      { type: "thinking", thinking: "Check the lesson first.", signature: "sig-one==" },
      { type: "text", text: "Let me look at the step.", citations: null },
      {
        type: "tool_use",
        id: "toolu_01",
        name: "get_lesson_context",
        input: { lesson_id: LESSON_ID, step_id: STEP_ID },
      },
    ]);
    // The tool result is the executor's JSON, unchanged, in one user message.
    const results = blocksOf(requestAt(r, 2), 2);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_01", is_error: false });
    expect(JSON.parse(results[0]?.content ?? "")).toMatchObject({
      step: { id: STEP_ID, rung: 0, solution: null },
    });

    const tools = events.filter((e) => e.type === "tool_start" || e.type === "tool_result");
    expect(tools.map((e) => [e.type, e.data.toolUseId])).toEqual([
      ["tool_start", "toolu_01"],
      ["tool_result", "toolu_01"],
      ["tool_start", "toolu_02"],
      ["tool_result", "toolu_02"],
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", data: { iterations: 3 } });
    expect(result.text).toBe(
      "Let me look at the step.\n\nWhere does your last note land compared with the first?",
    );
    // Committed once, at the end: user, assistant, tool results, assistant, tool results, assistant.
    expect(storedRecords(r).map((x) => [(x.record as { role: string }).role, x.excluded])).toEqual([
      ["user", false],
      ["assistant", false],
      ["user", false],
      ["assistant", false],
      ["user", false],
      ["assistant", false],
    ]);
  });

  test("usage adds up over the requests, cache fields included, and each call is logged", async () => {
    const r = rig(toolTurn());
    const { result, events } = await runOn(r);
    expect(result.usage).toMatchObject({
      backend: "anthropic-api",
      requests: 3,
      inputTokens: 92,
      outputTokens: 185,
      cacheReadInputTokens: 12_400,
      cacheCreationInputTokens: 6_550,
      cacheCreation1hInputTokens: 6_000,
      cacheCreation5mInputTokens: 550,
      includedInPlan: false,
      servedBy: ["claude-opus-5-5"],
    });
    // 92*4 + 12400*4*0.05 + 550*4*1.25 + 6000*4*2 + 185*20, per million.
    expect(result.usage.costUsd).toBeCloseTo(0.057298, 9);
    expect(r.ports.usage.rows.map((row) => row.usage.requests)).toEqual([1, 1, 1]);
    // The running total is reported after every model call.
    expect(events.flatMap((e) => (e.type === "usage" ? [e.data.requests] : []))).toEqual([1, 2, 3]);
  });

  test("two tool calls in one response go back in ONE user message, in order", async () => {
    const r = rig(greedy());
    await runOn(r);
    const second = messagesOf(requestAt(r, 1));
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const results = blocksOf(requestAt(r, 1), 2);
    expect(results.map((b) => [b.type, b.tool_use_id])).toEqual([
      ["tool_result", "toolu_g1"],
      ["tool_result", "toolu_g2"],
    ]);
  });

  test("invalid tool input comes back as an error result and the loop goes on", async () => {
    const r = rig(invalidToolInput());
    const { events, result } = await runOn(r);
    const block = blocksOf(requestAt(r, 1), 2)[0];
    expect(block?.is_error).toBe(true);
    expect(JSON.parse(block?.content ?? "")).toMatchObject({ error: "INVALID_JSON" });
    expect(r.ports.grader.evaluated).toEqual([]);
    expect(events.find((e) => e.type === "tool_result")).toMatchObject({ data: { ok: false } });
    expect(result).toMatchObject({ ok: true, text: "Trying that another way." });
  });

  test("pause_turn sends the conversation back as it is, with no new user message", async () => {
    const r = rig(pauseTurn());
    const { result } = await runOn(r);
    expect(messagesOf(requestAt(r, 1)).map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result).toMatchObject({ ok: true, text: "Working on it ... done." });
  });
});

describe("propose_code with eager input streaming", () => {
  test("the input streams as a card draft, then the validated card is shown", async () => {
    const r = rig(proposeCode());
    const { events, result } = await runOn(r, lessonRequest(), { cardDrafts: true });
    const drafts = events.flatMap((e) => (e.type === "tool_input" ? [e.data] : []));
    expect(drafts.length).toBeGreaterThan(5);
    expect(new Set(drafts.map((d) => d.toolUseId))).toEqual(new Set(["toolu_c1"]));
    expect(JSON.parse(drafts.map((d) => d.partialJson).join(""))).toEqual(CARD_INPUT);
    // A graded step below rung 4: the server makes the card preview-only, whatever the model wants.
    const card = events.find((e) => e.type === "card");
    expect(card).toMatchObject({
      data: { toolUseId: "toolu_c1", code: CARD_INPUT.code, apply: "preview_only" },
    });
    expect(typesOf(events).filter((t) => t === "tool_start")).toHaveLength(1);
    expect(result.cardIds).toHaveLength(1);
    expect(result.text).toBe("Here is the same idea in another key.\n\nPlay it and listen for the top.");
  });

  test("only propose_code is drafted; other tools' inputs are not forwarded", async () => {
    const r = rig(greedy());
    const { events } = await runOn(r, lessonRequest(), { cardDrafts: true });
    expect(typesOf(events)).not.toContain("tool_input");
  });

  test("truncated card JSON: the shortened input is rejected before anything is linted, run or shown", async () => {
    const r = rig(proposeTruncatedJson());
    const { events, result } = await runOn(r, lessonRequest(), { cardDrafts: true });
    const second = requestAt(r, 1);
    // What the SDK's tolerant parser made of it: an object with required fields silently missing.
    expect(blocksOf(second, 1)[0]?.input).toEqual({ kind: "example", title: "Half a card" });
    const block = blocksOf(second, 2)[0];
    expect(block?.is_error).toBe(true);
    expect(JSON.parse(block?.content ?? "")).toMatchObject({ error: "INVALID_JSON" });
    expect(r.ports.grader.evaluated).toEqual([]);
    expect(typesOf(events)).not.toContain("card");
    expect(result).toMatchObject({ ok: true, cardIds: [], text: "Let me put that differently." });
  });
});

describe("a fallback-served response", () => {
  test("servedBy names the fallback model, and null cache fields count as zero", async () => {
    const r = rig(fallbackServed());
    const { result } = await runOn(r);
    expect(result.usage.servedBy).toEqual(["claude-opus-5-5", "claude-sonnet-5"]);
    expect(r.ports.usage.rows[0]?.usage).toMatchObject({
      servedBy: ["claude-opus-5-5", "claude-sonnet-5"],
      inputTokens: 50,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheCreation1hInputTokens: 0,
      cacheCreation5mInputTokens: 0,
    });
    expect(Number.isFinite(result.usage.costUsd)).toBe(true);
  });

  test("the fallback block stays; thinking and tool calls before it are left out and never run", async () => {
    const r = rig(fallbackServed());
    const { events } = await runOn(r);
    const second = requestAt(r, 1);
    expect(blocksOf(second, 1).map((b) => b.id ?? b.type)).toEqual(["fallback", "thinking", "toolu_kept"]);
    expect(blocksOf(second, 2).map((b) => b.tool_use_id)).toEqual(["toolu_kept"]);
    expect(events.flatMap((e) => (e.type === "tool_result" ? [e.data.toolUseId] : []))).toEqual([
      "toolu_kept",
    ]);
  });
});

test("the timeline the panel shows holds the turn once", async () => {
  const r = rig(toolTurn());
  await runOn(r);
  const timeline = await r.ports.conversations.timeline(LESSON_THREAD);
  expect(timeline.map((e) => e.role)).toEqual(["user", "assistant"]);
});
