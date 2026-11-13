// Musical truth of U05–U07, C2 and X1, re-derived. Each claim below is computed a second way, from first
// principles (half-step arithmetic, chords stacked in 3rds, the tunes written out letter by letter from an
// independent reading), and compared with what headless Strudel plays from the lessons' own code and with
// their answer keys. A content edit that breaks a chord name, an inversion, a chord tone on a strong beat,
// a suspension's resolution or a folk tune's notes fails here, not in front of a learner. Written in the
// Wave 4 teaching review, with a regression check for each defect it fixed.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Exercise, LessonDef } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { capstones } from "../capstones.ts";
import { checkpoint as U05CP } from "../core/U05/CP/checkpoint.ts";
import U05L03 from "../core/U05/L03/lesson.ts";
import U05L04 from "../core/U05/L04/lesson.ts";
import U05L05 from "../core/U05/L05/lesson.ts";
import U05L07 from "../core/U05/L07/lesson.ts";
import U05L08 from "../core/U05/L08/lesson.ts";
import U06L02 from "../core/U06/L02/lesson.ts";
import U06L06 from "../core/U06/L06/lesson.ts";
import U06L10 from "../core/U06/L10/lesson.ts";
import U06L11 from "../core/U06/L11/lesson.ts";
import U07L01 from "../core/U07/L01/lesson.ts";
import U07L03 from "../core/U07/L03/lesson.ts";
import U07L04 from "../core/U07/L04/lesson.ts";
import U07L05 from "../core/U07/L05/lesson.ts";
import U07L08 from "../core/U07/L08/lesson.ts";
import U07L09 from "../core/U07/L09/lesson.ts";
import U07L10 from "../core/U07/L10/lesson.ts";
import auraLee from "../repertoire/aura-lee/song.ts";
import redRiver from "../repertoire/red-river-valley/song.ts";

setDefaultTimeout(60_000);

// --- first principles ---------------------------------------------------------------------------

const mod12 = (x: number) => ((x % 12) + 12) % 12;
const NAT: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** "C4" → 60, "F#3" → 54, "Bb3" → 58. */
const midi = (name: string): number => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return (
    (NAT[m[1] as string] as number) + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12 * (Number(m[3]) + 1)
  );
};
const notes = (s: string) => s.split(/\s+/).filter(Boolean).map(midi);
const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
/** Pitch classes of a major key, degree 1 first. */
const majorPcs = (tonicPc: number) => {
  const out = [tonicPc];
  for (const s of MAJOR_STEPS.slice(0, 6)) out.push(mod12((out[out.length - 1] as number) + s));
  return out;
};
type Quality = "maj" | "min" | "dim" | "aug";
const QUALITY: Record<string, Quality> = { "4,3": "maj", "3,4": "min", "3,3": "dim", "4,4": "aug" };
/**
 * A triad read from its sounding notes, the way the lessons teach it: find the note the other two stack on
 * in 3rds (the root), measure the two 3rds, and name the lowest note (root, 3rd or 5th).
 */
function readTriad(
  midis: number[],
): { rootPc: number; quality: Quality; bass: "root" | "3rd" | "5th" } | null {
  const pcs = [...new Set(midis.map(mod12))];
  if (pcs.length !== 3) return null;
  for (const r of pcs) {
    const up = pcs.map((p) => mod12(p - r)).sort((a, b) => a - b);
    const q = QUALITY[`${up[1]},${(up[2] as number) - (up[1] as number)}`];
    if (up[0] !== 0 || !q) continue;
    const low = mod12(Math.min(...midis) - r);
    return { rootPc: r, quality: q, bass: low === 0 ? "root" : low === up[1] ? "3rd" : "5th" };
  }
  return null;
}

interface Ev {
  track: string;
  onset: number;
  midi: number;
}
async function events(code: string, bars: number): Promise<Ev[]> {
  const r = await evalHeadless(code.replace(/⟪|⟫/g, ""), bars);
  return r.events
    .filter((e) => e.midi !== null)
    .map((e) => ({ track: e.track, onset: e.onset, midi: e.midi as number }))
    .sort((a, b) => a.onset - b.onset || a.midi - b.midi);
}
/** One track's notes, grouped by onset: the chords of a chord line. */
const chordsOf = (evs: Ev[], track: string) => {
  const by = new Map<number, number[]>();
  for (const e of evs.filter((x) => x.track === track)) by.set(e.onset, [...(by.get(e.onset) ?? []), e.midi]);
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([onset, ms]) => ({ onset, midis: ms }));
};
/** The chord sounding on `track` at time `t` (the last one that started at or before it). */
const chordAt = (evs: Ev[], track: string, t: number) =>
  chordsOf(evs, track)
    .filter((c) => c.onset <= t + 1e-9)
    .pop()?.midis ?? [];
