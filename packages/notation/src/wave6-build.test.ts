// Wave 6 engraving built in the Build phase, each rule on a small piece: the declared grid, tuplets written per
// beat, swing straightening for written shuffles and real triplets, voices that follow tracks, a named track that
// keeps its staff, key changes that show (cancelling naturals) and ones that do not (same signature), modal key
// plans, chord labels once a bar, guide-tone marks, triplet values in the staff-input edit model.
import { describe, expect, test } from "bun:test";
import type { KeySpec, MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { checkAbc, eventsOf, readBack } from "../corpus/harness.ts";
import { nearestStep, snapToGrid, straightenSwing } from "./build.ts";
import {
  editNoteList,
  guideToneMarks,
  harmonyLabels,
  keyChangesOf,
  type NoteListContext,
  notate,
  parseNoteList,
  scoreRhythm,
  toNoteList,
  tripletTokens,
} from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const FOUR = METERS["4/4"];
const line = (dsl: string, track = "mel", meter: MeterSpec = FOUR) => parseNoteList(dsl, { track, meter });
const body = (abc: string): string =>
  abc
    .split("\n")
    .filter((l) => !/^[A-Z]:|^%%/.test(l))
    .join("\n")
    .replace(/!class=oak-e\d+!/g, "")
    .trim();
const shift = (events: NEvent[], by: Rat): NEvent[] =>
  events.map((e) => ({ ...e, onset: R.add(e.onset, by), id: `${e.id}'` }));

describe("the declared grid (NotationInput.grid)", () => {
  test("nearestStep: the nearest step; half-way goes to the stronger position, the earlier one on a tie", () => {
    expect(nearestStep([33, 64], 16)).toEqual([1, 2]);
    expect(nearestStep([7, 100], 8)).toEqual([1, 8]);
    // A beat (4/16) pushed late by a 32nd lies between the beat and the next sixteenth: back to the beat.
    expect(nearestStep([9, 32], 16)).toEqual([1, 4]);
    // Between 5/16 and 6/16 = 3/8: the eighth is the stronger of the two.
    expect(nearestStep([11, 32], 16)).toEqual([3, 8]);
    // Between 1/16 and 3/16 on a grid of 8 (0 and 1/8): 1/16 is half-way, 0 is stronger.
    expect(nearestStep([1, 16], 8)).toEqual([0, 1]);
    expect(nearestStep([3, 16], 8)).toEqual([1, 4]);
  });
  test("snapToGrid keeps a note at least one step long and reports two notes on one step", () => {
    const tiny = line("C4:32 r:32 D4:32 r:32 r:8 r:4 r:2");
    const snapped = snapToGrid(tiny, 8);
    expect(snapped.collision).toBeNull();
    expect(snapped.events.map((e) => `${R.str(e.onset)}+${R.str(e.dur)}`)).toEqual(["0+1/8", "0+1/8"]);
    const flam = [...line("C4:8 r:8 r:4 r:2"), ...shift(line("C4:8 r:8 r:4 r:2"), [1, 64])];
    const clash = snapToGrid(flam, 16);
    expect(clash.collision).not.toBeNull();
    expect(clash.events.length).toBe(1);
  });
  test("a lazy snare stays on its beat; the Score is exact and says which grid it used", () => {
    const events = shift(line("r:4 sd:4 r:4 sd:4", "snare"), [1, 32]);
    const free = notate({ events, meter: FOUR, key: null, bars: 1, staff: "percussion" });
    expect(scoreRhythm(free.score).ties).toBeGreaterThan(0);
    const { score, abc } = notate({ events, meter: FOUR, key: null, bars: 1, staff: "percussion", grid: 16 });
    expect(toNoteList(score)).toBe("r:4 sd:4 r:4 sd:4");
    expect([score.grid, score.approximate, score.warnings.length]).toEqual([16, false, 0]);
    expect(checkAbc(abc.abc).warnings).toEqual([]);
  });
  test("a grid of 12 keeps triplets; a grid of 8 writes them as the eighths they are nearest to", () => {
    const events = line("C4:8t D4:8t E4:8t G4:4 r:2");
    const twelve = notate({ events, meter: FOUR, key: C, bars: 1, staff: "treble", grid: 12 });
    expect(toNoteList(twelve.score)).toBe("(3:2 C4:8 D4:8 E4:8) G4:4 r:2");
    const eight = notate({ events, meter: FOUR, key: C, bars: 1, staff: "treble", grid: 8 });
    expect(eight.score.approximate).toBe(false);
    expect(scoreRhythm(eight.score).tuplets).toEqual([]);
  });
  test("a grid that is not a whole number of steps is ignored", () => {
    const events = line("C4:4 D4:4 E4:4 F4:4");
    const { score } = notate({ events, meter: FOUR, key: C, bars: 1, staff: "treble", grid: 0 });
    expect(score.grid).toBeUndefined();
    expect(toNoteList(score)).toBe("C4:4 D4:4 E4:4 F4:4");
  });
});

describe("tuplets wider than a beat", () => {
  const notes = (dsl: string, bars = 1) =>
    notate({ events: line(dsl), meter: FOUR, key: C, bars, staff: "treble" });
  test("a line pushed by a triplet eighth is written in triplets per beat, tied over the beats", () => {
    // The first note would start before the bar: Strudel does not play it on the first pass, nor does the page.
    const events = shift(line("C4:4 E4:4 G4:4 C5:4"), [-1, 12]).filter((e) => R.lte([0, 1], e.onset));
    const { score, abc } = notate({ events, meter: FOUR, key: C, bars: 1, staff: "treble" });
    expect(body(abc.abc)).toBe("(3:2:2z4 E2- (3:2:2E4 G2- (3:2:2G4 c2- (3:2:2c4 z2 |]");
    expect(score.approximate).toBe(false);
    // The ABC plays what was given (read back on its own).
    const back = readBack(abc.abc).staves[0]?.voices[0]?.map(
      (n) => `${n.onset.toFixed(4)}+${n.dur.toFixed(4)}`,
    );
    expect(back).toEqual(["0.1667+0.2500", "0.4167+0.2500", "0.6667+0.2500"]);
  });
  test("plain quarter-note and half-note triplets keep one bracket", () => {
    expect(body(notes("C4:4t D4:4t E4:4t F4:2").abc.abc)).toBe("(3:2:3C4 D4 E4 F8 |]");
    expect(body(notes("C4:2t D4:2t E4:2t").abc.abc)).toBe("(3:2:3C8 D8 E8 |]");
    // Two eighths and two quarters under a quarter-note triplet: still one bracket, no dots inside.
    expect(body(notes("C4:8t D4:8t E4:4t F4:4t G4:2").abc.abc)).toBe("(3:2:4C2D2 E4 F4 G8 |]");
  });
  test("a quarter-note triplet across the half bar is split into two beat triplets, so beat 3 shows", () => {
    const s = notes("C4:4 D4:4t E4:4t F4:4t G4:4");
    expect(body(s.abc.abc)).toBe("C4 (3:2:2D4 E2- (3:2:2E2 F4 G4 |]");
    expect(s.score.approximate).toBe(false);
  });
});

describe("swing straightening for the staff", () => {
  const SW = { subdivision: 8 as const, amount: 1 / 3 };
  const at = (events: NEvent[]) => events.map((e) => `${R.str(e.onset)}+${R.str(e.dur)}`);
  test("a swingBy off-beat (ringing into the next beat) ends on the beat, as before", () => {
    const e = line("C4:8 r:8 r:4 r:2").map((x) => ({ ...x, onset: [1, 6] as Rat, dur: [1, 8] as Rat }));
    expect(at(straightenSwing(e, 4, SW))).toEqual(["1/8+1/8"]);
  });
  test("an off-beat a triplet eighth long (a shuffle written [c4@2 d4]) becomes an eighth", () => {
    const e = line("C4:8 r:8 r:4 r:2").map((x) => ({ ...x, onset: [1, 6] as Rat, dur: [1, 12] as Rat }));
    expect(at(straightenSwing(e, 4, SW))).toEqual(["1/8+1/8"]);
  });
  test("a staccato off-beat keeps its length", () => {
    const e = line("C4:8 r:8 r:4 r:2").map((x) => ({ ...x, onset: [1, 6] as Rat, dur: [1, 24] as Rat }));
    expect(at(straightenSwing(e, 4, SW))).toEqual(["1/8+1/24"]);
  });
  test("a real triplet in a swung line keeps its three notes; another track's slot is still straightened", () => {
    const trip = line("C4:8t D4:8t E4:8t r:4 r:2", "mel");
    const pair = [
      { ...(line("G3:8 r:8 r:4 r:2", "bass")[0] as NEvent), onset: [1, 6] as Rat, dur: [1, 12] as Rat },
    ];
    const out = straightenSwing([...trip, ...pair], 4, SW);
    expect(at(out.filter((e) => e.track === "mel"))).toEqual(["0+1/12", "1/12+1/12", "1/6+1/12"]);
    expect(at(out.filter((e) => e.track === "bass"))).toEqual(["1/8+1/8"]);
  });
});

describe("voices follow tracks", () => {
  test("comping stabs over a walking bass on one staff: each track keeps one voice", async () => {
    const code = `chords: note("~ [c4,e4,g4] ~ ~ [c4,e4,g4] ~ ~ ~")
bass: note("c2 e2 g2 e2")`;
    const events = await eventsOf({ code, bars: 1 });
    const { score } = notate({ events, meter: FOUR, key: C, bars: 1, staff: "bass" });
    expect(score.staves[0]?.voices.map((v) => v.id)).toEqual(["S1", "S1v2"]);
    expect(toNoteList(score, { voice: 0 })).toBe("r:8 [C4,E4,G4]:8 r:4 [C4,E4,G4]:8 r:8 r:4");
    expect(toNoteList(score, { voice: 1 })).toBe("C2:4 E2:4 G2:4 E2:4");
    expect(score.warnings).toEqual([]);
  });
  test("two tracks that never sound together stay one line (a call and its answer)", async () => {
    const code = `call: note("c4 e4 ~ ~")
answer: note("~ ~ g4 e4")`;
    const events = await eventsOf({ code, bars: 1 });
    const { score } = notate({ events, meter: FOUR, key: C, bars: 1, staff: "treble" });
    expect(score.staves[0]?.voices.length).toBe(1);
    expect(toNoteList(score)).toBe("C4:4 E4:4 G4:4 E4:4");
  });
  test("a tune over held chords was two clean voices before and still is", async () => {
    const code = `mel: note("e5 g5 e5 c5")
chords: note("[c4,e4,g4]")`;
    const events = await eventsOf({ code, bars: 1 });
    const { score } = notate({ events, meter: FOUR, key: C, bars: 1, staff: "treble" });
    expect(toNoteList(score, { voice: 0 })).toBe("E5:4 G5:4 E5:4 C5:4");
    expect(toNoteList(score, { voice: 1 })).toBe("[C4,E4,G4]:1");
  });
});

describe("a named track keeps its staff (trackClefs on a grand staff)", () => {
  test("left-hand voicings around middle C go whole to the bass staff, also when every track is low", async () => {
    const code = `chords: note("~ [b3,e4,f4,a4] ~@6")
bass: note("g2 g2 g2 g2")`;
    const events = await eventsOf({ code, bars: 1 });
    // Unnamed, the voicing reads as a treble part (its notes sit around middle C) and by register it is cut in two.
    const byTrack = notate({ events, meter: FOUR, key: C, bars: 1, staff: "grand" });
    expect(toNoteList(byTrack.score, { staff: 0 })).toBe("r:8 [B3,E4,F4,A4]:8 r:4 r:2");
    expect(toNoteList(byTrack.score, { staff: 1 })).toBe("G2:4 G2:4 G2:4 G2:4");
    const byRegister = notate({ events, meter: FOUR, key: C, bars: 1, staff: "grand", split: "register" });
    expect(toNoteList(byRegister.score, { staff: 0 })).toBe("r:8 [E4,F4,A4]:8 r:4 r:2");
    const named = notate({
      events,
      meter: FOUR,
      key: C,
      bars: 1,
      staff: "grand",
      trackClefs: { chords: "bass" },
    });
    expect(toNoteList(named.score, { staff: 0 })).toBe("r:1");
    expect(toNoteList(named.score, { staff: 1, voice: 0 })).toBe("r:8 [B3,E4,F4,A4]:8 r:4 r:2");
    expect(toNoteList(named.score, { staff: 1, voice: 1 })).toBe("G2:4 G2:4 G2:4 G2:4");
    expect(checkAbc(named.abc.abc).warnings).toEqual([]);
  });
});

describe("key changes on the staff", () => {
  const plan = (keys: [number, string, string?][]) =>
    keyChangesOf(
      keys.map(([bar, tonic, mode]) => ({ bar, key: { tonic, mode: mode ?? "major" } as KeySpec })),
    );
  test("D to C to F: a double bar and the new signature each time; abcjs cancels with naturals", async () => {
    const events = line("D4:4 F#4:4 A4:4 F#4:4 | C4:4 E4:4 G4:4 E4:4 | F4:4 A4:4 Bb4:4 A4:4");
    const { abc } = notate({
      events,
      meter: FOUR,
      bars: 3,
      staff: "treble",
      ...plan([
        [1, "D"],
        [2, "C"],
        [3, "F"],
      ]),
    });
    expect(body(abc.abc)).toBe("D4 F4 A4 F4 || [K:C] C4 E4 G4 E4 || [K:F] F4 A4 B4 A4 |]");
    // What abcjs will draw at each change (independent of the emitter): naturals for F and C, then B flat.
    // biome-ignore lint/suspicious/noExplicitAny: abcjs is CommonJS
    const mod: any = await import("abcjs");
    const tune = (mod.default ?? mod).parseOnly(abc.abc)[0];
    const keys = tune.lines[0].staff[0].voices[0]
      // biome-ignore lint/suspicious/noExplicitAny: abcjs element
      .filter((e: any) => e.el_type === "key")
      // biome-ignore lint/suspicious/noExplicitAny: abcjs element
      .map((k: any) => k.accidentals.map((a: { acc: string; note: string }) => `${a.acc} ${a.note}`));
    expect(keys).toEqual([["natural f", "natural c"], ["flat B"]]);
    expect(checkAbc(abc.abc).barTypes).toEqual(["bar_thin_thin", "bar_thin_thin", "bar_thin_thick"]);
  });
  test("C major to A minor: the same signature, so no double bar and no [K:]; G sharp is an accidental", () => {
    const events = line("C4:4 E4:4 G4:4 E4:4 | A3:4 C4:4 E4:4 G#4:4").map((e) => {
      const { written: _w, ...rest } = e;
      return rest as NEvent;
    });
    const { score, abc } = notate({
      events,
      meter: FOUR,
      bars: 2,
      staff: "treble",
      ...plan([
        [1, "C"],
        [2, "A", "harmonic minor"],
      ]),
    });
    expect(body(abc.abc)).toBe("C4 E4 G4 E4 | A,4 C4 E4 ^G4 |]");
    // The Score still knows the key changed: labels read in A minor from bar 2.
    expect(score.keyChanges).toEqual([{ bar: 1, key: { tonic: "A", mode: "harmonic minor" } }]);
  });
  test("C major to G Mixolydian (no accidentals either): no mark; G major to G Mixolydian: a natural cancels F sharp", () => {
    const events = line("C4:4 E4:4 G4:4 E4:4 | G4:4 B4:4 D5:4 F5:4").map((e) => {
      const { written: _w, ...rest } = e;
      return rest as NEvent;
    });
    const same = notate({
      events,
      meter: FOUR,
      bars: 2,
      staff: "treble",
      ...plan([
        [1, "C"],
        [2, "G", "mixolydian"],
      ]),
    });
    expect(body(same.abc.abc)).toBe("C4 E4 G4 E4 | G4 B4 d4 f4 |]");
    const shown = notate({
      events,
      meter: FOUR,
      bars: 2,
      staff: "treble",
      ...plan([
        [1, "G"],
        [2, "G", "mixolydian"],
      ]),
    });
    expect(body(shown.abc.abc)).toBe("C4 E4 G4 E4 || [K:Gmix] G4 B4 d4 f4 |]");
  });
  test("a change back to the first key after a hidden one is still compared with the signature in force", () => {
    const events = line("C4:1 | A3:1 | D4:1 | C4:1");
    const { abc } = notate({
      events,
      meter: FOUR,
      bars: 4,
      staff: "treble",
      ...plan([
        [1, "C"],
        [2, "A", "minor"],
        [3, "D"],
        [4, "A", "minor"],
      ]),
    });
    expect(body(abc.abc)).toBe("C16 | A,16 || [K:D] D16 || [K:Am] C16 |]");
  });
  test("keyChangesOf with modal 'parallel': a scale beside its mode keeps one signature", () => {
    const G: KeySpec = { tonic: "G", mode: "major" };
    const GMIX = { tonic: "G", mode: "mixolydian" } as KeySpec;
    expect(
      keyChangesOf(
        [
          { bar: 1, key: G },
          { bar: 3, key: GMIX },
          { bar: 5, key: G },
        ],
        { modal: "parallel" },
      ),
    ).toEqual({ key: G });
    expect(
      keyChangesOf(
        [
          { bar: 1, key: { tonic: "D", mode: "lydian" } as KeySpec },
          { bar: 4, key: { tonic: "D", mode: "dorian" } as KeySpec },
        ],
        { modal: "parallel" },
      ),
    ).toEqual({
      key: { tonic: "D", mode: "major" },
      keyChanges: [{ bar: 3, key: { tonic: "D", mode: "minor" } }],
    });
    // Default: the modes keep their own signatures.
    expect(
      keyChangesOf([
        { bar: 1, key: G },
        { bar: 3, key: GMIX },
      ]),
    ).toEqual({ key: G, keyChanges: [{ bar: 2, key: GMIX }] });
  });
});

describe("harmonyLabels: one label a chord", () => {
  const stabs = [
    { bar: 1, beat: 1, symbol: "C", rn: "I" },
    { bar: 1, beat: 3, symbol: "C", rn: "I" },
    { bar: 2, beat: 1, symbol: "C", rn: "I" },
    { bar: 2, beat: 3, symbol: "G7", rn: "V7" },
  ];
  test("a chord struck again inside its bar is named once; the next bar names it again", () => {
    expect(harmonyLabels(stabs).chords).toEqual([
      { bar: 0, beat: 1, symbol: "C" },
      { bar: 1, beat: 1, symbol: "C" },
      { bar: 1, beat: 3, symbol: "G7" },
    ]);
    expect(harmonyLabels(stabs, { restrikes: true }).chords?.length).toBe(4);
  });
  test("a chord with no numeral yet (not taught, harmony-lens depth) keeps its symbol and writes no numeral", () => {
    const out = harmonyLabels([
      { bar: 1, beat: 1, symbol: "C", rn: "I" },
      { bar: 2, beat: 1, symbol: "D7", rn: "" },
    ]);
    expect(out.chords?.length).toBe(2);
    expect(out.romans).toEqual([{ bar: 0, beat: 1, rn: "I" }]);
  });
});

describe("guideToneMarks", () => {
  test("the 3rd and 7th of each chord among stacked sevenths; a triad marks its 3rd only", () => {
    const events = line("[D4,F4,A4,C5]:1 | [G3,B3,D4,F4]:1 | [C4,E4,G4]:1", "chords");
    const { score, abc } = notate({
      events,
      meter: FOUR,
      key: C,
      bars: 3,
      staff: "treble",
      chords: ["Dm7", "G7", "C"].map((symbol, bar) => ({ bar, beat: 1, symbol })),
    });
    const marks = guideToneMarks(score);
    expect(marks.map((m) => `${m.pitch}=${m.role}@${m.n}.${m.member}`)).toEqual([
      "F4=third@0.1",
      "C5=seventh@0.3",
      "B3=third@1.1",
      "F4=seventh@1.3",
      "E4=third@2.1",
    ]);
    // Each mark names the event its head engraves.
    for (const m of marks) expect(abc.idMap[m.n]?.eventIds[m.member]).toBe(m.eventId);
  });
  test("a tune over the changes: only the notes that are guide tones; a tied note is marked once", () => {
    const events = line("F4:2 E4:4 F4:4~ | F4:2 D4:2");
    const { score } = notate({
      events,
      meter: FOUR,
      key: C,
      bars: 2,
      staff: "treble",
      chords: [
        { bar: 0, beat: 1, symbol: "Dm7" },
        { bar: 1, beat: 1, symbol: "G7" },
      ],
    });
    // F is the 3rd of Dm7 (twice); the tied F began under Dm7 and is not marked again under G7.
    expect(guideToneMarks(score).map((m) => `${m.pitch}=${m.role}/${m.chord}`)).toEqual([
      "F4=third/Dm7",
      "F4=third/Dm7",
    ]);
  });
  test("an event's own chord symbol wins over the staff's; unknown symbols and drums mark nothing", () => {
    const events = line("[B3,E4,F4,A4]:1", "chords").map((e) => ({ ...e, chordSymbol: "G7" }));
    const { score } = notate({ events, meter: FOUR, key: C, bars: 1, staff: "bass" });
    expect(guideToneMarks(score)).toEqual([]);
    expect(guideToneMarks(score, { events }).map((m) => `${m.pitch}=${m.role}`)).toEqual([
      "B3=third",
      "F4=seventh",
    ]);
    expect(guideToneMarks(score, { chords: [{ bar: 0, beat: 1, symbol: "H13" }] })).toEqual([]);
    const drums = notate({
      events: line("bd:4 sd:4 bd:4 sd:4"),
      meter: FOUR,
      key: null,
      bars: 1,
      staff: "percussion",
    });
    expect(guideToneMarks(drums.score, { chords: [{ bar: 0, beat: 1, symbol: "C7" }] })).toEqual([]);
  });
});

describe("triplet values in the staff-input edit model (NoteListContext.triplets)", () => {
  const ctx: NoteListContext = { meter: FOUR, key: C, bars: 1 };
  const third: Rat = [1, 12];
  test("tripletTokens rewrites triplet groups as triplet values and keeps other tuplets", () => {
    expect(tripletTokens("(3:2 C4:8 D4:8~ E4:8) G4:4")).toBe("C4:8t D4:8t~ E4:8t G4:4");
    expect(tripletTokens("(5:4 C4:16 D4:16 E4:16 F4:16 G4:16) r:4")).toBe(
      "(5:4 C4:16 D4:16 E4:16 F4:16 G4:16) r:4",
    );
    expect(tripletTokens("(3:2 C4:4 r:8) | (3:2 [C4,E4]:8 r:4)")).toBe("C4:4t r:8t | [C4,E4]:8t r:4t");
    // Both forms are the same events.
    const a = parseNoteList("(3:2 C4:8 D4:8 E4:8) G4:4 r:2");
    const b = parseNoteList(tripletTokens("(3:2 C4:8 D4:8 E4:8) G4:4 r:2"));
    expect(b.map((e) => `${R.str(e.onset)}+${R.str(e.dur)}:${e.midi}`)).toEqual(
      a.map((e) => `${R.str(e.onset)}+${R.str(e.dur)}:${e.midi}`),
    );
  });
  test("with triplets off a triplet length is refused, as any length no single value writes", () => {
    const r = editNoteList("r:1", { op: "insert", onset: [0, 1], dur: third, pitch: "C4" }, ctx);
    expect([r.changed, r.refused]).toEqual([false, "needs-tie"]);
  });
  test("with triplets on, three inserts build a group; the answer is written in triplet values", () => {
    const on = { ...ctx, triplets: true };
    let r = editNoteList("r:1", { op: "insert", onset: [0, 1], dur: third, pitch: "C4" }, on);
    expect(r.changed).toBe(true);
    // One note of a group: the rest of the beat is a rest under the same bracket.
    expect(r.list).toBe("C4:8t r:4t r:4 r:2");
    r = editNoteList(r.list, { op: "insert", onset: [1, 12], dur: third, pitch: "D4" }, on);
    r = editNoteList(r.list, { op: "insert", onset: [1, 6], dur: third, pitch: "E4" }, on);
    expect(r.list).toBe("C4:8t D4:8t E4:8t r:4 r:2");
    expect(body(r.abc.abc)).toBe("(3:2:3C2D2E2 z4 z8 |]");
    expect(r.score.approximate).toBe(false);
    // The value reads back as the same three notes.
    expect(parseNoteList(r.list).map((e) => `${R.str(e.onset)}+${R.str(e.dur)}:${e.midi}`)).toEqual([
      "0+1/12:60",
      "1/12+1/12:62",
      "1/6+1/12:64",
    ]);
  });
  test("deleting one note of a group leaves a rest in the bracket; plain answers are untouched by the flag", () => {
    const on = { ...ctx, triplets: true };
    const list = "C4:8t D4:8t E4:8t r:4 r:2";
    const mid = parseNoteList(list)[1] as NEvent;
    const r = editNoteList(list, { op: "delete", eventId: mid.id }, on);
    expect(r.list).toBe("C4:8t r:8t E4:8t r:4 r:2");
    const plain = editNoteList("C4:4 r:4 r:2", { op: "insert", onset: [1, 4], dur: [1, 4], pitch: "D4" }, on);
    expect(plain.list).toBe("C4:4 D4:4 r:2");
  });
});
