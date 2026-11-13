// The tools U08–U11 and the side lessons A1.L01–L04 unlock (contracts §3.2; the REAL unlock table, content/toolbox.ts,
// and the legal-order graph): each is locked before its lesson in a graded step (an error naming the lesson), a hint
// in Studio, and accepted from its lesson on. Also the lint errors §6.3, §6.8 and §6.10 name for these tools:
// form.inconsistent-arrange, code.arranged-scale-pattern, code.swing-fraction-string, code.swing-convention.
import { describe, expect, test } from "bun:test";
import type { LintContext, LintProfile, SessionId } from "@oak/content-kit";
import { courseGraph } from "../../../../content/index.ts";
import { unlockedAt } from "../../../../content/lib/course.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { lintOak } from "./oak.ts";

const T = "setcpm(100/4)\n\n";
const SECTIONS = `const melVerse = n("<[0 2 4 2] [1 3 2 0]>").scale("C4:major")\nconst melChorus = n("<[4 4 5 4] [2 ~ 0 ~]>").scale("C4:major")\n`;
const CASES: [string, string, string][] = [
  [
    "tb.rootNotes",
    "U08.L01",
    `${T}chords: chord("<C Am F G>").voicing().s("piano")\nbass: chord("<C Am F G>").rootNotes(2).s("sawtooth")`,
  ],
  [
    "tb.const",
    "U08.L04",
    `${T}const groove = "x ~ x ~"\nkick: s("bd").struct(groove)\nbass: note("c2").struct(groove).s("sawtooth")`,
  ],
  ["snd.fingerbass", "U08.L05", `${T}bass: note("c2 ~ c2 g1").s("fingerbass")`],
  ["tb.arrange", "U09.L02", `${T}${SECTIONS}mel: arrange([2, melVerse], [2, melChorus]).s("piano")`],
  [
    "tb.signal",
    "U09.L04",
    `${T}mel: n("0 2 4 2").scale("C4:major").gain(sine.range(.4, .8).slow(4)).s("piano")`,
  ],
  ["tb.range", "U09.L04", `${T}mel: n("0 2 4 2").scale("C4:major").gain(saw.range(.3, .9)).s("piano")`],
  ["tb.segment", "U09.L04", `${T}mel: n(saw.range(0, 7).segment(8)).scale("C4:major").s("piano")`],
  ["tb.mask", "U09.L05", `${T}hats: s("hh*8").mask("<0 0 1 1>")`],
  ["scale.minor", "U10.L01", `${T}mel: n("0 2 4 2").scale("A4:minor").s("piano")`],
  ["scale.harmonic-minor", "U10.L06", `${T}mel: n("0 4 6 7").scale("A4:harmonic:minor").s("piano")`],
  ["scale.melodic-minor", "U10.L08", `${T}mel: n("0 4 5 6 7").scale("A4:melodic:minor").s("piano")`],
  ["snd.strings", "U10.L09", `${T}pad: n("[0,2,4]").scale("A3:minor").s("strings")`],
  ["tb.delay", "U10.L09", `${T}mel: n("0 2 4 2").scale("A4:minor").s("piano").delay(.4)`],
  ["scale.major-pentatonic", "U11.L01", `${T}mel: n("0 1 2 3 4").scale("C4:major:pentatonic").s("piano")`],
  ["scale.minor-pentatonic", "U11.L02", `${T}mel: n("0 1 2 3 4").scale("A3:minor:pentatonic").s("piano")`],
  ["scale.blues", "U11.L03", `${T}mel: n("0 1 2 3 4 5").scale("C4:blues").s("piano")`],
  ["snd.crunch", "U11.L03", `${T}gtr: n("0 2 3 4").scale("E3:blues").s("crunch")`],
  ["tb.distort", "U11.L03", `${T}gtr: n("0 2 3 4").scale("E3:blues").s("sawtooth").distort(2)`],
  ["chord.dom7", "U11.L04", `${T}chords: chord("<C7 F7>").voicing().s("piano")`],
  ["tb.swingBy", "U11.L07", `${T}hats: s("hh*8").swingBy(1/3, 4)`],
  ["tb.swing", "U11.L07", `${T}hats: s("hh*8").swing(4)`],
  // A1, the side lessons (open after U03.L02; their tools are the lesson's own).
  ["tb.scope", "A1.L01", `${T}mel: note("a2").s("sawtooth").scope()`],
  ["tb.partials", "A1.L01", `${T}mel: note("a2").s("sawtooth").partials([1, .5, .3])`],
  ["tb.hpf", "A1.L02", `${T}mel: note("a2").s("sawtooth").hpf(2000)`],
  ["tb.bpf", "A1.L02", `${T}mel: note("a2").s("sawtooth").bpf(800)`],
  ["tb.lpq", "A1.L02", `${T}mel: note("a2").s("sawtooth").lpf(600).lpq(12)`],
  ["tb.lpenv", "A1.L02", `${T}mel: note("a2").s("sawtooth").lpf(300).lpenv(4)`],
  ["tb.adsr", "A1.L03", `${T}mel: note("a2").s("sawtooth").attack(.1).release(.3)`],
  ["tb.roomsize", "A1.L04", `${T}mel: note("a2").s("sawtooth").room(.5).roomsize(6)`],
  ["tb.delaytime", "A1.L04", `${T}mel: note("a2").s("sawtooth").delay(.5).delaytime(.25)`],
  ["tb.delayfeedback", "A1.L04", `${T}mel: note("a2").s("sawtooth").delay(.5).delayfeedback(.6)`],
  ["tb.orbit", "A1.L04", `${T}mel: note("a2").s("sawtooth").orbit(2)`],
];

