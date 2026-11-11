// Unit tests of @oak/notation without Strudel: the note-list DSL, the model readers, the staff-input
// helpers, swing, pickups, voices, warnings and ABC details. Music facts are stated, not snapshotted.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import {
  activeNotes,
  applyEdit,
  buildScore,
  drumStaffPosition,
  editStaff,
  estimateKey,
  type NotationInput,
  notate,
  nudgePitch,
  parseNoteList,
  pitchToStep,
  scoreToEvents,
  staffStepAtY,
  stepToPitch,
  straightenSwing,
  toAbc,
  toNoteList,
  withIds,
  writtenToCycles,
  xToOnset,
} from "./index.ts";

// biome-ignore lint/suspicious/noExplicitAny: abcjs is CommonJS
const abcjsMod: any = await import("abcjs");
const abcjs = abcjsMod.default ?? abcjsMod;
const abcWarnings = (abc: string): string[] => abcjs.parseOnly(abc)[0].warnings ?? [];

const C: KeySpec = { tonic: "C", mode: "major" };
const input = (dsl: string, over: Partial<NotationInput> = {}): NotationInput => {
  const meter = over.meter ?? METERS["4/4"];
  return { events: parseNoteList(dsl, { meter }), meter, key: null, bars: 1, staff: "treble", ...over };
};
const body = (abc: string) => abc.split("\n").filter((l) => l && !/^[A-Z]:|^%%/.test(l));
const dsl = (i: NotationInput) => toNoteList(buildScore(i));

describe("note-list DSL", () => {
  test("durations are 1/n of a whole note, in cycles through the meter", () => {
    const ev = parseNoteList("C4:4 D4:8 r:8 [C4,E4]:2");
    expect(ev.map((e) => [R.str(e.onset), R.str(e.dur), e.midi])).toEqual([
      ["0", "1/4", 60],
      ["1/4", "1/8", 62],
      ["1/2", "1/2", 60],
      ["1/2", "1/2", 64],
    ]);
    const waltz = parseNoteList("C4:4 D4:2", { meter: METERS["3/4"] });
    expect(waltz.map((e) => R.str(e.dur))).toEqual(["1/3", "2/3"]);
    const six = parseNoteList("C4:4. D4:8", { meter: METERS["6/8"] });
    expect(six.map((e) => R.str(e.dur))).toEqual(["1/2", "1/6"]);
  });
  test("dots, triplet values, tuplet groups, ties, drums and Strudel spellings", () => {
    const ev = parseNoteList("C4:8. D4:16 (3:2 E4:8 F4:8 G4:8) A4:8t cs4:4~ C#4:8 bd:8");
    expect(ev.map((e) => [R.str(e.onset), R.str(e.dur), e.midi ?? e.s])).toEqual([
      ["0", "3/16", 60],
      ["3/16", "1/16", 62],
      ["1/4", "1/12", 64],
      ["1/3", "1/12", 65],
      ["5/12", "1/12", 67],
      ["1/2", "1/12", 69],
      ["7/12", "3/8", 61],
      ["23/24", "1/8", "bd"],
    ]);
    expect(ev.find((e) => e.midi === 61)?.written).toBe("C#4");
    expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length);
    expect(ev[0]?.id).toBe("main|1|0/1|60|0");
  });
  test("bad input throws", () => {
    expect(() => parseNoteList("C4:3")).toThrow();
    expect(() => parseNoteList("H4:4")).toThrow();
    expect(() => parseNoteList("C4")).toThrow();
  });
  test("start and track options", () => {
    const ev = parseNoteList("E4:4", { start: [2, 1], track: "mel" });
    expect(ev[0]?.track).toBe("mel");
    expect(ev[0]?.onset).toEqual([2, 1]);
    expect(ev[0]?.id).toBe("mel|3|2/1|64|0");
  });
});