const line = (evs: Ev[], track: string) => evs.filter((e) => e.track === track);

const exOf = (l: LessonDef, step: string): Exercise => {
  const e = l.steps.find((s) => s.id === step)?.exercise;
  if (!e) throw new Error(`${l.id} ${step}: no exercise`);
  return e;
};
const refOf = (e: Exercise): string => {
  const r = (e as { reference?: { solutions: string[] } }).reference;
  if (!r) throw new Error(`${e.id}: no reference`);
  return r.solutions[0] as string;
};
const stimulus = (e: Exercise): { code: string; bars: number } => {
  const s = (e as { stimulus?: { src: string; code?: string; bars?: number } }).stimulus;
  if (s?.src !== "code" || !s.code) throw new Error(`${e.id}: no code stimulus`);
  return { code: s.code, bars: s.bars ?? 1 };
};
const option = (e: Exercise, id: string): string => {
  const o = (e as { answer: { options: { id: string; audio?: string }[] } }).answer.options.find(
    (x) => x.id === id,
  );
  if (!o?.audio) throw new Error(`${e.id}: no audio option ${id}`);
  return o.audio;
};
const exampleOf = (l: LessonDef, id: string): { code: string; bars: number } => {
  for (const s of l.steps)
    if (s.example?.id === id) return { code: s.example.code, bars: s.example.bars ?? 4 };
  throw new Error(`${l.id}: no example ${id}`);
};
const mdx = (l: string) =>
  Bun.file(new URL(`../core/${l.replace(".", "/")}/lesson.mdx`, import.meta.url)).text();

// --- U05–U06: triads, qualities, inversions, numerals --------------------------------------------

describe("the diatonic triads (U05.L02, U06.L01, U06.L02)", () => {
  // "Major on 1, 4 and 5; minor on 2, 3 and 6; diminished on 7. The same pattern holds in every major key."
  const WANT: Quality[] = ["maj", "min", "min", "maj", "maj", "min", "dim"];
  for (const [tonic, pc] of [
    ["C", 0],
    ["G", 7],
    ["F", 5],
  ] as const)
    test(`${tonic} major: n("[0,2,4]") on every degree`, async () => {
      for (let d = 0; d < 7; d++) {
        const evs = await events(`n("[${d},${d + 2},${d + 4}]").scale("${tonic}3:major")`, 1);
        const t = readTriad(evs.map((e) => e.midi));
        expect([d + 1, t?.quality, t?.rootPc, t?.bass]).toEqual([
          d + 1,
          WANT[d],
          majorPcs(pc)[d] as number,
          "root",
        ]);
      }
    });

  test("U06.L02 S6: ii in G is A minor", () => {
    expect((exOf(U06L02, "S6") as { correct: { text: string[] } }).correct.text).toEqual(["Am"]);
    expect(majorPcs(7)[1]).toBe(NAT.A);
  });

  test("U05.L03 S3: B D F is two minor 3rds, its outer notes a tritone; C E G♯ two major 3rds", async () => {
    const seven = chordsOf(await events(exampleOf(U05L03, "seven-then-home").code, 2), "chords");
    const b = seven[0]?.midis ?? [];
    expect(readTriad(b)).toEqual({ rootPc: NAT.B as number, quality: "dim", bass: "root" });
    expect(Math.max(...b) - Math.min(...b)).toBe(6);
    expect(readTriad(seven[1]?.midis ?? [])?.quality).toBe("maj");
    const rise = chordsOf(await events(refOf(exOf(U05L03, "S4")), 2), "chords");
    expect(readTriad(rise[0]?.midis ?? [])).toEqual({ rootPc: 0, quality: "aug", bass: "root" });
  });
});

describe("named chords (U05.L04 S5)", () => {
  // Added in review: the prose now says Strudel's voicing need not put the root lowest, as the roll shows.
  test("by name, each chord has the same three letters as the stack; C's lowest note is E", async () => {
    const evs = await events(exampleOf(U05L04, "by-name").code, 4);
    for (let bar = 0; bar < 4; bar++) {
      const hand = chordAt(evs, "chords", bar).map(mod12);
      const named = chordAt(evs, "keys", bar + 0.5).map(mod12);
      expect(new Set(named)).toEqual(new Set(hand));
    }
    expect(mod12(Math.min(...chordAt(evs, "keys", 0.5)))).toBe(NAT.E as number);
  });
});

