// Wave 7 notation (docs/design/wave7.md §3.3): jazz-glyph chord symbols from the one table, the two-bar clave line, a
// 32-bar lead sheet's section letters, comping as slashes, brackets, bar-wide tuplets for a polyrhythm, a polymeter
// with accents, the printed grouping of an odd meter, ghost notes and the hemiola. The golden corpus (corpus-w7.ts)
// engraves the lesson material; these tests pin the seams' own rules.
import { describe, expect, test } from "bun:test";
import type { NEvent } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { evalHeadless } from "@oak/grader/testing";
import { CLAVE_TYPES, type ClaveDirection, claveSteps, METERS, meterWith } from "@oak/theory";
import { readBack } from "../corpus/harness.ts";
import {
  buildScore,
  GHOST_MAX_GAIN,
  ghostMarks,
  type NotationInput,
  notate,
  parseNoteList,
  toNoteList,
} from "./index.ts";
import {
  chordSymbolText,
  claveLineInput,
  compingInput,
  formSectionMarks,
  hemiolaBracket,
  polymeterMarks,
  polyrhythmMarks,
  WAVE7_NOTATION_UNBUILT,
} from "./wave7.ts";

const FOUR = METERS["4/4"];
const ev = (track: string, onset: [number, number], dur: [number, number], midi: number | null, more = {}) =>
  ({
    id: `${track}|${onset[0]}/${onset[1]}|${midi}`,
    track,
    onset: rat(onset[0], onset[1]),
    dur: rat(dur[0], dur[1]),
    midi,
    pitchSource: midi === null ? "none" : "note-num",
    gain: 0.8,
    locs: [],
    ...more,
  }) as NEvent;

describe("chord symbols in both styles, from the one table", () => {
  const CASES: [string, string, string][] = [
    ["C6", "C6", "C6"],
    ["C69", "C6/9", "C6/9"],
    ["C9", "C9", "C9"],
    ["C13", "C13", "C13"],
    ["C7b9", "C7b9", "C7♭9"],
    ["C7#9", "C7#9", "C7♯9"],
    ["C7alt", "C7alt", "C7alt"],
    ["Cm11", "Cm11", "C–11"],
    ["C^9", "Cmaj9", "C∆9"],
    ["Csus", "Csus4", "Csus"],
    ["C7sus", "C7sus4", "C7sus"],
    ["C7/E", "C7/E", "C7/E"],
    ["F/G", "F/G", "F/G"],
    ["Dm7b5", "Dm7b5", "Dø7"],
    ["Co7", "Co7", "C°7"],
    ["C^7", "Cmaj7", "C∆7"],
    ["Dm7", "Dm7", "D–7"],
    ["Bb13", "Bb13", "B♭13"],
  ];
  for (const [code, lead, jazz] of CASES)
    test(`${code}: ${lead} / ${jazz}`, () => {
      expect(chordSymbolText(code)).toBe(lead);
      expect(chordSymbolText(code, "jazz")).toBe(jazz);
    });
  test("the engraver prints every chord of an input in its style; unknown text as written", () => {
    const score = buildScore({
      events: [],
      meter: FOUR,
      key: null,
      bars: 2,
      staff: "lead",
      chords: [
        { bar: 0, beat: 1, symbol: "Dm7" },
        { bar: 1, beat: 1, symbol: "C^7" },
        { bar: 1, beat: 3, symbol: "N.C." },
      ],
      chordStyle: "jazz",
    });
    expect((score.chords ?? []).map((c) => c.text)).toEqual(["D–7", "C∆7", "N.C."]);
  });
});