describe("spelling and accidentals", () => {
  test("a written spelling from staff input is kept (E# in F# minor) and gets its accidental", () => {
    const { abc, score } = notate(input("E#4:4 F#4:4 r:2", { key: { tonic: "F#", mode: "minor" } }));
    expect(toNoteList(score)).toBe("E#4:4 F#4:4 r:4 r:2".replace(" r:4 r:2", " r:2"));
    expect(body(abc.abc)[0]).toBe("!class=oak-e0!^E4 !class=oak-e1!F4 z8 |]");
  });
  test("accidentals are bar-scoped and per octave; a tie into a bar is not restated", () => {
    const { abc } = notate(input("F#4:2 F#5:4 F4:4~ | F4:4 F4:4 F#4:2", { bars: 2 }));
    expect(body(abc.abc)[0]).toBe(
      "!class=oak-e0!^F8 !class=oak-e1!^f4 !class=oak-e2!=F4- | !class=oak-e2!F4 !class=oak-e3!F4 !class=oak-e4!^F8 |]",
    );
  });
  test("key estimate: needs 7 notes outside C major; fits one key", () => {
    expect(estimateKey(parseNoteList("C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8"))).toBeNull();
    expect(estimateKey(parseNoteList("D4:8 E4:8 F#4:8"))).toBeNull();
    expect(estimateKey(parseNoteList("Bb3:8 C4:8 D4:8 Eb4:8 F4:8 G4:8 A4:8 Bb4:8"))).toEqual({
      tonic: "Bb",
      mode: "major",
    });
  });
  test("chord context spells a chord tone (G# over E7, not Ab)", () => {
    const s = buildScore(input("G#4:1", { chords: [{ bar: 0, beat: 1, symbol: "E7" }], staff: "lead" }));
    expect(toNoteList(s)).toBe("G#4:1");
    const flat = buildScore(input("G#4:1", { chords: [{ bar: 0, beat: 1, symbol: "Fm" }], staff: "lead" }));
    expect(flat.staves[0]?.voices[0]?.bars[0]?.items[0]?.pitches[0]?.name).toBe("G#4");
    // A written spelling wins; a numeric pitch follows the chord.
    const num = parseNoteList("C4:1").map((e) => ({
      ...e,
      midi: 68,
      pitchSource: "note-num" as const,
      written: undefined,
    }));
    const s2 = buildScore({
      ...input("C4:1"),
      events: num.map(({ written: _w, ...e }) => e),
      chords: [{ bar: 0, beat: 1, symbol: "Fm" }],
    });
    expect(s2.staves[0]?.voices[0]?.bars[0]?.items[0]?.pitches[0]?.name).toBe("Ab4");
  });
  test("chord symbols are translated for display and h7 is never printed", () => {
    const s = buildScore(
      input("C4:1", {
        staff: "lead",
        chords: [
          { bar: 0, beat: 1, symbol: "C^7" },
          { bar: 0, beat: 2, symbol: "Cm7b5" },
          { bar: 0, beat: 3, symbol: "Ch7" },
          { bar: 0, beat: 4, symbol: "Co" },
        ],
      }),
    );
    const texts = s.chords?.map((c) => c.text) ?? [];
    expect(texts[0]).toBe("Cmaj7");
    expect(texts.join(" ")).not.toContain("h7");
    const parsed = abcjs.parseOnly(toAbc(s).abc)[0];
    const names = parsed.lines[0].staff[0].voices[0].flatMap((e: { chord?: { name: string }[] }) =>
      (e.chord ?? []).map((c) => c.name),
    );
    expect(names[0]).toBe("Cmaj7");
    expect(names[1]).toBe("Cm7♭5");
    expect(names[3]).toBe("C°");
  });
  test("Roman numerals go under the staff", () => {
    const { abc } = notate(
      input("C4:2 G4:2", {
        romans: [
          { bar: 0, beat: 1, rn: "I" },
          { bar: 0, beat: 3, rn: "V7" },
        ],
      }),
    );
    expect(abc.abc).toContain('"_I"!class=oak-e0!C8 "_V7"!class=oak-e1!G8');
  });
});

