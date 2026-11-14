// The tools U12–U17 unlock (contracts §3.2; the REAL unlock table, content/toolbox.ts, and the legal-order graph):
// each is locked before its lesson in a graded step (an error naming the lesson), a hint in Studio, and accepted
// from its lesson on. Also the lint findings §6.8 names for key changes (code.transpose-after-scale,
// code.arranged-scale-pattern), the chromatic-step note of U15.L01 and the quoted fraction of `.early()`.
import { describe, expect, test } from "bun:test";
import type { LintContext, LintProfile, SessionId } from "@oak/content-kit";
import { courseGraph } from "../../../../content/index.ts";
import { unlockedAt } from "../../../../content/lib/course.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { lintOak } from "./oak.ts";

const T = "setcpm(100/4)\n\n";
const CASES: [string, string, string, string?][] = [
  ["chord.seventh", "U12.L01", `${T}chords: chord("<C^7 Am7 Dm7 G7>").voicing().s("piano")`],
  ["chord.seventh-dim", "U12.L03", `${T}chords: chord("<Bm7b5 Co7>").voicing().s("piano")`],
  [
    "tb.dict.lefthand",
    "U12.L06",
    `${T}chords: chord("<Dm7 G7 C^7 C^7>").dict("lefthand").voicing().s("piano")`,
  ],
  ["snd.jazzgtr", "U12.L06", `${T}chords: chord("<Dm7 G7 C^7 C^7>").voicing().s("jazzgtr")`],
  ["tb.early", "U13.L01", `${T}chords: chord("<C F>").voicing().early(1/8).s("piano")`],
  ["tb.late", "U13.L01", `${T}chords: chord("<C F>").voicing().late(1/8).s("piano")`],
  ["tb.velocity", "U13.L02", `${T}snare: s("sd*4").velocity("1 .3 1 .3")`],
  ["snd.cleangtr", "U13.L02", `${T}gtr: n("[0 2 4 2]*2").scale("C4:major").s("cleangtr")`],
  ["tb.ply", "U13.L05", `${T}hats: s("hh*4").ply(3)`],
  ["scale.mixolydian", "U14.L01", `${T}mel: n("0 2 4 6").scale("G4:mixolydian").s("piano")`],
  ["scale.dorian", "U14.L03", `${T}mel: n("0 2 4 5").scale("D4:dorian").s("piano")`],
  ["scale.lydian", "U14.L04", `${T}mel: n("0 2 3 4").scale("F4:lydian").s("piano")`],
  ["scale.phrygian", "U14.L05", `${T}mel: n("0 1 2 4").scale("E4:phrygian").s("piano")`],
  ["tb.pan", "U14.L06", `${T}mel: n("0 2 4 2").scale("C4:major").s("piano").pan(.3)`],
  ["tb.jux", "U14.L06", `${T}mel: n("0 2 4 2").scale("C4:major").s("piano").jux(rev)`],
  ["tb.n.chromatic", "U15.L01", `${T}mel: n("4 3# 4 ~").scale("C4:major").s("piano")`],
  ["snd.horns", "U15.L05", `${T}horns: chord("<E7 A7 D7 G7>").voicing().struct("x ~ ~ x").s("horns")`],
  ["snd.trumpet", "U15.L05", `${T}mel: n("4 3 2 0").scale("C4:major").s("trumpet")`],
  ["snd.tenor", "U16.L05", `${T}mel: n("4 5 4 2").scale("C4:major").s("tenor")`],
];

const graph = courseGraph();
/** Everything any session guaranteed before `s` unlocked (not `s`'s own unlocks). */
const before = (s: string): Set<string> =>
  new Set([...graph.before(s as SessionId)].flatMap((x) => [...unlockedAt(graph, toolbox, x)]));
const at = (s: string): Set<string> => unlockedAt(graph, toolbox, s as SessionId) as Set<string>;
const ctx = (profile: LintProfile, unlocked: Set<string>, o: Partial<LintContext> = {}): LintContext => ({
  profile,
  unlocked: unlocked as LintContext["unlocked"],
  allowPreview: false,
  meter: "4/4",
  key: null,
  ...o,
});

