// Wave 3 behaviour of @oak/notation beyond the corpus: clef choice per track, annotation lines, courtesy
// accidentals, theoretical keys, the abcjs-limit warnings, spelling-aware labels, tick-based hit-testing and
// the constrained note-list edit model (bars full, no ties or dots unless allowed).
import { describe, expect, test } from "bun:test";
import type { KeySpec, MeterSpec, NEvent } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import {
  ABCJS_LIMITS,
  type BarGeometry,
  buildScore,
  clefOfTrack,
  editNoteList,
  hitTest,
  labelSpelled,
  type NotationInput,
  type NoteListContext,
  notate,
  noteListInput,
  onsetX,
  parseNoteList,
  plainNoteList,
  type StaffGeometry,
  toAbc,
  withIds,
  xToOnset,
} from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const G: KeySpec = { tonic: "G", mode: "major" };
const M44 = METERS["4/4"];
const M34 = METERS["3/4"];

const ev = (list: string, track = "main", meter: MeterSpec = M44): NEvent[] =>
  parseNoteList(list, { track, meter });
const input = (events: NEvent[], extra: Partial<NotationInput> = {}): NotationInput => ({
  events,
  meter: M44,
  key: C,
  bars: 1,
  staff: "auto",
  ...extra,
});
const tracksOf = (events: NEvent[]) => withIds(events.map(({ id: _id, ...e }) => e));

describe("clefs per track", () => {
  test("clefOfTrack: explicit, by name, by register", () => {
    expect(clefOfTrack("mel", [72, 74])).toBe("treble");
    expect(clefOfTrack("mel", [48, 50])).toBe("bass");
    expect(clefOfTrack("bass", [64, 67])).toBe("bass");
    expect(clefOfTrack("band.bassline", [64])).toBe("bass");
    expect(clefOfTrack("lh", [72])).toBe("bass");
    expect(clefOfTrack("bassoon", [40])).toBe("bass"); // by register, not by name
    expect(clefOfTrack("bassoon", [70])).toBe("treble");
    expect(clefOfTrack("x", [40], { trackClefs: { x: "treble" } })).toBe("treble");
    expect(clefOfTrack("x", [62], { split: 64 })).toBe("bass");
  });
  test("auto: a melody dipping below middle C stays whole on the treble staff when a bass track exists", () => {
    const events = tracksOf([...ev("C4:4 B3:4 A3:4 C4:4", "mel"), ...ev("C3:2 F2:2", "bass")]);
    const score = buildScore(input(events));
    expect(score.staves.map((s) => `${s.id}:${s.clef}`)).toEqual(["RH:treble", "LH:bass"]);
    const rh = score.staves[0]?.voices[0]?.bars[0]?.items.flatMap((i) => i.pitches.map((p) => p.name));
    expect(rh).toEqual(["C4", "B3", "A3", "C4"]);
  });
  test("auto: two treble tracks stay on one treble staff", () => {
    const events = tracksOf([...ev("E5:2 D5:2", "s"), ...ev("C5:2 B4:2", "a")]);
    expect(buildScore(input(events)).staves.map((s) => `${s.id}:${s.clef}`)).toEqual(["S1:treble"]);
  });
  test("trackClefs decides a single auto staff and a grand staff", () => {
    const one = buildScore(input(ev("G3:4 C4:4 E4:4 G4:4", "pad"), { trackClefs: { pad: "bass" } }));
    expect(one.staves.map((s) => s.clef)).toEqual(["bass"]);
    const events = tracksOf([...ev("C5:1", "a"), ...ev("E4:1", "b")]);
    const grand = buildScore(input(events, { staff: "grand", trackClefs: { b: "bass" } }));
    expect(grand.staves.map((s) => s.voices[0]?.bars[0]?.items[0]?.pitches[0]?.name)).toEqual(["C5", "E4"]);
    // split: "register" keeps the old behaviour even with tracks: E4 is above middle C.
    const reg = buildScore(input(events, { staff: "grand", split: "register" }));
    expect(reg.staves.map((s) => s.voices[0]?.bars[0]?.items[0]?.pitches.map((p) => p.name))).toEqual([
      ["E4", "C5"],
      [],
    ]);
    const low = buildScore(input(events, { staff: "grand", split: "register", splitMidi: 66 }));
    expect(low.staves.map((s) => s.voices[0]?.bars[0]?.items[0]?.pitches[0]?.name ?? "rest")).toEqual([
      "C5",
      "E4",
    ]);
  });
});

