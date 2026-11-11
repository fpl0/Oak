// Route-level tests through app.request(): no socket, no Bun server (so these also prove the
// stream works when `server.timeout` is not reachable).
import { describe, expect, test } from "bun:test";
import {
  CAPSTONE_REVIEW,
  GRADE,
  LEARNER_CODE,
  LESSON_ID,
  REVIEW_SOURCE,
  STEP_ID,
} from "../testing/fixtures.ts";
import { ScriptedBackend } from "../testing/scripted-backend.ts";
import { UNAVAILABLE } from "../types.ts";
import { TURN_ROUTES } from "./routes.ts";
import { BASE, HEADERS, setup, sse } from "./testing/harness.ts";

const lesson = { subjectKind: "lesson", subjectId: LESSON_ID };

describe("turn routes", () => {
  test("each route fixes its thread kind and streams meta ... done", async () => {
    const backend = new ScriptedBackend("anthropic-api", [{ text: "Listen to bar 1." }]);
    const { post, ports } = setup([backend]);
    ports.lessons.reviews.set("capstone:C2", REVIEW_SOURCE);
    backend.deliveries = [CAPSTONE_REVIEW];
    const step = { thread: lesson, stepId: STEP_ID, learnerCode: LEARNER_CODE, graderResult: GRADE };
    const cases: [string, unknown, string, string[]][] = [
      ["/tutor/chat", { thread: lesson, userText: "Why?" }, "chat", ["meta", "text", "done"]],
      ["/tutor/hint", step, "hint", ["meta", "text", "done"]],
      ["/tutor/explain-mistake", step, "explain", ["meta", "text", "done"]],
      [
        "/tutor/note",
        { thread: { subjectKind: "sketch", subjectId: "sk1" }, learnerCode: 's("bd")' },
        "listening",
        ["meta", "text", "done"],
      ],
      [
        "/tutor/reviews/capstone",
        { thread: { subjectKind: "capstone", subjectId: "C2" } },
        "review-capstone",
        ["meta", "tool_start", "review", "tool_result", "done"],
      ],
    ];
    for (const [path, body, kind, expected] of cases) {
      const res = await post(path, body);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      const { frames, events } = await sse(res);
      expect(events).toEqual(expected);
      expect(frames[0]?.data).toMatchObject({ kind, backend: "anthropic-api" });
    }
    // The hint routes moved the ladder; nothing in a body could have.
    expect(ports.progress.advances.map((a) => a.to)).toEqual([1, 2]);
    // Every kind has a route, and the older spellings reach the same handlers.
    expect(TURN_ROUTES.map((r): string => r.kind).sort()).toEqual(
      ["chat", "explain", "hint", "listening", "review-capstone", "review-transcription"].sort(),
    );
    const alias = await post("/tutor/listening-note", {
      thread: { subjectKind: "sketch", subjectId: "sk1" },
      learnerCode: 's("bd")',
    });
    expect((await sse(alias)).frames[0]?.data).toMatchObject({ kind: "listening" });
  });

  test("a review whose first object is invalid is retried once and ends with review then done", async () => {
    const backend = new ScriptedBackend("claude-cli");
    backend.channel = "direct";
    backend.deliveries = [{ ...CAPSTONE_REVIEW, listeningQuestion: "One? Two?" }, CAPSTONE_REVIEW];
    const { post, ports } = setup([backend]);
    ports.lessons.reviews.set("capstone:C2", REVIEW_SOURCE);
    const body = { thread: { subjectKind: "capstone", subjectId: "C2" }, userText: "Be honest." };
    const ok = await sse(await post("/tutor/review/capstone", body));
    expect(ok.events).toEqual(["meta", "review", "done"]);
    expect(ok.frames[1]?.data).toEqual({ reviewKind: "capstone", review: CAPSTONE_REVIEW });

    backend.deliveries = [{}, {}, CAPSTONE_REVIEW];
    const failed = await sse(await post("/tutor/reviews/capstone", body));
    expect(failed.events).toEqual(["meta", "error"]);
    expect(failed.last?.data).toMatchObject({ kind: "iteration_limit" });
  });

  test("bodies are validated before anything runs", async () => {
    const backend = new ScriptedBackend("anthropic-api", [{ text: "x" }]);
    const { post, ports } = setup([backend]);
    const bad: [string, unknown, string][] = [
      ["/tutor/chat", { thread: lesson, userText: "   " }, "userText"],
      ["/tutor/chat", { thread: lesson, userText: "hi", kind: "review-capstone" }, "kind"],
      ["/tutor/chat", { thread: lesson, userText: "hi", rung: 4 }, "rung"],
      ["/tutor/hint", { thread: lesson, stepId: STEP_ID, hintRung: 4 }, "hintRung"],
      ["/tutor/hint", { thread: lesson, stepId: STEP_ID, passed: true }, "passed"],
      ["/tutor/hint", { thread: lesson }, "stepId"],
      [
        "/tutor/hint",
        { thread: { subjectKind: "general", subjectId: "general" }, stepId: STEP_ID },
        "lessonId",
      ],
      [
        "/tutor/chat",
        { thread: { subjectKind: "nope", subjectId: "x" }, userText: "hi" },
        "thread.subjectKind",
      ],
      ["/tutor/chat", { thread: lesson, userText: "x".repeat(8_001) }, "userText"],
      ["/tutor/note", { thread: { subjectKind: "sketch", subjectId: "s" } }, "learnerCode"],
      ["/tutor/reviews/capstone", { thread: lesson }, "thread.subjectKind"],
      [
        "/tutor/reviews/capstone",
        { thread: { subjectKind: "capstone", subjectId: "C2" }, learnerCode: "x" },
        "learnerCode",
      ],
      [
        "/tutor/reviews/transcription",
        { thread: { subjectKind: "capstone", subjectId: "C2" } },
        "thread.subjectKind",
      ],
    ];
    for (const [path, body, field] of bad) {
      const res = await post(path, body);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { kind: string; problems: string[] } };
      expect(json.error.kind).toBe("bad_request");
      expect(json.error.problems.join(" ")).toContain(field);
    }
    expect((await post("/tutor/chat", "{not json")).status).toBe(400);
    const form = await post("/tutor/chat", "thread=x", {
      ...HEADERS,
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(form.status).toBe(415);
    const plain = await post("/tutor/chat", JSON.stringify({ thread: lesson, userText: "hi" }), {
      ...HEADERS,
      "content-type": "text/plain",
    });
    expect(plain.status).toBe(415);
    expect(backend.turns).toEqual([]);
    expect(ports.progress.advances).toEqual([]);
  });

  test("an oversized body is refused", async () => {
    const { post } = setup([new ScriptedBackend()], { maxBodyBytes: 2_000 });
    const res = await post("/tutor/chat", { thread: lesson, userText: "hi", learnerCode: "x".repeat(5_000) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { kind: "bad_request" } });
  });

  test("tutor off: 200 stream with one error event that says how to set it up", async () => {
    const api = new ScriptedBackend("anthropic-api");
    api.isAvailable = { ok: false, reason: UNAVAILABLE.missingKey };
    const { post } = setup([api]);
    const res = await post("/tutor/chat", { thread: lesson, userText: "hi" });
    expect(res.status).toBe(200);
    const { frames } = await sse(res);
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({ event: "error", data: { kind: "auth" } });
    expect(frames[0]?.data).toMatchObject({
      message: expect.stringContaining("Add an Anthropic API key in Settings"),
    });
  });

  test("budget: the soft marker is a notice frame before done; the hard cap is an error event", async () => {
    const backend = new ScriptedBackend("anthropic-api", [{ text: "ok" }]);
    const { post, ports } = setup([backend]);
    ports.settings.value.softMonthlyUsd = 0.001;
    const first = await sse(await post("/tutor/chat", { thread: lesson, userText: "hi" }));
    expect(first.events).toEqual(["meta", "text", "notice", "done"]);
    expect(first.frames[2]?.data).toEqual({
      kind: "budget_soft_marker",
      message: "Tutor spending passed your monthly marker. Details in Settings.",
    });
    expect(ports.settings.value.softWarnedMonth).toBe("2026-11");
    ports.settings.value.hardMonthlyUsd = 0.001;
    const capped = await sse(await post("/tutor/chat", { thread: lesson, userText: "hi" }));
    expect(capped.events).toEqual(["error"]);
    expect(capped.last?.data).toMatchObject({ kind: "budget" });
  });

  test("without a Bun server the stream still runs and the gap is logged once; `require` refuses", async () => {
    const lenient = setup([new ScriptedBackend("anthropic-api", [{ text: "ok" }])]);
    for (let i = 0; i < 2; i++)
      expect(
        (await sse(await lenient.post("/tutor/chat", { thread: lesson, userText: "hi" }))).last?.event,
      ).toBe("done");
    expect(lenient.logs.filter((l) => l.msg.includes("idle timeout not lifted"))).toHaveLength(1);

    const strict = setup([new ScriptedBackend("anthropic-api", [{ text: "ok" }])], {
      idleTimeout: "require",
    });
    const res = await strict.post("/tutor/chat", { thread: lesson, userText: "hi" });
    expect(res.status).toBe(500);
    const timeouts: number[] = [];
    const server = { timeout: (_r: Request, s: number) => void timeouts.push(s) };
    const ok = await strict.app.request(
      `${BASE}/tutor/chat`,
      { method: "POST", headers: HEADERS, body: JSON.stringify({ thread: lesson, userText: "hi" }) },
      server,
    );
    expect((await sse(ok)).last?.event).toBe("done");
    expect(timeouts).toEqual([0]);
  });
});

describe("security on every tutor route", () => {
  test("cross-origin, missing X-Oak, rebinding Host and preflight are refused before any work", async () => {
    const backend = new ScriptedBackend("anthropic-api", [{ text: "x" }]);
    const { post, get, app } = setup([backend]);
    const body = { thread: lesson, userText: "hi" };
    const { "x-oak": _x, ...noOak } = HEADERS;
    const denied: [Promise<Response>, string][] = [
      [post("/tutor/chat", body, { ...HEADERS, origin: "https://evil.example" }), "origin"],
      [post("/tutor/chat", body, noOak), "x-oak"],
      [post("/tutor/chat", body, { ...HEADERS, host: "evil.example:8787" }), "host"],
      [post("/tutor/warm", undefined, { ...HEADERS, origin: "null" }), "origin"],
      [get("/tutor/status", { host: "127.0.0.1:8787" }), "x-oak"],
      [
        get(`/tutor/threads/lesson/${LESSON_ID}`, { ...HEADERS, "sec-fetch-site": "cross-site" }),
        "fetch-site",
      ],
      [post("/tutor/cards/card-1/applied", undefined, noOak), "x-oak"],
    ];
    for (const [pending, reason] of denied) {
      const res = await pending;
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden", reason });
      expect([...res.headers.keys()].some((k) => k.startsWith("access-control-"))).toBe(false);
    }
    const pre = await app.request(`${BASE}/tutor/chat`, { method: "OPTIONS", headers: HEADERS });
    expect(pre.status).toBe(403);
    expect(backend.turns).toEqual([]);
  });
});
