// The glossary's music, by execution (corrections pass before the learner starts): each entry the outside review
// found false, or that the full re-read of content/terms.ts against its lesson corrected, is pinned here by what
// its example actually plays in headless Strudel and by @oak/theory. The registry rules (one example per term,
// tools unlocked at `introducedBy`) stay in content/validate/registries.test.ts.
import { describe, expect, test } from "bun:test";
import { evalHeadless, type HeadlessEvent } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { candoById } from "./candos.ts";
import { termById } from "./terms.ts";

const term = (id: string) => {
  const t = termById.get(id);
  expect([id, t !== undefined]).toEqual([id, true]);
  return t as NonNullable<typeof t>;
};
const play = async (id: string, bars: number) => (await evalHeadless(term(id).example, bars)).events;
const on = (events: HeadlessEvent[], track: string) => events.filter((e) => e.track === track);
/** Onset and end as numbers of bars. */
const frac = (s: string) =>
  s
    .split("/")
    .map(Number)
    .reduce((a, b) => a / b);
const span = (e: HeadlessEvent): [number, number] => [e.onset, frac(e.end)];
const pcs = (events: HeadlessEvent[]) =>
  [...new Set(events.map((e) => (((e.midi as number) % 12) + 12) % 12))].sort((a, b) => a - b);
const pcsOf = (...names: string[]) => [...new Set(names.map((n) => theory.pcOf(n)))].sort((a, b) => a - b);
/** The events sounding at time `t` (bars) on a track. */
const at = (events: HeadlessEvent[], track: string, t: number) =>
  on(events, track).filter((e) => e.onset <= t && span(e)[1] > t);

