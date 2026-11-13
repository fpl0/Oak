// The tools U05–U07 unlock (contracts §3.2; the REAL unlock table, content/toolbox.ts, and the legal-order
// graph): each is locked before its lesson in a graded step (an error naming the lesson), a hint in Studio,
// and accepted from its lesson on. chord() and .voicing() are refused in graded steps before U05.L08 (the
// voicing gate's tools), and a chord spelling must exist in the dictionary in use (STYLE §5.2).
import { describe, expect, test } from "bun:test";
import type { LintContext, LintProfile, SessionId } from "@oak/content-kit";
import { courseGraph } from "../../../../content/index.ts";
import { unlockedAt } from "../../../../content/lib/course.ts";
import { toolbox } from "../../../../content/toolbox.ts";
import { lintOak } from "./oak.ts";

const T = "setcpm(120/4)\n\n";
const CASES: [string, string, string][] = [
  ["tb.arp", "U05.L04", `${T}chords: n("[0,2,4]").scale("C3:major").arp("0 1 2 1").s("piano")`],
  ["tb.chord", "U05.L08", `${T}chords: chord("<C Am F G>").voicing().s("piano")`],
  ["tb.anchor", "U05.L08", `${T}chords: chord("<C Am F G>").anchor("c5").voicing().s("piano")`],
  ["tb.mode.below", "U05.L08", `${T}chords: chord("<C Am F G>").mode("below").voicing().s("piano")`],
  ["tb.dict.triads", "U05.L08", `${T}chords: chord("<C Am F G>").dict("triads").voicing().s("piano")`],
  ["snd.rhodes", "U05.L08", `${T}chords: n("[0,2,4]").scale("C3:major").s("rhodes")`],
  ["snd.upright", "U05.L06", `${T}bass: note("c2 e2").s("upright")`],
  ["tb.add", "U06.L01", `${T}chords: n("[0,2,4]").add(n("<0 4 5 3>")).scale("C3:major").s("piano")`],
  ["snd.pad", "U06.L06", `${T}pad: n("[0,2,4]").scale("C3:major").s("pad")`],
  ["tb.mode.root", "U06.L11", `${T}chords: chord("<C Am F G>").voicing().mode("root:g2").s("piano")`],
  ["tb.struct", "U06.L12", `${T}chords: n("[0,2,4]").scale("C3:major").struct("x ~ x x").s("piano")`],
  ["tb.rev", "U07.L02", `${T}mel: n("0 2 4 5").scale("C4:major").rev().s("piano")`],
  ["tb.scaleTranspose", "U07.L02", `${T}mel: n("0 2 4 5").scale("C4:major").scaleTranspose(2).s("piano")`],
  ["tb.lastOf", "U07.L06", `${T}mel: n("0 2 4 5").scale("C4:major").lastOf(4, x => x.rev()).s("piano")`],
  ["tb.firstOf", "U07.L06", `${T}mel: n("0 2 4 5").scale("C4:major").firstOf(4, x => x.rev()).s("piano")`],
  ["tb.off", "U07.L07", `${T}mel: n("0 2 4 5").scale("C4:major").off(1/8, x => x.add(2)).s("piano")`],
  [
    "tb.superimpose",
    "U07.L07",
    `${T}mel: n("0 2 4 5").scale("C4:major").superimpose(x => x.add(7)).s("piano")`,
  ],
  ["tb.mini.maybe", "U07.L10", `${T}mel: n("0 2? 4 5").scale("C4:major").s("piano")`],
  ["tb.degradeBy", "U07.L10", `${T}mel: n("0 2 4 5").scale("C4:major").degradeBy(0.2).s("piano")`],
  [
    "tb.sometimesBy",
    "U07.L10",
    `${T}mel: n("0 2 4 5").scale("C4:major").sometimesBy(0.3, x => x.add(1)).s("piano")`,
  ],
];

const graph = courseGraph();
/** Everything any session guaranteed before `s` unlocked (not `s`'s own unlocks). */
const before = (s: string): Set<string> =>
  new Set([...graph.before(s as SessionId)].flatMap((x) => [...unlockedAt(graph, toolbox, x)]));
const at = (s: string): Set<string> => unlockedAt(graph, toolbox, s as SessionId) as Set<string>;
const ctx = (profile: LintProfile, unlocked: Set<string>): LintContext => ({
  profile,
  unlocked: unlocked as LintContext["unlocked"],
  allowPreview: false,
  meter: "4/4",
  key: null,
});

