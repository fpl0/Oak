// The integration proof: `createDefaultTutor` booted on a real socket, a browser-shaped POST to
// /api/tutor/*, the SSE stream read through to its terminal frame, once on each backend. The CLI
// backend runs the fake `claude` executable, which calls Oak's tools back over HTTP through the
// composed app's own /mcp/tutor mount; the API backend runs the real SDK on a cassette `fetch`.
import { afterEach, describe, expect, test } from "bun:test";
import type { WireRequest } from "./backends/api/cassettes/fake-fetch.ts";
import { reviewAccepted, reviewRejectedTwice } from "./backends/api/cassettes/review-scenarios.ts";
import { greedy, proposeCode, textOnly } from "./backends/api/cassettes/scenarios.ts";
import type { ScriptedCall } from "./backends/cli/testing/scenario.ts";
import { createDefaultTutor } from "./compose.ts";
import { decodeNested, findLeaks, forbiddenKeys, leakMarkers } from "./redaction.ts";
import type { AcceptedReview } from "./service-types.ts";
import { CASSETTE_KEY, type Composed, PARENT_ENV_KEY, startComposed } from "./testing/composed.ts";
import { makePorts } from "./testing/fakes.ts";
import {
  CAPSTONE_REVIEW,
  EXERCISE_REF,
  GRADE,
  LEARNER_CODE,
  LESSON_ID,
  REVIEW_SOURCE,
  STEP,
  STEP_ID,
} from "./testing/fixtures.ts";
import type { ThreadView } from "./thread-view.ts";

const THREAD = { subjectKind: "lesson", subjectId: LESSON_ID } as const;
const CHAT = {
  thread: THREAD,
  userText: "Just tell me the exact code that passes.",
  learnerCode: LEARNER_CODE,
  graderResult: GRADE,
  stepId: STEP_ID,
};
const CARD = {
  kind: "example",
  title: "Same shape in C",
  code: 'mel: n("0 2 4").scale("C4:major")',
  explanation: "Listen to the top.",
  bars: 4,
};
const GREEDY: ScriptedCall[] = [
  { name: "get_lesson_context", arguments: { lesson_id: LESSON_ID, step_id: STEP_ID } },
  {
    name: "compare_haps",
    arguments: {
      learner_code: null,
      target: { kind: "exercise", ref: EXERCISE_REF },
      from_bar: 1,
      bars: 1,
      mode: "auto",
    },
  },
  { name: "evaluate_strudel", arguments: { code: LEARNER_CODE, from_bar: 1, bars: 1, key: "D dorian" } },
  { name: "propose_code", arguments: CARD },
];

let c: Composed;
afterEach(() => c?.stop());

/** Nothing above rung `level` in `haystack`. */
function expectNoLeak(haystack: string, level: 0 | 1 | 2 | 3) {
  expect(findLeaks(haystack, leakMarkers(STEP, GRADE), level)).toEqual([]);
  for (const key of forbiddenKeys(level)) expect(haystack).not.toContain(key);
}

/** A raw API request body: markers anywhere, withheld keys in `messages` (the tool list names "fix"). */
function expectNoLeakOnWire(w: WireRequest | undefined, level: 0 | 1 | 2 | 3) {
  expect(findLeaks(w?.bodyText ?? "", leakMarkers(STEP, GRADE), level)).toEqual([]);
  const messages = decodeNested(JSON.stringify(w?.body.messages));
  for (const key of forbiddenKeys(level)) expect(messages).not.toContain(key);
}

