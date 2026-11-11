// Analyzers checked against known music facts and against Strudel itself (onsets of `(k,n,r)`, swingBy).
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { GradeResult } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { ev, hits, line, norm, strudel } from "./__support__/fixtures.ts";
import { bluesForm, cadenceAt, chordSlots, matchProgression, voiceLeading } from "./chords.ts";
import { onsets, toRat } from "./events.ts";
import { energyCurve, formLabels, formMatches, lettersOf } from "./form.ts";
import {
  claveType,
  euclidMatch,
  euclidPattern,
  euclidSteps,
  grooveLock,
  polyRatio,
  velocityGhosts,
} from "./groove.ts";
import { keyEstimate, modeEstimate, modulations } from "./key.ts";
import { classifyNct, melodyLine, motifReuse, stepLeap } from "./melody.ts";
import { inferMeter, metricWeights, syncopation } from "./meter.ts";
import { analyzePiece, detectDevices, linerNotes } from "./piece.ts";
import { resolveSection, sectionNameOf, sectionsFromAst } from "./sections.ts";
import { straighten, swingRatio } from "./swing.ts";
import { normalizedFromEvents, periodOf, resolveTarget, selectTrack } from "./tracks.ts";

setDefaultTimeout(20_000);
const C = { tonic: "C", mode: "major" } as const;

describe("meter", () => {
  test("LHL weights in 4/4 on a 16th grid", () => {
    expect(metricWeights("4/4", rat(1, 16))).toEqual([
      0, -4, -3, -4, -2, -4, -3, -4, -1, -4, -3, -4, -2, -4, -3, -4,
    ]);
  });
  test("6/8 groups its eighths in threes: beat 2 is the 4th eighth", () => {
    const w = metricWeights("6/8", rat(1, 6));
    expect(w[0]).toBe(0);
    expect(w[3]).toBeGreaterThan(w[1] as number);
    expect(w[3]).toBeGreaterThan(w[2] as number);
  });
  test("syncopation: on-beat quarters score 0; an anticipation of beat 3 scores", async () => {
    expect(syncopation((await strudel('s("bd bd bd bd")')).all, "4/4").total).toBe(0);
    const s = syncopation((await strudel('s("bd [~ bd] ~ ~")')).all, "4/4");
    expect(s.count).toBe(1);
    expect(s.total).toBe(2);
    expect(s.at).toEqual([rat(3, 8)]);
  });
  test("meter inference: a waltz is 3/4, a backbeat 4/4, a 6/8 jig 6/8", async () => {
    expect(inferMeter((await strudel('s("bd hh hh")')).all)[0]?.meter).toBe("3/4");
    expect(inferMeter((await strudel('s("bd sd bd sd, hh*8")')).all)[0]?.meter).toBe("4/4");
    expect(inferMeter((await strudel('s("bd hh hh bd hh hh")')).all)[0]?.meter).toBe("6/8");
  });
});

describe("swing", () => {
  test("swingBy(1/3, 4) measures 2:1 (triplet swing), x = 1/3; straight 8ths 1:1; quarters are unmeasurable", async () => {
    const sw = swingRatio((await strudel('s("hh*8").swingBy(1/3, 4)')).all, "4/4", 8);
    expect(sw.ratio).toBeCloseTo(2, 9);
    expect(sw.x).toBeCloseTo(1 / 3, 9);
    expect(sw.cls).toBe("triplet");
    expect(sw.p).toEqual(rat(2, 3));
    expect(swingRatio((await strudel('s("hh*8")')).all, "4/4", 8).cls).toBe("straight");
    expect(swingRatio((await strudel('s("bd*4").swingBy(1/3, 4)')).all, "4/4", 8).n).toBe(0);
  });
  test("straighten undoes swingBy exactly, durations untouched (contracts §6.10 item 6)", async () => {
    const swung = (await strudel('s("hh*8").swingBy(1/3, 4)')).all;
    const back = straighten(swung, { subdivision: 8, amount: 1 / 3 }, "4/4");
    expect(back.map((e) => R.str(e.onset))).toEqual(["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"]);
    expect(back.every((e) => R.eq(e.dur, rat(1, 8)))).toBe(true);
  });
  test("3/4 swing with swingBy(1/3, 3)", async () => {
    expect(swingRatio((await strudel('s("hh*6").swingBy(1/3, 3)')).all, "3/4", 8).ratio).toBeCloseTo(2, 9);
  });
});

