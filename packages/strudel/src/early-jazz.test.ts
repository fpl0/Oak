// The early-jazz backing (early-jazz.ts) on real changes, evaluated in headless Strudel: a two-beat bass on the
// roots and 5ths, the right hand on 2 and 4 with every chord tone and smooth voice leading, brushes, all on the
// grid; swung by the pattern source's realism at R2, with the part being transcribed left straight.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import { chordPcs, parseChordSymbol } from "@oak/theory";
import * as core from "@strudel/core";
import { BYE_BYE_BLACKBIRD, CFT_CHANGES, FIVE_FOOT_TWO_A as FIVE_A } from "../e2e/wave6-fixtures.ts";
import { BASS_RANGE, type BarChords, earlyJazzBacking, earlyJazzPlan, noteName } from "./early-jazz.ts";
import { TRACK_KEY } from "./haps.ts";
import { realismSpec } from "./realism.ts";
import { applyRealism } from "./realism-pattern.ts";

setDefaultTimeout(30_000);

const SONGS = CFT_CHANGES;

const mod12 = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
const symbolsOf = (bar: BarChords): string[] => (typeof bar === "string" ? [bar] : [...bar]);
const pcsOf = (symbol: string): number[] => chordPcs(parseChordSymbol(symbol) as never).map(mod12);
const rootOf = (symbol: string): number => mod12((parseChordSymbol(symbol) as { rootPc: number }).rootPc);
const codeOf = (harmony: readonly BarChords[], pickup = false): string => {
  const l = earlyJazzBacking(harmony, { pickup });
  return `setcpm(132/4)\ndrums: ${l.drums}\nbass: ${l.bass}\nchords: ${l.chords}`;
};
const beatOf = (e: HeadlessEvent): number => Math.round((e.onset % 1) * 4 * 1000) / 1000;

describe("noteName", () => {
  test("flats only, octave by MIDI number", () => {
    expect([36, 46, 59, 60, 61, 70].map(noteName)).toEqual(["c2", "bb2", "b3", "c4", "db4", "bb4"]);
  });
});

for (const [title, harmony] of Object.entries(SONGS)) {
  describe(`${title}: 32 bars`, () => {
    test("the two-beat bass: the root on 1, the 5th or the next root on 3, between G1 and B♭2", async () => {
      expect(harmony.length).toBe(32);
      const r = await evalHeadless(codeOf(harmony), 32);
      expect(r.logs.filter((l) => /error|unknown|not found/i.test(l))).toEqual([]);
      const bass = r.events.filter((e) => e.track === "bass");
      expect(bass.length).toBe(64);
      for (let bar = 0; bar < 32; bar++) {
        const [one, three] = bass.filter((e) => Math.floor(e.onset) === bar) as [
          HeadlessEvent,
          HeadlessEvent,
        ];
        const symbols = symbolsOf(harmony[bar] as BarChords);
        expect([beatOf(one), beatOf(three)]).toEqual([0, 2]);
        expect(mod12(one.midi as number), `bar ${bar + 1}`).toBe(rootOf(symbols[0] as string));
        if (symbols.length === 2)
          expect(mod12(three.midi as number), `bar ${bar + 1}`).toBe(rootOf(symbols[1] as string));
        else {
          // the chord's own 5th: perfect, or the diminished 5th of a diminished or half-diminished chord
          const fifth = mod12((three.midi as number) - (one.midi as number));
          expect(pcsOf(symbols[0] as string), `bar ${bar + 1}`).toContain(mod12(three.midi as number));
          expect([6, 7], `bar ${bar + 1}`).toContain(fifth);
        }
        for (const e of [one, three]) {
          expect(e.midi as number).toBeGreaterThanOrEqual(BASS_RANGE[0]);
          expect(e.midi as number).toBeLessThanOrEqual(BASS_RANGE[1]);
          expect(e.value.cutoff).toBe(900);
          expect(e.s).toBe("upright");
        }
      }
    });

    test("the right hand: beats 2 and 4, every chord tone, close, above the bass, each voice moving little", async () => {
      const r = await evalHeadless(codeOf(harmony), 32);
      const chords = r.events.filter((e) => e.track === "chords");
      const plan = earlyJazzPlan(harmony);
      let prev: number[] | null = null;
      let worst = 0;
      for (let bar = 0; bar < 32; bar++) {
        const inBar = chords.filter((e) => Math.floor(e.onset) === bar);
        expect([...new Set(inBar.map(beatOf))]).toEqual([1, 3]);
        const symbols = symbolsOf(harmony[bar] as BarChords);
        for (const [k, beat] of [1, 3].entries()) {
          const symbol = symbols[symbols.length === 2 ? k : 0] as string;
          const notes = inBar
            .filter((e) => beatOf(e) === beat)
            .map((e) => e.midi as number)
            .sort((a, b) => a - b);
          expect(notes, `bar ${bar + 1} beat ${beat + 1}`).toEqual([...(plan[bar]?.chords[k] ?? [])]);
          // exactly the chord's tones (three or four), within an octave, from D3 up, over the bass
          expect(
            [...new Set(notes.map(mod12))].sort((a, b) => a - b),
            `bar ${bar + 1} ${symbol}`,
          ).toEqual([...new Set(pcsOf(symbol))].sort((a, b) => a - b));
          expect((notes.at(-1) as number) - (notes[0] as number)).toBeLessThan(12);
          expect(notes[0] as number).toBeGreaterThanOrEqual(50);
          expect(notes.at(-1) as number).toBeLessThanOrEqual(71);
          expect(notes[0] as number).toBeGreaterThan(BASS_RANGE[1]);
          if (prev) {
            // every new note within a third of a note of the chord before
            for (const n of notes) worst = Math.max(worst, Math.min(...prev.map((p) => Math.abs(p - n))));
          }
          prev = notes;
        }
        // short: the chord stops before the next beat
        for (const e of inBar) expect(Number(e.value.clip)).toBe(0.5);
      }
      expect(worst).toBeLessThanOrEqual(4);
    });

    test("brushes: bass drum with the bass on 1 and 3, the tap on 2 and 4, hats in eighths leaning on the beat", async () => {
      const r = await evalHeadless(codeOf(harmony), 4);
      const drums = r.events.filter((e) => e.track === "drums" && Math.floor(e.onset) === 2);
      const at = (s: string) => drums.filter((e) => e.s === s).map(beatOf);
      expect(at("bd")).toEqual([0, 2]);
      expect(at("sd")).toEqual([1, 3]);
      expect(at("hh")).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
      expect(drums.filter((e) => e.s === "hh").map((e) => e.value.velocity)).toEqual([
        1, 0.6, 1, 0.6, 1, 0.6, 1, 0.6,
      ]);
      for (const e of drums) expect(e.value.bank).toBe("jazzkit");
    });
  });
}