describe("annotation lines", () => {
  // The off-beat dyad is engraved as two eighths tied over beat 3.
  const events = ev("C4:4 F#4:8 [E4,G4]:4 r:8 r:4");
  test("below: one w: line per kind, in order, replacing labels", () => {
    const { abc, score } = notate(
      input(events, { staff: "treble", labels: "solfege", annotations: { noteName: true, degree: true } }),
    );
    expect(score.annotations).toEqual({ noteName: true, degree: true });
    const w = abc.abc.split("\n").filter((l) => l.startsWith("w:"));
    expect(w).toEqual(["w:1 ♯4 3~5 *", "w:C4 F♯4 E4~G4 *"]);
  });
  test("without a key only names are written; an empty set changes nothing", () => {
    const bare = notate(
      input(events, { key: null, staff: "treble", annotations: { degree: true, noteName: true } }),
    );
    expect(bare.abc.abc.split("\n").filter((l) => l.startsWith("w:"))).toEqual(["w:C4 F♯4 E4~G4 *"]);
    const none = notate(input(events, { staff: "treble", annotations: {} }));
    expect(none.score.annotations).toBeUndefined();
    expect(none.abc.abc).not.toContain("w:");
    expect(none.abc.abc).not.toContain("%%vocalfont");
  });
  test("above: stacked texts on the first piece only; percussion is never annotated", () => {
    const { abc } = notate(
      input(events, { staff: "treble", annotations: { degree: true, solfege: true, position: "above" } }),
    );
    // Chord members are joined by a thin space.
    expect(abc.abc).toContain('"^3\u20095""^mi\u2009sol"!class=oak-e2![EG]2- !class=oak-e2![EG]2');
    expect(abc.abc).not.toContain("w:");
    const drums = tracksOf(ev("bd:4 sd:4 bd:4 sd:4", "dr"));
    const perc = notate(input(drums, { staff: "percussion", annotations: { noteName: true } }));
    expect(perc.abc.abc).not.toContain("w:");
  });
  test("labels follow the spelling on the staff, also where the key never spells that way", () => {
    const p = (name: string) => {
      const e = ev(`${name}:4`)[0] as NEvent;
      return { midi: e.midi as number, name, letter: name[0] as string, alt: 0, oct: 4 };
    };
    expect(labelSpelled({ ...p("A#4"), alt: 1 }, C)).toEqual({ degree: "♯6", syllable: "li" });
    expect(labelSpelled({ ...p("Bb4"), alt: -1 }, C)).toEqual({ degree: "♭7", syllable: "te" });
    expect(labelSpelled({ ...p("Gb4"), alt: -1 }, C)).toEqual({ degree: "♭5", syllable: "se" });
    expect(labelSpelled(p("C4"), { tonic: "G#", mode: "major" }).degree).toBe("♭4");
    expect(labelSpelled(p("C4"), { tonic: "A", mode: "minor" })).toEqual({ degree: "♭3", syllable: "me" });
  });
});

