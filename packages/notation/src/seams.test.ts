// Wave 3 seams of @oak/notation (docs/design/wave3.md §3.1): options and annotations, pure staff geometry
// and hit-testing, and the note-list edit model the staff-input widget drives.
import { describe, expect, test } from "bun:test";
import type { KeySpec, NEvent } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import {
  buildScore,
  editNoteList,
  headAt,
  hitTest,
  type NotationInput,
  NotationNotBuiltError,
  noteAnnotations,
  noteAt,
  noteListInput,
  onsetX,
  parseNoteList,
  resolveKeySignature,
  type StaffGeometry,
  staffAt,
  stepY,
  toAbc,
} from "./index.ts";

const C: KeySpec = { tonic: "C", mode: "major" };
const D: KeySpec = { tonic: "D", mode: "major" };
const M44 = METERS["4/4"];

describe("options", () => {
  test("key signatures from fifths, names and keys", () => {
    expect(resolveKeySignature(2)).toEqual(D);
    expect(resolveKeySignature(-3)).toEqual({ tonic: "Eb", mode: "major" });
    expect(resolveKeySignature("F#m")).toEqual({ tonic: "F#", mode: "minor" });
    expect(resolveKeySignature("C4:major")).toEqual(C);
    expect(resolveKeySignature(null)).toBeNull();
    expect(() => resolveKeySignature(9)).toThrow(RangeError);
  });
  test("annotations: degree, syllable and name per engraved note, tie continuations skipped", () => {
    const events = parseNoteList("D4:4 F#4:4 [A4,D5]:4 C5:4~ | C5:4 r:2.", { meter: M44 });
    const score = buildScore({ events, meter: M44, key: D, bars: 2, staff: "treble" });
    const ann = noteAnnotations(score, { degree: true, solfege: true, noteName: true });
    expect(ann.map((a) => a.degree)).toEqual(["1", "3", "5 1", "♭7"]);
    expect(ann.map((a) => a.solfege)).toEqual(["do", "mi", "sol do", "te"]);
    expect(ann.map((a) => a.noteName)).toEqual(["D4", "F♯4", "A4 D5", "C5"]);
    // Without a key, only names.
    const bare = buildScore({ events, meter: M44, key: null, bars: 2, staff: "treble" });
    expect(noteAnnotations(bare, { degree: true, noteName: true }, null)[0]).toEqual({
      n: 0,
      noteName: "D4",
    });
  });
});

// A measured two-bar treble staff over a two-bar bass staff (a grand staff, one system), in pixels.
const GEOM: StaffGeometry = {
  staves: [
    {
      staff: "RH",
      clef: "treble",
      system: 0,
      topLineY: 100,
      lineSpacing: 10,
      y0: 60,
      y1: 170,
      bars: [
        { x0: 50, x1: 250, cycle: 0 },
        { x0: 250, x1: 450, cycle: 1 },
      ],
    },
    {
      staff: "LH",
      clef: "bass",
      system: 0,
      topLineY: 200,
      lineSpacing: 10,
      y0: 170,
      y1: 280,
      bars: [
        { x0: 50, x1: 250, cycle: 0 },
        { x0: 250, x1: 450, cycle: 1 },
      ],
    },
  ],
  notes: [
    {
      n: 0,
      staff: "RH",
      box: { x: 60, y: 130, width: 12, height: 40 },
      heads: [{ x: 60, y: 135, width: 12, height: 9 }],
    },
    {
      n: 1,
      staff: "RH",
      box: { x: 110, y: 115, width: 12, height: 40 },
      heads: [
        { x: 110, y: 135, width: 12, height: 9 },
        { x: 110, y: 125, width: 12, height: 9 },
      ],
    },
  ],
};