describe("pickup and errors", () => {
  test("with a pickup every layer rests through cycle 0 and bar 1 starts at cycle 1", async () => {
    const r = await evalHeadless(codeOf(FIVE_A, true), 9);
    for (const t of ["drums", "bass", "chords"]) {
      const first = Math.min(...r.events.filter((e) => e.track === t).map((e) => e.onset));
      expect([t, first >= 1 && first < 1.3]).toEqual([t, true]);
    }
    const one = r.events.filter((e) => e.track === "bass" && e.onset === 1)[0];
    expect(mod12(one?.midi as number)).toBe(0);
  });
  test("an unknown chord and an empty tune are errors, not silence", () => {
    expect(() => earlyJazzBacking(["C", "Hmaj"])).toThrow(/unknown chord/);
    expect(() => earlyJazzBacking([])).toThrow(/no bars/);
  });
  test("the same changes always give the same notes", () => {
    expect(earlyJazzBacking(BYE_BYE_BLACKBIRD)).toEqual(earlyJazzBacking(BYE_BYE_BLACKBIRD));
  });
});

describe("realism (contracts §6.12): the source swings at R2, the transcribed part stays on the grid", () => {
  type Pattern = Strudel.Pattern;
  const tagged = (pattern: Pattern, track: string): Pattern =>
    (pattern.withContext as (fn: (c: Record<string, unknown>) => Record<string, unknown>) => Pattern).call(
      pattern,
      (c) => ({ ...c, [TRACK_KEY]: track }),
    );
  test("hats' off-beats move to the last triplet; bass (the target) and the quarter-note chords do not move", () => {
    const hats = tagged(
      core.s(core.sequence("hh", "hh", "hh", "hh", "hh", "hh", "hh", "hh")) as Pattern,
      "drums",
    );
    const bass = tagged(core.note(core.sequence(36, 43, 36, 43)) as Pattern, "bass");
    const chords = tagged(core.note(core.sequence(core.silence, 60, core.silence, 60)) as Pattern, "chords");
    const spec = { ...realismSpec(2, { seed: 3, target: "bass", swung: true }), timingMs: 0, velocity: 0 };
    const out = applyRealism(core.stack(hats, bass, chords) as Pattern, spec, {
      cps: 132 / 240,
      tracks: ["drums", "bass", "chords"],
    });
    const pos = (track: string) =>
      out
        .queryArc(0, 1)
        .filter((h) => h.hasOnset() && h.context[TRACK_KEY] === track)
        .map((h) => Math.round(Number(h.whole?.begin.valueOf()) * 4 * 1000) / 1000)
        .sort((a, b) => a - b);
    expect(pos("drums")).toEqual([0, 0.667, 1, 1.667, 2, 2.667, 3, 3.667]);
    expect(pos("bass")).toEqual([0, 1, 2, 3]);
    expect(pos("chords")).toEqual([1, 3]);
  });
});
