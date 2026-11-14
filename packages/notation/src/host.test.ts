// Wave 6 carry-over d5 (host.ts): one helper for every staff host. Swing printed as the Workbench prints it, scale
// steps the code alters drawn as written, and the drawn spelling handed back for every text that names a note.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { eventsOf } from "../corpus/harness.ts";
import {
  alteredStepName,
  alteredSteps,
  drawnLabels,
  drawnLabelsOf,
  type NotationInput,
  notate,
  parseNoteList,
  staffHostInput,
  staffSwingOf,
  swingTextOf,
  toNoteList,
} from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const FOUR = METERS["4/4"];
const base = (events: NEvent[], bars: number, extra: Partial<NotationInput> = {}): NotationInput => ({
  events,
  meter: FOUR,
  key: C,
  bars,
  staff: "treble",
  ...extra,
});
/** Triplet swing as the grader's `swingView` reports a track (the off-beat two thirds into its pair). */
const swung = (sub: 8 | 16, p: [number, number] = [2, 3]) => ({
  swung: sub,
  eighths: { p: sub === 8 ? p : null },
  sixteenths: { p: sub === 16 ? p : null },
});
const straight = { swung: null, eighths: { p: [1, 2] as [number, number] }, sixteenths: { p: null } };

describe("staffSwingOf / swingTextOf", () => {
  test("the amount is read from where the off-beat lands; straight tracks do not count", () => {
    const s8 = staffSwingOf([straight, swung(8)]);
    expect(s8?.subdivision).toBe(8);
    expect(s8?.amount).toBeCloseTo(1 / 3, 12);
    expect(staffSwingOf([swung(16, [5, 8])])).toEqual({ subdivision: 16, amount: 0.25 });
    expect(staffSwingOf([straight])).toBeNull();
    expect(staffSwingOf([])).toBeNull();
  });
  test("tracks that swing differently give no staff swing: the staff shows what plays", () => {
    expect(staffSwingOf([swung(8), swung(16)])).toBeNull();
    expect(staffSwingOf([swung(8), swung(8, [3, 5])])).toBeNull();
  });
  test("the words the staff prints", () => {
    expect(swingTextOf({ subdivision: 8, amount: 1 / 3 })).toBe("Swing 8ths");
    expect(swingTextOf({ swung: 16 })).toBe("Swing 16ths");
    expect(swingTextOf({ swung: null })).toBeNull();
    expect(swingTextOf(null)).toBeNull();
  });
});

describe("staffHostInput: swing", () => {
  const code = 'mel: n("0 1 2 3 4 5 6 7").scale("C4:major").swingBy(1/3, 4)';
  test("a measured swing is printed straight under Swing 8ths; without it the line is triplets", async () => {
    const events = await eventsOf({ code, bars: 1 });
    const plain = notate(base(events, 1));
    // As played, each off-beat rings into the next beat: the staff needs two voices and triplet brackets.
    expect(plain.score.swingText).toBeUndefined();
    expect(plain.score.staves[0]?.voices.length).toBe(2);
    expect(toNoteList(plain.score, { voice: 1 })).toContain("(3:2");
    const hosted = notate(staffHostInput(base(events, 1), { code, swing: [swung(8)] }));
    expect(hosted.score.swingText).toBe("Swing 8ths");
    expect(hosted.abc.abc).toContain('Q:"Swing 8ths"');
    expect(toNoteList(hosted.score)).toBe("C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8");
    expect(hosted.score.staves[0]?.voices.length).toBe(1);
    expect(hosted.score.approximate).toBe(false);
  });
  test("a declared SwingSpec is passed through; a swing the input already has wins", async () => {
    const events = await eventsOf({ code, bars: 1 });
    const declared = { subdivision: 8 as const, amount: 1 / 3 };
    expect(staffHostInput(base(events, 1), { swing: declared }).swing).toEqual(declared);
    const own = { subdivision: 16 as const, amount: 0.2 };
    expect(staffHostInput(base(events, 1, { swing: own }), { swing: [swung(8)] }).swing).toEqual(own);
    expect(staffHostInput(base(events, 1), { swing: [straight] }).swing).toBeUndefined();
    expect(staffHostInput(base(events, 1), {}).swing).toBeUndefined();
  });
  test("a measured swing is not handed to a compound meter (the staff would warn swing-unsupported)", () => {
    const events = parseNoteList("C4:8 D4:8 E4:8 F4:8 G4:8 A4:8", { meter: METERS["6/8"] });
    const input = staffHostInput({ ...base(events, 1), meter: METERS["6/8"] }, { swing: [swung(8)] });
    expect(input.swing).toBeUndefined();
    expect(notate(input).score.warnings).toEqual([]);
  });
});

