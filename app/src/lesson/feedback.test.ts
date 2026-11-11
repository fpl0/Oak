import { describe, expect, test } from "bun:test";
import type { GradeResult } from "@oak/api";
import { summaryOf, viewFor } from "./feedback.ts";

const result = (status: GradeResult["status"], ids: string[]): GradeResult =>
  ({
    status,
    score: 0,
    dims: {},
    diagnostics: ids.map((id) => ({ id, severity: "error", params: {} })),
    messages: [],
  }) as unknown as GradeResult;

describe("summaryOf", () => {
  const render = () => "";
  test("a sung take with no voice says so, not 'Code didn't run.'", () => {
    const r = result("error", ["sing.no-voice"]);
    const line = summaryOf(viewFor(r, 0, false, render), r);
    expect(line).toContain("didn't hear a voice");
    expect(line).not.toContain("Code");
  });
  test("mic bleed and missed taps get their own lines", () => {
    const b = result("error", ["sing.bleed"]);
    expect(summaryOf(viewFor(b, 0, false, render), b)).toContain("headphones");
    const t = result("error", ["tap.missed"]);
    expect(summaryOf(viewFor(t, 0, false, render), t)).toContain("taps");
  });
  test("a code error keeps the code line", () => {
    const r = result("error", ["eval.syntax"]);
    expect(summaryOf(viewFor(r, 0, false, render), r)).toBe("Code didn't run.");
  });
});