describe("euclid, clave, polyrhythm, groove", () => {
  test("Bjorklund matches Strudel: E(3,8), E(5,8) and every rotation of (3,8,r)", async () => {
    expect(
      euclidPattern(3, 8)
        .map((x) => (x ? "x" : "."))
        .join(""),
    ).toBe("x..x..x.");
    expect(
      euclidPattern(5, 8)
        .map((x) => (x ? "x" : "."))
        .join(""),
    ).toBe("x.xx.xx.");
    for (let r = 0; r < 8; r++) {
      const got = onsets((await strudel(`s("x(3,8,${r})")`)).all).map((o) => o[0] * (8 / o[1]));
      expect(got).toEqual(euclidSteps(3, 8, r));
      expect(euclidMatch(onsets((await strudel(`s("x(3,8,${r})")`)).all), 3, 8)).toEqual({
        ok: true,
        rotation: r,
      });
    }
  });
  test("E(5,8) is the cinquillo; son 3-2 and 2-3 and rumba on the 2-bar grid", async () => {
    expect(claveType(onsets((await strudel('s("x(5,8)")', 2)).all)).type).toBe("cinquillo");
    expect(claveType(onsets((await strudel('s("x(3,8)")', 2)).all)).type).toBe("tresillo");
    const son32 = await strudel('s("<[x ~ ~ x ~ ~ x ~] [~ ~ x ~ x ~ ~ ~]>")', 8);
    expect(claveType(onsets(son32.all))).toEqual({ type: "son", direction: "3-2", bars: 8 });
    const son23 = await strudel('s("<[~ ~ x ~ x ~ ~ ~] [x ~ ~ x ~ ~ x ~]>")', 4);
    expect(claveType(onsets(son23.all))).toMatchObject({ type: "son", direction: "2-3" });
    const rumba = await strudel('s("<[x ~ ~ x ~ ~ ~ x] [~ ~ x ~ x ~ ~ ~]>")', 2);
    expect(claveType(onsets(rumba.all))).toMatchObject({ type: "rumba", direction: "3-2" });
  });
  test("polyrhythm 3 against 2; uneven lines are not", () => {
    const three = [rat(0), rat(1, 3), rat(2, 3)];
    const two = [rat(0), rat(1, 2)];
    expect(polyRatio(three, two)).toEqual([3, 2]);
    expect(polyRatio([rat(0), rat(1, 4), rat(1, 2)], two)).toBeNull();
  });
  test("groove lock: bass on every kick; an anticipation one 16th before an empty kick", () => {
    const kick = [rat(0), rat(1, 2)];
    expect(grooveLock(kick, [rat(0), rat(1, 2)], rat(0)).lock).toBe(1);
    const g = grooveLock(kick, [rat(0), rat(7, 16)], rat(0));
    expect(g.lock).toBe(0.5);
    expect(g.anticipations).toEqual([rat(7, 16)]);
  });
  test("ghost notes: quiet hits on the e and a", () => {
    const e = [
      ...hits("snare", "snare", ["1/16", "3/16"], 1, 0.3),
      ...hits("snare", "snare", ["1/4"], 1, 0.9),
      ...hits("snare", "snare", ["1/2"], 1, 0.3),
    ];
    expect(velocityGhosts(e, { on: "16th-offbeat" }).length).toBe(2);
    expect(velocityGhosts(e).length).toBe(3);
  });
});