describe("the composed tutor on the claude-cli backend", () => {
  test("POST /api/tutor/chat streams over real HTTP through to `done`", async () => {
    c = startComposed({ runs: [{ fixture: "plain-resume.jsonl" }] });
    const res = await c.sse("/api/tutor/chat", CHAT);

    expect(res.status).toBe(200);
    expect(res.events[0]).toBe("meta");
    expect(res.events.at(-1)).toBe("done");
    expect(res.events.filter((e) => e === "done" || e === "error")).toHaveLength(1);
    expect(res.frames[0]?.data).toMatchObject({
      backend: "claude-cli",
      kind: "chat",
      model: "claude-opus-5-5",
    });
    expect(res.frames.at(-1)?.data).toMatchObject({ backend: "claude-cli", stopReason: "end_turn" });
    expect(res.text).toStartWith("I can't give you the passing code yet");

    // One process, on the learner's login: effort by thread kind, no credential in its environment.
    const [start] = c.starts();
    expect(c.starts()).toHaveLength(1);
    expect(start?.credentials).toEqual([]);
    expect(start?.argv[start.argv.indexOf("--effort") + 1]).toBe("medium");
    expect(JSON.stringify(start)).not.toContain(PARENT_ENV_KEY);
    // The prompt went in on stdin with the context first, redacted to rung 0.
    expect(start?.stdin).toStartWith('<oak_context v="1">');
    expect(start?.stdin).toContain("hint_rung: 0 of 4");
    expectNoLeak(start?.stdin ?? "", 0);
    // Stored once, by the runner, and shown by the threads route.
    const view = (await (await c.get(`/api/tutor/threads/lesson/${LESSON_ID}`)).json()) as ThreadView;
    expect(view.entries.map((e) => [e.role, e.backend, e.failed])).toEqual([
      ["user", null, false],
      ["assistant", "claude-cli", false],
    ]);
  });

  test("tool calls come back through the composed /mcp/tutor mount, cut to the server's rung", async () => {
    c = startComposed({ runs: [{ fixture: "tool-turn.jsonl", calls: GREEDY }] });
    const res = await c.sse("/api/tutor/chat", CHAT);
    expect(res.events.at(-1)).toBe("done");

    const calls = c.mcpLog().filter((m) => m.method === "tools/call");
    expect(calls.map((m) => [m.name, m.status])).toEqual(GREEDY.map((g) => [g.name, 200]));
    const received = calls.map((m) => {
      const body = JSON.parse(m.body) as { result: { content: { text: string }[] } };
      return body.result.content[0]?.text ?? "";
    });
    // What the "model" was given: the stdin prompt and every tool result as it arrived over HTTP.
    expectNoLeak([...c.starts().map((s) => s.stdin), ...received].join("\n"), 0);
    expect(JSON.parse(received[0] as string).step).toMatchObject({ rung: 0, solution: null, hints_seen: [] });
    // And what the browser was given.
    expectNoLeak(res.raw, 0);

    // Tool events and the card reached the browser, in the order the model asked.
    const names = res.frames
      .filter((f) => f.event === "tool_start")
      .map((f) => (f.data as { name: string }).name);
    expect(names).toEqual(GREEDY.map((g) => g.name));
    const card = res.frames.find((f) => f.event === "card")?.data;
    // A graded, unpassed step below hint 4: preview only, whatever the model asked for.
    expect(card).toMatchObject({ code: CARD.code, apply: "preview_only", applyAllowed: false });
    const applied = await c.post(`/api/tutor/cards/${(card as { cardId: string }).cardId}/applied`);
    expect(applied.status).toBe(409);
    // The turn is over: its token is gone.
    expect(c.tutor.mcp.registry.size).toBe(0);
  });

  test("a hint advances the server's rung once, before the process starts, at low effort", async () => {
    c = startComposed({ runs: [{ fixture: "tool-turn.jsonl", calls: GREEDY.slice(0, 2) }] });
    const res = await c.sse("/api/tutor/hint", {
      thread: THREAD,
      stepId: STEP_ID,
      learnerCode: LEARNER_CODE,
    });

    expect(res.events.at(-1)).toBe("done");
    expect(res.frames[0]?.data).toMatchObject({ kind: "hint", lane: "hint", rung: 1 });
    expect(c.ports.progress.advances).toEqual([{ stepId: STEP_ID, from: 0, to: 1 }]);
    const [start] = c.starts();
    expect(start?.argv[start.argv.indexOf("--effort") + 1]).toBe("low");
    expect(start?.stdin).toContain("hint_rung: 1 of 4");
    expect(start?.stdin).toContain(STEP.hints?.[0] ?? "?");
    const received = c
      .mcpLog()
      .filter((m) => m.method === "tools/call")
      .map((m) => m.body)
      .join("\n");
    expectNoLeak(`${start?.stdin}\n${received}`, 1);
  });

  test("the MCP mount answers local processes only, and only with a live turn token", async () => {
    c = startComposed({ runs: [{ fixture: "plain-resume.jsonl" }] });
    const rpc = (
      headers: Record<string, string>,
      body: unknown = { jsonrpc: "2.0", id: 1, method: "tools/list" },
    ) =>
      fetch(`${c.base}/mcp/tutor`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      });
    // A browser page, even Oak's own, has no business here.
    expect((await rpc({ origin: c.base, "x-oak": "1" })).status).toBe(403);
    // No token, a made-up token: there is no turn behind it.
    for (const headers of [{}, { "x-oak-turn": "f".repeat(64) }]) {
      const res = await rpc(headers);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { error: { code: number } }).error.code).toBe(-32001);
    }
    // It is not reachable under the browser prefix at all.
    expect((await c.post("/api/mcp/tutor", { jsonrpc: "2.0", id: 1, method: "ping" })).status).toBe(404);
    // A batch is answered message by message, and without a turn each tool request is refused.
    const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
    const call = { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_learner_progress" } };
    const batch = (await (await rpc({}, [list, call])).json()) as { error: { code: number } }[];
    expect(batch.map((r) => r.error.code)).toEqual([-32001, -32001]);
    expect(
      (
        await rpc(
          {},
          Array.from({ length: 33 }, () => list),
        )
      ).status,
    ).toBe(400);
    // An oversized body is refused before it is parsed.
    const huge = {
      ...call,
      params: { name: "evaluate_strudel", arguments: { code: "x".repeat(1_100_000) } },
    };
    expect((await rpc({}, huge)).status).toBe(413);
    // The Vite dev port is not this endpoint's address.
    expect((await rpc({ host: "localhost:5173" })).status).toBe(403);
    // A forged Host (DNS rebinding) is refused before anything is parsed.
    const forged = await rpc({ host: "evil.example:80" });
    expect(forged.status).toBe(403);
  });
});

