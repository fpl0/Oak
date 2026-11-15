// Wave 7 Build (grader): the tools the advanced tracks unlock (contracts §3; the REAL unlock table, content/toolbox.ts,
// and the legal-order graph): each is locked before its lesson in a graded step (an error naming the lesson), a hint
// in Studio, and accepted from its lesson on.
import { describe, expect, test } from "bun:test";
import type { LintContext, LintProfile, SessionId } from "@oak/content-kit";
import { courseGraph } from "../../../../content/index.ts";
import { unlockedAt } from "../../../../content/lib/course.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { lintOak } from "./oak.ts";

const T = "setcpm(100/4)\n\n";
const CASES: [string, string, string, string?][] = [
  ["snd.jazzkit", "J1.L01", `${T}drums: s("bd ~ sd ~, rd*4").bank("jazzkit")`],
  ["snd.vibes", "J1.L01", `${T}mel: n("0 2 4 6").scale("C4:major").s("vibes")`],
  ["chord.sixth-sus", "J1.L02", `${T}chords: chord("<C6 G7sus>").voicing().s("piano")`],
  ["tb.dict.guidetones", "J1.L04", `${T}chords: chord("<Dm7 G7>").dict("guidetones").voicing().s("piano")`],
  ["tb.set", "J1.L05", `${T}bass: n("0").set(chord("<Dm7 G7>")).voicing().s("piano")`],
  ["tb.voicing.n", "J1.L05", `${T}chords: n("0 1 2 3").chord("<Dm7 G7>").voicing().s("piano")`],
  ["chord.alt", "J2.L02", `${T}chords: chord("<Dm7b5 G7b9 Cm7>").voicing().s("piano")`],
  ["chord.ext", "J2.L03", `${T}chords: chord("<Dm9 G13 C^9>").voicing().s("piano")`],
  ["tb.dict.ireal-ext", "J2.L03", `${T}chords: chord("<Dm9 G13>").dict("ireal-ext").voicing().s("piano")`],
  ["scale.locrian", "J2.L04", `${T}mel: n("0 1 2 3").scale("B4:locrian").s("piano")`],
  ["scale.altered", "J2.L04", `${T}mel: n("0 1 2 3").scale("G4:altered").s("piano")`],
  ["scale.lydian-dominant", "J2.L04", `${T}mel: n("0 1 2 3").scale("F4:lydian:dominant").s("piano")`],
  ["scale.bebop", "J2.L04", `${T}mel: n("0 1 2 3").scale("C4:bebop").s("piano")`],
  ["tb.mode.duck", "J3.L01", `${T}chords: chord("<Dm7 G7>").anchor("c5").mode("duck").voicing().s("piano")`],
  ["tb.offset", "J3.L01", `${T}chords: chord("<Dm7 G7>").dict("lefthand").offset(1).voicing().s("piano")`],
  ["snd.mutetpt", "J4.L02", `${T}mel: n("0 2 4 2").scale("F4:major").s("mutetpt")`],
  ["tb.swing.patterned", "R1.L02", `${T}hats: s("hh*8").swingBy("<.1 .3>", 4)`],
  ["snd.clav", "R1.L03", `${T}keys: chord("<Cm7>").voicing().struct("[~ x]*4").s("clav")`],
  ["tb.mini.polymeter", "R2.L05", `${T}perc: s("{bd ~ ~}%4")`],
  ["tb.mini.euclid", "R3.L01", `${T}perc: s("rim(3,8)")`],
  ["tb.mini.euclid-rot", "R3.L03", `${T}perc: s("rim(5,8,1)")`],
  ["tb.euclid", "R3.L03", `${T}perc: s("rim").euclid(3, 8)`],
  ["tb.euclidRot", "R3.L03", `${T}perc: s("rim").euclidRot(5, 8, 1)`],
  ["tb.crush", "A1.L05", `${T}a: note("c3").s("sawtooth").crush(4)`],
  ["tb.coarse", "A1.L05", `${T}a: note("c3").s("sawtooth").coarse(8)`],
  ["tb.distorttype", "A1.L05", `${T}a: note("c3").s("sawtooth").distort(2).distorttype("diode")`],
  ["tb.vib", "A1.L06", `${T}a: note("c3").s("triangle").vib(5)`],
  ["tb.phaser", "A1.L06", `${T}a: note("c3").s("sawtooth").phaser(2)`],
  ["tb.tremolo", "A1.L06", `${T}a: note("c3").s("sawtooth").tremolosync(4)`],
  ["tb.lpmod", "A1.L06", `${T}a: note("c3").s("sawtooth").lpf(800).lprate(2)`],
  ["tb.fm", "A1.L07", `${T}a: note("c3").s("sine").fm(2)`],
  ["tb.unison", "A1.L07", `${T}a: note("c3").s("supersaw").unison(5)`],
  ["tb.pw", "A1.L07", `${T}a: note("c3").s("pulse").pw(.3)`],
  ["snd.wave.supersaw", "A1.L07", `${T}a: note("c3").s("supersaw")`],
  ["snd.wave.pulse", "A1.L07", `${T}a: note("c3").s("pulse")`],
  ["tb.fscope", "A2.L01", `${T}a: note("c3").s("sawtooth").fscope()`],
  ["snd.brk", "A2.L04", `${T}drums: s("brk")`],
  ["tb.chop", "A2.L04", `${T}drums: s("brk").slice(4, "0 2 1 3")`],
  ["tb.loopAt", "A2.L04", `${T}drums: s("brk").loopAt(1)`],
  ["tb.speed", "A2.L04", `${T}drums: s("brk").speed(2)`],
  ["tb.compressor", "A2.L05", `${T}a: note("c3").s("sawtooth").compressor("-20:4:10:.002:.1")`],
  ["tb.postgain", "A2.L05", `${T}a: note("c3").s("sawtooth").postgain(.5)`],
  ["tb.duck", "A2.L05", `${T}a: note("c3").s("sawtooth").duckorbit(2).duckdepth(.5)`],
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

describe("track tools: locked before their lesson, accepted from it on (contracts §3; wave7.md)", () => {
  test("the table covers every tool, scale, chord family and sound a track lesson unlocks", () => {
    const unlockedIn = toolbox
      .filter((t) => {
        const sites = Array.isArray(t.unlock) ? t.unlock : [t.unlock];
        return sites.some((s) => /^(J[1-5]|R[1-3]|A2)\.L\d\d$|^A1\.L0[5-7]$/.test(String(s)));
      })
      .map((t) => t.id as string)
      .filter(
        (id) => !id.startsWith("tb.feature.") && !id.startsWith("tb.lens.") && !id.startsWith("tb.template."),
      );
    // tb.meter.odd is a tempo-line form, checked in "odd meters" below; tools with an earlier core unlock
    // (tb.distort, tb.pan) are covered by the core tables.
    const covered = new Set([...CASES.map(([tool]) => tool), "tb.meter.odd", "tb.distort", "tb.pan"]);
    expect(unlockedIn.filter((id) => !covered.has(id))).toEqual([]);
  });
  for (const [tool, session, code] of CASES)
    test(`${tool} (${session})`, () => {
      const locked = lintOak(code, ctx("graded", before(session)), toolbox);
      expect(locked.locked as string[]).toContain(tool);
      expect(locked.ok).toBe(false);
      const d = locked.diagnostics.find((x) => x.severity === "error" && x.id.startsWith("code.locked"));
      expect(d).toBeDefined();
      expect(d?.message).toMatch(/unlocks in|[JRA]\d\.L\d\d/);
      const studio = lintOak(code, ctx("studio", before(session)), toolbox);
      expect(studio.ok).toBe(true);
      const open = lintOak(code, ctx("graded", at(session)), toolbox);
      expect(open.locked as string[]).not.toContain(tool);
      expect(open.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
      expect(open.ok).toBe(true);
    });
  test("odd meters (R2.L01): the 7/8 tempo line reads the eighth as the unit", () => {
    const seven = `setcpm(140/7)\n\ndrums: s("bd ~ bd ~ bd ~ ~")`;
    const r = lintOak(seven, ctx("graded", at("R2.L01"), { meter: "7/8" }), toolbox);
    expect(r.diagnostics.filter((x) => x.severity === "error")).toEqual([]);
  });
});
