// Musical truth of U03 and U04, re-derived. Each claim the lessons, checkpoints and their feedback make is
// computed here a second way, from first principles (letters, the W W H W W W H pattern, half-step
// arithmetic), and compared with @oak/theory, with the lessons' own answer keys and with what headless
// Strudel plays. A content edit that breaks a spelling, a degree ↔ `n` bridge or an interval claim fails
// here, not in front of a learner. Written in the Wave 3 teaching review.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CheckpointDef, Exercise, LessonDef } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { FLAT_ORDER, intervalOf, keyOf, SHARP_ORDER, scaleNotes, signatureOf } from "@oak/theory";
import { checkpoint as U03CP } from "../core/U03/CP/checkpoint.ts";
import U03L01 from "../core/U03/L01/lesson.ts";
import U03L02 from "../core/U03/L02/lesson.ts";
import U03L03 from "../core/U03/L03/lesson.ts";
import U03L04 from "../core/U03/L04/lesson.ts";
import U03L05 from "../core/U03/L05/lesson.ts";
import U03L06 from "../core/U03/L06/lesson.ts";
import U03L07 from "../core/U03/L07/lesson.ts";
import U03L08 from "../core/U03/L08/lesson.ts";
import U03L09 from "../core/U03/L09/lesson.ts";
import U03L10 from "../core/U03/L10/lesson.ts";
import U03L11 from "../core/U03/L11/lesson.ts";
import { checkpoint as U04CP } from "../core/U04/CP/checkpoint.ts";
import U04L01 from "../core/U04/L01/lesson.ts";
import U04L02 from "../core/U04/L02/lesson.ts";
import U04L03 from "../core/U04/L03/lesson.ts";
import U04L04 from "../core/U04/L04/lesson.ts";

setDefaultTimeout(60_000);

