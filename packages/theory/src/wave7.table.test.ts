// Wave 7 Build (grader): exhaustive table tests of the advanced tracks' facts over all twelve keys and every grid,
// and the `theory` CLI's Wave 7 ops. Every fact is computed from the one chord table, so each is checked against an
// independent reading (pitch classes by arithmetic, the voicing reader on the builders' output, round trips).
import { describe, expect, test } from "bun:test";
import { chordPcs, parseChordSymbol } from "./chords.ts";
import { runTheoryCli } from "./cli.ts";
import { euclid } from "./rhythm.ts";
import type { ChordId } from "./types.ts";
import {
  availableTensions,
  backdoor,
  CLAVE_TYPES,
  claveOf,
  claveSteps,
  diminishedPassing,
  drop2,
  euclidIdentity,
  FOURTHS_MAJOR,
  FOURTHS_MINOR,
  lateFor,
  lateMs,
  rootlessVoicing,
  secondaryTwoFive,
  shellVoicing,
  swingAmount,
  swingRatio,
  tensionsOf,
  tritoneSub,
  twoFiveOne,
  twoFiveOnesAllKeys,
  twoFiveTarget,
  voicingType,
} from "./wave7.ts";

const PC: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
};
const m12 = (x: number): number => ((x % 12) + 12) % 12;
const chord = (s: string): ChordId => parseChordSymbol(s) as ChordId;

describe("ii–V–I in all twelve keys", () => {
  test("major: ii7 V7 Imaj7 a whole step, a 5th and the tonic above; the pair aims at its key", () => {
    expect(twoFiveOnesAllKeys("major")).toHaveLength(12);
    for (const k of FOURTHS_MAJOR) {
      const t = twoFiveOne(k, "major");
      const [ii, v, i] = t.symbols.map(chord) as [ChordId, ChordId, ChordId];
      const tonic = PC[k] as number;
      expect([k, ii.rootPc, ii.quality] as unknown[]).toEqual([k, m12(tonic + 2), "m7"]);
      expect([k, v.rootPc, v.quality] as unknown[]).toEqual([k, m12(tonic + 7), "7"]);
      expect([k, i.rootPc, i.quality] as unknown[]).toEqual([k, tonic, "maj7"]);
      expect(twoFiveTarget(ii, v) as unknown).toEqual({ tonicPc: tonic, mode: "major" });
      expect(t.rn).toEqual(["ii7", "V7", "Imaj7"]);
    }
  });
  test("minor: iiø7 V7alt i7, and the V's 3rd is the key's leading tone", () => {
    for (const k of FOURTHS_MINOR) {
      const t = twoFiveOne(k, "minor");
      const [ii, v, i] = t.symbols.map(chord) as [ChordId, ChordId, ChordId];
      const tonic = PC[k] as number;
      expect([k, ii.rootPc, ii.quality] as unknown[]).toEqual([k, m12(tonic + 2), "m7b5"]);
      expect([k, v.rootPc, v.quality] as unknown[]).toEqual([k, m12(tonic + 7), "7alt"]);
      expect([k, i.rootPc, i.quality] as unknown[]).toEqual([k, tonic, "m7"]);
      expect(chordPcs(v).map(m12)).toContain(m12(tonic - 1));
      expect(twoFiveTarget(ii, v)?.tonicPc as number | undefined).toBe(tonic);
    }
  });
});

describe("substitutions in all twelve keys", () => {
  test("a tritone sub shares the dominant's 3rd and 7th; a backdoor is iv7 ♭VII7 Imaj7", () => {
    for (const k of FOURTHS_MAJOR) {
      const tonic = PC[k] as number;
      const v = chord(twoFiveOne(k).symbols[1]);
      const sub = tritoneSub(v);
      expect(sub.rootPc as number).toBe(m12(v.rootPc + 6));
      const guide = (c: ChordId) => new Set([m12(c.rootPc + 4), m12(c.rootPc + 10)]);
      expect([...guide(sub)].sort()).toEqual([...guide(v)].sort());
      const [iv, bvii, i] = backdoor(k);
      expect([iv.rootPc, iv.quality, bvii.rootPc, bvii.quality, i.rootPc] as unknown[]).toEqual([
        m12(tonic + 5),
        "m7",
        m12(tonic + 10),
        "7",
        tonic,
      ]);
    }
  });
  test("a secondary ii–V aims at its target; a diminished chord passes a half step above", () => {
    for (const k of FOURTHS_MAJOR) {
      const target = chord(`${k}^7`);
      const [ii, v] = secondaryTwoFive(target);
      expect(m12(v.rootPc + 5)).toBe(target.rootPc);
      expect(m12(v.rootPc - ii.rootPc)).toBe(5);
      const to = chord(twoFiveOne(k).symbols[0]);
      const d = diminishedPassing(target, to);
      expect(d?.rootPc as number | undefined).toBe(m12(target.rootPc + 1));
      expect(d?.quality).toBe("dim7");
    }
  });
});