describe("geometry and hit-testing", () => {
  test("pointer → staff, bar, slot, step and pitch in the clef and key", () => {
    // Treble, bar 2, third quarter (x = 250 + 0.5 · 200), on the bottom line (E4; in D major still E4).
    const h = hitTest(GEOM, { x: 350, y: 140 }, { meter: M44, key: D, grid: [1, 4] });
    expect(h).toMatchObject({
      staff: "RH",
      clef: "treble",
      cycle: 1,
      onset: [3, 2],
      slot: 2,
      step: 8,
      note: null,
    });
    expect(h?.pitch?.name).toBe("E4");
    // The top space of the treble staff in D major is E5; the top line is F#5.
    expect(hitTest(GEOM, { x: 60, y: 100 }, { meter: M44, key: D })?.pitch?.name).toBe("F#5");
    // Bass staff: top line A3; middle line D3. Default grid 1/16: x = 50 + 200·5/16 → slot 5.
    const b = hitTest(GEOM, { x: 112.5, y: 220 }, { meter: M44, key: C });
    expect(b).toMatchObject({ staff: "LH", clef: "bass", slot: 5, step: 4, onset: [5, 16] });
    expect(b?.pitch?.name).toBe("D3");
    expect(hitTest(GEOM, { x: 10, y: 140 }, { meter: M44, key: C })).toBeNull();
  });
  test("notes and chord heads under the pointer", () => {
    expect(noteAt(GEOM, { x: 65, y: 150 })).toBe(0);
    expect(noteAt(GEOM, { x: 200, y: 150 })).toBeNull();
    const chord = GEOM.notes[1] as StaffGeometry["notes"][number];
    expect(headAt(chord, { x: 115, y: 127 })).toBe(1);
    expect(headAt(chord, { x: 115, y: 140 })).toBe(0);
    expect(hitTest(GEOM, { x: 116, y: 128 }, { meter: M44, key: C })?.note).toBe(1);
  });
  test("bands, ghost positions", () => {
    expect(staffAt(GEOM, 175)?.staff).toBe("LH");
    expect(staffAt(GEOM, 10)?.staff).toBe("RH");
    expect(stepY({ topLineY: 100, lineSpacing: 10 }, 8)).toBe(140);
    expect(onsetX(GEOM.staves[0] as StaffGeometry["staves"][number], [3, 2])).toBe(350);
    expect(onsetX(GEOM.staves[0] as StaffGeometry["staves"][number], [5, 1])).toBeNull();
  });
  test("the not-built error is typed", () => {
    const e = new NotationNotBuiltError("measureStaff");
    expect(e).toBeInstanceOf(Error);
    expect(e.code).toBe("notation_not_built");
  });
});

describe("the note-list edit model", () => {
  const ctx = { meter: M44, key: C, bars: 1 };
  const idOf = (list: string, midi: number): string =>
    (noteListInput(list, ctx).events.find((e) => e.midi === midi) as NEvent).id;

  test("add, move, delete, change duration, accidental", () => {
    let list = "C4:4 D4:4 E4:4 F4:4";
    list = editNoteList(list, { op: "insert", onset: [1, 4], dur: [1, 2], pitch: "G4" }, ctx).list;
    expect(list).toBe("C4:4 G4:2 F4:4");
    list = editNoteList(list, { op: "move", eventId: idOf(list, 65), onset: [0, 1] }, ctx).list;
    expect(list).toBe("F4:4 G4:2 r:4");
    list = editNoteList(list, { op: "move", eventId: idOf(list, 67), onset: [1, 2], pitch: "A4" }, ctx).list;
    expect(list).toBe("F4:4 r:4 A4:2");
    list = editNoteList(list, { op: "accidental", eventId: idOf(list, 69), alt: -1 }, ctx).list;
    expect(list).toBe("F4:4 r:4 Ab4:2");
    list = editNoteList(list, { op: "accidental", eventId: idOf(list, 65), alt: 1 }, ctx).list;
    expect(list).toBe("F#4:4 r:4 Ab4:2");
    list = editNoteList(list, { op: "resize", eventId: idOf(list, 66), dur: [1, 2] }, ctx).list;
    expect(list).toBe("F#4:2 Ab4:2");
    list = editNoteList(list, { op: "delete", eventId: idOf(list, 68) }, ctx).list;
    expect(list).toBe("F#4:2 r:2");
  });
  test("an empty answer engraves a rest bar; edits regenerate ABC with stable classes", () => {
    const out = editNoteList(
      "",
      { op: "insert", onset: [0, 1], dur: [1, 4], pitch: "E4" },
      { ...ctx, bars: 2 },
    );
    expect(out.list).toBe("E4:4 r:4 r:2 | r:1");
    expect(out.abc.abc).toContain("oak-e0");
    expect(out.abc.idMap[0]?.pitches).toEqual(["E4"]);
  });
  test("a bass-clef answer engraves on the bass staff", () => {
    const input: NotationInput = noteListInput("C3:2 G2:2", { ...ctx, staff: "bass" });
    expect(toAbc(buildScore(input)).abc).toContain("clef=bass");
  });
});
