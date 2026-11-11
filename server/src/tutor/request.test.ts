import { describe, expect, test } from "bun:test";
import { MAX_LEARNER_CODE_CHARS, MAX_USER_TEXT_CHARS, parseTurnRequest } from "./request.ts";
import { GRADE, LEARNER_CODE } from "./testing/fixtures.ts";

const base = {
  thread: { subjectKind: "lesson", subjectId: "U03.L02" },
  kind: "hint",
  userText: "Give me a nudge",
};

describe("tutor request body", () => {
  test("a minimal and a full request", () => {
    expect(parseTurnRequest(base)).toEqual({ ok: true, request: base as never });
    const full = {
      ...base,
      learnerCode: LEARNER_CODE,
      graderResult: GRADE,
      lessonId: "U03.L02",
      stepId: "U03.L02/S5",
    };
    const parsed = parseTurnRequest(full);
    expect(parsed).toEqual({ ok: true, request: full as never });
    // Absent optionals stay absent rather than becoming `undefined` keys.
    const min = parseTurnRequest(base);
    expect(min.ok && Object.keys(min.request)).toEqual(["thread", "kind", "userText"]);
  });

  test.each([
    ["a hint rung", { rung: 4 }],
    ["a pass claim", { passed: true }],
    ["an apply state", { apply: "applicable" }],
    ["a day", { day: "2026-01-01" }],
    ["a backend", { backend: "anthropic-api" }],
    ["an effort", { effort: "high" }],
    ["a model", { model: "claude-haiku" }],
  ])("the browser cannot send %s", (_name, extra) => {
    const r = parseTurnRequest({ ...base, ...extra });
    expect(r.ok).toBe(false);
  });

  test("the contract's `thread_kind` names are not request kinds; unknown subjects are refused", () => {
    expect(parseTurnRequest({ ...base, kind: "note" }).ok).toBe(false);
    expect(parseTurnRequest({ ...base, kind: "review" }).ok).toBe(false);
    expect(parseTurnRequest({ ...base, thread: { subjectKind: "admin", subjectId: "x" } }).ok).toBe(false);
    expect(parseTurnRequest({ ...base, thread: { subjectKind: "lesson", subjectId: "" } }).ok).toBe(false);
    expect(
      parseTurnRequest({ ...base, thread: { subjectKind: "lesson", subjectId: "x", day: "2026-01-01" } }).ok,
    ).toBe(false);
  });

  test("sizes are bounded", () => {
    expect(parseTurnRequest({ ...base, userText: "x".repeat(MAX_USER_TEXT_CHARS) }).ok).toBe(true);
    expect(parseTurnRequest({ ...base, userText: "x".repeat(MAX_USER_TEXT_CHARS + 1) }).ok).toBe(false);
    expect(parseTurnRequest({ ...base, learnerCode: "x".repeat(MAX_LEARNER_CODE_CHARS + 1) }).ok).toBe(false);
    expect(
      parseTurnRequest({
        ...base,
        graderResult: { ...GRADE, issues: Array.from({ length: 201 }, () => GRADE.issues[0]) },
      }).ok,
    ).toBe(false);
  });

  test("a malformed grade is refused with a path", () => {
    const r = parseTurnRequest({ ...base, graderResult: { ...GRADE, status: "passed!" } });
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.problems[0]).toStartWith("graderResult.status:");
    for (const body of [null, "text", 42, [], {}]) expect(parseTurnRequest(body).ok).toBe(false);
  });
});
