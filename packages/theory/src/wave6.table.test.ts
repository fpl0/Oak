// Exhaustive table tests for the Wave 6 theory seam (docs/design/wave6.md §3.1) over every key, cross-checked with
// tonal where tonal knows the answer: seventh chords on all 15 major and 15 minor tonics with numerals both ways,
// the five qualities on every root in every inversion, guide tones and guide-tone lines through ii–V–I in every
// key, simple and compound intervals with their inversions, the four colour modes on every tonic, chromatic
// degrees and their step strings in every major key, applied chords with their leading tones and dominant chains,
// the borrowed chords of every major key and the Picardy I and Dorian IV of every minor key, pivot chords and key
// distance between every pair of major keys, key plans, beat grids, and the CLI ops that print them.
import { describe, expect, test } from "bun:test";
import type { KeySpec, SeventhQuality } from "@oak/content-kit";
import { CHROMATIC_STEPS, MODE_CHARACTERISTIC, SEVENTH_QUALITIES } from "@oak/content-kit";
import { Chord, Interval, Key, Mode, Note, Scale } from "tonal";
import { runTheoryCli } from "./cli.ts";
import { WAVE6_OPS } from "./cli-wave6.ts";
import {
  APPLIED_KINDS,
  appliedChord,
  appliedChords,
  appliedReading,
  appliedTargets,
  beatGrid,
  borrowedChords,
  borrowedReading,
  CHROMATIC_DEGREE_TABLE,
  COLOUR_MODES,
  characteristicTonesOf,
  chordOfRoman,
  chordPcs,
  chromaticChordKind,
  chromaticDegree,
  chromaticLabel,
  compoundInterval,
  degreeSemitones,
  diatonicChords,
  dominantChain,
  dorianFour,
  guideToneLine,
  guideTones,
  intervalFacts,
  keyAtBarOfPlan,
  keyDistance,
  keyFromFifths,
  keyLiftScale,
  keySevenths,
  METERS,
  modalChords,
  modalKey,
  modalProgression,
  modesContaining,
  outsideChordKind,
  parentMajor,
  parseKeyPlan,
  pcOf,
  picardy,
  pivotChords,
  pushAmount,
  romanText,
  scalePcs,
  seventhChord,
  seventhFromPcs,
  seventhInfo,
  seventhQualityOf,
  TAUGHT_MODES,
  toCode,
  transposeKey,
} from "./index.ts";

const FIFTHS = Array.from({ length: 15 }, (_, i) => i - 7);
const MAJOR_TONICS = FIFTHS.map((f) => keyFromFifths(f, "major").tonic);
const MINOR_TONICS = FIFTHS.map((f) => keyFromFifths(f, "minor").tonic);
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const pc = (name: string): number => mod12(Note.midi(`${name.replace(/-?\d+$/, "")}4`) as number);
const tonalPcs = (name: string): number[] =>
  [...new Set(Chord.get(name).notes.map(pc))].sort((a, b) => a - b);
const ourPcs = (c: Parameters<typeof chordPcs>[0]): number[] =>
  [...new Set((chordPcs(c) as number[]).map(mod12))].sort((a, b) => a - b);
const major = (tonic: string): KeySpec => ({ tonic, mode: "major" });
const minor = (tonic: string): KeySpec => ({ tonic, mode: "minor" });
const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const TONAL_SUFFIX: Record<SeventhQuality, string> = {
  maj7: "maj7",
  "7": "7",
  m7: "m7",
  m7b5: "m7b5",
  dim7: "dim7",
};