describe("model readers", () => {
  const s = buildScore(input("C4:4 D4:4 [E4,G4]:2 | C4:1~ | C4:4 r:4 r:2", { bars: 3 }));
  test("activeNotes follows the clock, lights chords, ties and nothing on rests; it wraps the loop", () => {
    expect(activeNotes(s, 0.1)).toEqual([0]);
    expect(activeNotes(s, 0.6)).toEqual([2]);
    expect(activeNotes(s, 1.5)).toEqual([3]);
    expect(activeNotes(s, 2.1)).toEqual([3]);
    expect(activeNotes(s, 2.5)).toEqual([]);
    expect(activeNotes(s, 3.1)).toEqual([0]);
    expect(activeNotes(s, -0.9)).toEqual([3]);
  });
  test("scoreToEvents merges tie chains and keeps spellings", () => {
    const ev = scoreToEvents(s, "answer");
    expect(ev.map((e) => [R.str(e.onset), R.str(e.dur), e.written])).toEqual([
      ["0", "1/4", "C4"],
      ["1/4", "1/4", "D4"],
      ["1/2", "1/2", "E4"],
      ["1/2", "1/2", "G4"],
      ["1", "5/4", "C4"],
    ]);
    expect(ev.every((e) => e.track === "answer")).toBe(true);
  });
  test("idMap: one entry per engraved note or chord, display bar and beat, union of code locations", () => {
    const evs = parseNoteList("C4:2 [E4,G4]:2").map((e, i) => ({
      ...e,
      locs:
        i === 0
          ? [{ from: 6, to: 8 }]
          : [
              { from: 12, to: 14 },
              { from: 0, to: 4 },
              { from: 0, to: 4 },
            ],
    }));
    const { abc } = notate({ ...input(""), events: evs });
    expect(abc.idMap.map((e) => [e.n, e.bar, e.beat, e.pitches.join("+")])).toEqual([
      [0, 1, 1, "C4"],
      [1, 1, 3, "E4+G4"],
    ]);
    expect(abc.idMap[1]?.locs).toEqual([
      { from: 0, to: 4 },
      { from: 12, to: 14 },
    ]);
    for (const e of evs) expect(abc.byEvent.has(e.id)).toBe(true);
    expect(toAbc(buildScore({ ...input(""), events: evs }), { classPrefix: "x-" }).abc).toContain(
      "!class=x-1![EG]8",
    );
  });
});