describe("chord names read off the music (U05.L05, U05.CP, U06.L11)", () => {
  test("U05.L05 S6: C F A is F with C lowest, F/C", async () => {
    const e = exOf(U05L05, "S6");
    const t = readTriad((await events(stimulus(e).code, 1)).map((x) => x.midi));
    expect(t).toEqual({ rootPc: NAT.F as number, quality: "maj", bass: "5th" });
    expect((e as { correct: { text: string[] } }).correct.text).toEqual(["F/C"]);
  });
  test("U05.CP grand staff: A on the bass staff under C F A is F/A, first inversion", async () => {
    const e = U05CP.authored.find((x) => x.id === "name-from-the-page") as Exercise;
    const t = readTriad((await events(stimulus(e).code, 1)).map((x) => x.midi));
    expect(t).toEqual({ rootPc: NAT.F as number, quality: "maj", bass: "3rd" });
    expect((e as { correct: { text: string[] } }).correct.text).toEqual(["F/A"]);
  });
  test("U06.L11 S5: the walk C B A under C G Am is I V6 vi", async () => {
    const e = exOf(U06L11, "S5");
    const evs = await events(stimulus(e).code, 3);
    const got = [0, 1, 2].map((bar) => {
      const all = [...chordAt(evs, "chords", bar), ...chordAt(evs, "bass", bar)];
      const t = readTriad(all);
      const deg = majorPcs(0).indexOf(t?.rootPc ?? -1) + 1;
      const rn = (["", "I", "ii", "iii", "IV", "V", "vi", "vii°"][deg] as string).toString();
      return rn + (t?.bass === "3rd" ? "6" : t?.bass === "5th" ? "64" : "");
    });
    expect(got).toEqual((e as { correct: { rn: string[] } }).correct.rn);
    expect(got).toEqual(["I", "V6", "vi"]);
  });
});

describe("voice leading by hand (U05.L07, U05.L08)", () => {
  // "Hold every note two neighbouring chords share, move each other note as little as you can (three half
  // steps at most)": the references meet the rule they grade, voice by voice in written order.
  for (const [l, step] of [
    [U05L07, "S5"],
    [U05L08, "S1"],
  ] as const)
    test(`${l.id} ${step}: shared notes held, no voice moves more than 3 half steps`, async () => {
      const ref = refOf(exOf(l, step));
      const cs = chordsOf(await events(ref, 4), "chords").map((c) => c.midis);
      for (let i = 1; i < cs.length; i++) {
        const [a, b] = [cs[i - 1] as number[], cs[i] as number[]];
        const moves = a.map((m, v) => Math.abs((b[v] as number) - m));
        expect(Math.max(...moves)).toBeLessThanOrEqual(3);
        for (const m of a) if (b.map(mod12).includes(mod12(m))) expect(b).toContain(m);
      }
    });
});

describe("the swerve (U06.L06 S6)", () => {
  // Fixed in review: the tune over V leapt a 6th (D4 up to B4) while the comment called it a step. Now 2 5 |
  // 1: notes of V, then up a 4th to the high C, which belongs to both C and Am, so only the chord swerves.
  test("both endings: the tune is D G | C5, no leap over a 5th, and C5 sits in I and in vi", async () => {
    const e = exOf(U06L06, "S6");
    for (const id of ["to-i", "to-vi"]) {
      const evs = await events(option(e, id), 2);
      const tune = line(evs, "mel").map((x) => x.midi);
      expect(tune).toEqual(notes("D4 G4 C5"));
      for (let i = 1; i < tune.length; i++)
        expect(Math.abs((tune[i] as number) - (tune[i - 1] as number))).toBeLessThanOrEqual(7);
      expect(chordAt(evs, "chords", 1).map(mod12)).toContain(0);
      expect(chordAt(evs, "chords", 0).map(mod12)).toEqual(expect.arrayContaining([7, 2]));
    }
  });
});

describe("the seventh (U06.L10)", () => {
  test("every 7th of the hook sits one or two half steps under the root's octave", async () => {
    const evs = await events(exampleOf(U06L10, "hook").code, 4);
    for (const c of chordsOf(evs, "chords")) {
      const [root, , , seventh] = c.midis as [number, number, number, number];
      expect([10, 11]).toContain(seventh - root);
    }
  });
  test("the prose says what a 7th is, not that root and 7th sit close together", async () => {
    const text = await mdx("U06.L10");
    expect(text).not.toContain("Root and 7th that close together");
    expect(text).toContain("a 2nd turned inside out");
  });
});

