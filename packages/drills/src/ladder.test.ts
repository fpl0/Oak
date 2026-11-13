// The transcription-ladder generators (contracts §2.9, §6.12; U07 spec "The ladder"). Golden tests state the
// expected notes of fixed seeds; property tests walk every level and realism over many seeds and check that
// an item is deterministic, plays exactly what its code says (headless Strudel), stays inside the gym's
// vocabulary (keys, loops, rhythms on the grid, registers, a pickup only after U07.L08), sounds like music
// (chord tones on strong beats, voice-led chords, a melody that ends home) and carries an answer key that
// plays the target part note for note. That the grader marks the key exactly right, and a one-note or
// one-onset change wrong, is content/gym/ladder.test.ts (it needs the course toolbox).
import { describe, expect, test } from "bun:test";
import { type NEvent, R } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { DEFAULT_PROFILE } from "./engine.ts";
import { chordPcs, formatRn, keyAccidentals, mod, rnRootPc, tonicMidi } from "./kernel.ts";
import {
  generateLadderPiece,
  LADDER_FEATURE_GATES,
  LADDER_LOOPS,
  type LadderLevelNo,
  type LadderPiece,
  type LadderRealism,
  ladderItemOf,
  ladderKeys,
} from "./ladder.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

const LEVELS: LadderLevelNo[] = [1, 2, 3, 4];
const REALISM: LadderRealism[] = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37);
const AFTER_PICKUPS = { completed: new Set([LADDER_FEATURE_GATES.pickup]) };
const pieces = (opts = AFTER_PICKUPS): LadderPiece[] =>
  LEVELS.flatMap((l) =>
    REALISM.flatMap((r) => SEEDS.map((s) => generateLadderPiece(l, r, s, DEFAULT_PROFILE, opts))),
  );
const ALL = pieces();
const of = (track: string, p: LadderPiece): NEvent[] => p.events.filter((e) => e.track === track);
const onBeat = (e: NEvent, per: number): boolean => R.toNum(R.mul(R.frac(e.onset), [per, 1])) % 1 === 0;
/** Position of an event inside its bar, in eighths. */
const eighth = (e: NEvent): number => R.toNum(R.mul(R.frac(e.onset), [8, 1]));

describe("golden: fixed seeds give these items", () => {
  test("L1 R0 seed 7: a two-bar rock beat in 72 BPM", () => {
    const p = generateLadderPiece(1, 0, 7, DEFAULT_PROFILE);
    expect(p.bpm).toBe(72);
    expect(p.code).toBe(
      'setcpm(72/4)\n\nkick: s("bd ~ bd ~")\nsnare: s("~ sd ~ sd")\nhats: s("hh*8").gain(.48)',
    );
    expect(p.given.sounds).toEqual(["bd", "sd", "hh"]);
    expect(p.title).toBe("Drum loop · 2 bars");
  });
  test("L2 R0 seed 7: the roots of I IV V IV in D major, one a bar", () => {
    const p = generateLadderPiece(2, 0, 7, DEFAULT_PROFILE);
    expect(p.key).toEqual({ tonic: "D", mode: "major" });
    expect(p.degrees).toEqual(["1", "4", "5", "4"]);
    expect(p.events.map((e) => e.midi)).toEqual([38, 43, 45, 43]);
    expect(p.answer).toBe('setcpm(74/4)\n\nbass: n("<0 3 4 3>").scale("D2:major").s("ebass")');
  });
  test("L3 R0 seed 7: I V vi IV in G, bass first, chords voice-led", () => {
    const p = generateLadderPiece(3, 0, 7, DEFAULT_PROFILE);
    expect(p.key.tonic).toBe("G");
    expect(p.chords?.map((c) => [c.rn, c.symbol, c.code])).toEqual([
      ["I", "G", "G"],
      ["V", "D", "D"],
      ["vi", "Em", "Em"],
      ["IV", "C", "C"],
    ]);
    expect(of("bass", p).map((e) => e.midi)).toEqual([43, 38, 40, 36]);
    expect(p.stages).toEqual(["bass", "quality", "rn"]);
    expect(p.stageAnswers?.rn).toContain('chords: n("[0,2,4]").add(n("<0 4 5 3>")).scale("G3:major")');
  });
  test("L4 R2 seed 11: a two-bar tune in A♭ over I vi | V I that ends home", () => {
    const p = generateLadderPiece(4, 2, 11, DEFAULT_PROFILE);
    expect(p.key.tonic).toBe("Ab");
    expect(p.degrees).toEqual(["5", "6", "5", "3", "1", "5", "3", "1"]);
    expect(p.answer).toBe(
      'setcpm(84/4)\n\nmel: n("<[[4 5] 4 2 0] [4 2 0@2]>").scale("Ab3:major").s("piano")',
    );
  });
  test("L4 R3 seed 11 after U07.L08: a question that ends on V, an answer that repeats bar 1, a pickup a step below", () => {
    const p = generateLadderPiece(4, 3, 11, DEFAULT_PROFILE, AFTER_PICKUPS);
    expect(p.pickup).toEqual({ units: [1, 1] });
    expect(p.given.bars).toBe(4);
    expect(p.bars).toBe(5);
    expect(p.answer).toContain(
      'n("<[~ ~ ~ 3] [4@2 4 3] [4 [2 1] 6@2] [4@2 4 3] [1@2 0@2]>").scale("Bb3:major")',
    );
  });
});