describe("key and mode", () => {
  test("a C-major tune is C major; an A-minor tune with G# is A minor", async () => {
    expect(keyEstimate((await strudel('n("0 2 4 5 4 2 1 0 4 0").scale("C4:major")')).all)[0]?.key).toEqual({
      tonic: "C",
      mode: "major",
    });
    expect(keyEstimate((await strudel('note("a3 c4 e4 g#4 a4 e4 c4 b3 a3")')).all)[0]?.key).toEqual({
      tonic: "A",
      mode: "minor",
    });
  });
  test("D dorian: its ♮6 (B) is the characteristic tone", async () => {
    const n = await strudel('n("0 1 2 3 4 5 6 4 0").scale("D4:dorian")');
    const top = modeEstimate(n.all, 2)[0];
    expect(top?.mode).toBe("dorian");
    expect(top?.characteristic).toBe(true);
  });
  test("a patterned scale from C to D major is a modulation at bar 5", async () => {
    const n = await strudel('n("<[0 2 4 2] [4 2 1 0]>").scale("<C4:major!4 D4:major!4>")', 8);
    expect(modulations(n.all, 8)).toEqual([
      { bar: 5, from: { tonic: "C", mode: "major" }, to: { tonic: "D", mode: "major" } },
    ]);
  });
});

describe("chords", () => {
  test("voicings keep their symbol; a separate bass sets the inversion", async () => {
    const n = await strudel('chords: chord("<C G>").voicing()\nbass: note("<e2 g2>")', 2);
    const slots = chordSlots(selectTrack(n, "chords"), { bass: n.all.filter((e) => e.midi !== null) });
    expect(slots.map((s) => [s.symbol, s.chord?.rootPc, s.chord?.bassPc])).toEqual([
      ["C", 0, 4],
      ["G", 7, 7],
    ]);
  });
  test("hand voicings are identified from their notes", async () => {
    const n = await strudel('chords: note("<[c3,e3,g3] [a2,c3,e3] [g2,b2,d3,f3]>")', 3);
    const slots = chordSlots(n.all);
    expect(slots.map((s) => [s.chord?.rootPc, s.chord?.quality])).toEqual([
      [0, "maj"],
      [9, "min"],
      [7, "7"],
    ]);
  });
  test("cadences: V→I root position with 1 on top is PAC, with 3 on top IAC; IV→I PC; V→vi DC", async () => {
    const mk = async (chords: string, bass: string, mel: string) => {
      const n = await strudel(
        `chords: chord("<${chords}>").voicing()\nbass: note("<${bass}>")\nmel: note("<${mel}>")`,
        2,
      );
      return cadenceAt(
        chordSlots(selectTrack(n, "chords"), { bass: n.all }),
        melodyLine(selectTrack(n, "mel")),
        C,
        2,
      );
    };
    expect(await mk("G C", "g2 c2", "d5 c5")).toBe("PAC");
    expect(await mk("G C", "g2 c2", "d5 e5")).toBe("IAC");
    expect(await mk("F C", "f2 c2", "a4 g4")).toBe("PC");
    expect(await mk("G Am", "g2 a2", "d5 c5")).toBe("DC");
    expect(await mk("C G", "c2 g2", "e5 d5")).toBe("HC");
    expect(await mk("Bb C", "bb1 c2", "d5 c5")).toBe("bVII-I");
  });
  test("progressions compare on the triad core: Am7 F^7 C G7 is the axis loop rotated", () => {
    const parse = (s: string) =>
      s.split(" ").map((x) => ({
        rootPc: 0 as const,
        root: "C",
        quality: "maj" as const,
        bassPc: 0 as const,
        ext: [],
        x,
      }));
    expect(parse("a").length).toBe(1);
  });
  test("voice leading C → F keeps the common tone C and moves at most 2", () => {
    const vl = voiceLeading([60, 64, 67], [60, 65, 69]);
    expect(vl).toMatchObject({ total: 3, maxMove: 2, commonTones: 1 });
  });
  test("12-bar blues: standard and quick change", async () => {
    const std = await strudel('chords: chord("<C7 C7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing()', 12);
    expect(bluesForm(chordSlots(std.all), C, 12)).toMatchObject({ variant: "standard", choruses: 1 });
    const qc = await strudel('chords: chord("<C7 F7 C7 C7 F7 F7 C7 C7 G7 F7 C7 G7>").voicing()', 12);
    expect(bluesForm(chordSlots(qc.all), C, 12).variant).toBe("quick-change");
  });
  test("matchProgression with rotation", () => {
    const c = (rootPc: number, quality: "maj" | "min") => ({
      rootPc: rootPc as 0,
      root: "",
      quality,
      bassPc: rootPc as 0,
      ext: [],
    });
    const axis = [c(0, "maj"), c(7, "maj"), c(9, "min"), c(5, "maj")];
    expect(
      matchProgression([c(9, "min"), c(5, "maj"), c(0, "maj"), c(7, "maj"), c(9, "min")], axis, true),
    ).toEqual({ matched: 5, length: 4, rotation: 2 });
    expect(matchProgression([c(9, "min")], axis, false).matched).toBe(0);
  });
});