describe("staffHostInput: the names the code wrote", () => {
  const code = 'mel: n("<[4 3# 4 7] [5 4# 5 ~] [3 0# 1 3] [6b ~ 5 4]>").scale("C4:major")';
  test("fi, si, di and te are drawn as written; without the code the lower neighbour of 6 is A flat", async () => {
    const events = await eventsOf({ code, bars: 4 });
    const plain = notate(base(events, 4));
    expect(toNoteList(plain.score)).toContain("A4:4 Ab4:4 A4:4");
    const hosted = notate(staffHostInput(base(events, 4), { code }));
    expect(toNoteList(hosted.score)).toBe(
      "G4:4 F#4:4 G4:4 C5:4 | A4:4 G#4:4 A4:4 r:4 | F4:4 C#4:4 D4:4 F4:4 | Bb4:4 r:4 A4:4 G4:4",
    );
  });
  test("alteredStepName: only an altered step of a seven-note scale gets a name", async () => {
    const events = await eventsOf({ code, bars: 1 });
    expect(events.map((e) => alteredStepName(code, e))).toEqual([null, "F#4", null, null]);
    expect(alteredSteps(code, events).map((e) => e.written ?? null)).toEqual([null, "F#4", null, null]);
    // No accidental in the code: the events come back untouched.
    const plainCode = 'mel: n("0 2 4").scale("C4:major")';
    const plainEvents = await eventsOf({ code: plainCode, bars: 1 });
    expect(alteredSteps(plainCode, plainEvents)).toEqual(plainEvents);
    // A pentatonic step is not a letter: left to the staff.
    const penta = 'mel: n("0 1# 2").scale("C4:minor:pentatonic")';
    const pentaEvents = await eventsOf({ code: penta, bars: 1 });
    expect(pentaEvents.map((e) => alteredStepName(penta, e))).toEqual([null, null, null]);
  });
  test("a flat step in a minor key and a step altered twice over", async () => {
    const code2 = 'mel: n("0 1b 5# 6b").scale("A3:minor")';
    const events = await eventsOf({ code: code2, bars: 1 });
    // 1b: B flat (♭2); 5#: F sharp (the Dorian 6); 6b: G flat.
    expect(events.map((e) => alteredStepName(code2, e))).toEqual([null, "Bb3", "F#4", "Gb4"]);
    // In C minor step 6 is already B flat: 6b would be B double flat, which is left to the key's own spelling.
    const code3 = 'mel: n("0 6b").scale("C4:minor")';
    const twice = await eventsOf({ code: code3, bars: 1 });
    expect(twice.map((e) => alteredStepName(code3, e))).toEqual([null, null]);
  });
});