describe("determinism and the grader seam", () => {
  test("the same inputs give the same item; seeds differ", () => {
    for (const l of LEVELS)
      for (const r of REALISM) {
        const a = generateLadderPiece(l, r, 99, DEFAULT_PROFILE, AFTER_PICKUPS);
        const b = generateLadderPiece(l, r, 99, DEFAULT_PROFILE, AFTER_PICKUPS);
        expect(b).toEqual(a);
        const codes = new Set(
          SEEDS.slice(0, 10).map((s) => generateLadderPiece(l, r, s, DEFAULT_PROFILE).code),
        );
        expect(codes.size).toBeGreaterThan(3);
      }
  });
  test("ladderItemOf gives the grader what it needs and never the swing (answers stay on the grid)", () => {
    const p = generateLadderPiece(3, 2, 5, DEFAULT_PROFILE);
    expect(ladderItemOf(p, "quality")).toEqual({
      itemId: "lad.3.5",
      level: 3,
      stage: "quality",
      reference: p.code,
      bars: 4,
      key: p.key,
      meter: "4/4",
      bpm: p.bpm,
    });
  });
});

describe("vocabulary: what the learner has met by the gym", () => {
  test("keys: major, up to 2 accidentals at R0–R1 and 4 from R2; tempo grows with realism", () => {
    for (const p of ALL) {
      expect(p.key.mode).toBe("major");
      expect(Math.abs(keyAccidentals(p.key))).toBeLessThanOrEqual(p.realism >= 2 ? 4 : 2);
      expect(ladderKeys(p.realism).some((k) => k.tonic === p.key.tonic)).toBe(true);
      expect(p.bpm).toBeGreaterThanOrEqual(72 + p.realism * 4);
      expect(p.bpm).toBeLessThanOrEqual(84 + p.realism * 7);
    }
  });
  test("a pickup only once U07.L08 is done, only at L4 from R2, always one beat", () => {
    for (const p of pieces({ completed: new Set() })) expect(p.pickup).toBeNull();
    const withPickup = ALL.filter((p) => p.pickup);
    expect(withPickup.length).toBeGreaterThan(10);
    for (const p of withPickup) {
      expect([p.level, p.realism >= 2]).toEqual([4, true]);
      expect(p.pickup).toEqual({ units: [1, 1] });
      const first = of("mel", p)[0] as NEvent;
      expect(R.toNum(first.onset)).toBe(0.75);
      // Nothing else plays in the pickup bar.
      expect(p.events.filter((e) => e.track !== "mel" && R.lt(e.onset, [1, 1]))).toEqual([]);
    }
  });
  test("loops are the U06 schemas, drawn from the realism they open at; one diatonic triad a bar", () => {
    for (const p of ALL.filter((x) => x.level === 3)) {
      const rns = (p.chords ?? []).map((c) => c.rn);
      const loop = LADDER_LOOPS.find((l) => l.chords.map(formatRn).join(" ") === rns.join(" "));
      expect(loop).toBeDefined();
      expect((loop as (typeof LADDER_LOOPS)[number]).from).toBeLessThanOrEqual(p.realism);
      expect(p.given.chordsPerBar).toBe(1);
    }
  });
  test("rhythms sit on the grid: drums on sixteenths, bass and melody on eighths", () => {
    for (const p of ALL)
      for (const e of p.events)
        expect([p.level, e.track, onBeat(e, e.drum ? 16 : 8)]).toEqual([p.level, e.track, true]);
  });
  test("registers: bass in E1–A3, chords G3–C5 close triads, melody inside the comfortable range", () => {
    for (const p of ALL) {
      for (const e of of("bass", p))
        expect([28 <= (e.midi as number), (e.midi as number) <= 57]).toEqual([true, true]);
      const chordOnsets = new Map<string, number[]>();
      for (const e of of("chords", p))
        chordOnsets.set(R.str(e.onset), [...(chordOnsets.get(R.str(e.onset)) ?? []), e.midi as number]);
      for (const notes of chordOnsets.values()) {
        expect(notes.length).toBe(3);
        expect(Math.max(...notes) - Math.min(...notes)).toBeLessThanOrEqual(9);
        expect(Math.min(...notes)).toBeGreaterThanOrEqual(46);
        expect(Math.max(...notes)).toBeLessThanOrEqual(72);
      }
      if (p.level === 4) {
        const mel = of("mel", p).map((e) => e.midi as number);
        expect(mod((mel.at(-1) as number) - tonicMidi(p.key.tonic, 3), 12)).toBe(0);
        // The octave that fits the comfortable range best: no octave shift would overflow it less.
        const over = (shift: number) =>
          Math.max(0, DEFAULT_PROFILE.comfLow - (Math.min(...mel) + shift)) +
          Math.max(0, Math.max(...mel) + shift - DEFAULT_PROFILE.comfHigh);
        expect(over(0)).toBeLessThanOrEqual(Math.min(over(-12), over(12)));
        expect(over(0)).toBeLessThanOrEqual(Math.max(0, Math.max(...mel) - Math.min(...mel) - 15) + 5);
      }
    }
  });
  test("sounds come from the pop and jazz-soul kits; the lead is vocal-like only at R4", () => {
    const known = new Set([
      "piano",
      "rhodes",
      "vibes",
      "ebass",
      "upright",
      "tenor",
      "choir",
      "bd",
      "sd",
      "cp",
      "hh",
      "oh",
    ]);
    for (const p of ALL) {
      for (const s of p.preload) expect(known.has(s.replace(/^[A-Za-z0-9]+_/, ""))).toBe(true);
      expect(p.performance.vocalLead !== null).toBe(p.level === 4 && p.realism === 4);
      expect(p.swing !== null).toBe(p.flavour === "jazz-soul");
      if (p.realism < 2) expect(p.flavour).toBe("pop");
    }
  });
});