describe("swing, pickups, voices, warnings", () => {
  test("straightening is exact: swung off-beats move back by amount/2 of a slot", () => {
    const ev = parseNoteList("C4:8 D4:8 E4:8 F4:8").map((e, i) =>
      i % 2 ? { ...e, onset: R.add(e.onset, [1, 24]) } : e,
    );
    expect(straightenSwing(ev, 4, { subdivision: 8, amount: 1 / 3 }).map((e) => R.str(e.onset))).toEqual([
      "0",
      "1/8",
      "1/4",
      "3/8",
    ]);
    const s16 = parseNoteList("C4:16 D4:16").map((e, i) =>
      i ? { ...e, onset: R.add(e.onset, [1, 48]) } : e,
    );
    expect(straightenSwing(s16, 4, { subdivision: 16, amount: 1 / 3 }).map((e) => R.str(e.onset))).toEqual([
      "0",
      "1/16",
    ]);
    const light = parseNoteList("C4:8 D4:8").map((e, i) =>
      i ? { ...e, onset: R.add(e.onset, [1, 40]) } : e,
    );
    expect(straightenSwing(light, 4, { subdivision: 8, amount: 0.2 }).map((e) => R.str(e.onset))).toEqual([
      "0",
      "1/8",
    ]);
  });
  test("an undeclared swing is not exact: approximate", () => {
    const ev = parseNoteList("C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8").map((e, i) =>
      i % 2 ? { ...e, onset: R.add(e.onset, [1, 24]) } : e,
    );
    const s = buildScore({ ...input(""), events: ev });
    expect(s.swingText).toBeUndefined();
    const declared = buildScore({ ...input(""), events: ev, swing: { subdivision: 8, amount: 1 / 3 } });
    expect(declared.approximate).toBe(false);
    expect(declared.swingText).toBe("Swing 8ths");
    expect(toNoteList(declared)).toBe("C4:8 D4:8 E4:8 F4:8 G4:8 A4:8 B4:8 C5:8");
  });
  test("a pickup with notes before it is written as a whole bar, with a warning", () => {
    const s = buildScore(input("C4:4 r:2 G4:4 | C5:1", { bars: 2, pickup: { units: [1, 1] } }));
    expect(s.pickup).toBe(false);
    expect(s.warnings.map((w) => w.code)).toEqual(["out-of-range"]);
    expect(s.staves[0]?.voices[0]?.bars[0]?.partial).toBe(false);
  });
  test("pickup bars: bar numbering starts at 0 in the idMap", () => {
    const { abc, score } = notate(input("r:2. G4:4 | C5:1", { bars: 2, pickup: { units: [1, 1] } }));
    expect(score.pickup).toBe(true);
    expect(abc.idMap.map((e) => [e.bar, e.beat])).toEqual([
      [0, 4],
      [1, 1],
    ]);
    expect(body(abc.abc)[0]).toBe("!class=oak-e0!G4 | !class=oak-e1!c16 |]");
  });
  test("a second voice that is silent for a bar gets an invisible rest", () => {
    const evs = [
      ...parseNoteList("C5:1 | C5:1", { track: "a" }),
      ...parseNoteList("E4:1", { track: "b" }).map((e) => ({ ...e, dur: [1, 2] as Rat })),
    ];
    const { abc, score } = notate({
      ...input(""),
      events: withIds(evs.map(({ id: _i, ...e }) => e)),
      bars: 2,
    });
    expect(score.staves[0]?.voices.length).toBe(2);
    expect(abc.abc).toContain("V:S1v2\n!class=oak-e2!E8 z8 | x16 |]");
    expect(abcWarnings(abc.abc)).toEqual([]);
  });
  test("more than four overlapping lines: cut, warned, approximate", () => {
    const evs = parseNoteList("C4:1").flatMap((e, i) =>
      [0, 1, 2, 3, 4].map((k) => ({ ...e, onset: [k, 8] as Rat, dur: [1, 1] as Rat, midi: 60 + 2 * k + i })),
    );
    const s = buildScore({ ...input(""), events: withIds(evs.map(({ id: _i, ...e }) => e)), bars: 2 });
    expect(s.approximate).toBe(true);
    expect(s.warnings.some((w) => w.code === "overlap-cut")).toBe(true);
  });
  test("drums on a pitched staff are dropped with a warning; far notes warn", () => {
    const evs: NEvent[] = withIds([
      { track: "d", onset: [0, 1], dur: [1, 4], midi: null, pitchSource: "none", s: "bd", gain: 1, locs: [] },
      { track: "m", onset: [0, 1], dur: [1, 1], midi: 30, pitchSource: "note-num", gain: 1, locs: [] },
    ]);
    const s = buildScore({ ...input(""), events: evs });
    expect(s.warnings.map((w) => w.code).sort()).toEqual(["out-of-range", "unpitched-dropped"]);
  });
  test("engraving a window of a longer piece: startBar, tie-in from the previous bar", () => {
    const evs = parseNoteList("C4:1 | F#4:1~ | F#4:2 G4:2 | A4:1");
    const { abc, score } = notate({ ...input(""), events: evs, startBar: 2, bars: 2 });
    expect(score.startBar).toBe(2);
    expect(toNoteList(score)).toBe("F#4:2 G4:2 | A4:1");
    expect(body(abc.abc)[0]).toBe("!class=oak-e0!F8 !class=oak-e1!G8 | !class=oak-e2!A16 |]");
    expect(score.staves[0]?.voices[0]?.bars[0]?.items[0]?.tieFromPrev).toBe(true);
  });
  test("line breaks every barsPerLine bars; voices interleave per line", () => {
    const evs = [
      ...parseNoteList("C5:1 | C5:1 | C5:1", { track: "a" }),
      ...parseNoteList("C3:1 | C3:1 | C3:1", { track: "b" }),
    ];
    const { abc } = notate(
      { ...input(""), events: withIds(evs.map(({ id: _i, ...e }) => e)), bars: 3, staff: "grand" },
      { barsPerLine: 2 },
    );
    expect(abc.abc.split("\n").filter((l) => l.startsWith("V:RH") || l.startsWith("V:LH")).length).toBe(6);
    expect(abcWarnings(abc.abc)).toEqual([]);
  });
  test("a percussion staff next to a sharp key gets no key signature", () => {
    const evs: NEvent[] = withIds([
      { track: "m", onset: [0, 1], dur: [1, 1], midi: 66, pitchSource: "note-num", gain: 1, locs: [] },
      { track: "d", onset: [0, 1], dur: [1, 1], midi: null, pitchSource: "none", s: "sd", gain: 1, locs: [] },
    ]);
    const { abc } = notate({ ...input(""), events: evs, key: { tonic: "D", mode: "major" }, staff: "auto" });
    expect(abc.abc).toContain("V:DR\n[K:C clef=perc] ");
    // biome-ignore lint/suspicious/noExplicitAny: abcjs staff
    const keys = abcjs.parseOnly(abc.abc)[0].lines[0].staff.map((st: any) => st.key.accidentals.length);
    expect(keys).toEqual([2, 0]);
  });
  test("the tempo line counts the meter's tempo unit", () => {
    expect(notate(input("C4:4. D4:4.", { meter: METERS["6/8"], tempoBpm: 80 })).abc.abc).toContain(
      "Q:3/8=80\n",
    );
    expect(notate(input("C4:1", { tempoBpm: 120, title: "Ode" })).abc.abc).toContain(
      "T:Ode\nM:4/4\nL:1/16\nQ:1/4=120\n",
    );
  });
  test("drumStaffPosition", () => {
    expect(drumStaffPosition("bd")).toEqual({ pitch: "F4", head: "normal" });
    expect(drumStaffPosition("sd")).toEqual({ pitch: "C5", head: "normal" });
    expect(drumStaffPosition("hh")).toEqual({ pitch: "G5", head: "x" });
    expect(drumStaffPosition("hh:3")).toEqual({ pitch: "G5", head: "x" });
    expect(drumStaffPosition("piano")).toBeNull();
  });
});