describe("the composed tutor on the anthropic-api backend", () => {
  test("POST /api/tutor/chat streams over real HTTP through to `done`", async () => {
    c = startComposed({ apiKey: CASSETTE_KEY, cassette: textOnly() });
    const res = await c.sse("/api/tutor/chat", CHAT);

    expect(res.status).toBe(200);
    expect(res.events[0]).toBe("meta");
    expect(res.events.at(-1)).toBe("done");
    expect(res.frames[0]?.data).toMatchObject({ backend: "anthropic-api", kind: "chat" });
    expect(res.text).toBe("Look at beat 3 of bar 1. Which number is the octave?");
    expect(res.events).toContain("thinking");
    // The API key present means the CLI was never started.
    expect(c.starts()).toHaveLength(0);

    expect(c.wire).toHaveLength(1);
    const [req] = c.wire;
    expect(req?.body).toMatchObject({
      model: "claude-opus-5-5",
      output_config: { effort: "medium" },
      max_tokens: 16_000,
      tool_choice: { type: "auto" },
    });
    expectNoLeakOnWire(req, 0);
    // The key went to the API in its header (SDK 1.8.0 sends it as a bearer token) and nowhere else.
    expect(req?.headers.authorization).toBe(`Bearer ${CASSETTE_KEY}`);
    expect(res.raw).not.toContain(CASSETTE_KEY);
    const status = await (await c.get("/api/tutor/status")).text();
    expect(status).not.toContain(CASSETTE_KEY);
    expect(JSON.parse(status)).toMatchObject({ tutor: "ready", active: "anthropic-api" });
    expect(JSON.stringify(c.logs)).not.toContain(CASSETTE_KEY);
  });

  test("a tool loop: every request body stays at the server's rung, the card arrives preview-only", async () => {
    c = startComposed({
      apiKey: CASSETTE_KEY,
      cassette: { name: "two", responses: [...greedy().responses] },
    });
    const res = await c.sse("/api/tutor/chat", CHAT);
    expect(res.events.at(-1)).toBe("done");
    expect(c.wire).toHaveLength(3);
    for (const w of c.wire) expectNoLeakOnWire(w, 0);
    expectNoLeak(res.raw, 0);

    c.stop();
    c = startComposed({ apiKey: CASSETTE_KEY, cassette: proposeCode() });
    const card = await c.sse("/api/tutor/chat", CHAT);
    expect(card.events.at(-1)).toBe("done");
    expect(card.frames.find((f) => f.event === "card")?.data).toMatchObject({
      apply: "preview_only",
      applyAllowed: false,
    });
    // Card drafts are unlinted code: not forwarded by default.
    expect(card.events).not.toContain("tool_input");
  });

  test("a key pasted while the server runs takes effect without a restart", async () => {
    let key: string | null = null;
    c = startComposed({ apiKey: () => key, cassette: textOnly(), runs: [{ fixture: "plain-resume.jsonl" }] });
    c.ports.settings.value = { ...c.ports.settings.value, backend: "anthropic-api" };
    const off = await c.sse("/api/tutor/chat", CHAT);
    expect(off.frames.at(-1)).toMatchObject({ event: "error", data: { kind: "auth" } });
    expect(c.wire).toHaveLength(0);

    key = CASSETTE_KEY;
    c.tutor.refresh();
    const on = await c.sse("/api/tutor/chat", CHAT);
    expect(on.events.at(-1)).toBe("done");
    expect(c.wire).toHaveLength(1);
  });
});