// --- U07: melody ------------------------------------------------------------------------------------

describe("contour and climax (U07.L01)", () => {
  test("the hook rises to A, dips to D in bar 4, peaks once on F5 at bar 6 beat 1, a 6th up from A", async () => {
    const tune = line(await events(exampleOf(U07L01, "hook").code, 8), "mel");
    const top = Math.max(...tune.map((e) => e.midi));
    expect(top).toBe(midi("F5"));
    expect(tune.filter((e) => e.midi === top).map((e) => e.onset)).toEqual([5]);
    const i = tune.findIndex((e) => e.midi === top);
    expect(top - (tune[i - 1] as Ev).midi).toBe(8);
    expect(Math.max(...tune.filter((e) => e.onset < 2).map((e) => e.midi))).toBe(midi("A4"));
    expect(tune.filter((e) => e.onset >= 3 && e.onset < 4).map((e) => e.midi)).toEqual([midi("D4")]);
    expect(top - midi("C4")).toBe(17);
    // Fixed in review: the OnPass said the tune "climbs for five bars"; it dips in bars 3–4.
    expect(await mdx("U07.L01")).toContain("dips back to D in bar 4");
  });
});

describe("chord tones and non-chord tones (U07.L03–L05)", () => {
  test("U07.L03 hook: every note on beats 1 and 3 is a chord tone; F in bar 1 and D in bar 3 are not", async () => {
    const evs = await events(exampleOf(U07L03, "hook").code, 4);
    for (const n of line(evs, "mel")) {
      const pcs = chordAt(evs, "chords", n.onset).map(mod12);
      const strong = Math.abs(n.onset * 2 - Math.round(n.onset * 2)) < 1e-9;
      if (strong) expect([n.onset, pcs.includes(mod12(n.midi))]).toEqual([n.onset, true]);
    }
    const nct = line(evs, "mel").filter(
      (n) => !chordAt(evs, "chords", n.onset).map(mod12).includes(mod12(n.midi)),
    );
    expect(nct.some((n) => n.onset < 1 && mod12(n.midi) === NAT.F)).toBe(true);
    expect(nct.some((n) => n.onset >= 2 && n.onset < 3 && mod12(n.midi) === NAT.D)).toBe(true);
  });

  test("U07.L04 S3: four non-chord tones, one a bar, each a step from both neighbours", async () => {
    const evs = await events(exampleOf(U07L04, "outside-the-chord").code, 4);
    const tune = line(evs, "mel");
    const nct = tune.filter((n) => !chordAt(evs, "chords", n.onset).map(mod12).includes(mod12(n.midi)));
    expect(nct.map((n) => Math.floor(n.onset))).toEqual([0, 1, 2, 3]);
    for (const n of nct) {
      const i = tune.indexOf(n);
      for (const nb of [tune[i - 1], tune[i + 1]])
        expect(Math.abs((nb as Ev).midi - n.midi)).toBeLessThanOrEqual(2);
    }
  });

  test("U07.L05 hook: a 4–3 suspension into V and a 9–8 appoggiatura into I", async () => {
    const evs = await events(exampleOf(U07L05, "hook").code, 4);
    const tune = line(evs, "mel");
    const at = (t: number) => tune.filter((n) => n.onset <= t + 1e-9).pop() as Ev;
    // The C is prepared over IV (a chord tone there), still sounds on beat 1 of the V bar (not in G B D),
    // and falls a half step to B, G's 3rd, on beat 3.
    const c = at(2);
    expect(c.midi).toBe(midi("C5"));
    expect(c.onset).toBeLessThan(2);
    expect(chordAt(evs, "chords", c.onset).map(mod12)).toContain(0);
    expect(chordAt(evs, "chords", 2).map(mod12)).not.toContain(0);
    const res = at(2.5);
    expect([res.onset, c.midi - res.midi]).toEqual([2.5, 1]);
    expect(mod12(res.midi - (chordAt(evs, "chords", 2)[0] as number))).toBe(4);
    // D5 on beat 1 of the last bar, leapt to (a 3rd) from that B, falling a step to C, the root.
    const d = at(3);
    expect([d.midi, d.onset, d.midi - res.midi]).toEqual([midi("D5"), 3, 3]);
    expect(chordAt(evs, "chords", 3).map(mod12)).not.toContain(NAT.D);
    expect(d.midi - at(3.5).midi).toBe(2);
    expect(mod12(at(3.5).midi)).toBe(0);
  });
});