describe("arrangement by realism (U07 spec table)", () => {
  test("which parts play at each level and realism", () => {
    for (const p of ALL) {
      const tracks = new Set(p.events.map((e) => e.track));
      const drums = tracks.has("kick");
      if (p.level === 1) expect([...tracks].sort()).toEqual(["hats", "kick", "snare"]);
      if (p.level === 2) {
        expect(drums).toBe(p.realism >= 2);
        expect(tracks.has("chords")).toBe(p.realism >= 3);
      }
      if (p.level === 3) {
        expect(tracks.has("bass") && tracks.has("chords")).toBe(true);
        expect(drums).toBe(p.realism >= 2);
      }
      if (p.level === 4) {
        expect(tracks.has("chords")).toBe(p.realism >= 1);
        expect(tracks.has("bass")).toBe(p.realism >= 2);
        expect(drums).toBe(p.realism >= 3);
      }
      expect(p.given.bars).toBe(p.level === 2 || p.level === 3 ? 4 : p.realism >= 3 ? 4 : 2);
      expect(p.bars).toBe(p.given.bars + (p.pickup ? 1 : 0));
    }
  });
});

describe("music: chords and melodies a musician would write", () => {
  test("L3 chords are the loop's triads over their roots, and the bass starts every bar on the root", () => {
    for (const p of ALL.filter((x) => x.level === 3)) {
      (p.chords ?? []).forEach((c, bar) => {
        const pcs = new Set(chordPcs(rnRootPc(c, p.key), c.quality));
        const chordNotes = of("chords", p).filter((e) => R.floor(e.onset) === bar);
        for (const e of chordNotes) expect(pcs.has(mod(e.midi as number, 12))).toBe(true);
        const bassFirst = of("bass", p).find((e) => R.floor(e.onset) === bar) as NEvent;
        expect(R.toNum(bassFirst.onset)).toBe(bar);
        expect(mod(bassFirst.midi as number, 12)).toBe(rnRootPc(c, p.key));
      });
    }
  });
  test("L4: a chord tone on beats 1 and 3, steps only at R0–R1, leaps turn back, home at the end", () => {
    for (const p of ALL.filter((x) => x.level === 4 && x.realism >= 1)) {
      const mel = of("mel", p);
      const chords = of("chords", p);
      for (const e of mel) {
        if (R.lt(e.onset, [p.pickup ? 1 : 0, 1])) continue;
        const pos = eighth(e);
        if (pos !== 0 && pos !== 4) continue;
        const sounding = chords.filter(
          (c) => R.lte(c.onset, e.onset) && R.lt(e.onset, R.add(c.onset, c.dur)),
        );
        const pcs = new Set(sounding.map((c) => mod(c.midi as number, 12)));
        expect([p.seed, p.realism, R.str(e.onset), pcs.has(mod(e.midi as number, 12))]).toEqual([
          p.seed,
          p.realism,
          R.str(e.onset),
          true,
        ]);
      }
      const midis = mel.filter((e) => !R.lt(e.onset, [p.pickup ? 1 : 0, 1])).map((e) => e.midi as number);
      for (let i = 1; i < midis.length; i++) {
        const iv = Math.abs((midis[i] as number) - (midis[i - 1] as number));
        if (p.realism <= 1) expect(iv).toBeLessThanOrEqual(2);
        else expect(iv).toBeLessThanOrEqual(9);
      }
      expect(p.degrees?.at(-1)).toBe("1");
      expect(new Set(midis).size).toBeGreaterThanOrEqual(4);
    }
  });
  test("a 4-bar melody brings bar 1 back in bar 3 and its question (bar 2) ends on a note of V", () => {
    for (const p of ALL.filter((x) => x.level === 4 && x.given.bars === 4)) {
      const off = p.pickup ? 1 : 0;
      const bar = (b: number) =>
        of("mel", p)
          .filter((e) => R.floor(e.onset) === b + off)
          .map((e) => [R.str(R.frac(e.onset)), e.midi]);
      expect(bar(2)).toEqual(bar(0));
      const q = of("mel", p)
        .filter((e) => R.floor(e.onset) === 1 + off)
        .at(-1) as NEvent;
      const v = chordPcs(rnRootPc({ degree: "5", quality: "maj" }, p.key), "maj");
      expect(v.includes(mod(q.midi as number, 12))).toBe(true);
    }
  });
});