describe("U12–U17 tools: locked before their lesson, accepted from it on", () => {
  test("the table covers every tool, scale, chord family and sound a U12–U17 lesson unlocks", () => {
    const unlockedIn = toolbox
      .filter((t) => {
        const sites = Array.isArray(t.unlock) ? t.unlock : [t.unlock];
        return sites.some((s) => /^U1[2-7]\.L\d\d$/.test(String(s)));
      })
      .map((t) => t.id as string)
      .filter(
        (id) => !id.startsWith("tb.feature.") && !id.startsWith("tb.lens.") && !id.startsWith("tb.template."),
      );
    const covered = new Set([...CASES.map(([tool]) => tool), "tb.meter.compound"]);
    expect(unlockedIn.filter((id) => !covered.has(id))).toEqual([]);
  });
  for (const [tool, session, code] of CASES)
    test(`${tool} (${session})`, () => {
      const locked = lintOak(code, ctx("graded", before(session)), toolbox);
      expect(locked.locked as string[]).toContain(tool);
      expect(locked.ok).toBe(false);
      const d = locked.diagnostics.find((x) => x.severity === "error" && x.id.startsWith("code.locked"));
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/unlocks in|U\d\d\.L\d\d/);
      const studio = lintOak(code, ctx("studio", before(session)), toolbox);
      expect(studio.ok).toBe(true);
      const open = lintOak(code, ctx("graded", at(session)), toolbox);
      expect(open.locked as string[]).not.toContain(tool);
      expect(open.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
      expect(open.ok).toBe(true);
    });
  test("compound meter (U13.L04): the 6/8 and 12/8 tempo lines are read as the dotted-quarter beat", () => {
    // 60 to the dotted quarter in 6/8 is setcpm(60/2); the lint reads the divisor against the meter.
    const six = `setcpm(60/2)\n\nhats: s("hh*6")`;
    const open = lintOak(six, ctx("graded", at("U13.L04"), { meter: "6/8" }), toolbox);
    expect(open.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
    const wrong = lintOak(
      `setcpm(60/4)\n\nhats: s("hh*6")`,
      ctx("graded", at("U13.L04"), { meter: "6/8" }),
      toolbox,
    );
    expect(wrong.diagnostics.map((d) => d.id)).toContain("code.setcpm-form");
    const twelve = lintOak(
      `setcpm(60/4)\n\nhats: s("hh*12")`,
      ctx("graded", at("U13.L04"), { meter: "12/8" }),
      toolbox,
    );
    expect(twelve.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
  });
});

describe("the lint findings of §6.8 and of the Wave 6 tools", () => {
  const all = (): Set<string> => at("U17.L04");
  const ids = (code: string, profile: LintProfile = "graded"): string[] =>
    lintOak(code, ctx(profile, all()), toolbox).diagnostics.map((d) => d.id);
  test("code.transpose-after-scale: a key change by .transpose() after .scale()", () => {
    const code = `${T}mel: n("0 2 4 2").scale("C4:major").transpose("<0 2>").s("piano")`;
    const r = lintOak(code, ctx("graded", all()), toolbox);
    const d = r.diagnostics.find((x) => x.id === "code.transpose-after-scale");
    // A warning for the learner (the piece still plays and is graded by ear), an error in content.
    expect(d?.severity).toBe("warn");
    expect(d?.message).toContain("patterned");
    const content = lintOak(code, ctx("content", all()), toolbox);
    expect(content.diagnostics.find((x) => x.id === "code.transpose-after-scale")?.severity).toBe("error");
    // By whole octaves the degrees stay what they are: no finding.
    expect(ids(`${T}mel: n("0 2 4 2").scale("C4:major").transpose(12).s("piano")`)).not.toContain(
      "code.transpose-after-scale",
    );
    // The taught form is clean.
    expect(ids(`${T}mel: n("0 2 4 2").scale("<C4:major!2 D4:major!2>").s("piano")`)).not.toContain(
      "code.transpose-after-scale",
    );
  });
  test("code.arranged-scale-pattern: a key plan inside a section const; after arrange() it is clean", () => {
    const inside = `${T}const melVerse = n("0 2 4 2")\nconst melChorus = n("4 4 5 4").scale("<C4:major!2 D4:major!2>")\nmel: arrange([4, melVerse.scale("C4:major")], [4, melChorus]).s("piano")`;
    expect(ids(inside)).toContain("code.arranged-scale-pattern");
    const after = `${T}const melVerse = n("0 2 4 2")\nconst melChorus = n("4 4 5 4")\nconst melChorus2 = n("4 4 5 4")\nmel: arrange([4, melVerse], [4, melChorus], [4, melChorus2]).scale("<C4:major!8 D4:major!4>").s("piano")`;
    expect(ids(after)).not.toContain("code.arranged-scale-pattern");
    expect(lintOak(after, ctx("graded", all()), toolbox).ok).toBe(true);
  });
  test("a lifted chord() section keeps its section's name (chordsChorus2), or the tracks disagree", () => {
    const head = `${T}const chordsVerse = chord("<C G>").voicing()\nconst melVerse = n("0 2 4 2")\nconst melChorus2 = n("4 4 5 4")\n`;
    const tail = `mel: arrange([2, melVerse], [2, melChorus2]).scale("<C4:major!2 D4:major!2>").s("piano")`;
    const good = `${head}const chordsChorus2 = chord("<D A>").voicing()\nchords: arrange([2, chordsVerse], [2, chordsChorus2]).s("piano")\n${tail}`;
    expect(ids(good)).not.toContain("form.inconsistent-arrange");
    const lift = `${head}const chordsLift = chord("<D A>").voicing()\nchords: arrange([2, chordsVerse], [2, chordsLift]).s("piano")\n${tail}`;
    expect(ids(lift)).toContain("form.inconsistent-arrange");
  });
  test("chromatic steps: 3# is ♯4 and clean; 7b names the slip (the number is the step, not the degree)", () => {
    expect(ids(`${T}mel: n("4 3# 4 6b").scale("C4:major").s("piano")`)).toEqual([]);
    const r = lintOak(`${T}mel: n("0 7b 4 2").scale("C4:major").s("piano")`, ctx("graded", all()), toolbox);
    expect(r.diagnostics.find((d) => d.id === "code.chromatic-step")?.severity).toBe("warn");
  });
  test("a fraction in quotes to .early() or .late() is one finding, not two", () => {
    for (const fn of ["early", "late"]) {
      const r = lintOak(
        `${T}chords: chord("<C F>").voicing().${fn}("1/8").s("piano")`,
        ctx("graded", all()),
        toolbox,
      );
      expect(r.diagnostics.map((d) => d.id)).toEqual(["code.time-fraction-string"]);
      expect(r.diagnostics[0]?.message).toContain(`.${fn}(1/8)`);
    }
    // The number form is clean.
    expect(ids(`${T}chords: chord("<C F>").voicing().early(1/8).s("piano")`)).toEqual([]);
  });
  test("code.dict-after-voicing: the dictionary goes before .voicing(), or it changes nothing (U12.L04)", () => {
    const after = lintOak(
      `${T}chords: chord("<Dm7 G7>").voicing().dict("lefthand").s("piano")`,
      ctx("graded", all()),
      toolbox,
    );
    const d = after.diagnostics.find((x) => x.id === "code.dict-after-voicing");
    expect(d?.severity).toBe("warn");
    expect(d?.message).toBe(
      '`.dict("lefthand")` after `.voicing()` changes nothing: the voicing is already chosen. Put it before: `.dict("lefthand").voicing()`.',
    );
    expect(ids(`${T}chords: chord("<Dm7 G7>").dict("lefthand").voicing().s("piano")`)).toEqual([]);
  });
  test("velocity: one value per step; mode above stays an error with the lefthand dictionary", () => {
    expect(ids(`${T}snare: s("sd*8").velocity("[1 .3]*4")`)).toEqual([]);
    expect(
      ids(`${T}chords: chord("<Dm7 G7>").dict("lefthand").mode("above:c4").voicing().s("piano")`),
    ).toContain("code.mode-above");
  });
});