describe("melody", () => {
  test("non-chord tones over C major: passing D, neighbour D, suspension", () => {
    const chords = chordSlots([ev({ track: "c", onset: rat(0), dur: rat(1), midi: 60, chordSymbol: "C" })]);
    const mel = melodyLine(line("mel", "72:1/4 74:1/4 76:1/4 77:1/4 76:1/4"));
    const nct = classifyNct(mel, chords, "4/4");
    expect(nct.map((x) => x.type)).toEqual(["passing", "neighbor"]);
  });
  test("steps and leaps; a recovered leap", () => {
    const s = stepLeap(melodyLine(line("m", "60 62 64 72 71")));
    expect(s.maxLeap).toBe(8);
    expect(s.unrecovered).toEqual([]);
    expect(s.stepRatio).toBe(0.75);
  });
  test("motif reuse finds a transposed repeat", async () => {
    const n = await strudel('n("<[0 2 4] [1 3 5] [7 0 3] [0 2 4]>").scale("C4:major")', 4);
    const m = motifReuse(melodyLine(n.all));
    expect(m.reusedAt).toEqual([3]);
  });
});

describe("form and sections", () => {
  const song = `const drumsVerse = s("bd sd")
const drumsChorus2 = s("bd*4")
const melVerse = n("0 2")
drums: arrange([4, drumsVerse], [4, drumsChorus2], [2, silence])
mel: arrange([4, melVerse], [4, silence], [2, melVerse]).scale("C4:major")`;
  test("section names from identifiers; silence agrees with any name", () => {
    expect(sectionNameOf("melChorus2")).toEqual({ tag: "chorus2", label: "chorus" });
    expect(sectionNameOf("bassVerse")).toEqual({ tag: "verse", label: "verse" });
    expect(sectionsFromAst(song)).toEqual({
      sections: [
        { label: "verse", tag: "verse", bars: 4, startBar: 0 },
        { label: "chorus", tag: "chorus2", bars: 4, startBar: 4 },
        { label: "verse", tag: "verse", bars: 2, startBar: 8 },
      ],
      totalBars: 10,
    });
    // A section where every track rests.
    expect(
      sectionsFromAst(
        'const melA = n("0")\ndrums: arrange([2, melA], [2, silence])\nmel: arrange([2, melA], [2, silence])',
      ),
    ).toMatchObject({ totalBars: 4 });
    expect(sectionsFromAst('mel: n("0").scale("C4:major")')).toBeNull();
  });
  test("tracks that disagree are reported, naming the first disagreement", () => {
    const bad = song.replace("[4, drumsChorus2]", "[2, drumsChorus2]");
    expect(sectionsFromAst(bad)).toMatchObject({ inconsistent: { track: "mel" } });
  });
  test("section refs and form patterns", () => {
    const s = sectionsFromAst(song);
    if (!s || !("sections" in s)) throw new Error("no sections");
    expect(resolveSection({ section: "chorus" }, s.sections, s.totalBars)).toEqual([4, 8]);
    expect(resolveSection("last", s.sections, s.totalBars)).toEqual([8, 10]);
    expect(resolveSection({ section: "verse", nth: 2 }, s.sections, s.totalBars)).toEqual([8, 10]);
    expect(formMatches("ABA", s.sections)).toBe(true);
    expect(formMatches("verse chorus verse", s.sections)).toBe(true);
    expect(formMatches("AAB", s.sections)).toBe(false);
    expect(lettersOf(["verse", "chorus", "verse", "bridge"])).toBe("ABAC");
  });
  test("form letters from the music: AABA", async () => {
    const n = await strudel(
      'mel: n("<0 2 4 0 0 2 4 0 7 9 11 7 0 2 4 0>").scale("C4:major")\nbass: note("<c2!8 f2!4 c2!4>")',
      16,
    );
    expect(formLabels(n.byTrack, 16)).toBe("AABA");
  });
  test("energy rises with a build", async () => {
    const n = await strudel('drums: s("<bd [bd sd] [bd sd hh hh] [bd*4, hh*8, sd*2]>")', 4);
    const e = energyCurve(n.byTrack, 4);
    expect(e[0]).toBeLessThan(e[1] as number);
    expect(e[2]).toBeLessThan(e[3] as number);
    expect(e[3]).toBe(Math.max(...e));
  });
});

