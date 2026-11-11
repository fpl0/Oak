import { describe, expect, test } from "bun:test";
import { ERROR_COPY } from "../../errors.ts";
import { encodeSse } from "../../events.ts";
import {
  maxTokensMidTool,
  maxTokensText,
  maxTokensWhileThinking,
  overloadedMidStream,
  rateLimited,
  refusal,
  runaway,
  silentGap,
  unauthorized,
  unreachable,
} from "./cassettes/failure-scenarios.ts";
import { CASSETTE_KEY } from "./cassettes/fake-fetch.ts";
import {
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
} from "./cassettes/harness.ts";
import { sequence, textOnly, toolTurn, unparseableToolJson } from "./cassettes/scenarios.ts";

/** A failed turn: an `error` event of the kind, and nothing left behind that would be replayed. */
async function expectExcluded(r: ReturnType<typeof rig>) {
  const records = storedRecords(r);
  expect(records.length).toBeGreaterThan(0);
  expect(records.every((x) => x.excluded)).toBe(true);
  expect(await r.ports.conversations.backendRecords(LESSON_CONVERSATION, "anthropic-api")).toEqual([]);
  expect(await r.ports.conversations.entries(LESSON_CONVERSATION)).toEqual([]);
}

describe("stop reasons that end a turn in an error", () => {
  test("refusal: fixed copy, the tail is logged as excluded", async () => {
    const r = rig(refusal());
    const { events, result } = await runOn(r);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      data: { kind: "refusal", message: ERROR_COPY.refusal },
    });
    expect(typesOf(events)).not.toContain("done");
    expect(result).toMatchObject({ ok: false, error: { kind: "refusal" } });
    await expectExcluded(r);
    // The refused assistant message is in the log, for diagnosis, but marked.
    expect(storedRecords(r).map((x) => (x.record as { role: string }).role)).toEqual(["user", "assistant"]);
    // The call was billed, so it is counted.
    expect(result.usage.requests).toBe(1);
    expect(r.ports.usage.rows).toHaveLength(1);
  });

  test("max_tokens inside a tool call: the tool is not run, no card is shown, nothing is replayable", async () => {
    const r = rig(maxTokensMidTool());
    const { events, result } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "max_tokens" } });
    expect(typesOf(events)).not.toContain("tool_result");
    expect(typesOf(events)).not.toContain("card");
    expect(r.ports.grader.evaluated).toEqual([]);
    expect(result.cardIds).toEqual([]);
    expect(r.wire).toHaveLength(1);
    await expectExcluded(r);
  });

  test("max_tokens in plain text is a finished, shortened reply", async () => {
    const r = rig(maxTokensText());
    const { events, result } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "done", data: { stopReason: "max_tokens" } });
    expect(result).toMatchObject({ ok: true, text: "A long answer that stops mid" });
    expect(storedRecords(r).map((x) => x.excluded)).toEqual([false, false]);
  });

  test("max_tokens before any visible text is an error, not an empty reply", async () => {
    const r = rig(maxTokensWhileThinking());
    const { events } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "max_tokens" } });
    await expectExcluded(r);
  });

  test("the iteration cap of the thread kind stops a model that keeps calling tools", async () => {
    const r = rig(runaway(5));
    // A hint thread allows three model calls.
    const { events, result } = await runOn(r, lessonRequest({ kind: "hint" }));
    expect(r.wire).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "iteration_limit" } });
    expect(result.usage.requests).toBe(3);
    expect(storedRecords(r, LESSON_CONVERSATION.replace(/chat$/, "hint")).every((x) => x.excluded)).toBe(
      true,
    );
  });
});