describe("the clave line", () => {
  test("son 3-2 is 0 3 6 | 2 4 on the eighth grid", () => {
    const i = claveLineInput("son", "3-2");
    expect(i.events.map((e) => e.onset)).toEqual([rat(0), rat(3, 8), rat(3, 4), rat(5, 4), rat(3, 2)]);
  });
  for (const type of CLAVE_TYPES)
    for (const dir of ["3-2", "2-3"] as ClaveDirection[])
      test(`${type} ${dir}: the same staff as Strudel's rim pattern, read back from the ABC`, async () => {
        const steps = claveSteps(type, dir);
        const bar = (k: number) =>
          `[${Array.from({ length: 8 }, (_, i) => (steps.includes(k * 8 + i) ? "rim" : "~")).join(" ")}]`;
        const r = await evalHeadless(`perc: s("<${bar(0)} ${bar(1)}>")`, 2);
        const onsets = r.events.map((h) => h.begin);
        const i = claveLineInput(type, dir);
        expect(i.events.map((e) => R.str(e.onset))).toEqual(onsets);
        const { score, abc } = notate(i);
        expect(score.approximate).toBe(false);
        const back = readBack(abc.abc).staves[0]?.voices.flat() ?? [];
        expect(back.map((n) => n.onset).sort((a, b) => a - b)).toEqual(steps.map((s) => s / 8));
      });
});

test("section letters of a 32-bar AABA lead sheet and the 34-bar refrain", () => {
  expect(formSectionMarks(["A", "A", "B", "A"], 8).map((m) => [m.bar, m.text, m.doubleBar])).toEqual([
    [0, "A", false],
    [8, "A", true],
    [16, "B", true],
    [24, "A", true],
  ]);
  expect(formSectionMarks(["A", "A", "B", "A"], [8, 8, 8, 10]).map((m) => m.bar)).toEqual([0, 8, 16, 24]);
});

describe("comping as slash notation", () => {
  const voicing = (onset: [number, number], dur: [number, number], gain = 0.8) =>
    [50, 53, 57, 60].map((m) => ev("chords", onset, dur, m, { gain }));
  test("one slash per attack, as long as the longest note there, at its loudest level", () => {
    const i = compingInput(
      [
        ...voicing([0, 1], [3, 8]),
        ev("chords", [0, 1], [1, 4], 64),
        ...voicing([3, 8], [1, 8], 0.3),
        ev("bass", [0, 1], [1, 2], 38),
      ],
      { track: "chords", bars: 1, chords: [{ bar: 0, beat: 1, symbol: "Dm7" }] },
    );
    expect(i.staff).toBe("rhythm");
    expect(i.slashes).toBe(true);
    expect(i.events.map((e) => [R.str(e.onset), R.str(e.dur), e.gain])).toEqual([
      ["0", "3/8", 0.8],
      ["3/8", "1/8", 0.3],
    ]);
    const { score, abc } = notate(i);
    expect(score.slashes).toBe(true);
    expect(toNoteList(score)).toBe("rhythm:4. rhythm:8 r:2");
    expect(abc.abc).toContain('"Dm7"!class=oak-e0!!style=rhythm!B6');
  });
  test("a push tied over the bar line keeps its slash on both pieces", () => {
    const i = compingInput(voicing([7, 8], [1, 4]), { track: "chords", bars: 2 });
    const { abc } = notate(i);
    expect(abc.abc).toContain("!class=oak-e0!!style=rhythm!B2- | !class=oak-e0!!style=rhythm!B2");
  });
  test("slashes only on a rhythm staff", () => {
    const score = buildScore({
      events: voicing([0, 1], [1, 1]),
      meter: FOUR,
      key: null,
      bars: 1,
      staff: "treble",
      slashes: true,
    });
    expect(score.slashes).toBeUndefined();
  });
  test("nothing is left unbuilt in the seam", () => {
    expect(WAVE7_NOTATION_UNBUILT).toEqual([]);
  });
});