describe("staff input helpers", () => {
  test("y → step → pitch with the key signature, and back", () => {
    expect(staffStepAtY(100, { topLineY: 100, lineSpacing: 10 })).toBe(0);
    expect(staffStepAtY(141, { topLineY: 100, lineSpacing: 10 })).toBe(8);
    expect(stepToPitch(0, "treble", C).name).toBe("F5");
    expect(stepToPitch(0, "treble", { tonic: "D", mode: "major" }).name).toBe("F#5");
    expect(stepToPitch(8, "treble", C).name).toBe("E4");
    expect(stepToPitch(10, "treble", C).name).toBe("C4");
    expect(stepToPitch(0, "bass", C).name).toBe("A3");
    expect(stepToPitch(8, "bass", { tonic: "F", mode: "major" }).name).toBe("G2");
    expect(stepToPitch(4, "treble", { tonic: "Eb", mode: "major" }).name).toBe("B4".replace("B", "Bb"));
    expect(pitchToStep({ letter: "C", oct: 4 }, "treble")).toBe(10);
    expect(pitchToStep({ letter: "A", oct: 3 }, "bass")).toBe(0);
  });
  test("keyboard nudges: diatonic step in the key, semitone, octave", () => {
    const e4 = stepToPitch(8, "treble", C);
    expect(nudgePitch(e4, "step", 1, { tonic: "D", mode: "major" }).name).toBe("F#4");
    expect(nudgePitch(e4, "semitone", 1, C).name).toBe("E#4");
    expect(nudgePitch(nudgePitch(e4, "semitone", 1, C), "semitone", 1, C).name).toBe("F#4");
    expect(nudgePitch(e4, "semitone", -1, C).name).toBe("Eb4");
    expect(nudgePitch(e4, "octave", -1, C).name).toBe("E3");
  });
  test("x → onset snapped to the grid", () => {
    const bars = [
      { x0: 0, x1: 100, cycle: 0 },
      { x0: 100, x1: 200, cycle: 1 },
    ];
    expect(xToOnset(26, bars, METERS["4/4"], [1, 4])).toEqual([1, 4]);
    expect(xToOnset(149, bars, METERS["4/4"], [1, 8])).toEqual([3, 2]);
    expect(xToOnset(99, bars, METERS["4/4"], [1, 4])).toEqual([3, 4]);
    expect(xToOnset(50, bars, METERS["6/8"], [1, 8])).toEqual([1, 2]);
    expect(xToOnset(-5, bars, METERS["4/4"])).toBeNull();
    expect(writtenToCycles(4, 0, METERS["6/8"])).toEqual([1, 3]);
    expect(writtenToCycles(4, 1, METERS["6/8"])).toEqual([1, 2]);
    expect(writtenToCycles(2, 1, METERS["4/4"])).toEqual([3, 4]);
  });
  test("edits regenerate the score and ABC; insert replaces what it overlaps", () => {
    let i = input("C4:4 D4:4 E4:4 F4:4", { key: C });
    i = applyEdit(i, { op: "insert", onset: [1, 4], dur: [1, 2], pitch: "G4" });
    expect(dsl(i)).toBe("C4:4 G4:2 F4:4");
    const g = i.events.find((e) => e.midi === 67) as NEvent;
    i = applyEdit(i, { op: "repitch", eventId: g.id, pitch: "Bb4" });
    expect(dsl(i)).toBe("C4:4 Bb4:2 F4:4");
    const c = i.events[0] as NEvent;
    i = applyEdit(i, { op: "resize", eventId: c.id, dur: [1, 2] });
    expect(dsl(i)).toBe("C4:2 Bb4:4 F4:4");
    i = applyEdit(i, { op: "rest", onset: [3, 4], dur: [1, 4] });
    expect(dsl(i)).toBe("C4:2 Bb4:4 r:4");
    const out = editStaff(i, { op: "delete", eventId: (i.events[0] as NEvent).id });
    expect(toNoteList(out.score)).toBe("r:2 Bb4:4 r:4");
    expect(body(out.abc.abc)[0]).toBe("z8 !class=oak-e0!_B4 z4 |]");
    expect(new Set(out.input.events.map((e) => e.id)).size).toBe(out.input.events.length);
  });
});