describe("upstream failures", () => {
  test("overloaded in the middle of a stream: text so far was shown, nothing is stored for replay", async () => {
    const r = rig(overloadedMidStream());
    const { events, result } = await runOn(r);
    expect(textOf(events)).toBe("Partial ");
    expect(events.at(-1)).toMatchObject({
      type: "error",
      data: { kind: "overloaded", message: ERROR_COPY.overloaded },
    });
    expect(result.ok).toBe(false);
    await expectExcluded(r);
  });

  test("429 carries retry-after", async () => {
    const r = rig(rateLimited());
    const { events } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "rate_limit", retryAfterSec: 17 } });
    expect(r.wire).toHaveLength(1);
    await expectExcluded(r);
  });

  test("401: `auth`, and neither the key nor the upstream message reaches an event or the store", async () => {
    const r = rig(unauthorized(CASSETTE_KEY));
    const { events, result } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "auth", message: ERROR_COPY.auth } });
    const everything = JSON.stringify([
      events.map(encodeSse),
      result,
      r.ports.conversations.allBackendRecords(),
      await r.ports.conversations.timeline(LESSON_THREAD),
      r.backend,
    ]);
    expect(everything).not.toContain(CASSETTE_KEY);
    expect(everything).not.toContain("x-api-key");
  });

  test("a transport failure is `network`", async () => {
    const r = rig(unreachable());
    const { events } = await runOn(r);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "network" } });
    await expectExcluded(r);
  });

  test("tool input the SDK cannot parse at all is `internal`; the raw JSON is not forwarded", async () => {
    const r = rig(unparseableToolJson());
    const { events } = await runOn(r);
    expect(events.at(-1)).toMatchObject({
      type: "error",
      data: { kind: "internal", message: ERROR_COPY.internal },
    });
    expect(JSON.stringify(events)).not.toContain("not json at all");
    expect(typesOf(events)).not.toContain("tool_result");
    await expectExcluded(r);
  });
});

describe("abort", () => {
  test("Stop in the middle of a stream ends the turn at once and aborts the upstream request", async () => {
    const r = rig(silentGap(30_000));
    const ac = new AbortController();
    const started = performance.now();
    const { events, result } = await runOn(r, lessonRequest(), {
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === "text") ac.abort();
      },
    });
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(textOf(events)).toBe("before-gap");
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "aborted" } });
    expect(result).toMatchObject({ ok: false, error: { kind: "aborted" } });
    expect(r.wire[0]?.aborted).toBe(true);
    await expectExcluded(r);
  });

  test("Stop while a tool runs: the results are not sent on, and the turn is not replayable", async () => {
    const r = rig(toolTurn());
    const ac = new AbortController();
    const { events } = await runOn(r, lessonRequest(), {
      signal: ac.signal,
      onEvent: (e) => {
        if (e.type === "tool_result") ac.abort();
      },
    });
    expect(r.wire).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "aborted" } });
    await expectExcluded(r);
  });

  test("a turn that is already stopped makes no request", async () => {
    const r = rig(textOnly());
    const ac = new AbortController();
    ac.abort();
    const { events } = await runOn(r, lessonRequest(), { signal: ac.signal });
    expect(r.wire).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ type: "error", data: { kind: "aborted" } });
  });
});

describe("retry after a failed turn", () => {
  test("the retry is a clean re-send: the failed turn is not in the request", async () => {
    const r = rig(sequence("fail-then-ok", overloadedMidStream(), textOnly()));
    await runOn(r);
    const { result } = await runOn(r);
    expect(result.ok).toBe(true);
    const retry = messagesOf(requestAt(r, 1));
    expect(retry.map((m) => m.role)).toEqual(["user"]);
    // The log keeps both attempts; only the second is history.
    expect(storedRecords(r).map((x) => x.excluded)).toEqual([true, false, false]);
  });

  test("a failed turn in the middle of a conversation changes nothing before it", async () => {
    const r = rig(sequence("ok-fail-ok", textOnly(), refusal(), textOnly(["Count from zero."])));
    await runOn(r);
    const first = storedRecords(r).map((x) => x.record);
    await runOn(r, lessonRequest({ userText: "Write my homework." }));
    await runOn(r, lessonRequest({ userText: "So is it 7?" }));
    const third = messagesOf(requestAt(r, 2));
    expect(third.slice(0, 2)).toEqual(first as never);
    expect(third).toHaveLength(3);
    expect(JSON.stringify(third)).not.toContain("Write my homework.");
    expect(storedRecords(r).map((x) => x.excluded)).toEqual([false, false, true, true, false, false]);
  });
});
