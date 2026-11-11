import { describe, expect, test } from "bun:test";
import type { StreamLine } from "./process.ts";
import { exited, fixtureLines, OAK_TOOLS, replay, SESSION } from "./testing/replay.ts";

const init = (over: Record<string, unknown> = {}): StreamLine => ({
  type: "system",
  subtype: "init",
  session_id: SESSION,
  tools: OAK_TOOLS,
  apiKeySource: "none",
  ...over,
});
const result = (over: Record<string, unknown> = {}): StreamLine => ({
  type: "result",
  subtype: "success",
  is_error: false,
  stop_reason: "end_turn",
  result: "ok",
  usage: { input_tokens: 1, output_tokens: 2 },
  ...over,
});
const streamEvent = (event: Record<string, unknown>): StreamLine => ({ type: "stream_event", event });
const messageStart = streamEvent({
  type: "message_start",
  message: { usage: { input_tokens: 5, output_tokens: 1 } },
});
const text = (t: string) =>
  streamEvent({ type: "content_block_delta", delta: { type: "text_delta", text: t } });

describe("a recorded tool turn", () => {
  const r = replay(fixtureLines("tool-turn.jsonl"));
  const verdict = r.translator.finish(exited());

  test("the text deltas add up to the CLI's own final text", () => {
    expect(verdict).toMatchObject({ ok: true, stopReason: "end_turn" });
    expect(verdict.ok && verdict.resultText).toBe(r.text);
    expect(r.text).toStartWith("Your ear is right.");
    expect(r.stops).toEqual([]);
  });

  test("status follows the stream; tool events are left to the MCP endpoint", () => {
    expect(r.events.filter((e) => e.type === "status").map((e) => e.data.label)).toEqual([
      "Thinking",
      "Reading the lesson",
      "Comparing with the target",
      "Thinking",
      "Comparing with the target",
      "Thinking",
      "Writing",
    ]);
    const types = new Set(r.events.map((e) => e.type));
    expect([...types].sort()).toEqual(["status", "text"]);
  });

  test("empty thinking deltas are not forwarded (the CLI sends no thinking text)", () => {
    expect(r.events.some((e) => e.type === "thinking")).toBe(false);
  });

  test("usage is the result's token counts; the CLI's list-price figure is never read", () => {
    expect(r.translator.iterations).toBe(3);
    expect(r.translator.sessionId).toBe(SESSION);
    expect(r.translator.usage()).toEqual({
      backend: "claude-cli",
      requests: 3,
      inputTokens: 6,
      outputTokens: 641,
      cacheReadInputTokens: 6985,
      cacheCreationInputTokens: 2126,
      cacheCreation1hInputTokens: 2126,
      cacheCreation5mInputTokens: 0,
      costUsd: null,
      includedInPlan: true,
      servedBy: ["claude-opus-5-5"],
    });
  });
});

test("a recorded structured turn: no text, stop_reason tool_use is a normal ending", () => {
  const r = replay(fixtureLines("structured-review.jsonl"), { expectedTools: ["StructuredOutput"] });
  const verdict = r.translator.finish(exited());
  expect(r.text).toBe("");
  expect(verdict).toMatchObject({ ok: true, stopReason: "end_turn" });
  expect(Object.keys((verdict.ok ? verdict.structuredOutput : {}) as object)).toEqual([
    "strengths",
    "revision",
    "listening_question",
    "liner_note",
  ]);
});