describe("seventh chords in every key", () => {
  for (const t of MAJOR_TONICS)
    test(`${t} major: Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7, as tonal has them, numerals both ways`, () => {
      const ours = keySevenths(major(t));
      expect(ours.map((c) => c.rn)).toEqual(["Imaj7", "ii7", "iii7", "IVmaj7", "V7", "vi7", "viiø7"]);
      const theirs = Key.majorKey(t).chords;
      ours.forEach((c, i) => {
        expect([c.rn, ourPcs(c.chord)]).toEqual([c.rn, tonalPcs(theirs[i] as string)]);
        expect(romanText(c.chord, major(t))).toBe(c.rn);
        const back = chordOfRoman(c.rn, major(t));
        expect(back && ourPcs(back)).toEqual(ourPcs(c.chord));
      });
    });
  for (const t of MINOR_TONICS)
    test(`${t} minor: i7 iiø7 IIImaj7 iv7 v7 VImaj7 VII7; harmonic V7 and vii°7`, () => {
      const nat = keySevenths(minor(t));
      const har = keySevenths(minor(t), { form: "harmonic" });
      expect(nat.map((c) => c.rn)).toEqual(["i7", "iiø7", "IIImaj7", "iv7", "v7", "VImaj7", "VII7"]);
      expect([har[4]?.rn, har[6]?.rn]).toEqual(["V7", "viio7"]);
      const tk = Key.minorKey(t);
      for (const [i, c] of nat.entries())
        expect(ourPcs(c.chord)).toEqual(tonalPcs(tk.natural.chords[i] as string));
      expect(ourPcs((har[4] as (typeof har)[number]).chord)).toEqual(
        tonalPcs(tk.harmonic.chords[4] as string),
      );
      expect(ourPcs((har[6] as (typeof har)[number]).chord)).toEqual(
        tonalPcs(tk.harmonic.chords[6] as string),
      );
      for (const c of [...nat, har[4], har[6]])
        if (c) {
          const back = chordOfRoman(c.rn, minor(t));
          expect(back && ourPcs(back)).toEqual(ourPcs(c.chord));
        }
    });
  test("the five qualities on every root: from the symbol, and from the notes in every inversion", () => {
    for (const root of ROOTS)
      for (const q of SEVENTH_QUALITIES) {
        const chord = seventhChord(root, q);
        expect(ourPcs(chord)).toEqual(tonalPcs(`${root}${TONAL_SUFFIX[q]}`));
        expect(seventhQualityOf(chord)).toBe(q);
        expect(seventhQualityOf(toCode(chord))).toBe(q);
        const pcs = chordPcs(chord) as number[];
        // A diminished seventh is the same four notes on four roots: only its root position names it.
        const inversions = q === "dim7" ? [0] : [0, 1, 2, 3];
        for (const inv of inversions) {
          const hit = seventhFromPcs(pcs, pcs[inv] as number);
          expect([root, q, inv, hit?.quality, hit?.inversion, hit?.chord.rootPc]).toEqual([
            root,
            q,
            inv,
            q,
            inv,
            chord.rootPc,
          ]);
        }
        expect(seventhInfo(q).intervals).toEqual(pcs.map((p) => mod12(p - chord.rootPc)));
      }
    // A triad has no seventh quality; neither do three notes of one.
    expect(seventhQualityOf("C")).toBeNull();
    expect(seventhFromPcs([0, 4, 7], 0)).toBeNull();
  });
});

describe("guide tones in every key", () => {
  test("the 3rd and the 7th of every seventh chord are the chord's own notes at those intervals", () => {
    for (const root of ROOTS)
      for (const q of SEVENTH_QUALITIES) {
        const chord = seventhChord(root, q);
        const g = guideTones(chord);
        const third = q === "maj7" || q === "7" ? 4 : 3;
        const seventh = q === "maj7" ? 11 : q === "dim7" ? 9 : 10;
        expect([
          root,
          q,
          mod12((g.third?.pc ?? -1) - chord.rootPc),
          mod12((g.seventh?.pc ?? -1) - chord.rootPc),
        ]).toEqual([root, q, third, seventh]);
      }
    expect(guideTones(seventhChord("C", "7")).third?.interval).toBe("M3");
    expect(guideTones(seventhChord("C", "dim7")).seventh?.interval).toBe("d7");
  });
  for (const t of MAJOR_TONICS)
    test(`${t} major, ii7–V7–Imaj7: both lines move by step or stay, and swap 3rd and 7th`, () => {
      const [, ii, , , V] = keySevenths(major(t));
      const I = keySevenths(major(t))[0];
      const chords = [ii, V, I].map((c) => (c as NonNullable<typeof c>).chord);
      for (const start of ["third", "seventh"] as const) {
        const line = guideToneLine(chords, { start });
        expect(line.every((s) => s !== null)).toBe(true);
        expect(line.map((s) => s?.role)).toEqual(
          start === "third" ? ["third", "seventh", "third"] : ["seventh", "third", "seventh"],
        );
        for (const s of line.slice(1)) expect(Math.abs(s?.move ?? 99)).toBeLessThanOrEqual(2);
      }
      // The 7th of ii falls a half step to the 3rd of V.
      expect(guideToneLine(chords, { start: "seventh" })[1]?.move).toBe(-1);
    });
});