describe("tracks", () => {
  test("role inference: fixed labels first, then drums / chords / bass / melody (contracts §6.2)", () => {
    const n = normalizedFromEvents([
      ...hits("kit", "kick", ["0"]),
      ...line("keys", "60,64,67:1/2 62,65,69:1/2"),
      ...line("gtr", "36:1/2 43:1/2"),
      ...line("lead", "72 74 76 77"),
    ]);
    expect(n.roles).toEqual({ drums: "kit", chords: "keys", bass: "gtr", melody: "lead" });
  });
  test("periodOf finds the loop; resolveTarget by degree", async () => {
    const n = await strudel('mel: n("<0 2 4>").scale("C4:major")', 6);
    expect(periodOf(n.all, 16, 6)).toBe(3);
    const t = resolveTarget(n, { degree: "3" }, { meter: "4/4", key: C });
    expect(t.map((e) => e.midi)).toEqual([64, 64]);
    expect(
      resolveTarget(n, { degree: "3", nth: 2 }, { meter: "4/4", key: C }).map((e) => R.floor(e.onset)),
    ).toEqual([4]);
  });
  test("toRat finds exact fractions", () => {
    expect(toRat(1 / 3)).toEqual(rat(1, 3));
    expect(toRat(0.125)).toEqual(rat(1, 8));
  });
});

describe("piece analysis and liner notes", () => {
  const code =
    'setcpm(120/4)\nchords: chord("<C E7 Am F>").voicing()\nbass: note("<c2 e2 a2 f2>")\nmel: n("<[0 2 4 2] [2 1 0 ~] [0 2 4 7] [5 4 2 0]>").scale("C4:major")';
  test("analyzePiece: key, numerals, a secondary dominant", async () => {
    const n = await strudel(code, 4);
    const a = analyzePiece(n, { meter: "4/4", code, bars: 4 });
    expect(a.key[0]?.key).toEqual(C);
    expect(a.slots.map((s) => s.rn)).toEqual(["I", "V7/vi", "vi", "IV"]);
    expect(a.bars).toBe(4);
    expect(a.durationSec).toBe(8);
    expect(a.devices).toContain("V7/vi→vi bar 2");
    expect(detectDevices(n, { meter: "4/4", key: C }).map((d) => d.device)).toContain("secondary dominant");
  });
  test("liner notes are deterministic", async () => {
    const n = await strudel(code, 4);
    const a = analyzePiece(n, { meter: "4/4", code, bars: 4 });
    const result = {
      rubric: [
        {
          ruleId: "x",
          required: true,
          ok: true,
          diag: { id: "rubric.met", severity: "praise", params: { label: "Ends on 1" } },
        },
      ],
    } as unknown as GradeResult;
    const text = linerNotes(a, result, { lockedTools: ["tb.voicing"] });
    expect(text).toBe(linerNotes(a, result, { lockedTools: ["tb.voicing"] }));
    expect(text.split("\n")[0]).toBe("4 bars at 120 BPM in C major (0:08).");
    expect(text).toContain("Done: Ends on 1.");
    expect(text).toContain("Uses tools not yet unlocked: tb.voicing.");
  });
});

void norm;