describe("headless Strudel plays exactly the events, and the answer key plays the target", () => {
  const sample = LEVELS.flatMap((l) =>
    REALISM.flatMap((r) =>
      [3, 8, 21].map((s) => generateLadderPiece(l, r, s, DEFAULT_PROFILE, AFTER_PICKUPS)),
    ),
  );
  test("reference code ≡ events, answer target ≡ reference target", async () => {
    for (const p of sample) {
      const got = await strudelEvents(p.code, p.bars);
      expect([p.level, p.realism, p.seed, got.flat]).toEqual([
        p.level,
        p.realism,
        p.seed,
        flattenEvents(p.events),
      ]);
      expect(got.logs.filter((l) => /error|unknown/i.test(l))).toEqual([]);
      const answer = await evalHeadless(p.answer, p.bars);
      // Chords are compared as pitch classes per onset (the answer stacks root-position triads; contracts §6.7).
      const key = (track: string, begin: string, midi: number | null, s: string | null) =>
        `${track}|${begin}|${track === "chords" ? mod(midi as number, 12) : (midi ?? s)}`;
      const uniq = (xs: string[]) => [...new Set(xs)].sort();
      const want = uniq(
        p.events
          .filter((e) => p.target.includes(e.track))
          .map((e) => key(e.track, R.str(e.onset), e.midi, e.midi === null ? (e.s ?? null) : null)),
      );
      const have = uniq(
        answer.events
          .filter((e) => p.target.includes(e.track))
          .map((e) => key(e.track, e.begin, e.midi, e.midi === null ? e.s : null)),
      );
      expect([p.level, p.realism, p.seed, have]).toEqual([p.level, p.realism, p.seed, want]);
    }
  }, 120_000);
});
