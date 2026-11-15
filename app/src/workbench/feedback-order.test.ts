// Carry f5 (docs/design/wave7.md §2): the Workbench's FeedbackPanel prints the step's own sentence (the grader's
// message, rendered with the step's `feedbackText`) before the catalog's general one; the catalog's is used only for a
// finding the result carries no message for. A "3 more" line is a count, never a finding's text.
import { describe, expect, test } from "bun:test";
import type { Diagnostic, GradeResult } from "@oak/content-kit";
import { messagesOf, renderFeedback } from "@oak/grader";
import { messageOf, viewOf } from "./FeedbackPanel.tsx";

const diag = (id: string, bar: number, params: Record<string, string> = {}): Diagnostic =>
  ({ id, severity: "error", params, where: { bar } }) as unknown as Diagnostic;

function result(ds: Diagnostic[], overrides?: Record<string, string>): GradeResult {
  return {
    exerciseId: "X.L01/s",
    exerciseVersion: 1,
    attemptNo: 1,
    firstAttempt: true,
    mode: "lesson",
    status: "fail",
    score: 0,
    adjustedScore: 0,
    dims: {},
    constraints: [],
    diagnostics: ds,
    messages: messagesOf(ds, overrides as never),
    assist: { rung: 0 },
  } as unknown as GradeResult;
}

describe("the step's own sentence comes first (f5)", () => {
  const own = "The two hits inside beats 2 and 4 sit an equal distance apart: lean the second one later.";
  const d = diag("rubric.unmet", 2, { label: "The short hits swing", detail: "the off-beats are even" });

  test("an overridden finding shows the step's sentence, not the catalog's, at every rung", () => {
    const r = result([d], { "rubric.unmet": own });
    const catalog = renderFeedback(d);
    expect(catalog).not.toBe(own);
    for (const rung of [0, 1, 2, 3, 4] as const) {
      const view = viewOf(r, rung, { render: (x) => renderFeedback(x) });
      expect(view.issues[0]?.what).toBe(own);
    }
  });

  test("a finding the step does not override reads the catalog's sentence, as before", () => {
    const r = result([d]);
    const view = viewOf(r, 0, { render: (x) => renderFeedback(x) });
    expect(view.issues[0]?.what).toBe("The short hits swing: the off-beats are even");
  });

  test("a finding past the first three uses the catalog; the '1 more' line is never its text", () => {
    const ds = [1, 2, 3, 4].map((b) => diag("rubric.unmet", b, { label: `Rule ${b}`, detail: "unmet" }));
    // The fourth has no place of its own in the "1 more" line's terms: give it none.
    const fourth = { ...ds[3], where: {} } as Diagnostic;
    const r = result([...ds.slice(0, 3), fourth]);
    expect(r.messages.at(-1)?.text).toBe("1 more");
    expect(messageOf(r, fourth)).toBeNull();
    const view = viewOf(r, 0, { render: (x) => renderFeedback(x) });
    expect(view.issues.map((i) => i.what)).toEqual([
      "Rule 1: unmet",
      "Rule 2: unmet",
      "Rule 3: unmet",
      "Rule 4: unmet",
    ]);
  });
});