describe("fail closed", () => {
  test.each([
    ["a built-in tool is listed", { tools: [...OAK_TOOLS, "Bash"] }],
    ["a built-in replaces an Oak tool", { tools: [...OAK_TOOLS.slice(1), "WebFetch"] }],
    ["an Oak tool is missing", { tools: OAK_TOOLS.slice(1) }],
    ["a duplicate hides a missing tool", { tools: [...OAK_TOOLS.slice(1), OAK_TOOLS[1]] }],
    ["no tools at all (the MCP server did not connect)", { tools: [] }],
    ["the tool list is absent", { tools: undefined }],
    ["the tool list is not a list", { tools: "mcp__oak__propose_code" }],
  ])("%s: stop at the init event, nothing forwarded", (_name, over) => {
    const r = replay([init(over), messageStart, text("hello"), result()]);
    expect(r.stops).toHaveLength(1);
    expect(r.stops[0]).toStartWith("unexpected tool surface");
    expect(r.delivered).toBe(1);
    expect(r.events).toEqual([]);
    expect(r.translator.violated).toBe(true);
    const verdict = r.translator.finish(exited({ exitCode: 143, stopped: r.stops[0] as string }));
    expect(verdict).toMatchObject({
      ok: false,
      error: { kind: "internal", message: "Something went wrong in the tutor." },
    });
  });

  test("the order of the listed tools does not matter", () => {
    const r = replay([init({ tools: [...OAK_TOOLS].reverse() }), messageStart, text("hello"), result()]);
    expect(r.stops).toEqual([]);
    expect(r.text).toBe("hello");
  });

  test("model output before any init event is not forwarded", () => {
    const r = replay([messageStart, text("hello"), init(), result()]);
    expect(r.stops).toEqual(["stream event before init"]);
    expect(r.events).toEqual([]);
  });

  test("a CLI that is using an API key is refused: this backend is the subscription login", () => {
    const r = replay([init({ apiKeySource: "ANTHROPIC_API_KEY" }), messageStart, text("hello"), result()]);
    expect(r.events).toEqual([]);
    expect(r.translator.finish(exited({ stopped: r.stops[0] as string }))).toMatchObject({
      ok: false,
      error: { kind: "auth" },
    });
  });

  test("the iteration limit: the model call beyond it is cut before it can write or call", () => {
    const r = replay(fixtureLines("tool-turn.jsonl"), { maxIterations: 2 });
    expect(r.stops).toEqual(["more than 2 model calls"]);
    expect(r.text).toBe(""); // the reply came in the third call
    expect(r.translator.finish(exited({ stopped: "x" }))).toMatchObject({
      ok: false,
      error: { kind: "iteration_limit" },
    });
  });
});