describe("intervals: inversion and compound forms", () => {
  const SIMPLE = ["P1", "m2", "M2", "m3", "M3", "P4", "A4", "d5", "P5", "m6", "M6", "m7", "M7", "P8"];
  test("every simple interval: semitones and inversion as tonal has them", () => {
    for (const name of SIMPLE) {
      const f = intervalFacts(name);
      expect([name, f.semitones]).toEqual([name, Interval.semitones(name) as number]);
      if (name !== "P1" && name !== "P8") {
        // tonal writes the number first ("7M").
        const theirs = Interval.invert(name).replace(/^(\d+)([A-Za-z]+)$/, "$2$1");
        expect([name, f.inversion]).toEqual([name, theirs]);
        expect(f.semitones + intervalFacts(f.inversion).semitones).toBe(12);
      }
      expect(f.compound).toBe(false);
    }
  });
  test("every compound interval up to two octaves is its simple form plus octaves", () => {
    for (const name of SIMPLE.filter((x) => x !== "P1" && x !== "P8"))
      for (const octaves of [1, 2]) {
        const compound = compoundInterval(name, octaves);
        const f = intervalFacts(compound);
        expect([compound, f.simple, f.octaves, f.compound]).toEqual([compound, name, octaves, true]);
        expect(f.semitones).toBe(intervalFacts(name).semitones + 12 * octaves);
        expect(f.semitones).toBe(Interval.semitones(compound) as number);
        // A compound interval inverts as its simple form does.
        expect(f.inversion).toBe(intervalFacts(name).inversion);
      }
    expect(compoundInterval("M3")).toBe("M10");
    expect(compoundInterval("P5")).toBe("P12");
  });
});

describe("the colour modes on every tonic", () => {
  const TONAL_MODE: Record<string, string> = {
    mixolydian: "mixolydian",
    dorian: "dorian",
    lydian: "lydian",
    phrygian: "phrygian",
  };
  for (const mode of COLOUR_MODES)
    test(`${mode}: scale, colour note, numerals and parent major on all twelve tonics`, () => {
      for (const tonic of ROOTS) {
        const key = modalKey(tonic, mode);
        const theirs = Scale.get(`${tonic} ${TONAL_MODE[mode]}`).notes.map(pc);
        expect([tonic, [...scalePcs(key)].map(mod12)]).toEqual([tonic, theirs]);
        // The colour note is the degree content-kit names, and the only note that differs from the parent scale.
        const tone = characteristicTonesOf(key)[0];
        const spec = MODE_CHARACTERISTIC[mode];
        expect([tonic, tone?.degree as string, Number(tone?.pc)]).toEqual([
          tonic,
          spec.tone,
          mod12(pcOf(tonic) + degreeSemitones(spec.tone)),
        ]);
        const parentScale = new Set(scalePcs({ tonic, mode: spec.parent }).map(mod12));
        const differing = [...scalePcs(key)].map(mod12).filter((p) => !parentScale.has(p));
        expect([tonic, differing]).toEqual([tonic, [tone?.pc as number]]);
        // Seven triads, each inside the mode; numerals read back in the mode.
        const chords = modalChords(key);
        expect(chords.length).toBe(7);
        const scale = new Set([...scalePcs(key)].map(mod12));
        for (const c of chords) {
          expect(ourPcs(c.chord).every((p) => scale.has(p))).toBe(true);
          expect(romanText(c.chord, key)).toBe(c.rn);
        }
        // The same seven notes as the parent major, which tonal finds as the mode's relative.
        const parent = parentMajor(key);
        expect([...scalePcs(parent)].map(mod12).sort()).toEqual([...scale].sort());
        expect(pc(parent.tonic)).toBe(pc(Mode.relativeTonic("major", TONAL_MODE[mode] as string, tonic)));
        // A piece that sounds all seven notes fits this mode and no other taught one.
        expect(modesContaining(scalePcs(key), pcOf(tonic))).toEqual([mode]);
      }
    });
  test("the characteristic progressions: I–♭VII–IV, i–IV, I–II, i–♭II, in a key", () => {
    const rn = (tonic: string, mode: (typeof COLOUR_MODES)[number]) =>
      modalProgression(modalKey(tonic, mode)).map((c) => c.rn);
    expect(rn("G", "mixolydian")).toEqual(["I", "bVII", "IV"]);
    expect(rn("D", "dorian")).toEqual(["i", "IV"]);
    expect(rn("F", "lydian")).toEqual(["I", "II"]);
    expect(rn("E", "phrygian")).toEqual(["i", "bII"]);
    expect(TAUGHT_MODES).toEqual(["lydian", "major", "mixolydian", "dorian", "minor", "phrygian"]);
  });
});