describe("pickups (U07.L08, U07.L09, U07.L10)", () => {
  test("Auld Lang Syne: the low G on beat 4 of bar 0, then C C C E | D C D E | C C E G | A", async () => {
    const tune = line(await events(exampleOf(U07L08, "hook").code, 5), "mel");
    expect(tune.map((n) => n.midi)).toEqual(notes("G3 C4 C4 C4 E4 D4 C4 D4 E4 C4 C4 E4 G4 A4"));
    expect(tune[0]?.onset).toBe(0.75);
  });
  test("Amazing Grace (New Britain) in F: C | F . A F | A . G | F . D | C", async () => {
    const tune = line(await events(exampleOf(U07L09, "hook").code, 5), "mel");
    expect(tune.slice(0, 10).map((n) => n.midi)).toEqual(notes("C4 F4 A4 F4 A4 G4 F4 D4 C4 C4"));
    expect(tune[0]?.onset).toBeCloseTo(2 / 3, 9);
  });
  // Fixed in review: both by-ear pickup steps passed answers that miss the point of the step at the
  // dictation default (0.85). The lesson tests pin the failing answers; these pin the thresholds.
  test("the by-ear pickup steps pass only an exact answer", () => {
    expect((exOf(U07L08, "S5") as { pass?: number }).pass).toBe(0.98);
    const hook = exOf(U07L10, "S6") as { pass?: number; matcher: { m: string; of?: { m: string }[] } };
    expect(hook.pass).toBe(0.98);
    expect(hook.matcher.of?.map((m) => m.m)).toEqual(["melody", "rhythm"]);
  });
});

// --- the repertoire X1 transcribes, written out independently -----------------------------------------

describe("X1's answer keys, note by note", () => {
  const melodyOf = async (code: string, bars: number) =>
    line(
      await events(
        code
          .split("\n")
          .filter((l) => !l.startsWith("chords") && !l.startsWith("bass"))
          .join("\n"),
        bars,
      ),
      "mel",
    ).map((n) => n.midi);
  test("Aura Lee in C: verse 5 1 7 1 | 2 6 2, chorus 7 7 7 | 1 1 1 | 3 2 1 2 | 3", async () => {
    const got = await melodyOf(auraLee.answerKey.code, 16);
    expect(got).toEqual(
      notes(`G3 C4 B3 C4  D4 A3 D4  C4 B3 A3 B3  C4
             G3 C4 B3 C4  D4 D4 D4  C4 B3 A3 B3  C4
             B3 B3 B3  C4 C4 C4  E4 D4 C4 D4  E4
             E4 E4 F4 E4  D4 A3 D4 C4  B3 B3 E4 D4  C4`),
    );
    expect((auraLee.answerKey.chords ?? []).map((c) => c.symbol)).toEqual(
      "C Dm G C C Dm G C Em Am C C C Dm G C".split(" "),
    );
  });
  test("Red River Valley in C, from its two-beat pickup", async () => {
    const got = await melodyOf(redRiver.answerKey.code, 17);
    expect(got).toEqual(
      notes(`G3 C4  E4 E4 E4  E4 D4 E4  D4 C4
             G3 C4  E4 C4 E4  G4 F4 E4  D4
             G4 F4  E4 E4 D4  C4 D4 E4  G4 F4
             A3 A3  G3 B3 C4  D4 E4 D4  C4`),
    );
    expect((redRiver.answerKey.chords ?? []).map((c) => c.symbol)).toEqual(
      "C C C C C C G G C C F F G G C C".split(" "),
    );
  });
});

// --- C2 -----------------------------------------------------------------------------------------------

describe("C2 Four-Chord Song", () => {
  const c2 = capstones.find((c) => c.id === "C2");
  test("the motif rule reads a sequence by degrees as the idea (U07.L02's sequence counts)", () => {
    const rule = c2?.brief?.rubric.find((r) => r.rule === "motif-reuse") as {
      minRatio: number;
      shape?: string;
    };
    expect(rule).toMatchObject({ minRatio: 0.5, shape: "either" });
  });
  test("every passing test piece: notes of the chord on beats 1 and 3, in at least 60% of them", async () => {
    for (const t of (c2?.brief?.tests ?? []).filter((x) => x.expect === "pass")) {
      const code = (t.response as { code: string }).code;
      const evs = await events(code, 8);
      const strong = line(evs, "mel").filter((n) => Math.abs(n.onset * 2 - Math.round(n.onset * 2)) < 1e-9);
      const fit = strong.filter((n) => chordAt(evs, "chords", n.onset).map(mod12).includes(mod12(n.midi)));
      expect([t.name, fit.length / strong.length >= 0.6]).toEqual([t.name, true]);
    }
  });
});