describe("how a run ended", () => {
  const ended = (lines: StreamLine[], proc = exited()) =>
    replay([init(), messageStart, ...lines]).translator.finish(proc);

  test("no result event: never a completed turn", () => {
    expect(ended([text("partial")], exited({ exitCode: 1 }))).toMatchObject({
      ok: false,
      error: { kind: "internal" },
    });
    expect(ended([text("partial")], exited({ exitCode: 0 }))).toMatchObject({
      ok: false,
      error: { kind: "internal" },
    });
    // Killed from outside (SIGTERM) reads as stopped.
    expect(ended([], exited({ exitCode: 143 }))).toMatchObject({ ok: false, error: { kind: "aborted" } });
    expect(ended([], exited({ exitCode: 1, stderr: "Invalid API key · Please run /login" }))).toMatchObject({
      error: { kind: "auth" },
    });
  });

  test("Stop wins over whatever else happened; a timeout is a network error", () => {
    expect(ended([result()], exited({ aborted: true, exitCode: 143 }))).toMatchObject({
      error: { kind: "aborted" },
    });
    expect(ended([], exited({ timedOut: true, exitCode: 143 }))).toMatchObject({
      error: { kind: "network" },
    });
    expect(ended([], exited({ spawnError: { code: "ENOENT", message: "x" }, exitCode: null }))).toMatchObject(
      {
        error: { kind: "internal" },
      },
    );
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
    [{ is_error: true, result: "API Error: 429 Too Many Requests" }, "rate_limit"],
    [{ is_error: true, api_error_status: 429, result: "" }, "rate_limit"],
    [{ is_error: true, api_error_status: 401, result: "" }, "auth"],
    [{ is_error: true, api_error_status: 400, result: "" }, "bad_request"],
    [{ is_error: true, api_error_status: 529, result: "" }, "overloaded"],
    [{ is_error: true, result: "Not logged in · Please run /login" }, "auth"],
    [{ is_error: true, result: "fetch failed" }, "network"],
    [{ is_error: true, subtype: "error_max_turns", result: "" }, "iteration_limit"],
    [{ is_error: false, subtype: "error_during_execution", result: "" }, "internal"],
    [{ is_error: true, result: "something new" }, "internal"],
    [{ stop_reason: "refusal" }, "refusal"],
  ] as const)("result %j -> %s", (over, kind) => {
    const verdict = ended([text("x"), result(over)]);
    expect(verdict).toMatchObject({ ok: false, error: { kind } });
  });

  test("an in-band error on an assistant message fails the turn although the result says success", () => {
    for (const [error, kind] of [
      ["rate_limit", "rate_limit"],
      ["authentication_failed", "auth"],
      ["server_error", "overloaded"],
      ["unknown", "internal"],
    ] as const) {
      const verdict = ended([
        { type: "assistant", message: { content: [] }, error },
        result({ result: "API Error" }),
      ]);
      expect(verdict).toMatchObject({ ok: false, error: { kind } });
    }
  });

  test("a rejected rate-limit event is a rate limit, with the reset time as retry-after", () => {
    const rejected: StreamLine = {
      type: "rate_limit_event",
      rate_limit_info: { status: "rejected", resetsAt: 2_000 },
    };
    const r = replay([init(), rejected, result({ result: "" })], { nowMs: () => 1_940_000 });
    expect(r.translator.finish(exited())).toEqual({
      ok: false,
      error: {
        kind: "rate_limit",
        message: "The tutor is being rate limited. Try again in a moment.",
        retryAfterSec: 60,
      },
      detail: expect.any(String),
    });
    // An allowed event (present in every recording) changes nothing.
    const allowed: StreamLine = {
      type: "rate_limit_event",
      rate_limit_info: { status: "allowed", resetsAt: 2_000 },
    };
    expect(replay([init(), allowed, result()]).translator.finish(exited()).ok).toBe(true);
  });

  test("max_tokens completes with that stop reason; unknown stop reasons are 'other'", () => {
    expect(ended([result({ stop_reason: "max_tokens" })])).toMatchObject({
      ok: true,
      stopReason: "max_tokens",
    });
    expect(ended([result({ stop_reason: "pause_turn" })])).toMatchObject({ ok: true, stopReason: "other" });
    expect(ended([result({ stop_reason: null })])).toMatchObject({ ok: true, stopReason: "other" });
  });

  test("the learner-facing error is fixed copy; the diagnostic is scrubbed of credentials", () => {
    const stderr = "request failed: x-api-key: sk-ant-api03-AAAABBBBCCCC X-Oak-Turn: deadbeefdeadbeef";
    const verdict = ended([], exited({ exitCode: 1, stderr }));
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.error).toEqual({ kind: "internal", message: "Something went wrong in the tutor." });
    expect(verdict.detail).toContain("exit 1");
    expect(verdict.detail.includes("AAAABBBBCCCC")).toBe(false);
    expect(verdict.detail.includes("deadbeefdeadbeef")).toBe(false);
  });
});

describe("usage", () => {
  test("without a result event, the per-call counts seen so far stand in", () => {
    const delta = (out: number) =>
      streamEvent({
        type: "message_delta",
        usage: { input_tokens: 5, output_tokens: out, cache_read_input_tokens: 100 },
      });
    const r = replay([init(), messageStart, delta(40), messageStart, text("cut")]);
    expect(r.translator.usage()).toMatchObject({
      requests: 2,
      inputTokens: 10,
      outputTokens: 41, // 40 final for the first call, 1 so far for the second
      cacheReadInputTokens: 100,
      costUsd: null,
      includedInPlan: true,
    });
  });

  test("a run that never reached the model counts nothing", () => {
    const r = replay([init()]);
    expect(r.translator.usage()).toMatchObject({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      servedBy: [],
    });
  });

  test("non-empty thinking deltas are forwarded, should the CLI ever send them", () => {
    const thinking = streamEvent({
      type: "content_block_delta",
      delta: { type: "thinking_delta", thinking: "Hm." },
    });
    expect(replay([init(), messageStart, thinking]).events).toContainEqual({
      type: "thinking",
      data: { delta: "Hm." },
    });
  });
});