// --- first principles ---------------------------------------------------------------------------

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
const mod12 = (x: number) => ((x % 12) + 12) % 12;
const pcOf = (name: string): number => {
  const acc = name.slice(1);
  return mod12(
    (NATURAL[name[0] as string] as number) + (acc.match(/#/g)?.length ?? 0) - (acc.match(/b/g)?.length ?? 0),
  );
};
/** A major scale spelled by the rule the learner is taught: each letter once, W W H W W W H. */
function spellMajor(tonic: string): string[] {
  const start = LETTERS.indexOf(tonic[0] as (typeof LETTERS)[number]);
  const out = [tonic];
  let pc = pcOf(tonic);
  for (let i = 1; i < 7; i++) {
    pc = mod12(pc + (MAJOR_STEPS[i - 1] as number));
    const letter = LETTERS[(start + i) % 7] as string;
    const diff = mod12(pc - (NATURAL[letter] as number));
    out.push(letter + (diff === 0 ? "" : diff <= 2 ? "#".repeat(diff) : "b".repeat(12 - diff)));
  }
  return out;
}
const accidentals = (scale: string[]) => scale.filter((n) => n.length > 1);
/** MIDI of degree (1-based) `d` of a major key whose tonic sits at `tonicMidi`, `oct` octaves away. */
const degMidi = (tonicMidi: number, d: number, oct = 0) =>
  tonicMidi + MAJOR_STEPS.slice(0, d - 1).reduce((a, b) => a + b, 0) + 12 * oct;
/** What `n(k)` plays over a major scale at `tonicMidi`: degree k+1, wrapping by octaves (n = degree − 1). */
const nMidi = (tonicMidi: number, k: number) => degMidi(tonicMidi, mod7(k) + 1, Math.floor(k / 7));
const mod7 = (x: number) => ((x % 7) + 7) % 7;
const MIDI = { C4: 60, D4: 62, Eb4: 63, F4: 65, G4: 67, A3: 57, G3: 55 } as const;

const exOf = (l: LessonDef, id: string): Exercise => {
  for (const s of l.steps) if (s.exercise?.id === id) return s.exercise;
  throw new Error(`${l.id}: no exercise ${id}`);
};
const cpEx = (cp: CheckpointDef, id: string): Exercise => {
  const e = cp.authored.find((x) => x.id === id);
  if (!e) throw new Error(`${cp.id}: no item ${id}`);
  return e;
};
const rat = (x: string | number): number => {
  const [a, b] = String(x).split("/").map(Number);
  return b ? (a as number) / b : (a as number);
};
async function midis(code: string, bars: number): Promise<number[]> {
  const r = await evalHeadless(code, bars);
  return r.events
    .filter((e) => e.midi !== null)
    .sort((a, b) => rat(a.begin) - rat(b.begin) || (a.midi as number) - (b.midi as number))
    .map((e) => e.midi as number);
}
const refOf = (e: Exercise): { code: string; bars: number } => {
  const r = (e as { reference?: { solutions: string[]; bars: number } }).reference;
  if (!r) throw new Error(`${e.id}: no reference`);
  return { code: r.solutions[0] as string, bars: r.bars };
};

// --- keys ---------------------------------------------------------------------------------------

const FIFTEEN = ["C", "G", "D", "A", "E", "B", "F#", "C#", "F", "Bb", "Eb", "Ab", "Db", "Gb", "Cb"];

describe("the fifteen major keys (U03.L01, L06, L07)", () => {
  for (const tonic of FIFTEEN)
    test(`${tonic} major: spelling, signature, order, last sharp 7 / last flat 4`, () => {
      const scale = spellMajor(tonic);
      // Each letter once.
      expect(new Set(scale.map((n) => n[0])).size).toBe(7);
      // The same as @oak/theory, note for note.
      expect(scaleNotes({ tonic, mode: "major" })).toEqual(scale);
      const acc = accidentals(scale);
      const sharp = acc.some((n) => n.includes("#"));
      const order = sharp ? SHARP_ORDER : FLAT_ORDER;
      const sig = signatureOf(keyOf(`${tonic} major`) as never);
      const written = sharp ? sig.sharps : sig.flats;
      // A key signature is the first k of the order (F C G D A E B, or its mirror), never mixed.
      expect(written).toEqual(order.slice(0, acc.length) as string[]);
      expect([...written].sort()).toEqual([...acc].sort());
      expect(sharp ? sig.flats : sig.sharps).toEqual([]);
      if (acc.length > 0) {
        const last = written[written.length - 1] as string;
        // L06: "the last sharp is always degree 7"; L07: "the last flat is always degree 4".
        expect(scale.indexOf(last) + 1).toBe(sharp ? 7 : 4);
      }
    });

  test("the order of flats is the order of sharps backwards (L07 S4)", () => {
    expect(FLAT_ORDER.map((n) => n[0])).toEqual([...SHARP_ORDER.map((n) => n[0])].reverse());
  });

  test("clockwise each home is degree 5 of the last, anticlockwise degree 4 (L07 S1, S3)", () => {
    const cw = ["C", "G", "D", "A", "E", "B", "F#"];
    for (let i = 1; i < cw.length; i++) expect(spellMajor(cw[i - 1] as string)[4]).toBe(cw[i] as string);
    const acw = ["C", "F", "Bb", "Eb", "Ab", "Db", "Gb"];
    for (let i = 1; i < acw.length; i++) expect(spellMajor(acw[i - 1] as string)[3]).toBe(acw[i] as string);
  });

  test("neighbours on the circle share six of seven notes (L07 S6)", () => {
    for (const [a, b] of [
      ["C", "G"],
      ["C", "F"],
      ["D", "A"],
      ["Bb", "Eb"],
    ] as const) {
      const shared = spellMajor(a).filter((n) => spellMajor(b).includes(n));
      expect(shared.length).toBe(6);
    }
  });

  test("L07 S7 tip: C to G changes one note; C to F♯ (half-way round) changes five pitch classes", async () => {
    const pcs = (t: string) => new Set(spellMajor(t).map(pcOf));
    const changed = (a: string, b: string) => [...pcs(b)].filter((p) => !pcs(a).has(p)).length;
    expect(changed("C", "G")).toBe(1);
    expect(changed("C", "F#")).toBe(5);
    // Strudel reads the key plan of the tip.
    const r = await evalHeadless('n("0").scale("<C4:major F#4:major>")', 2);
    expect(r.events.map((e) => e.midi)).toEqual([60, 66]);
  });
});

describe("answer keys about keys", () => {
  test("U03.L01: G major needs F♯ (S5) and D major is D E F# G A B C# (S7)", async () => {
    expect(spellMajor("G")).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    const d = exOf(U03L01, "spell-d-major") as Extract<Exercise, { kind: "fact" }>;
    expect(d.correct.text).toEqual(spellMajor("D"));
    const g = refOf(exOf(U03L01, "build-g-major"));
    expect(await midis(g.code, g.bars)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => nMidi(67, k)));
  });

  test("U03.L01 S3: the half steps of C major are E–F and B–C", () => {
    const c = spellMajor("C");
    const halves = MAJOR_STEPS.map((s, i) => (s === 1 ? `${c[i]}-${c[(i + 1) % 7]}` : null)).filter(Boolean);
    expect(halves).toEqual(["E-F", "B-C"]);
  });

  test("U03.L05 S5: n 2 over D4:major is F♯, degree 3", async () => {
    const e = exOf(U03L05, "n-two-in-d") as Extract<Exercise, { kind: "fact" }>;
    expect(e.correct.text).toEqual([spellMajor("D")[2] as string]);
    expect(await midis('n("2").scale("D4:major")', 1)).toEqual([66]);
  });

  test("U03.L06: A major has three sharps (S6), D major's are F# C# (S4)", () => {
    const a = exOf(U03L06, "sharps-in-a") as Extract<Exercise, { kind: "fact" }>;
    expect(a.correct.number).toBe(accidentals(spellMajor("A")).length);
    expect(signatureOf(keyOf("D major") as never).sharps).toEqual(["F#", "C#"]);
  });

  test("U03.L06 S5: the page in G plays D5 F#5 G5 D5 | E5 D5 B4", async () => {
    const r = refOf(exOf(U03L06, "page-in-g"));
    expect(await midis(r.code, r.bars)).toEqual([74, 78, 79, 74, 76, 74, 71]);
  });

  test("U03.L07: F major's flat is B♭ (S2), E♭ major is spelled with three flats (S5)", async () => {
    expect(accidentals(spellMajor("F"))).toEqual(["Bb"]);
    const r = refOf(exOf(U03L07, "spell-e-flat-major"));
    expect(await midis(r.code, r.bars)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((k) => nMidi(63, k)));
    expect(accidentals(spellMajor("Eb"))).toEqual(["Eb", "Ab", "Bb"]);
    // The answer key spells them with flats, each letter once.
    expect(r.code).toContain("eb4 f4 g4 ab4 bb4 c5 d5 eb5");
  });

  test("U03.CP: E♭ major's signature is B♭ E♭ A♭ in that order", () => {
    expect(signatureOf(keyOf("Eb major") as never).flats).toEqual(["Bb", "Eb", "Ab"]);
  });
});

// --- degrees and n ------------------------------------------------------------------------------

describe("degree = n + 1, everywhere it is claimed", () => {
  test("U03.L02: Ode to Joy is degrees 3 3 4 5 | 5 4 3 2, n one less, in C and in G", async () => {
    const tune = [3, 3, 4, 5, 5, 4, 3, 2];
    const c = refOf(exOf(U03L02, "tune-by-numbers"));
    expect(await midis(c.code, c.bars)).toEqual(tune.map((d) => degMidi(60, d)));
    const g = refOf(exOf(U03L02, "home-is-g"));
    expect(await midis(g.code, g.bars)).toEqual(tune.map((d) => degMidi(67, d)));
  });

  test("U03.L02 S3: n 0 is labelled 1 and n 4 plays degree 5", () => {
    expect(nMidi(60, 0)).toBe(degMidi(60, 1));
    expect(nMidi(60, 4)).toBe(degMidi(60, 5));
  });

  test("U03.L03: n -3 is the 5 below home, n -1 the 7 below, n 7 home an octave up; the line an octave down", async () => {
    expect(nMidi(60, -3)).toBe(degMidi(60, 5, -1));
    expect(nMidi(60, -1)).toBe(degMidi(60, 7, -1));
    expect(nMidi(60, 7)).toBe(72);
    const r = refOf(exOf(U03L03, "an-octave-down"));
    expect(await midis(r.code, r.bars)).toEqual([5, 3, 2, 1].map((d) => degMidi(60, d, -1)));
  });

  test("U03.L04: `0 .. 7` then `7 .. 0` is home to home and back, 16 notes", async () => {
    const r = refOf(exOf(U03L04, "up-and-back-down"));
    const up = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => nMidi(60, k));
    expect(await midis(r.code, r.bars)).toEqual([...up, ...[...up].reverse()]);
    // The leading tone is a half step under home.
    expect(degMidi(60, 1, 1) - degMidi(60, 7)).toBe(1);
  });

  test("U03.L05: the tune in C then G4; C to D moves every note 2 half steps, C to F 5", async () => {
    const tune = [1, 3, 5, 3, 4, 2, 1];
    const r = refOf(exOf(U03L05, "visit-g"));
    expect(await midis(r.code, r.bars)).toEqual([
      ...tune.map((d) => degMidi(60, d)),
      ...tune.map((d) => degMidi(67, d)),
    ]);
    expect(MIDI.F4 - MIDI.C4).toBe(5);
  });

  test("U03.L08: do re mi re do is n 0 1 2 1 0; sol is degree 5", async () => {
    const r = refOf(exOf(U03L08, "write-what-you-sing"));
    expect(await midis(r.code, r.bars)).toEqual([1, 2, 3, 2, 1].map((d) => degMidi(60, d)));
  });

  test("U03.L09: the Saints is (rest) 1 3 4 | 5, twice", async () => {
    const r = refOf(exOf(U03L09, "saints-by-number"));
    expect(await midis(r.code, r.bars)).toEqual([1, 3, 4, 5, 1, 3, 4, 5].map((d) => degMidi(60, d)));
  });

  test("U03.L10: Swing Low is 3 1 | 3 1 6, | 5, and Auld Lang Syne 1 1 1 3 | 2 1 2 3 | 1 1 3 5 | 6", async () => {
    const s = refOf(exOf(U03L10, "swing-low-by-ear"));
    expect(await midis(s.code, s.bars)).toEqual([
      degMidi(60, 3),
      60,
      degMidi(60, 3),
      60,
      degMidi(60, 6, -1),
      degMidi(60, 5, -1),
    ]);
    const a = refOf(exOf(U03L10, "auld-lang-syne-by-ear"));
    expect(await midis(a.code, a.bars)).toEqual(
      [1, 1, 1, 3, 2, 1, 2, 3, 1, 1, 3, 5, 6].map((d) => degMidi(60, d)),
    );
  });

  test("U03.L10 S6: only a move by degrees brings the answer home; moves that keep the half steps end open", async () => {
    // The phrase is 1 1 1 3 | 2 1 2 3 and ends on 3. Moves that keep every half step start on 4 or 5 (1 2 3,
    // 4 5 6 and 5 6 7 are all two whole steps) and end on 6 or 7; the move from 6 keeps the shape in degrees
    // and ends on 1. That is why the rubric counts `shape: "either"` and the brief starts bar 3 on 6.
    const steps = (from: number) => [
      nMidi(60, from) - nMidi(60, from - 1),
      nMidi(60, from + 1) - nMidi(60, from),
    ];
    const keepsHalfSteps = [1, 2, 3, 4, 5, 6, 7].filter((d) => steps(d).join() === steps(1).join());
    expect(keepsHalfSteps).toEqual([1, 4, 5]);
    expect(keepsHalfSteps.map((d) => ((d + 2 - 1) % 7) + 1)).toEqual([3, 6, 7]);
    const e = exOf(U03L10, "answer-the-phrase") as Extract<Exercise, { kind: "code-make" }>;
    const rule = e.rubric.find((r) => r.id === "same-shape") as { shape?: string };
    expect(rule.shape).toBe("either");
    const minimal = e.tests.find((t) => t.name.startsWith("minimal"));
    if (!minimal) throw new Error("U03.L10 S6: no minimal test");
    const code = (minimal.response as { code: string }).code;
    const m = await midis(code, 4);
    expect(m.slice(8)).toEqual([6, 6, 6, 8, 7, 6, 7, 8].map((d) => nMidi(60, d - 1)));
    expect(m[m.length - 1]).toBe(72);
  });

  test("U03.L07 S3: C to G changes one note of the scale, C to F♯ five", () => {
    const pcs = (t: string) => new Set(spellMajor(t).map(pcOf));
    const differ = (a: string, b: string) => [...pcs(b)].filter((p) => !pcs(a).has(p)).length;
    expect(differ("C", "G")).toBe(1);
    expect(differ("C", "F#")).toBe(5);
    // The three places with two names at the bottom of the clock are the same keys on the piano.
    for (const [a, b] of [
      ["B", "Cb"],
      ["F#", "Gb"],
      ["C#", "Db"],
    ] as const)
      expect(differ(a, b)).toBe(0);
  });

  test("U03.L11: the tune pauses on 5 in bar 4 and ends on 1; the draft of S3 ends on 2", async () => {
    const r = refOf(exOf(U03L11, "bring-it-home"));
    const m = await midis(r.code, r.bars);
    expect(m[m.length - 1]).toBe(60);
    const bar4 = await evalHeadless(r.code, r.bars);
    const inBar4 = bar4.events.filter((e) => rat(e.begin) >= 3 && rat(e.begin) < 4);
    expect(inBar4[inBar4.length - 1]?.midi).toBe(degMidi(60, 5));
  });

  test("U03.CP: 1 3 5 3 | 4 2 1 in D, home on D4", async () => {
    const r = refOf(cpEx(U03CP, "tune-in-d"));
    expect(await midis(r.code, r.bars)).toEqual([1, 3, 5, 3, 4, 2, 1].map((d) => degMidi(62, d)));
  });
});