describe("the glossary plays what it says", () => {
  test("suspension (theory-b 7): the C is held over the change to G, not struck again, then steps down to B", async () => {
    const ev = await play("term.suspension", 2);
    // The chord changes at bar 2 (t = 1): C E G, then G B D.
    expect(pcs(at(ev, "chords", 0.5))).toEqual(pcsOf("C", "E", "G"));
    expect(pcs(at(ev, "chords", 1.5))).toEqual(pcsOf("G", "B", "D"));
    // One C5 sounds across the bar line: it started under the C chord, where it belonged.
    const held = at(ev, "mel", 1);
    expect(held.map((e) => e.midi)).toEqual([72]);
    expect((held[0] as HeadlessEvent).onset).toBeLessThan(1);
    // Nothing is struck on the change itself.
    expect(on(ev, "mel").filter((e) => e.onset === 1)).toEqual([]);
    // Then it falls a step to B, the G chord's 3rd: 4 to 3.
    const after = on(ev, "mel").find((e) => e.onset > 1 && e.onset < 2) as HeadlessEvent;
    expect(after.midi).toBe(71);
    expect<number>(theory.pcOf("B")).toBe((after.midi as number) % 12);
  });

  test("line cliché (theory-d 5): C held above a bass sliding C, B, B♭ by half steps, then F over A", async () => {
    const ev = await play("term.line-cliche", 4);
    const bass = on(ev, "bass").map((e) => e.midi as number);
    expect(bass).toEqual([48, 47, 46, 45]);
    for (const bar of [0, 1, 2])
      expect([bar, pcs(at(ev, "chords", bar + 0.5))]).toEqual([bar, pcsOf("C", "E", "G")]);
    expect(pcs(at(ev, "chords", 3.5))).toEqual(pcsOf("F", "A", "C"));
    // The bass is below every chord note, so the slash names are what sounds: C, C/B, C/B♭, F/A.
    for (const bar of [0, 1, 2, 3])
      expect(
        Math.max(
          ...on(ev, "bass")
            .slice(bar, bar + 1)
            .map((e) => e.midi as number),
        ),
      ).toBeLessThan(Math.min(...at(ev, "chords", bar + 0.5).map((e) => e.midi as number)));
    expect(term("term.line-cliche").definition).toContain("C, C/B, C/B♭, then F/A");
  });

  test("harmonic series (theory-b 8): counted from 1, the note itself; a sine has only that one", async () => {
    const d = term("term.harmonic-series").definition;
    expect(d).toContain("1, 2, 3, 4");
    expect(d).toContain("A sine has only the first");
    expect(d).not.toContain("inside every note");
    const ev = await play("term.harmonic-series", 2);
    expect(ev.map((e) => e.s)).toEqual(["sine", "sine", "sawtooth", "sawtooth"]);
  });

  test("voice leading (theory-c): shared notes hold, the rest move a little; not 'each note to the nearest'", async () => {
    const d = term("term.voice-leading").definition;
    expect(d).not.toContain("nearest");
    const ev = await play("term.voice-leading", 4);
    const chords = [0, 1, 2, 3].map((b) => at(ev, "chords", b + 0.5).map((e) => e.midi as number));
    for (let i = 0; i < 4; i++) {
      const [a, b] = [chords[i] as number[], chords[(i + 1) % 4] as number[]];
      const moves = a.map((m, v) => (b[v] as number) - m);
      // Common tones hold; no voice moves more than 3 half steps (F4 → D4 is 3 although G4 is nearer: the
      // nearest-note rule the old definition stated would double G and lose D).
      for (const pc of a.filter((m) => b.includes(m))) expect(moves[a.indexOf(pc)]).toBe(0);
      expect(Math.max(...moves.map(Math.abs))).toBeLessThanOrEqual(3);
    }
    expect(candoById.get("cd.write.voice-leading")?.statement).not.toContain("each note moves");
  });

  test("guide tones (theory-e 2): 3rd and 7th carry the colour; they do not tell m7 from m7♭5", async () => {
    const d = term("term.guide-tones").definition;
    expect(d).not.toContain("say what kind of chord it is");
    const third7 = (sym: string) => {
      const notes = theory.chordPcs(theory.parseChordSymbol(sym) as theory.ChordId);
      return [notes[1], notes[3]] as number[];
    };
    expect(third7("Bm7")).toEqual(third7("Bm7b5"));
    // The example's tune is on a guide tone of every bar's chord and moves by step or not at all.
    const ev = await play("term.guide-tones", 4);
    const symbols = ["Dm7", "G7", "Cmaj7", "Cmaj7"];
    const mel = on(ev, "mel").map((e) => e.midi as number);
    for (const [i, m] of mel.entries())
      expect([i, third7(symbols[i] as string).includes(m % 12)]).toEqual([i, true]);
    for (let i = 1; i < mel.length; i++)
      expect(Math.abs((mel[i] as number) - (mel[i - 1] as number))).toBeLessThanOrEqual(2);
  });

  test("half-time: the snare that hit 2 and 4 lands on 3, once a bar, at the same tempo", async () => {
    const ev = await play("term.half-time", 2);
    expect(ev.filter((e) => e.s === "sd").map((e) => e.onset)).toEqual([0.5, 1.5]);
    expect(term("term.half-time").definition).toContain("lands on 3, once a bar");
  });

  test("comping: the chords hit with the snare, as U06.L12 teaches with `~ x ~ x`", async () => {
    const ev = await play("term.comping", 2);
    const snare = new Set(ev.filter((e) => e.s === "sd").map((e) => e.onset));
    const hits = [...new Set(on(ev, "chords").map((e) => e.onset))];
    expect(hits.length).toBe(4);
    for (const t of hits) expect([t, snare.has(t)]).toEqual([t, true]);
  });

  test("chord symbol: the definition names the chords the example plays (Am, B°)", async () => {
    const ev = await play("term.chord-symbol", 2);
    expect(pcs(at(ev, "chords", 0.5))).toEqual(pcsOf("A", "C", "E"));
    expect(pcs(at(ev, "chords", 1.5))).toEqual(pcsOf("B", "D", "F"));
    expect(term("term.chord-symbol").definition).toContain("Am or B°");
  });

  test("dominant seventh (theory-e 1): restless as V, and still home in the blues", () => {
    const d = term("term.dominant-seventh").definition;
    expect(d).not.toContain("wants to move");
    expect(d).toContain("in the blues even the home chord is one");
    const c7 = theory.chordPcs(theory.parseChordSymbol("C7") as theory.ChordId);
    expect([...c7].sort((a, b) => a - b)).toEqual(pcsOf("C", "E", "G", "Bb"));
  });

  test("mode: major and minor are modes too; the four taught ones are one note away", () => {
    const d = term("term.mode").definition;
    expect(d).toContain("Major and minor are modes");
    for (const [mode, family] of [
      ["mixolydian", "major"],
      ["dorian", "minor"],
      ["lydian", "major"],
      ["phrygian", "minor"],
    ] as const) {
      const own = theory.scaleNotes({ tonic: "C", mode });
      const parent = theory.scaleNotes({ tonic: "C", mode: family });
      expect([mode, own.filter((n, i) => n !== parent[i]).length]).toEqual([mode, 1]);
    }
  });
});