describe("odd meters: the grouping printed in the time signature", () => {
  const line = (meter: ReturnType<typeof meterWith>, dsl: string) =>
    notate({
      events: parseNoteList(dsl, { meter }),
      meter,
      key: null,
      bars: 1,
      staff: "treble",
      showGrouping: true,
    });
  test("5/4 as 3+2 and 2+3, 7/8 as 2+2+3 and 3+2+2, 9/8 as 2+2+2+3", () => {
    expect(line(meterWith("5/4"), "C4:1 C4:4").abc.abc).toContain("M:3+2/4");
    expect(line(meterWith("5/4", [2, 3]), "C4:1 C4:4").abc.abc).toContain("M:2+3/4");
    expect(line(meterWith("7/8"), "C4:2 C4:4.").abc.abc).toContain("M:2+2+3/8");
    expect(line(meterWith("7/8", [3, 2, 2]), "C4:4. C4:2").abc.abc).toContain("M:3+2+2/8");
    expect(line(METERS["9/8i"], "C4:2 C4:2 C4:4.").abc.abc).toContain("M:2+2+2+3/8");
  });
  test("an even grouping, or no request, keeps the plain signature", () => {
    expect(line(METERS["6/8"], "C4:4. C4:4.").abc.abc).toContain("M:6/8");
    const plain = notate({
      events: parseNoteList("C4:1 C4:4", { meter: METERS["5/4"] }),
      meter: METERS["5/4"],
      key: null,
      bars: 1,
      staff: "treble",
    });
    expect(plain.abc.abc).toContain("M:5/4");
    expect(plain.score.groupingText).toBeUndefined();
  });
});

describe("brackets, polyrhythm tuplets, polymeter accents, the hemiola", () => {
  test("polyrhythmMarks: 4:3 asks for a bar-wide tuplet and a bracket per bar; 2:3 asks for none", () => {
    expect(polyrhythmMarks({ track: "perc", a: 4, b: 3, bars: 2 })).toEqual({
      polyTuplets: [{ track: "perc", p: 4, q: 3 }],
      brackets: [
        { bar: 0, from: rat(0), to: rat(1), text: "4:3" },
        { bar: 1, from: rat(0), to: rat(1), text: "4:3" },
      ],
    });
    expect(polyrhythmMarks({ track: "perc", a: 2, b: 3, bars: 1 }).polyTuplets).toEqual([]);
  });
  test("a bar off the p grid is written as usual; another track's bar is untouched", () => {
    const meter = METERS["3/4"];
    const four = parseNoteList("E4:8. F4:8. G4:8. A4:8. | E4:4 F4:4 G4:4", { meter, track: "mel" });
    const s = buildScore({
      events: four,
      meter,
      key: null,
      bars: 2,
      staff: "treble",
      polyTuplets: [{ track: "mel", p: 4, q: 3 }],
    });
    expect(toNoteList(s)).toBe("(4:3 E4:4 F4:4 G4:4 A4:4) | E4:4 F4:4 G4:4");
    const other = buildScore({
      events: four,
      meter,
      key: null,
      bars: 1,
      staff: "treble",
      polyTuplets: [{ track: "bass", p: 4, q: 3 }],
    });
    expect(toNoteList(other)).toBe("E4:8. F4:16~ F4:8 G4:8~ G4:16 A4:8.");
  });
  test("polymeterMarks: 3 steps at 4 a bar line up every 3 bars; 5 at 8 every 5", () => {
    const m = polymeterMarks({ track: "bass", steps: 3, stepsPerBar: 4 });
    expect(m.periodBars).toBe(3);
    expect(m.cycleAccents).toEqual([{ track: "bass", every: rat(3, 4) }]);
    expect(m.brackets?.[0]).toEqual({ bar: 0, from: rat(0), to: rat(3), text: "3 over 4" });
    expect(polymeterMarks({ track: "x", steps: 5, stepsPerBar: 8 }).periodBars).toBe(5);
    expect(polymeterMarks({ track: "x", steps: 6, stepsPerBar: 4 }).periodBars).toBe(3);
  });
  test("accents land on the notes that start a cycle, written !>! once per note", () => {
    const events = parseNoteList("D2:4 r:4 A2:4 D2:4 | r:4 A2:4 D2:4 r:4", { meter: FOUR, track: "bass" });
    const { score, abc } = notate({
      events,
      meter: FOUR,
      key: null,
      bars: 2,
      staff: "bass",
      ...polymeterMarks({ track: "bass", steps: 3, stepsPerBar: 4 }),
    });
    const accented = score.staves[0]?.voices[0]?.bars.flatMap((b) => b.items.filter((it) => it.accent)) ?? [];
    expect(accented.map((it) => R.str(it.onset))).toEqual(["0", "3/4", "3/2"]);
    expect(abc.abc.match(/!>!/g)?.length).toBe(3);
    expect(abc.abc).toContain('"^3 over 4"');
  });
  test("a bracket that starts inside a tuplet is drawn at the note sounding there, and the Score warns", () => {
    const events = parseNoteList("(3:2 C4:8 D4:8 E4:8) F4:4 G4:2", { meter: FOUR });
    const s = buildScore({
      events,
      meter: FOUR,
      key: null,
      bars: 1,
      staff: "treble",
      brackets: [{ bar: 0, from: rat(1, 24), to: rat(1, 2), text: "x" }],
    });
    expect(s.brackets?.[0]?.drawnAt).toEqual(rat(0));
    expect(s.warnings.map((w) => w.code)).toContain("abcjs-limit");
  });
  test("hemiolaBracket: across the bar (two bars) or inside a compound bar (written in three quarters)", () => {
    expect(hemiolaBracket(4)).toEqual({ bar: 4, from: rat(0), to: rat(2), text: "3 × 2" });
    const meter = METERS["6/8"];
    const events = parseNoteList("C4:4. E4:4. | C4:4 D4:4 E4:4", { meter });
    const plain = buildScore({ events, meter, key: null, bars: 2, staff: "treble" });
    expect(toNoteList(plain)).toBe("C4:4. E4:4. | C4:4 D4:8~ D4:8 E4:4");
    const regrouped = buildScore({
      events,
      meter,
      key: null,
      bars: 2,
      staff: "treble",
      brackets: [hemiolaBracket(1, "3 × 2", { compound: true })],
    });
    expect(toNoteList(regrouped)).toBe("C4:4. E4:4. | C4:4 D4:4 E4:4");
  });
});