describe("chromatic degrees in every major key", () => {
  for (const t of MAJOR_TONICS)
    test(`${t} major: each chromatic degree is the right note, by its step string and by its label`, () => {
      const key = major(t);
      const tonic = Note.midi(`${t}4`) as number;
      for (const d of CHROMATIC_DEGREE_TABLE) {
        const midi = tonic + d.semitones;
        const label = chromaticLabel(midi, key, { direction: d.raised ? 1 : -1 });
        expect([t, d.degree, label.degree, label.syllable, label.chromatic]).toEqual([
          t,
          d.degree,
          d.degree,
          d.syllable,
          true,
        ]);
        // The spelled note is a half step from the letter it bends, as tonal counts it.
        expect(pc(label.name)).toBe(mod12(midi));
        // The step string of content-kit is the table's, and the step is the degree's number minus one.
        expect(CHROMATIC_STEPS[d.degree]).toBe(d.step);
        expect(Number(d.step[0])).toBe(Number(d.degree.replace(/^[b#]/, "")) - 1);
        expect(chromaticDegree(d.degree)?.resolvesTo).toBe(d.resolvesTo);
      }
    });
  test("a raised note resolves up a half step and a lowered one down", () => {
    for (const d of CHROMATIC_DEGREE_TABLE) {
      const to = degreeSemitones(d.resolvesTo);
      expect([d.degree, mod12(to - d.semitones)]).toEqual([d.degree, d.raised ? 1 : 11]);
    }
  });
});

describe("applied chords in every key", () => {
  for (const t of MAJOR_TONICS)
    test(`${t} major: V/x and V7/x on ii iii IV V vi, their leading tones, and the chain III7–VI7–II7–V7`, () => {
      const key = major(t);
      const targets = appliedTargets(key);
      expect(targets.map((x) => x.rn)).toEqual(["ii", "iii", "IV", "V", "vi"]);
      for (const target of targets)
        for (const kind of APPLIED_KINDS) {
          const a = appliedChord(kind, target.degree, key);
          if (!a) throw new Error(`no ${kind}/${target.rn} in ${t}`);
          const dominant = kind === "V" || kind === "V7";
          // A dominant sits a 5th above its target; a leading-tone chord a half step below it.
          expect([a.rn, mod12(a.chord.rootPc - target.chord.rootPc)]).toEqual([a.rn, dominant ? 7 : 11]);
          expect(pc(a.leadingTone.name)).toBe(mod12(target.chord.rootPc - 1));
          expect(pc(a.leadingTone.resolvesTo)).toBe(target.chord.rootPc);
          // Read back from the chord: the same numeral, and it resolves into its target only.
          const read = appliedReading(a.chord, key, target.chord);
          if (kind !== "V" || target.rn !== "IV") {
            // (V/IV is the tonic triad itself: it is only applied with its 7th.)
            expect([a.rn, read?.rn, read?.resolves]).toEqual([a.rn, a.rn, true]);
            expect(chromaticChordKind(a.chord, key, target.chord)).toBe("applied");
            expect(outsideChordKind(a.chord, key, target.chord)).toBe(
              dominant ? "secondary-dominant" : "applied-leading-tone",
            );
            const elsewhere = keySevenths(key)[0]?.chord;
            expect(appliedReading(a.chord, key, elsewhere)?.resolves).toBe(false);
          }
          const back = chordOfRoman(a.rn, key);
          expect(back && ourPcs(back)).toEqual(ourPcs(a.chord));
        }
      expect(appliedChords(key).length).toBe(10);
      const chain = dominantChain(key, 4);
      expect(chain.map((c) => c.chainRn)).toEqual(["III7", "VI7", "II7", "V7"]);
      expect(chain.map((c) => c.rn)).toEqual(["V7/vi", "V7/ii", "V7/V", "V7"]);
      for (let i = 1; i < chain.length; i++)
        expect(
          mod12(
            (chain[i - 1] as (typeof chain)[number]).chord.rootPc -
              (chain[i] as (typeof chain)[number]).chord.rootPc,
          ),
        ).toBe(7);
      expect(Number((chain[3] as (typeof chain)[number]).chord.rootPc)).toBe(mod12(pcOf(t) + 7));
    });
  for (const t of MINOR_TONICS)
    test(`${t} minor: the targets are III iv V VI VII`, () => {
      expect(appliedTargets(minor(t)).map((x) => x.rn)).toEqual(["III", "iv", "V", "VI", "VII"]);
    });
});

describe("mixture in every key", () => {
  for (const t of MAJOR_TONICS)
    test(`${t} major borrows iv ♭VI ♭VII ♭III ii° from ${t} minor`, () => {
      const key = major(t);
      const borrowed = borrowedChords(key);
      expect(borrowed.map((b) => b.rn)).toEqual(["iv", "bVI", "bVII", "bIII", "iio"]);
      const parallel = diatonicChords(minor(t));
      const own = new Set(scalePcs(key).map(mod12));
      for (const b of borrowed) {
        // It is a chord of the parallel minor, with a note the major key does not own.
        expect(parallel.some((c) => c.rootPc === b.chord.rootPc && c.quality === b.chord.quality)).toBe(true);
        expect(ourPcs(b.chord).some((p) => !own.has(p))).toBe(true);
        expect(borrowedReading(b.chord, key)?.rn).toBe(b.rn);
        expect(chromaticChordKind(b.chord, key)).toBe("borrowed");
        expect(romanText(b.chord, key)).toBe(b.rn);
      }
      // The key's own chords are not borrowed.
      for (const c of diatonicChords(key)) expect(chromaticChordKind(c, key)).toBe("diatonic");
    });
  for (const t of MINOR_TONICS)
    test(`${t} minor: the Picardy I and the Dorian IV are major chords on 1 and 4`, () => {
      const key = minor(t);
      const p = picardy(key);
      const d = dorianFour(key);
      expect([p.rn, ourPcs(p.chord)]).toEqual(["I", tonalPcs(`${t}M`)]);
      expect(d.rn).toBe("IV");
      expect(mod12(d.chord.rootPc - pcOf(t))).toBe(5);
      expect(chromaticChordKind(p.chord, key)).toBe("picardy");
      expect(chromaticChordKind(d.chord, key)).toBe("dorian-iv");
      expect(outsideChordKind(p.chord, key)).toBe("borrowed");
      expect(pc(p.raised.name)).toBe(mod12(pcOf(t) + 4));
      expect(pc(d.raised.name)).toBe(mod12(pcOf(t) + 9));
    });
});

describe("key changes between every pair of major keys", () => {
  test("pivot chords are exactly the triads two keys share; neighbours on the circle share four", () => {
    for (const a of MAJOR_TONICS)
      for (const b of MAJOR_TONICS) {
        if (pc(a) === pc(b)) continue;
        const from = major(a);
        const to = major(b);
        const sig = (c: Parameters<typeof chordPcs>[0]) => ourPcs(c).join(",");
        const shared = diatonicChords(from)
          .map(sig)
          .filter((x) => diatonicChords(to).map(sig).includes(x));
        const pivots = pivotChords(from, to);
        expect([a, b, pivots.length]).toEqual([a, b, shared.length]);
        for (const p of pivots) {
          expect(romanText(p.chord, from)).toBe(p.from);
          expect(romanText(p.chord, to)).toBe(p.to);
        }
        const d = keyDistance(from, to);
        expect(d.pivots).toBe(pivots.length);
        expect(mod12(d.semitones)).toBe(mod12(pc(b) - pc(a)));
        if (mod12(pc(b) - pc(a)) === 7)
          expect([d.relation, d.pivots, d.commonTones]).toEqual(["dominant", 4, 6]);
        if (mod12(pc(b) - pc(a)) === 5) expect([d.relation, d.pivots]).toEqual(["subdominant", 4]);
        if (mod12(pc(b) - pc(a)) === 2)
          expect([d.relation, d.pivots, d.commonTones]).toEqual(["up-step", 2, 5]);
        if (mod12(pc(b) - pc(a)) === 1) expect([d.relation, d.pivots]).toEqual(["up-half", 0]);
      }
  });
  test("relative and parallel keys", () => {
    for (const t of MAJOR_TONICS) {
      const rel = minor(Key.majorKey(t).minorRelative);
      expect(keyDistance(major(t), rel).relation).toBe("relative");
      expect(keyDistance(major(t), rel).commonTones).toBe(7);
      expect(keyDistance(major(t), minor(t)).relation).toBe("parallel");
      expect(keyDistance(major(t), major(t)).relation).toBe("same");
    }
  });
  test("a lift in every key: the plan written, parsed, and read bar by bar", () => {
    for (const t of MAJOR_TONICS)
      for (const semis of [1, 2]) {
        const text = keyLiftScale(t, 24, semis, 8);
        const plan = parseKeyPlan(text);
        if (!plan) throw new Error(`not a plan: ${text}`);
        expect([plan.totalBars, plan.spans.length, plan.changes.length]).toEqual([32, 2, 1]);
        expect(plan.changes[0]?.bar).toBe(24);
        expect(keyAtBarOfPlan(plan, 23)).toEqual(major(t));
        const lifted = keyAtBarOfPlan(plan, 24);
        expect(pc(lifted.tonic)).toBe(mod12(pc(t) + semis));
        expect(pc(lifted.tonic)).toBe(pc(transposeKey(major(t), semis).tonic));
        expect(plan.changes[0]?.distance.relation).toBe(semis === 1 ? "up-half" : "up-step");
      }
    // One scale, or a pattern that is not a plan of bars, is no key plan.
    expect(parseKeyPlan("C4:major")?.changes ?? []).toEqual([]);
    expect(parseKeyPlan("[C4:major D4:major]")).toBeNull();
  });
});

describe("beat grids and pushes for every meter the core uses", () => {
  test("simple meters divide the beat in two, compound ones in three; BPM counts the beat", () => {
    for (const meter of ["4/4", "3/4", "2/4"] as const) {
      const g = beatGrid(meter);
      expect([meter, g.compound, g.division, g.beats]).toEqual([meter, false, 2, METERS[meter].unitsPerBar]);
      expect(g.lines.filter((l) => l.level === "beat").length).toBe(g.beats);
      expect(g.lines.length).toBe(g.beats * 2);
      expect(beatGrid(meter, { triplets: true }).lines.length).toBe(g.beats * 3);
    }
    for (const [meter, beats] of [
      ["6/8", 2],
      ["9/8", 3],
      ["12/8", 4],
    ] as const) {
      const g = beatGrid(meter);
      expect([meter, g.compound, g.division, g.beats, g.lines.length]).toEqual([
        meter,
        true,
        3,
        beats,
        beats * 3,
      ]);
      expect(g.lines.slice(0, 3).map((l) => l.label)).toEqual(["1", "la", "li"]);
    }
    expect(pushAmount("4/4", 8).code).toBe("1/8");
    expect(pushAmount("4/4", 16).code).toBe("1/16");
    expect(pushAmount("3/4", 8).code).toBe("1/6");
  });
});

describe("the CLI prints the same facts (`bun run theory`)", () => {
  const cli = (...args: string[]): unknown => {
    const r = runTheoryCli(args);
    if (r.code !== 0) throw new Error(r.out.split("\n")[0]);
    return JSON.parse(r.out);
  };
  test("every Wave 6 op is in the help and answers", () => {
    const help = runTheoryCli(["help"]).out;
    for (const op of WAVE6_OPS) expect(help).toContain(`\n  ${op} `);
    expect((cli("sevenths", "Eb") as { rn: string }[]).map((c) => c.rn)).toEqual(
      keySevenths(major("Eb")).map((c) => c.rn),
    );
    expect((cli("sevenths", "A:minor", "--harmonic") as { symbol: string }[])[4]?.symbol).toBe("E7");
    expect(cli("seventh", "Bm7b5")).toMatchObject({ quality: "m7b5", name: "half-diminished seventh" });
    expect(cli("seventh", "b3", "d4", "f4", "a4")).toMatchObject({ quality: "m7b5", inversion: 0 });
    expect(cli("seventh", "C")).toEqual({ symbol: "C", quality: null });
    expect(
      (cli("guide", "Dm7", "G7", "C^7") as { line: { name: string }[] }).line.map((s) => s.name),
    ).toEqual(["F", "F", "E"]);
    expect(
      (cli("guide", "Dm7", "G7", "C^7", "--from", "seventh") as { line: { name: string }[] }).line.map(
        (s) => s.name,
      ),
    ).toEqual(["C", "B", "B"]);
    expect(cli("interval-facts", "M10")).toMatchObject({ simple: "M3", octaves: 1, inversion: "m6" });
    expect(cli("mode", "G:mixolydian")).toMatchObject({
      colour: "♭7",
      progression: ["I", "bVII", "IV"],
      parentMajor: "C major",
    });
    expect(cli("modes-of", "D", "d4", "e4", "f4", "g4", "a4", "b4", "c5")).toEqual(["dorian"]);
    expect(cli("chromatic-label", "gs4", "C", "--chord", "E7")).toMatchObject({
      degree: "#5",
      syllable: "si",
    });
    expect(cli("chromatic-label", "gs4", "C", "--down")).toMatchObject({ degree: "b6", syllable: "le" });
    expect((cli("chromatic", "C") as { degrees: { note: string }[] }).degrees.map((d) => d.note)).toEqual([
      "C#",
      "Db",
      "D#",
      "Eb",
      "F#",
      "Gb",
      "G#",
      "Ab",
      "A#",
      "Bb",
    ]);
    expect(cli("applied-of", "A7", "C", "Dm")).toEqual({
      rn: "V7/ii",
      kind: "V7",
      target: "ii (Dm)",
      resolves: true,
    });
    expect(cli("applied-of", "A7", "C", "F")).toMatchObject({ resolves: false });
    expect(cli("applied-of", "Am", "C")).toBeNull();
    expect(
      (cli("applied", "C", "--kind", "V7") as { chords: { symbol: string }[] }).chords.map((c) => c.symbol),
    ).toEqual(["A7", "B7", "C7", "D7", "E7"]);
    expect((cli("chain", "Bb", "4") as { symbol: string }[]).map((c) => c.symbol)).toEqual([
      "D7",
      "G7",
      "C7",
      "F7",
    ]);
    expect((cli("borrowed", "C") as { symbol: string }[]).map((c) => c.symbol)).toEqual([
      "Fm",
      "A♭",
      "B♭",
      "E♭",
      "D°",
    ]);
    expect(cli("borrowed", "A:minor")).toMatchObject({
      picardy: { symbol: "A" },
      dorianFour: { symbol: "D" },
    });
    expect(cli("chord-kind", "Bb", "C")).toEqual({ kind: "borrowed", outside: "borrowed" });
    expect(cli("chord-kind", "D7", "C", "G")).toEqual({ kind: "applied", outside: "secondary-dominant" });
    expect((cli("pivots", "C", "G") as { pivots: { symbol: string }[] }).pivots.map((p) => p.symbol)).toEqual(
      ["C", "Em", "G", "Am"],
    );
    expect(cli("key-plan", "<C4:major!16 D4:major!8>")).toMatchObject({
      totalBars: 24,
      changes: [{ bar: 17, from: "C major", to: "D major", relation: "up-step" }],
    });
    expect(cli("lift", "C", "24", "2", "8")).toEqual({ scale: "<C4:major!24 D4:major!8>" });
    expect(cli("beat-grid", "6/8")).toMatchObject({ beats: 2, compound: true, counts: "1 la li 2 la li" });
    expect(cli("push", "4/4", "16")).toEqual({ cycles: "1/16", code: "1/16" });
    expect((cli("sevenths-table") as unknown[]).length).toBe(5);
  });
  test("usage errors say what is wrong", () => {
    for (const args of [
      ["sevenths"],
      ["seventh"],
      ["guide"],
      ["guide", "Dm7", "--from", "ninth"],
      ["interval-facts", "Z9"],
      ["mode", "C:blues"],
      ["applied", "C", "--kind", "ii"],
      ["chain", "C", "9"],
      ["borrowed", "D:dorian"],
      ["pivots", "C"],
      ["key-plan", "[C4:major D4:major]"],
      ["lift", "C", "x", "2", "8"],
      ["beat-grid", "11/8"],
      ["push", "4/4", "32"],
    ])
      expect([args.join(" "), runTheoryCli(args).code]).toEqual([args.join(" "), 1]);
  });
});
