// Golden rubric tests of contracts §6.3 item 8: for each of `form`, `contrast`, `key-change` and `groove-lock`,
// one piece that passes under per-track `arrange()` and one that fails ONLY because two tracks disagree about the
// sections (`form.inconsistent-arrange`, naming the first disagreement). Also item 7 (sections restart; the
// period warning) and §6.8 item 4 (the key plan after `arrange()`; a patterned scale inside a section is linted).
// Every piece was run headless against 1.2.6.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec, LintContext, RubricRule } from "@oak/content-kit";
import { strudel } from "../analyze/__support__/fixtures.ts";
import { sectionsFromAst } from "../analyze/sections.ts";
import { lintOak } from "../lint/oak.ts";
import { ALL_UNLOCKED, TOOLBOX } from "../lint/toolbox.test-data.ts";
import type { RubricContext } from "./context.ts";
import { evaluateRubric } from "./index.ts";
import { evalRule } from "./rules.ts";

setDefaultTimeout(30_000);
const C: KeySpec = { tonic: "C", mode: "major" };
const rule = (body: Record<string, unknown>): RubricRule =>
  ({ id: "golden", label: "golden", required: true, skills: [], ...body }) as unknown as RubricRule;

async function run(r: RubricRule, code: string) {
  const s = sectionsFromAst(code);
  const bars = s && "totalBars" in s ? s.totalBars : 16;
  const n = await strudel(code, bars);
  const ctx: RubricContext = { meter: "4/4", code, params: {}, bars, totalBars: bars, key: C };
  const out = evaluateRubric([r], n, ctx);
  return { ok: out.rows[0]?.ok ?? false, detail: evalRule(r, n, ctx).detail, extra: out.extra };
}
/** The same piece with one track's sections disagreeing: the bass's chorus lasts 6 bars instead of 4. */
const disagree = (code: string): string =>
  code.replace(
    /bass: arrange\(\[4, bassVerse\], \[4, bassChorus\]/,
    "bass: arrange([4, bassVerse], [6, bassChorus]",
  );

const PIECE = `setcpm(100/4)
const chordsVerse = chord("<C Am F G>").voicing()
const chordsChorus = chord("<F G C C>").voicing()
const bassVerse = note("<[c2 ~ c2 ~] [a1 ~ a1 ~] [f1 ~ f1 ~] [g1 ~ g1 ~]>")
const bassChorus = note("<[f1 ~ f1 f1] [g1 ~ g1 g1] [c2 ~ c2 c2] [c2 ~ c2 c2]>")
const melVerse = n("<[0 ~ 2 ~] [0 ~ ~ ~] [3 ~ 2 ~] [1 ~ ~ ~]>").scale("C4:major")
const melChorus = n("<[7 9 8 7] [6 7 8 9] [9 8 7 5] [7 ~ 7 ~]>").scale("C4:major")
const kickVerse = s("bd ~ bd ~")
const kickChorus = s("bd ~ bd bd")
chords: arrange([4, chordsVerse], [4, chordsChorus], [4, chordsVerse], [4, chordsChorus]).s("piano")
bass: arrange([4, bassVerse], [4, bassChorus], [4, bassVerse], [4, bassChorus]).s("sawtooth")
mel: arrange([4, melVerse], [4, melChorus], [4, melVerse], [4, melChorus]).s("piano")
kick: arrange([4, kickVerse], [4, kickChorus], [4, kickVerse], [4, kickChorus])
hats: s("hh*8").gain(.4)`;

function inconsistent(out: { ok: boolean; extra: { id: string; params: Record<string, unknown> }[] }) {
  expect(out.ok).toBe(false);
  const d = out.extra.find((x) => x.id === "form.inconsistent-arrange");
  expect(d).toBeDefined();
  expect(String(d?.params.detail)).toContain("bass");
}

describe("§6.3 item 8: per-track arrange() passes; two tracks that disagree fail", () => {
  test("form verse chorus verse chorus (names, letters, tags)", async () => {
    for (const pattern of ["verse chorus verse chorus", "ABAB", "verse chorus ? chorus"])
      expect((await run(rule({ rule: "form", pattern }), PIECE)).ok).toBe(true);
    const wrong = await run(rule({ rule: "form", pattern: "verse verse chorus chorus" }), PIECE);
    expect(wrong.ok).toBe(false);
    expect(wrong.extra.map((d) => d.id)).toEqual(["form.wrong"]);
    inconsistent(await run(rule({ rule: "form", pattern: "verse chorus verse chorus" }), disagree(PIECE)));
  });
  test("contrast chorus vs verse on two axes", async () => {
    const r = rule({
      rule: "contrast",
      a: { section: "chorus" },
      b: { section: "verse" },
      axes: ["pitch", "density", "harmony", "register", "energy"],
      minAxes: 2,
    });
    const out = await run(r, PIECE);
    expect(out.ok).toBe(true);
    expect(out.detail).toContain("pitch");
    inconsistent(await run(r, disagree(PIECE)));
  });
  test("groove-lock: the bass on the kick", async () => {
    const r = rule({ rule: "groove-lock", kick: "kick", bass: "bass", min: 0.5 });
    expect((await run(r, PIECE)).ok).toBe(true);
    inconsistent(await run(r, disagree(PIECE)));
  });
  test("key-change: the last chorus a whole step up, the key plan after arrange() (§6.8 item 4)", async () => {
    const LIFT = `setcpm(100/4)
const melVerse = n("<[0 2 4 2] [1 3 2 0]>")
const melChorus = n("<[4 4 5 4] [2 ~ 0 ~]>")
const bassVerse = n("<[0 ~ 0 ~] [4 ~ 4 ~]>")
const bassChorus = n("<[3 ~ 3 ~] [0 ~ 0 ~]>")
mel: arrange([8, melVerse], [8, melChorus], [8, melChorus]).scale("<C4:major!16 D4:major!8>").s("piano")
bass: arrange([8, bassVerse], [8, bassChorus], [8, bassChorus]).scale("<C2:major!16 D2:major!8>").s("sawtooth")`;
    const r = rule({ rule: "key-change", at: "last", semitones: [2], minBarsAfter: 8, sameMelody: true });
    const out = await run(r, LIFT);
    expect(out.ok).toBe(true);
    expect(out.detail).toBe("C major → D major at bar 17");
    const bad = LIFT.replace(
      "bass: arrange([8, bassVerse], [8, bassChorus]",
      "bass: arrange([8, bassVerse], [6, bassChorus]",
    );
    inconsistent(await run(r, bad));
  });
});

describe("§6.3 item 7 and §6.8 item 4: sections restart; the key plan stays outside the sections", () => {
  const lint = (code: string) =>
    lintOak(
      code,
      {
        profile: "graded",
        unlocked: ALL_UNLOCKED,
        allowPreview: false,
        meter: "4/4",
        key: null,
      } as LintContext,
      TOOLBOX,
    );
  test("a 2-bar idea in a 3-bar section is cut off: form.section-period (a warning)", () => {
    const code = `setcpm(100/4)\nconst melVerse = n("<[0 2 4 2] [1 3 2 0]>").scale("C4:major")\nconst melChorus = n("<[4 4 5 4]>").scale("C4:major")\nmel: arrange([3, melVerse], [4, melChorus])`;
    const d = lint(code).diagnostics.find((x) => x.id === "form.section-period");
    expect(d?.severity).toBe("warn");
    expect(d?.message).toBe("`melVerse` repeats every 2 bars, so a 3-bar section cuts it off.");
  });
  test("a patterned .scale() inside a section const: code.arranged-scale-pattern", () => {
    const code = `setcpm(100/4)\nconst melVerse = n("0 2 4 2").scale("<C4:major D4:major>")\nconst melChorus = n("4 4 5 4").scale("C4:major")\nmel: arrange([2, melVerse], [2, melChorus])`;
    expect(lint(code).diagnostics.map((x) => x.id)).toContain("code.arranged-scale-pattern");
  });
  test("each section plays from its own first bar (the grader reads the first pass only)", async () => {
    const code = `const melVerse = n("<0 2>").scale("C4:major")\nconst melChorus = n("<7>").scale("C4:major")\nmel: arrange([2, melVerse], [1, melChorus], [2, melVerse])`;
    const n = await strudel(code, 5);
    expect(n.all.map((e) => e.midi)).toEqual([60, 64, 72, 60, 64]);
  });
});