describe("property: random rhythms in every meter", () => {
  // Deterministic LCG so a failure is reproducible.
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
  const meters = ["4/4", "3/4", "2/4", "6/8", "9/8", "12/8", "5/4", "5/8", "7/8", "9/8i"] as const;
  for (const id of meters) {
    test(`${id}: 60 random bars engrave exactly and parse cleanly`, () => {
      const meter = METERS[id];
      const W: Rat = [meter.num, meter.den];
      for (let trial = 0; trial < 60; trial++) {
        // Notes and rests on a 1/16 grid, plus eighth triplets on quarter beats of /4 meters.
        const raw: Omit<NEvent, "id">[] = [];
        let pos = 0; // sixteenths
        const total = (meter.num / meter.den) * 16;
        const push = (from: Rat, len: Rat) => {
          if (rnd() < 0.2) return;
          const midi = [60, 64, 67, 70, 78][Math.floor(rnd() * 5)] as number;
          raw.push({
            track: "t",
            onset: R.div(from, W),
            dur: R.div(len, W),
            midi,
            pitchSource: "note-num",
            gain: 1,
            locs: [],
          });
        };
        while (pos < total) {
          if (meter.den === 4 && pos % 4 === 0 && total - pos >= 4 && rnd() < 0.2) {
            for (let k = 0; k < 3; k++) push(R.add([pos, 16], [k, 12]), [1, 12]);
            pos += 4;
            continue;
          }
          const n = Math.min(total - pos, [1, 2, 3, 4, 6, 8, 12][Math.floor(rnd() * 7)] as number);
          push([pos, 16], [n, 16]);
          pos += n;
        }
        const events = withIds(raw);
        const { score, abc } = notate({ events, meter, key: null, bars: 1, staff: "treble" });
        const what = events.map((e) => `${R.str(e.onset)}+${R.str(e.dur)}`).join(" ");
        expect({ what, approximate: score.approximate }).toEqual({ what, approximate: false });
        expect({ what, w: abcWarnings(abc.abc) }).toEqual({ what, w: [] });
        const k = (e: NEvent) => `${R.str(e.onset)}+${R.str(e.dur)}:${e.midi}`;
        expect(scoreToEvents(score).map(k)).toEqual(events.map(k));
      }
    });
  }
});