describe("U05–U07 tools: locked before their lesson, accepted from it on", () => {
  for (const [tool, session, code] of CASES)
    test(`${tool} (${session})`, () => {
      const locked = lintOak(code, ctx("graded", before(session)), toolbox);
      expect(locked.locked as string[]).toContain(tool);
      expect(locked.ok).toBe(false);
      const d = locked.diagnostics.find((x) => x.severity === "error" && x.id.startsWith("code.locked"));
      expect(d).toBeDefined();
      const studio = lintOak(code, ctx("studio", before(session)), toolbox);
      expect(studio.ok).toBe(true);
      const open = lintOak(code, ctx("graded", at(session)), toolbox);
      expect(open.locked as string[]).not.toContain(tool);
      expect(open.ok).toBe(true);
    });
});

describe("chord() in graded steps and the dictionary in use", () => {
  const chordLoop = `${T}chords: chord("<C Am F G>").voicing().s("piano")`;
  test("chord() and .voicing() are refused in every graded step before U05.L08, U05.L07 included", () => {
    for (const s of ["U05.L01", "U05.L04", "U05.L07", "U06.L01"] as const) {
      const unlocked =
        s === "U06.L01"
          ? new Set([...at(s)].filter((x) => !["tb.chord", "tb.voicing", "chord.triad"].includes(x)))
          : at(s);
      const r = lintOak(chordLoop, ctx("graded", unlocked), toolbox);
      expect(r.ok).toBe(false);
      expect(r.locked as string[]).toEqual(expect.arrayContaining(["tb.chord", "tb.voicing"]));
    }
    // A preview step (contracts §3.1 rule 5a) may show it read-only.
    const preview = lintOak(chordLoop, { ...ctx("graded", at("U05.L04")), allowPreview: true }, toolbox);
    expect(preview.diagnostics.filter((d) => d.id === "code.locked-tool" && d.severity === "error")).toEqual(
      [],
    );
  });
  test("a chord the dictionary voices wrongly or lacks is an error: Caug and G7 in triads", () => {
    const u = at("U05.L08");
    for (const code of [
      `${T}chords: chord("<C Caug>").dict("triads").voicing()`,
      `${T}chords: chord("<C Am F G7>").dict("triads").voicing()`,
    ]) {
      const r = lintOak(code, ctx("graded", new Set([...u, "chord.dom7"])), toolbox);
      expect(r.diagnostics.map((d) => d.id)).toContain("code.chord-not-in-dict");
      expect(r.ok).toBe(false);
    }
    const ok = lintOak(
      `${T}chords: chord("<C Am Bo F>").dict("triads").voicing()`,
      ctx("graded", u),
      toolbox,
    );
    expect(ok.ok).toBe(true);
  });
  test("spellings resolve in Strudel's dictionary: Cmaj is not a chord name, C/E is a division", () => {
    const u = at("U05.L08");
    const unknown = lintOak(`${T}chords: chord("<Cmaj Am>").voicing()`, ctx("graded", u), toolbox);
    expect(unknown.diagnostics.map((d) => d.id)).toContain("code.unknown-chord");
    const slash = lintOak(`${T}chords: chord("<C/E Am>").voicing()`, ctx("graded", u), toolbox);
    expect(slash.ok).toBe(false);
    // "CM" is an alias Strudel voices as C major: a spelling note, never "isn't a Strudel chord name".
    const alias = lintOak(`${T}chords: chord("<CM F G C>").voicing()`, ctx("graded", u), toolbox);
    expect(alias.ok).toBe(true);
    const note = alias.diagnostics.find((d) => d.id === "code.unknown-chord");
    expect(note?.severity).toBe("info");
    expect(note?.message).toContain("plays, but Oak writes this chord another way");
    expect(note?.message).toContain('Write "C"');
    expect(unknown.diagnostics.find((d) => d.id === "code.unknown-chord")?.message).toContain(
      "isn't a Strudel chord name",
    );
  });
  test("one finding per mistake: a slash chord is not also an unknown `/`, a misspelling not also a dictionary miss", () => {
    const u = at("U05.L08");
    const ids = (code: string) =>
      lintOak(`${T}${code}`, ctx("graded", u), toolbox).diagnostics.map((d) => d.id);
    expect(ids(`chords: chord("<C F G/B C>").voicing().s("piano")`)).toEqual(["code.slash-chord"]);
    expect(ids(`chords: chord("<Cmaj Am>").voicing().s("piano")`)).toEqual(["code.unknown-chord"]);
    // A real division of a chord pattern is still read as the mini-notation operator it is.
    expect(ids(`chords: chord("<C Am>/2").voicing().s("piano")`)).toContain("code.uncatalogued");
  });
  test('.mode("above") is an error everywhere (contracts §6.7 item 3)', () => {
    const r = lintOak(
      `${T}chords: chord("<C Am>").mode("above").voicing()`,
      ctx("graded", at("U06.L11")),
      toolbox,
    );
    expect(r.ok).toBe(false);
  });
});