// --- intervals ----------------------------------------------------------------------------------

describe("intervals (U04)", () => {
  test("U04.L02 S3: every name in the table is the number of half steps it claims", async () => {
    const table: [string, number][] = [
      ["2m", 1],
      ["2M", 2],
      ["3m", 3],
      ["3M", 4],
      ["4P", 5],
      ["5P", 7],
      ["6m", 8],
      ["6M", 9],
      ["7m", 10],
      ["7M", 11],
      ["8P", 12],
    ];
    for (const [name, semis] of table)
      expect([name, await midis(`note("c4").transpose("${name}")`, 1)]).toEqual([name, [60 + semis]]);
  });

  test("U04.L02 S2: C–E is four half steps (major), E–G three (minor)", () => {
    expect(intervalOf("C4", "E4").name).toBe("M3");
    expect(intervalOf("E4", "G4").name).toBe("m3");
  });

  test("U04.L02 S7: a major 3rd, major 6th or perfect 5th above C, F and G stays in C major", () => {
    const cMajorPcs = spellMajor("C").map(pcOf);
    for (const root of ["C", "F", "G"])
      for (const semis of [4, 9, 7])
        expect([root, semis, cMajorPcs.includes(mod12(pcOf(root) + semis))]).toEqual([root, semis, true]);
  });

  test("U04.L01: a 3rd above in the key is n + 2, and that is not always 4 half steps", async () => {
    const r = refOf(exOf(U04L01, "a-third-above"));
    const ev = await evalHeadless(r.code, r.bars);
    const mel = ev.events.filter((e) => e.track === "mel").map((e) => e.midi as number);
    const vox = ev.events.filter((e) => e.track === "vox").map((e) => e.midi as number);
    const melDeg = mel.map((m) => spellMajor("C").map(pcOf).indexOf(mod12(m)));
    const voxDeg = vox.map((m) => spellMajor("C").map(pcOf).indexOf(mod12(m)));
    expect(voxDeg).toEqual(melDeg.map((d) => (d + 2) % 7));
    expect(new Set(vox.map((v, i) => v - (mel[i] as number)))).toEqual(new Set([3, 4]));
  });

  test("U04.L03: B–F is six half steps; 4 and 7 are the only tritone in every major key", () => {
    expect(intervalOf("B3", "F4").semitones).toBe(6);
    for (const tonic of FIFTEEN) {
      const pcs = spellMajor(tonic).map(pcOf);
      const pairs: string[] = [];
      for (let i = 0; i < 7; i++)
        for (let j = i + 1; j < 7; j++)
          if (mod12((pcs[j] as number) - (pcs[i] as number)) % 6 === 0 && i !== j)
            pairs.push(`${i + 1}-${j + 1}`);
      expect([tonic, pairs]).toEqual([tonic, ["4-7"]]);
    }
  });

  test("U04.L03: B–F resolves inward to C–E (a 3rd)", () => {
    expect(intervalOf("C4", "E4").semitones).toBeLessThan(intervalOf("B3", "F4").semitones);
  });

  test("U04.CP: C–E M3, D–A P5, F–B A4 (a tritone); degree 2 up to 6 is a 5th", () => {
    expect(intervalOf("C4", "E4").name).toBe("M3");
    expect(intervalOf("D4", "A4").name).toBe("P5");
    expect(intervalOf("F4", "B4").name).toBe("A4");
    const c = cpEx(U04CP, "count-the-distance") as Extract<Exercise, { kind: "fact" }>;
    expect(c.correct.number).toBe(6 - 2 + 1);
  });

  test("U04.L04: a 4th above C E G E is F A C A, and a 3rd by degrees changes the shape", async () => {
    expect(await midis('note("c4 e4 g4 e4").transpose("4P")', 1)).toEqual([65, 69, 72, 69]);
    const diatonic = [64, 67, 71, 67];
    const exact = [60, 64, 67, 64].map((m) => m + 4);
    expect(diatonic).not.toEqual(exact);
    expect(U04L02.id).toBe("U04.L02");
    expect(U04L03.id).toBe("U04.L03");
    expect(U04L04.id).toBe("U04.L04");
  });
});
