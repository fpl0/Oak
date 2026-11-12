// The tools U03 and U04 unlock (contracts §3.2 group C and B, U03.L02 … U04.L03): each is locked before its
// lesson (an error in a graded step, an info hint in Studio that never blocks) and accepted from its
// lesson on. Unlock sessions as in content/toolbox.ts (the test data mirrors its rows).
import { describe, expect, test } from "bun:test";
import type { LintContext, LintProfile, ToolEntry } from "@oak/content-kit";
import { renderFeedback } from "../feedback/catalog.ts";
import { lintOak } from "./oak.ts";
import { TOOLBOX } from "./toolbox.test-data.ts";

const COURSE = [
  "U00.L01",
  "U00.L02",
  ...Array.from({ length: 9 }, (_, i) => `U01.L0${i + 1}`),
  ...Array.from({ length: 8 }, (_, i) => `U02.L0${i + 1}`),
  ...Array.from({ length: 11 }, (_, i) => `U03.L${String(i + 1).padStart(2, "0")}`),
  ...Array.from({ length: 4 }, (_, i) => `U04.L0${i + 1}`),
];
/** Every tool whose session is at or before `session` in the default order. */
const through = (session: string): Set<ToolEntry["id"]> => {
  const upTo = new Set(COURSE.slice(0, COURSE.indexOf(session) + 1));
  return new Set(TOOLBOX.filter((e) => upTo.has(e.unlock.at as string)).map((e) => e.id));
};
const before = (session: string): Set<ToolEntry["id"]> =>
  through(COURSE[COURSE.indexOf(session) - 1] as string);
const ctx = (profile: LintProfile, unlocked: Set<ToolEntry["id"]>): LintContext => ({
  profile,
  unlocked,
  allowPreview: false,
  meter: "4/4",
  key: null,
});
const T = "setcpm(120/4)\n\n";

const CASES: [tool: string, session: string, code: string, finding: string][] = [
  ["tb.n", "U03.L02", `${T}mel: n("0 2 4").scale("C4:major").s("piano")`, "code.locked-tool"],
  ["tb.scale", "U03.L02", `${T}mel: n("0 2 4").scale("C4:major").s("piano")`, "code.locked-tool"],
  ["scale.major", "U03.L02", `${T}mel: n("0 2 4").scale("C4:major").s("piano")`, "code.locked-scale"],
  ["tb.n.range", "U03.L03", `${T}mel: n("-1 0 7").scale("C4:major").s("piano")`, "code.locked-tool"],
  ["tb.mini.range", "U03.L04", `${T}mel: n("0 .. 4").scale("C4:major").s("piano")`, "code.locked-mini"],
  [
    "tb.scale.patterned",
    "U03.L05",
    `${T}mel: n("0 2 4 2").scale("<C4:major G4:major>").s("piano")`,
    "code.locked-tool",
  ],
  [
    "tb.legato",
    "U03.L09",
    `${T}mel: n("0 2 4 2").scale("C4:major").legato(0.5).s("piano")`,
    "code.locked-tool",
  ],
  [
    "tb.transpose.interval",
    "U04.L02",
    `${T}mel: n("0 2 4").scale("C4:major").transpose("3M").s("piano")`,
    "code.locked-tool",
  ],
  ["tb.mini.stack", "U04.L03", `${T}mel: n("[0,2] [0,4]").scale("C4:major").s("piano")`, "code.locked-mini"],
];

describe("U03–U04 tools: locked before their lesson, accepted from it on", () => {
  for (const [tool, session, code, finding] of CASES) {
    test(`${tool} (${session})`, () => {
      const locked = lintOak(code, ctx("graded", before(session)), TOOLBOX);
      expect(locked.locked).toContain(tool as ToolEntry["id"]);
      expect(locked.ok).toBe(false);
      const d = locked.diagnostics.find((x) => x.id === finding);
      expect(d?.severity).toBe("error");
      expect(renderFeedback(d as NonNullable<typeof d>)).toContain(session);
      // Studio: a hint, never a block.
      const studio = lintOak(code, ctx("studio", before(session)), TOOLBOX);
      expect(studio.ok).toBe(true);
      expect(studio.diagnostics.find((x) => x.id === finding)?.severity).toBe("info");
      // From the lesson on (the lint context of a lesson includes its own unlocks, contracts §3.1 rule 2).
      const open = lintOak(code, ctx("graded", through(session)), TOOLBOX);
      expect(open.locked).not.toContain(tool as ToolEntry["id"]);
      expect(open.ok).toBe(true);
    });
  }

  test("a later scale name stays locked through U04 (minor unlocks in U10.L01)", () => {
    const r = lintOak(
      `${T}mel: n("0 2 4").scale("A3:minor").s("piano")`,
      ctx("graded", through("U04.L04")),
      TOOLBOX,
    );
    expect(r.locked).toContain("scale.minor" as ToolEntry["id"]);
    expect(r.diagnostics.find((d) => d.id === "code.locked-scale")?.params.name).toBe("minor");
  });

  test("a numeric transpose is the U02 tool, not the interval string", () => {
    const r = lintOak(
      `${T}mel: n("0 2 4").scale("C4:major").transpose(12).s("piano")`,
      ctx("graded", through("U03.L11")),
      TOOLBOX,
    );
    expect(r.locked).not.toContain("tb.transpose.interval" as ToolEntry["id"]);
  });

  test('"0..7" is an error with a friendly fix, "0 .. 7" is the range', () => {
    const bad = lintOak(
      `${T}mel: n("0..7").scale("C4:major").s("piano")`,
      ctx("graded", through("U03.L04")),
      TOOLBOX,
    );
    expect(bad.ok).toBe(false);
    const d = bad.diagnostics.find((x) => x.id === "code.range-spacing");
    expect(d?.severity).toBe("error");
    expect(d?.message).toBe(
      'Strudel reads "0..7" as one word, not a range. Put a space on each side of the dots: "0 .. 7".',
    );
    expect(renderFeedback(d as NonNullable<typeof d>)).toBe(d?.message as string);
    // Studio never blocks (contracts §3.3): the same finding, as a hint.
    const studio = lintOak(
      `${T}mel: n("0..7").scale("C4:major").s("piano")`,
      ctx("studio", through("U03.L04")),
      TOOLBOX,
    );
    expect(studio.ok).toBe(true);
    expect(studio.diagnostics.find((x) => x.id === "code.range-spacing")?.message).toBe(d?.message as string);
    const good = lintOak(
      `${T}mel: n("0 .. 7").scale("C4:major").s("piano")`,
      ctx("graded", through("U03.L04")),
      TOOLBOX,
    );
    expect(good.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
  });
});