describe("ghost notes", () => {
  const hats = (gains: number[]) =>
    gains.map((g, i) => ev("hats", [i, 8], [1, 8], null, { s: "hh", gain: g }));
  const marks = (input: Partial<NotationInput>, events: NEvent[]) =>
    ghostMarks(
      buildScore({ events, meter: FOUR, key: null, bars: 1, staff: "percussion", ghosts: true, ...input }),
    );
  test(`at most ${GHOST_MAX_GAIN} loud, on a track whose loudest stroke is twice as loud`, () => {
    const m = marks({}, hats([0.8, 0.3, 0.8, 0.4, 0.8, 0.41, 0.8, 0]));
    expect(m.map((g) => R.str(g.onset))).toEqual(["1/8", "3/8"]);
  });
  test("a line quiet throughout has none; nor does a staff that did not ask", () => {
    expect(marks({}, hats([0.3, 0.3, 0.3, 0.3]))).toEqual([]);
    expect(marks({ ghosts: false }, hats([0.8, 0.2]))).toEqual([]);
  });
  test("a ghost snare under a loud hat marks the snare head only", () => {
    const events = [
      ev("hats", [0, 1], [1, 4], null, { s: "hh", gain: 0.8 }),
      ev("snare", [0, 1], [1, 4], null, { s: "sd", gain: 0.25 }),
      ev("snare", [1, 4], [1, 4], null, { s: "sd", gain: 0.8 }),
    ];
    const m = marks({}, events);
    expect(m.map((g) => [g.drum, g.member])).toEqual([["sd", 0]]);
  });
});