describe("voicings in all twelve keys (octave-aware)", () => {
  test("the builders' rootless A and B, shells and drop-2 read back as themselves", () => {
    for (const k of FOURTHS_MAJOR)
      for (const sym of twoFiveOne(k).symbols) {
        const c = chord(sym);
        expect([sym, voicingType(rootlessVoicing(c, "A"), c).type] as unknown[]).toEqual([sym, "rootless-a"]);
        expect([sym, voicingType(rootlessVoicing(c, "B"), c).type] as unknown[]).toEqual([sym, "rootless-b"]);
        expect([sym, voicingType(shellVoicing(c), c).type] as unknown[]).toEqual([sym, "shell"]);
        const rel = [...new Set(chordPcs(c).map((p) => m12(p - c.rootPc)))].sort((a, b) => a - b).slice(0, 4);
        const close = rel.map((x) => 48 + c.rootPc + x);
        expect([sym, voicingType(close, c).type] as unknown[]).toEqual([sym, "close"]);
        expect([sym, voicingType(drop2(close), c).type] as unknown[]).toEqual([sym, "drop-2"]);
        // The same pitch classes in another spacing are not a drop-2 (octave-aware, never by pitch-class set).
        const spread = [
          close[0] as number,
          (close[1] as number) + 12,
          (close[2] as number) + 12,
          (close[3] as number) + 24,
        ];
        expect([sym, voicingType(spread, c).type === "drop-2"] as unknown[]).toEqual([sym, false]);
      }
  });
});

describe("tensions in all twelve keys", () => {
  test("maj7 avoids the 11th, m7 takes 9 11 13, a dominant takes its altered colours", () => {
    for (const k of FOURTHS_MAJOR) {
      const [ii, v, i] = twoFiveOne(k).symbols.map(chord) as [ChordId, ChordId, ChordId];
      expect(availableTensions(i).map((t) => t.label)).not.toContain("11");
      expect(tensionsOf(i).find((t) => t.label === "11")?.avoid).toBe(true);
      expect(
        availableTensions(ii)
          .map((t) => t.label)
          .sort(),
      ).toEqual(["11", "13", "9"]);
      expect(availableTensions(v).map((t) => t.label)).toContain("9");
      expect(
        tensionsOf(chord(`${k}7alt`))
          .map((t) => t.label)
          .sort(),
      ).toEqual(["#11", "#9", "b13", "b9"].sort());
    }
  });
});

describe("rhythm tables", () => {
  test("every E(k, n, r) up to 16 steps is identified as a rotation of itself", () => {
    for (let n = 1; n <= 16; n++)
      for (let k = 1; k <= n; k++)
        for (let r = 0; r < n; r++) {
          const onsets = euclid(k, n, r).flatMap((b, i) => (b ? [i] : []));
          const id = euclidIdentity(onsets, n);
          expect(id?.pulses).toBe(k);
          const back = euclid(k, n, id?.rotation ?? -1).flatMap((b, i) => (b ? [i] : []));
          expect(back).toEqual(onsets);
        }
  });
  test("each clave round-trips, and the two directions are the same strokes with the bars swapped", () => {
    for (const type of CLAVE_TYPES) {
      const a = claveSteps(type, "3-2");
      const b = claveSteps(type, "2-3");
      expect(claveOf(a)).toEqual({ type, direction: "3-2" });
      expect(claveOf(b)).toEqual({ type, direction: "2-3" });
      expect(a.map((s) => (s + 8) % 16).sort((x, y) => x - y)).toEqual(b);
      expect(claveOf([...a, 15])).toBeNull();
    }
  });
  test("swing amount ↔ ratio, and ms ↔ cycles, round-trip", () => {
    for (const a of [0, 0.1, 0.2, 0.25, 1 / 3, 0.4, 0.5])
      expect(swingAmount(swingRatio(a))).toBeCloseTo(a, 12);
    expect(swingRatio(1 / 3)).toBeCloseTo(2, 12);
    for (const bpm of [60, 76, 90, 120, 180])
      for (const ms of [8, 20, 45, 99]) expect(lateMs(lateFor(ms, bpm), bpm)).toBeCloseTo(ms, 9);
    expect(lateMs(1 / 32, 76)).toBeCloseTo(98.684, 3);
  });
});

describe("the theory CLI's Wave 7 ops", () => {
  const run = (...args: string[]) => {
    const r = runTheoryCli(args);
    expect(r.code).toBe(0);
    return JSON.parse(r.out);
  };
  test("ii–V–I, tensions, voicing type, substitutions", () => {
    expect(run("two-five", "Eb").symbols).toEqual(["Fm7", "Bb7", "Eb^7"]);
    expect(run("two-five", "A", "minor").symbols).toEqual(["Bm7b5", "E7alt", "Am7"]);
    expect(run("two-five", "C", "--all")).toHaveLength(12);
    expect(run("tensions", "Dm7").available.sort()).toEqual(["11", "13", "9"]);
    expect(run("voicing-type", "C^7", "G3", "C4", "E4", "B4").type).toBe("drop-2");
    expect(run("voice", "G7", "rootless-b").reads).toBe("rootless-b");
    expect(run("sub", "G7", "tritone").to).toBe("D♭7");
    expect(run("sub", "C", "backdoor").chords).toEqual(["Fm7", "Bb7", "C^7"]);
    expect(run("sub", "C^7", "dim", "Dm7").passing).toBe("C#o7");
  });
  test("Euclid, clave, swing, microtiming, polymeter", () => {
    expect(run("euclid-id", "8", "0", "3", "6").mini).toBe("x(3,8)");
    expect(run("clave", "son", "3-2").steps).toEqual([0, 3, 6, 10, 12]);
    expect(run("clave-of", "2", "4", "8", "11", "14")).toEqual({ type: "son", direction: "2-3" });
    expect(run("swing", "--ratio", "2").amount).toBeCloseTo(1 / 3, 12);
    expect(run("late", "0.03125", "76").feel).toBe("a displacement");
    expect(run("late", "0.006", "76").feel).toBe("a feel");
    expect(run("polymeter", "3", "4").bars).toBe(3);
    expect(runTheoryCli(["sub", "G7", "nope"]).code).toBe(1);
  });
});