describe("reviews through the composed app", () => {
  const REVIEW = { thread: { subjectKind: "capstone", subjectId: "C2" } } as const;
  const stored: AcceptedReview[] = [];
  const over = { onReview: (r: AcceptedReview) => void stored.push(r) };

  test("CLI: `--json-schema` at high effort; the accepted review reaches `onReview` once", async () => {
    stored.length = 0;
    c = startComposed({
      runs: [{ fixture: "structured-review.jsonl", structuredOutput: CAPSTONE_REVIEW }],
      over,
    });
    c.ports.lessons.reviews.set("capstone:C2", REVIEW_SOURCE);
    const res = await c.sse("/api/tutor/reviews/capstone", REVIEW);
    expect(res.events).toEqual(["meta", "review", "done"]);
    expect(res.frames[1]?.data).toEqual({ reviewKind: "capstone", review: CAPSTONE_REVIEW });
    const argv = c.starts()[0]?.argv ?? [];
    expect(argv[argv.indexOf("--effort") + 1]).toBe("high");
    expect(argv).toContain("--json-schema");
    expect(stored).toEqual([{ subject: REVIEW.thread, reviewKind: "capstone", review: CAPSTONE_REVIEW }]);
    expect(c.ports.notes.notes.map((n) => n.source)).toEqual(["review"]);
  });

  test("API: the submit tool at high effort; a review that is never valid ends in `error`, its calls logged", async () => {
    stored.length = 0;
    c = startComposed({ apiKey: CASSETTE_KEY, cassette: reviewAccepted(), over });
    c.ports.lessons.reviews.set("capstone:C2", REVIEW_SOURCE);
    const ok = await c.sse("/api/tutor/reviews/capstone", REVIEW);
    expect(ok.events).toEqual(["meta", "tool_start", "review", "tool_result", "done"]);
    expect(c.wire[0]?.body).toMatchObject({ output_config: { effort: "high" }, max_tokens: 32_000 });
    expect(stored).toHaveLength(1);

    c.stop();
    stored.length = 0;
    c = startComposed({ apiKey: CASSETTE_KEY, cassette: reviewRejectedTwice(), over });
    c.ports.lessons.reviews.set("capstone:C2", REVIEW_SOURCE);
    const bad = await c.sse("/api/tutor/reviews/capstone", REVIEW);
    expect(bad.events.at(-1)).toBe("error");
    expect(bad.events).not.toContain("review");
    expect(stored).toEqual([]);
    // Two paid calls, both in the usage log although the review failed.
    expect(c.ports.usage.rows).toHaveLength(2);
    expect(c.ports.notes.notes).toEqual([]);
  });
});

describe("selection and wiring", () => {
  test("no key and no logged-in CLI: the tutor is off, as one `error` frame with set-up guidance", async () => {
    c = startComposed({ auth: { json: { loggedIn: false } } });
    const res = await c.sse("/api/tutor/chat", CHAT);
    expect(res.events).toEqual(["error"]);
    expect(res.frames[0]?.data).toMatchObject({ kind: "auth" });
    expect(c.starts()).toHaveLength(0);
    expect(await (await c.get("/api/tutor/status")).json()).toMatchObject({
      tutor: "missing_key",
      active: null,
    });
  });

  test("the browser rules hold on the composed routes", async () => {
    c = startComposed();
    const headers = c.headers();
    const cross = await c.post("/api/tutor/chat", CHAT, { ...headers, origin: "https://evil.example" });
    expect(cross.status).toBe(403);
    const { "x-oak": _dropped, ...noOak } = headers;
    expect((await c.post("/api/tutor/chat", CHAT, noOak)).status).toBe(403);
    const preflight = await fetch(`${c.base}/api/tutor/chat`, { method: "OPTIONS", headers });
    expect(preflight.status).toBe(403);
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("the MCP endpoint cannot be mounted under the browser prefix", () => {
    expect(() => createDefaultTutor({ ports: makePorts(), mcpPath: "/api/mcp" })).toThrow(/outside basePath/);
  });

  test("a warm-up on the API backend is recorded as usage; the CLI needs none", async () => {
    const warmed = {
      id: "msg_w",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [],
      stop_reason: "max_tokens",
      stop_sequence: null,
      usage: {
        input_tokens: 3,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 6000,
        cache_creation: { ephemeral_1h_input_tokens: 6000, ephemeral_5m_input_tokens: 0 },
      },
    };
    c = startComposed({
      apiKey: CASSETTE_KEY,
      cassette: { name: "warm", responses: [{ json: warmed, steps: [] }] },
    });
    expect(await (await c.post("/api/tutor/warm", {})).json()).toMatchObject({
      warmed: true,
      backend: "anthropic-api",
    });
    expect(c.wire[0]?.body).toMatchObject({ max_tokens: 0, stream: false });
    await Bun.sleep(5);
    expect(c.ports.usage.rows).toHaveLength(1);
    expect(c.ports.usage.rows[0]).toMatchObject({
      conversationId: "warm",
      usage: { cacheCreation1hInputTokens: 6000 },
    });
    expect(c.ports.usage.rows[0]?.usage.costUsd).toBeGreaterThan(0);

    c.stop();
    c = startComposed({ runs: [{ fixture: "plain-resume.jsonl" }] });
    expect(await (await c.post("/api/tutor/warm", {})).json()).toMatchObject({
      warmed: false,
      backend: "claude-cli",
      reason: "not_needed",
    });
  });
});