const graph = courseGraph();
/** Everything any session guaranteed before `s` unlocked (not `s`'s own unlocks). */
const before = (s: string): Set<string> =>
  new Set([...graph.before(s as SessionId)].flatMap((x) => [...unlockedAt(graph, toolbox, x)]));
const at = (s: string): Set<string> => unlockedAt(graph, toolbox, s as SessionId) as Set<string>;
const ctx = (profile: LintProfile, unlocked: Set<string>, allowPreview = false): LintContext => ({
  profile,
  unlocked: unlocked as LintContext["unlocked"],
  allowPreview,
  meter: "4/4",
  key: null,
});

describe("U08–U11 and A1 tools: locked before their lesson, accepted from it on", () => {
  for (const [tool, session, code] of CASES)
    test(`${tool} (${session})`, () => {
      const locked = lintOak(code, ctx("graded", before(session)), toolbox);
      expect(locked.locked as string[]).toContain(tool);
      expect(locked.ok).toBe(false);
      const d = locked.diagnostics.find((x) => x.severity === "error" && x.id.startsWith("code.locked"));
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/unlocks in|U\d\d\.L\d\d|A1\.L0\d/);
      const studio = lintOak(code, ctx("studio", before(session)), toolbox);
      expect(studio.ok).toBe(true);
      const open = lintOak(code, ctx("graded", at(session)), toolbox);
      expect(open.locked as string[]).not.toContain(tool);
      expect(open.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
      expect(open.ok).toBe(true);
    });
  test("the side lessons' tools are never guaranteed in the core order (A1 is optional)", () => {
    const u11 = at("U11.L08");
    for (const tool of ["tb.scope", "tb.partials", "tb.hpf", "tb.adsr", "tb.roomsize"])
      expect(u11.has(tool)).toBe(false);
  });
  test("swing previewed read-only before U11.L07 (jazz-soul Band, U01.L09)", () => {
    const code = `${T}hats: s("hh*8").swingBy(1/3, 4)`;
    const preview = lintOak(code, ctx("graded", before("U11.L07"), true), toolbox);
    expect(preview.diagnostics.filter((d) => d.id === "code.locked-tool" && d.severity === "error")).toEqual(
      [],
    );
  });
});

describe("the lint errors of §6.3, §6.8 and §6.10 on the Wave 5 tools", () => {
  const all = (): Set<string> => at("U11.L08");
  test("form.inconsistent-arrange: two tracks with different sections", () => {
    const code = `${T}${SECTIONS}const bassVerse = n("0 ~ 0 ~").scale("C2:major")\nconst bassChorus = n("3 ~ 3 ~").scale("C2:major")\nmel: arrange([2, melVerse], [2, melChorus]).s("piano")\nbass: arrange([2, bassVerse], [4, bassChorus]).s("sawtooth")`;
    // A warning for the learner (the form rules fail with it at Check), an error in content.
    const r = lintOak(code, ctx("graded", all()), toolbox);
    const d = r.diagnostics.find((x) => x.id === "form.inconsistent-arrange");
    expect(d?.severity).toBe("warn");
    expect(d?.message).toContain("bass");
    const content = lintOak(code, ctx("content", all()), toolbox);
    expect(content.diagnostics.find((x) => x.id === "form.inconsistent-arrange")?.severity).toBe("error");
  });
  test("code.arranged-scale-pattern: a key plan inside a section const", () => {
    const code = `${T}const melVerse = n("0 2 4 2").scale("<C4:major D4:major>")\nconst melChorus = n("4 4 5 4").scale("C4:major")\nmel: arrange([2, melVerse], [2, melChorus]).s("piano")`;
    expect(lintOak(code, ctx("graded", all()), toolbox).diagnostics.map((d) => d.id)).toContain(
      "code.arranged-scale-pattern",
    );
    // The binding form: the key plan after arrange() is clean.
    const good = `${T}const melVerse = n("0 2 4 2")\nconst melChorus = n("4 4 5 4")\nmel: arrange([2, melVerse], [2, melChorus]).scale("<C4:major!2 D4:major!2>").s("piano")`;
    expect(lintOak(good, ctx("graded", all()), toolbox).diagnostics.map((d) => d.id)).not.toContain(
      "code.arranged-scale-pattern",
    );
  });
  test("code.swing-fraction-string and code.swing-convention", () => {
    const frac = lintOak(`${T}hats: s("hh*8").swingBy("<0 1/3>", 4)`, ctx("graded", all()), toolbox);
    expect(frac.diagnostics.find((d) => d.id === "code.swing-fraction-string")?.severity).toBe("error");
    expect(
      lintOak(`${T}hats: s("hh*8").swingBy("<0 .33>", 4)`, ctx("graded", all()), toolbox).diagnostics.map(
        (d) => d.id,
      ),
    ).not.toContain("code.swing-fraction-string");
    const conv = lintOak(`${T}hats: s("hh*8").swingBy(1/3, 2)`, ctx("graded", all()), toolbox);
    expect(conv.diagnostics.map((d) => d.id)).toContain("code.swing-convention");
  });
  test("a seventh chord outside the triads dictionary in the default voicing is fine; G7 in triads is not", () => {
    const u = all();
    expect(lintOak(`${T}chords: chord("<C7 F7 G7>").voicing()`, ctx("graded", u), toolbox).ok).toBe(true);
    expect(
      lintOak(
        `${T}chords: chord("<C7 F7 G7>").dict("triads").voicing()`,
        ctx("graded", u),
        toolbox,
      ).diagnostics.map((d) => d.id),
    ).toContain("code.chord-not-in-dict");
  });
});