describe("accidentals", () => {
  const abcOf = (list: string, key: KeySpec | null, bars = 1) =>
    notate(input(ev(list), { key, bars, staff: "treble" }))
      .abc.abc.split("\n")
      .slice(4)
      .join("\n");
  test("courtesy accidentals: after a bar that altered the note, and across octaves", () => {
    expect(abcOf("F#4:2 F#4:2 | F4:2 F4:2", C, 2)).toContain(
      "^F8 !class=oak-e1!F8 | !class=oak-e2!=F8 !class=oak-e3!F8",
    );
    expect(abcOf("F4:2 C5:2 | F#4:2 F4:2", G, 2)).toContain(
      "=F8 !class=oak-e1!c8 | !class=oak-e2!^F8 !class=oak-e3!=F8",
    );
    // A courtesy is printed once: the bar after next needs none.
    expect(abcOf("F#4:1 | F4:1 | F4:1", C, 3)).toContain("^F16 | !class=oak-e1!=F16 | !class=oak-e2!F16");
    expect(abcOf("B4:4 Bb5:4 B5:4 B4:4", C)).toContain(
      "B4 !class=oak-e1!_b4 !class=oak-e2!=b4 !class=oak-e3!B4",
    );
    expect(abcOf("Bb4:4 B5:4 B5:4 B4:4", C)).toContain(
      "_B4 !class=oak-e1!=b4 !class=oak-e2!b4 !class=oak-e3!=B4",
    );
  });
  test("a note tied over the bar line is not restated; the next one is", () => {
    expect(abcOf("r:2 F#4:2~ | F#4:4 F#4:4 F4:2", C, 2)).toContain(
      "^F8- | !class=oak-e0!F4 !class=oak-e1!^F4 !class=oak-e2!=F8",
    );
  });
  test("theoretical keys get an explicit signature and a warning; real keys do not", () => {
    const gs = notate(input(ev("G#4:1"), { key: { tonic: "G#", mode: "major" }, staff: "treble" }));
    expect(gs.abc.abc).toContain("K:C exp ^^f ^c ^g ^d ^a ^e ^b\n");
    expect(gs.score.warnings.map((w) => w.code)).toEqual(["abcjs-limit"]);
    const fb = notate(input(ev("Fb4:1"), { key: { tonic: "Fb", mode: "major" }, staff: "treble" }));
    expect(fb.abc.abc).toContain("K:C exp _b _e _a _d _g _c _f\n".replace("_b _e", "__b _e"));
    for (const k of ["C#", "Cb", "A#m", "Abm"]) {
      const key = k.endsWith("m")
        ? { tonic: k.slice(0, -1), mode: "minor" as const }
        : { tonic: k, mode: "major" as const };
      expect(notate(input(ev("C4:1"), { key, staff: "treble" })).score.warnings).toEqual([]);
    }
  });
  test("a chord on one staff step warns (abcjs draws the heads on top of each other)", () => {
    const { score } = notate(input(ev("[F4,F#4]:2 [C4,E4]:2"), { staff: "treble" }));
    expect(score.warnings).toEqual([
      { code: "abcjs-limit", bar: 0, message: "a chord holds two notes on one staff step (F4 F#4)" },
    ]);
  });
  test("every documented limit names what abcjs does and what the emitter writes", () => {
    expect(ABCJS_LIMITS.length).toBeGreaterThanOrEqual(8);
    for (const l of ABCJS_LIMITS) {
      expect(l.abcjs.length).toBeGreaterThan(20);
      expect(l.fallback.length).toBeGreaterThan(10);
    }
    expect(new Set(ABCJS_LIMITS.map((l) => l.id)).size).toBe(ABCJS_LIMITS.length);
  });
});

describe("hit-testing with measured ticks", () => {
  // A 4/4 bar from x 100 to 300 where abcjs drew a half note at 120 and two quarters at 200 and 250:
  // space is not proportional to time.
  const bar: BarGeometry = {
    x0: 100,
    x1: 300,
    cycle: 0,
    ticks: [
      { x: 120, onset: [0, 1] },
      { x: 200, onset: [1, 2] },
      { x: 250, onset: [3, 4] },
    ],
  };
  test("xToOnset interpolates between ticks; onsetX is its inverse at the ticks", () => {
    expect(xToOnset(120, [bar], M44, [1, 4])).toEqual([0, 1]);
    expect(xToOnset(200, [bar], M44, [1, 4])).toEqual([1, 2]);
    expect(xToOnset(250, [bar], M44, [1, 4])).toEqual([3, 4]);
    // Halfway between the half note and the first quarter: beat 2.
    expect(xToOnset(160, [bar], M44, [1, 4])).toEqual([1, 4]);
    expect(xToOnset(105, [bar], M44, [1, 4])).toEqual([0, 1]);
    expect(onsetX({ bars: [bar] }, [1, 2])).toBe(200);
    expect(onsetX({ bars: [bar] }, [3, 4])).toBe(250);
    expect(onsetX({ bars: [bar] }, [1, 4])).toBe(160);
  });
  test("hitTest snaps by ticks, in 3/4 too", () => {
    const geom: StaffGeometry = {
      staves: [
        {
          staff: "S1",
          clef: "treble",
          system: 0,
          topLineY: 100,
          lineSpacing: 10,
          y0: 40,
          y1: 200,
          bars: [
            {
              x0: 0,
              x1: 300,
              cycle: 2,
              ticks: [
                { x: 50, onset: [2, 1] },
                { x: 100, onset: [7, 3] },
              ],
            },
          ],
        },
      ],
      notes: [],
    };
    const h = hitTest(geom, { x: 100, y: 100 }, { meter: M34, key: G, grid: [1, 4] });
    expect(h).toMatchObject({ cycle: 2, onset: [7, 3], slot: 1, step: 0 });
    expect(h?.pitch?.name).toBe("F#5");
  });
});