describe("drawnLabels: every text names the note the staff drew", () => {
  test("an approach tone the staff leans into its target is labelled as drawn (D sharp is ♯2, not ♭3)", () => {
    // C, D, then a chromatic D sharp that steps up into E: two events with no written name (as `n()` gives them).
    const named = parseNoteList("C4:4 D4:4 r:4 r:4", {});
    const bare = (id: string, onset: [number, number], midi: number): NEvent => ({
      id,
      track: "main",
      onset,
      dur: [1, 4],
      midi,
      pitchSource: "note-num",
      gain: 0.8,
      locs: [],
    });
    const approach: NEvent[] = [...named, bare("x|1", [1, 2], 63), bare("x|2", [3, 4], 64)];
    const { score } = notate(base(approach, 1));
    const labels = drawnLabels(score);
    expect(labels.get("x|1")).toMatchObject({ written: "D#4", name: "D♯4", pitchClass: "D♯", degree: "♯2" });
    expect(labels.get("x|1")?.syllable).toBe("ri");
    expect(labels.get("x|2")).toMatchObject({ written: "E4", degree: "3", syllable: "mi" });
  });
  test("under a chord the label follows the chord's spelling: G sharp under E7 is ♯5 si, A flat under A♭ is ♭6 le", () => {
    const events = parseNoteList("C4:1 | C4:1", { track: "mel" }).map((e, i) => {
      const { written: _w, ...rest } = e;
      return { ...rest, id: `mel|${i}`, midi: 68, pitchSource: "note-num" as const };
    });
    const { score } = notate(
      base(events, 2, {
        chords: [
          { bar: 0, beat: 1, symbol: "E7" },
          { bar: 1, beat: 1, symbol: "Ab" },
        ],
      }),
    );
    const labels = drawnLabels(score);
    expect(labels.get("mel|0")).toMatchObject({ written: "G#4", degree: "♯5", syllable: "si" });
    expect(labels.get("mel|1")).toMatchObject({ written: "Ab4", degree: "♭6", syllable: "le" });
  });
  test("after a key change a note is read in the key in force at its bar", () => {
    const events = parseNoteList("C4:4 E4:4 G4:4 E4:4 | D4:4 F#4:4 A4:4 F#4:4", {});
    const { score } = notate(
      base(events, 2, { keyChanges: [{ bar: 1, key: { tonic: "D", mode: "major" } }] }),
    );
    const labels = [...drawnLabels(score).values()].map((l) => `${l.written}=${l.degree}/${l.key?.tonic}`);
    expect(labels).toEqual([
      "C4=1/C",
      "E4=3/C",
      "G4=5/C",
      "E4=3/C",
      "D4=1/D",
      "F#4=3/D",
      "A4=5/D",
      "F#4=3/D",
    ]);
  });
  test("without a key only the names are given; rests, ties and drums are left out", () => {
    const events = parseNoteList("C4:4~ | C4:4 bd:4", {});
    const { score } = notate({ events, meter: FOUR, key: null, bars: 2, staff: "auto" });
    const labels = [...drawnLabels(score).values()];
    expect(labels).toEqual([{ written: "C4", name: "C4", pitchClass: "C", midi: 60 }]);
  });
  test("a blues five is the blue ♭5 whichever way the staff spells it", () => {
    const events = parseNoteList("F4:4 F#4:4 G4:4 r:4 | G4:4 Gb4:4 F4:4 r:4", {}).map((e) => {
      const { written: _w, ...rest } = e;
      return rest as NEvent;
    });
    const { score } = notate(base(events, 2, { key: { tonic: "C", mode: "blues" } as KeySpec }));
    const labels = [...drawnLabels(score).values()];
    expect(labels.map((l) => l.written)).toEqual(["F4", "F#4", "G4", "G4", "Gb4", "F4"]);
    expect([labels[1]?.degree, labels[4]?.degree]).toEqual(["♭5", "♭5"]);
    expect(labels[1]?.syllable).toBe(labels[4]?.syllable as string);
  });
});

describe("drawnLabelsOf: a piece engraved in pages", () => {
  const events = parseNoteList("C4:4 E4:4 G4:4 E4:4 | C4:1 | D4:4 F#4:4 A4:4 F#4:4 | D4:1", {});
  const input = base(events, 4, { keyChanges: [{ bar: 2, key: { tonic: "D", mode: "major" } }] });
  test("every event of every page is labelled once, in the key of its page", () => {
    const whole = drawnLabelsOf(input);
    const paged = drawnLabelsOf(input, 2);
    expect(paged.size).toBe(events.length);
    expect([...paged.keys()].sort()).toEqual([...whole.keys()].sort());
    for (const [id, l] of paged) expect(l).toEqual(whole.get(id) as typeof l);
    // Page 2 starts in D although the change sits on its first bar line.
    const last = events[events.length - 1] as NEvent;
    expect(paged.get(last.id)).toMatchObject({ degree: "1", key: { tonic: "D", mode: "major" } });
  });
  test("a page boundary does not relabel a note: the label is the one its own page draws", () => {
    const page2 = notate({
      ...input,
      key: { tonic: "D", mode: "major" },
      keyChanges: [],
      startBar: 2,
      bars: 2,
    });
    const own = drawnLabels(page2.score);
    const all = drawnLabelsOf(input, 2);
    for (const [id, l] of own) expect(all.get(id)).toEqual(l);
  });
});
