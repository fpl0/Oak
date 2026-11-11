import { describe, expect, test } from "bun:test";
import {
  asTutorEvent,
  CapstoneReviewSchema,
  EFFORT_OF,
  LANE_OF,
  parseTutorText,
  reviewRevisionsFor,
  SseParser,
  THREAD_KINDS,
  TUTOR_ERROR_COPY,
  TUTOR_ERROR_KINDS,
  TUTOR_EVENT_TYPES,
  TutorEventSchema,
  TutorTurnRequestSchema,
} from "./tutor.ts";

describe("tutor protocol (contracts §10)", () => {
  test("the event types and error kinds of §10.1", () => {
    // `review` is the delivery event of a validated review object; the rest is the list of §10.1.
    expect([...TUTOR_EVENT_TYPES].sort()).toEqual([
      "card",
      "done",
      "error",
      "meta",
      "review",
      "status",
      "text",
      "thinking",
      "tool_input",
      "tool_result",
      "tool_start",
      "usage",
    ]);
    expect([...TUTOR_ERROR_KINDS]).toEqual([
      "rate_limit",
      "overloaded",
      "auth",
      "bad_request",
      "network",
      "refusal",
      "max_tokens",
      "iteration_limit",
      "aborted",
      "internal",
    ]);
    expect(Object.keys(TUTOR_ERROR_COPY).sort()).toEqual([...TUTOR_ERROR_KINDS].sort());
  });

  test("six request kinds map onto four lanes with a constant effort each (§10.2)", () => {
    expect(THREAD_KINDS.map((k) => `${k}:${LANE_OF[k]}:${EFFORT_OF[LANE_OF[k]]}`)).toEqual([
      "chat:chat:medium",
      "hint:hint:low",
      "explain:hint:low",
      "listening:note:low",
      "review-capstone:review:high",
      "review-transcription:review:high",
    ]);
  });

  test("a turn request is strict and never carries a rung", () => {
    const ok = { thread: { subjectKind: "lesson", subjectId: "U03.L02" }, kind: "hint", userText: "" };
    expect(TutorTurnRequestSchema.safeParse(ok).success).toBe(true);
    expect(TutorTurnRequestSchema.safeParse({ ...ok, rung: 4 }).success).toBe(false);
    expect(
      TutorTurnRequestSchema.safeParse({ ...ok, thread: { subjectKind: "unit", subjectId: "U03" } }).success,
    ).toBe(false);
  });

  test("events validate; unknown shapes are rejected", () => {
    expect(TutorEventSchema.safeParse({ type: "text", data: { delta: "hi" } }).success).toBe(true);
    expect(
      TutorEventSchema.safeParse({ type: "error", data: { kind: "refusal", message: "x" } }).success,
    ).toBe(true);
    expect(TutorEventSchema.safeParse({ type: "error", data: { kind: "quota", message: "x" } }).success).toBe(
      false,
    );
    // The hard monthly cap was removed (2026-11-11), and its error kind with it.
    expect(
      TutorEventSchema.safeParse({ type: "error", data: { kind: "budget", message: "x" } }).success,
    ).toBe(false);
    expect(asTutorEvent({ event: "message", data: {} })).toBeNull();
    expect(asTutorEvent({ event: "text", data: "plain" })).toBeNull();
    expect(
      asTutorEvent({
        event: "card",
        data: {
          cardId: "c1",
          toolUseId: "t1",
          kind: "hint",
          title: "Try",
          code: 'n("0")',
          explanation: "x",
          bars: 1,
          apply: "preview_only",
          applyAllowed: false,
          lockedTools: ["tb.voicing"],
        },
      })?.type,
    ).toBe("card");
  });

  test("SseParser: CRLF, comments, multi-line data, non-JSON frames", () => {
    const p = new SseParser();
    expect(
      p.push(
        ': ping\r\n\r\nevent: text\r\ndata: {"delta":\r\ndata: "a"}\r\n\r\nevent: x\ndata: not json\n\nevent: text\ndata: {',
      ),
    ).toEqual([
      { event: "text", data: { delta: "a" } },
      { event: "x", data: "not json" },
    ]);
    expect(p.comments).toEqual(["ping"]);
    expect(p.pending).toBe("event: text\ndata: {");
  });

  test("review revision counts (§10.6)", () => {
    expect(["C0", "C4", "X1"].map(reviewRevisionsFor)).toEqual([1, 1, 1]);
    expect(["C5", "X2", "C7", "CF-A", "CF-T", "JC1", "RC2", "AC1"].map(reviewRevisionsFor)).toEqual([
      2, 2, 2, 2, 2, 2, 2, 2,
    ]);
    expect(
      CapstoneReviewSchema.safeParse({
        strengths: [],
        revisions: [],
        listeningQuestion: "q",
        linerNote: "n",
        verdict: "pass",
      }).success,
    ).toBe(false);
  });
});

describe("music tokens (contracts §10.7)", () => {
  const tokens = (text: string) => parseTutorText(text).flatMap((p) => (p.type === "token" ? [p.token] : []));

  test("every token kind of the grammar", () => {
    expect(
      tokens(
        "[[deg:5]] [[deg:b3]] [[deg:#4]] [[rn:V7]] [[rn:V7/vi]] [[rn:bVII]] [[note:F#4]] [[chord:Am7]] [[chord:C^7]] [[bars:3-4]] [[bars:7]] [[tool:tb.voicing]] [[term:cadence]] [[reveal]]",
      ),
    ).toEqual([
      { kind: "deg", value: "5" },
      { kind: "deg", value: "b3" },
      { kind: "deg", value: "#4" },
      { kind: "rn", value: "V7" },
      { kind: "rn", value: "V7/vi" },
      { kind: "rn", value: "bVII" },
      { kind: "note", value: "F#4" },
      { kind: "chord", value: "Am7" },
      { kind: "chord", value: "C^7" },
      { kind: "bars", value: "3-4" },
      { kind: "bars", value: "7" },
      { kind: "tool", value: "tb.voicing" },
      { kind: "term", value: "cadence" },
      { kind: "reveal" },
    ]);
  });

  test("unknown or malformed tokens render as plain text", () => {
    const text = "Try [[deg:8]], [[deg:]], [[key:C]], [[bars:a-b]], [[tool:voicing]] and [[reveal:now]].";
    expect(parseTutorText(text)).toEqual([{ type: "text", text }]);
  });

  test("text around tokens is kept exactly", () => {
    expect(parseTutorText("Hear how [[deg:7]] leans up to [[deg:1]].")).toEqual([
      { type: "text", text: "Hear how " },
      { type: "token", token: { kind: "deg", value: "7" }, raw: "[[deg:7]]" },
      { type: "text", text: " leans up to " },
      { type: "token", token: { kind: "deg", value: "1" }, raw: "[[deg:1]]" },
      { type: "text", text: "." },
    ]);
    expect(parseTutorText("")).toEqual([]);
  });
});