describe("the note-list edit model: bars full, no ties or dots unless allowed", () => {
  const ctx: NoteListContext = { meter: M44, key: C, bars: 2 };
  const id = (list: string, midi: number, c: NoteListContext = ctx) =>
    (noteListInput(list, c).events.find((e) => e.midi === midi) as NEvent).id;

  test("plainNoteList fills rests on their own grid and writes one value per note", () => {
    const events = ev("r:8 C4:4 r:8 r:2");
    expect(plainNoteList(events, { meter: M44, bars: 1 })).toBe("r:8 C4:4 r:8 r:2");
    // The engraving ties that quarter over the beat; the answer value does not.
    expect(notate(input(events, { staff: "treble" })).abc.abc).toContain("C2-");
    expect(plainNoteList(ev("C4:2. D4:4"), { meter: M44, bars: 2, dots: true })).toBe("C4:2. D4:4 | r:1");
    expect(plainNoteList(ev("C4:2. D4:4"), { meter: M44, bars: 1 })).toBe("C4:2~ C4:4 D4:4");
    expect(plainNoteList(ev("(3:2 C4:8 D4:8 E4:8) r:4 r:2"), { meter: M44, bars: 1 })).toBeNull();
    expect(plainNoteList(ev("C4:4 E4:4", "main", M34), { meter: M34, bars: 2 })).toBe(
      "C4:4 E4:4 r:4 | r:2 r:4",
    );
  });
  test("insert across the bar line is shortened to it; with ties it carries over", () => {
    const out = editNoteList(
      "C4:2 D4:2 | r:1",
      { op: "insert", onset: [3, 4], dur: [1, 2], pitch: "G4" },
      ctx,
    );
    expect(out).toMatchObject({ list: "C4:2 D4:4 G4:4 | r:1", changed: true, clipped: true });
    const tied = editNoteList(
      "C4:2 D4:2 | r:1",
      { op: "insert", onset: [3, 4], dur: [1, 2], pitch: "G4" },
      { ...ctx, ties: true },
    );
    expect(tied.list).toBe("C4:2 D4:4 G4:4~ | G4:4 r:4 r:2");
    expect(tied.clipped).toBeUndefined();
    expect(tied.abc.abc).toContain("G4- | !class=oak-e2!G4");
  });
  test("a dotted length is refused unless dots are on; a length no value writes needs ties", () => {
    const dotted = editNoteList("r:1 | r:1", { op: "insert", onset: [0, 1], dur: [3, 8], pitch: "E4" }, ctx);
    expect(dotted).toMatchObject({ list: "r:1 | r:1", changed: false, refused: "needs-dot" });
    const ok = editNoteList(
      "r:1 | r:1",
      { op: "insert", onset: [0, 1], dur: [3, 8], pitch: "E4" },
      { ...ctx, dots: true },
    );
    expect(ok.list).toBe("E4:4. r:8 r:2 | r:1");
    const five = editNoteList("r:1 | r:1", { op: "insert", onset: [0, 1], dur: [5, 16], pitch: "E4" }, ctx);
    expect(five.refused).toBe("needs-tie");
    const tied = editNoteList(
      "r:1 | r:1",
      { op: "insert", onset: [0, 1], dur: [5, 16], pitch: "E4" },
      { ...ctx, ties: true },
    );
    expect(tied.list).toBe("E4:4~ E4:16 r:16 r:8 r:2 | r:1");
  });
  test("out of range, unknown ids and zero lengths are refused without changing the answer", () => {
    expect(
      editNoteList("C4:1 | r:1", { op: "insert", onset: [2, 1], dur: [1, 4], pitch: "E4" }, ctx).refused,
    ).toBe("outside");
    expect(editNoteList("C4:1 | r:1", { op: "delete", eventId: "nope" }, ctx).refused).toBe("not-found");
    expect(
      editNoteList("C4:1 | r:1", { op: "resize", eventId: id("C4:1 | r:1", 60), dur: [0, 1] }, ctx).refused,
    ).toBe("outside");
  });
  test("move keeps the length up to the bar line, replaces what it lands on, repitches on request", () => {
    const list = "C4:2 E4:4 F4:4 | G4:1";
    const moved = editNoteList(list, { op: "move", eventId: id(list, 60), onset: [1, 2], pitch: "D4" }, ctx);
    expect(moved).toMatchObject({ list: "r:2 D4:2 | G4:1", changed: true });
    const late = editNoteList(list, { op: "move", eventId: id(list, 60), onset: [3, 4] }, ctx);
    expect(late).toMatchObject({ list: "r:2 E4:4 C4:4 | G4:1", clipped: true });
    const over = editNoteList(list, { op: "move", eventId: id(list, 67), onset: [1, 1] }, ctx);
    expect(over.list).toBe("C4:2 E4:4 F4:4 | G4:1");
    expect(over.changed).toBe(false);
  });
  test("resize and accidental in a key; delete leaves a rest", () => {
    const g = { ...ctx, key: G };
    let list = "G4:4 F#4:4 E4:2 | D4:1";
    list = editNoteList(list, { op: "accidental", eventId: id(list, 66, g), alt: 0 }, g).list;
    expect(list).toBe("G4:4 F4:4 E4:2 | D4:1");
    list = editNoteList(list, { op: "resize", eventId: id(list, 67, g), dur: [1, 2] }, g).list;
    expect(list).toBe("G4:2 E4:2 | D4:1");
    const r = editNoteList(list, { op: "resize", eventId: id(list, 64, g), dur: [1, 1] }, g);
    expect(r).toMatchObject({ list: "G4:2 E4:2 | D4:1", clipped: true, changed: false });
    list = editNoteList(list, { op: "delete", eventId: id(list, 62, g) }, g).list;
    expect(list).toBe("G4:2 E4:2 | r:1");
    const out = editNoteList(list, { op: "accidental", eventId: id(list, 64, g), alt: -1 }, g);
    expect(out.list).toBe("G4:2 Eb4:2 | r:1");
    expect(out.abc.abc).toContain("_E8");
  });
  test("bass and grand answers: the edit lands on the right staff", () => {
    const bass = editNoteList(
      "r:1",
      { op: "insert", onset: [0, 1], dur: [1, 1], pitch: "C3" },
      {
        ...ctx,
        bars: 1,
        staff: "bass",
      },
    );
    expect(bass.abc.abc).toContain("K:C clef=bass");
    const grand = editNoteList(
      "C5:2 r:2",
      { op: "insert", onset: [1, 2], dur: [1, 2], pitch: "C3" },
      {
        ...ctx,
        bars: 1,
        staff: "grand",
      },
    );
    expect(grand.list).toBe("C5:2 C3:2");
    expect(grand.score.staves.map((s) => s.id)).toEqual(["RH", "LH"]);
  });
  test("chords stay chords", () => {
    const list = "[C4,E4,G4]:2 r:2";
    const out = editNoteList(
      list,
      { op: "insert", onset: [1, 2], dur: [1, 2], pitch: "B3" },
      { ...ctx, bars: 1 },
    );
    expect(out.list).toBe("[C4,E4,G4]:2 B3:2");
    const added = editNoteList(
      out.list,
      { op: "insert", onset: [1, 2], dur: [1, 2], pitch: "D4", keep: true },
      { ...ctx, bars: 1 },
    );
    expect(added.list).toBe("[C4,E4,G4]:2 [B3,D4]:2");
  });
});

describe("the final barline", () => {
  test("ends the piece; a page of a longer piece closes with a plain barline", () => {
    const score = buildScore(input(ev("C4:4 D4:4 E4:4 F4:4 G4:1"), { bars: 2 }));
    expect(toAbc(score).abc).toMatch(/ \|\]\n/);
    const page = toAbc(score, { finalBar: false }).abc;
    expect(page).not.toContain("|]");
    expect(page.match(/\|/g)?.length).toBe(2);
  });
});
