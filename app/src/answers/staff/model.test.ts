import { describe, expect, test } from "bun:test";
import type { Rat } from "@oak/content-kit";
import type { StaffGeometry } from "@oak/notation";
import { intervalOf } from "@oak/theory";
import {
  applyStaffEdit,
  describeNote,
  engrave,
  initialCursor,
  ledgerSteps,
  nearestLetter,
  normalizeStaffValue,
  paletteDurations,
  pitchAt,
  pointerHit,
  refusalText,
  type StaffCursor,
  type StaffKeyInput,
  type StaffSpec,
  snapGrid,
  snapX,
  staffContext,
  staffEditOutcome,
  staffKey,
  staffNotes,
  stepOf,
  xOfOnset,
} from "./model.ts";

const spec = (over: Partial<StaffSpec> = {}): StaffSpec => ({
  ui: "staff-input",
  clef: "treble",
  bars: 1,
  palette: { durations: ["4"], accidentals: true, ties: false, rests: true },
  ...over,
});

/** Types keys into the model the way the widget does: each key's edit applied to the value. */
function typeKeys(s: StaffSpec, keys: (string | StaffKeyInput)[], start = "") {
  const ctx = staffContext(s);
  let value = start;
  let cursor: StaffCursor = initialCursor(s);
  const said: string[] = [];
  const played: number[] = [];
  for (const k of keys) {
    const input = typeof k === "string" ? { key: k } : k;
    const e = engrave(value, ctx);
    if (!e.ok) throw new Error(e.error);
    const r = staffKey(cursor, input, { spec: s, ctx, notes: staffNotes(e.score) });
    if (!r) continue;
    if (r.edit) {
      const next = applyStaffEdit(value, r.edit, ctx);
      if (next === null) throw new Error(`edit failed: ${JSON.stringify(r.edit)}`);
      value = next;
    }
    cursor = r.cursor;
    if (r.say) said.push(r.say);
    if (r.play) played.push(...r.play);
  }
  return { value, cursor, said, played };
}

describe("value", () => {
  test("a bare pitch list (the lesson host's reveal) reads as quarters", () => {
    expect(normalizeStaffValue("C4 E4 G4 C5")).toBe("C4:4 E4:4 G4:4 C5:4");
    expect(normalizeStaffValue("F#4:4 r:4 | Ab4:2")).toBe("F#4:4 r:4 | Ab4:2");
  });
  test("engrave never throws: an unreadable list says why", () => {
    const r = engrave("C4:3", staffContext(spec()));
    expect(r.ok).toBe(false);
    const ok = engrave("C4 E4", staffContext(spec()));
    expect(ok.ok && staffNotes(ok.score).map((n) => n.pitches[0]?.name)).toEqual(["C4", "E4"]);
  });
});

describe("pitches", () => {
  test("lines and spaces follow the clef: treble top line F5, bottom line E4; bass top line A3", () => {
    expect(pitchAt(stepOf(pitchAt(38, null).dia, "treble"), null).dia).toBe(0);
    expect(stepOf(38, "treble")).toBe(0);
    expect(pitchAt(38 - 8, null).name).toBe("E4");
    expect(pitchAt(26, null).name).toBe("A3");
    expect(pitchAt(26 - 8, null).name).toBe("G2");
  });
  test("the key signature applies: F in D major is F♯ (a note on the top line sounds F#5)", () => {
    const key = { tonic: "D", mode: "major" } as const;
    expect(pitchAt(38, key).name).toBe("F#5");
    expect(pitchAt(38, key).midi).toBe(78);
    expect(pitchAt(4 * 7 + 6, { tonic: "F", mode: "major" }).name).toBe("Bb4");
    expect(pitchAt(4 * 7 + 6, { tonic: "F", mode: "major" }, 0).name).toBe("B4");
  });
  test("ledger lines: middle C on treble needs one, A5 one above", () => {
    expect(ledgerSteps(stepOf(28, "treble"))).toEqual([10]);
    expect(ledgerSteps(stepOf(40, "treble"))).toEqual([-2]);
    expect(ledgerSteps(4)).toEqual([]);
  });
  test("the nearest letter: from E4, B is B3 (a fourth down beats a fifth up); from G4, C is C5", () => {
    expect(pitchAt(nearestLetter("b", 30), null).name).toBe("B3");
    expect(pitchAt(nearestLetter("C", 32), null).name).toBe("C5");
    expect(intervalOf("E4", "B3").name).toBe("P4");
  });
});

describe("keyboard grammar", () => {
  test("letters place quarters and step on; the answer is the note list", () => {
    const r = typeKeys(spec({ bars: 1 }), ["c", "e", "g", "c"]);
    // Starting from B4: C5 (nearest C), then E5, G5, C6? No: each letter is nearest to the previous note.
    expect(r.value).toBe("C5:4 E5:4 G5:4 C6:4");
    expect(r.played).toEqual([72, 76, 79, 84]);
  });
  test("moving the ghost down first, then C E G C writes the U02.L04 answer", () => {
    const s = spec();
    const down = Array.from({ length: 7 }, () => "ArrowDown");
    const r = typeKeys(s, [...down, "c", "e", "g", "c"]);
    expect(r.value).toBe("C4:4 E4:4 G4:4 C5:4");
    expect(r.said.at(-1)).toBe("C5, quarter, bar 1 beat 4");
  });
  test("E then - is E♭; # sharpens; in G major F is written F♯", () => {
    const r = typeKeys(spec(), ["e", "-"]);
    expect(r.value.startsWith("Eb5:4")).toBe(true);
    const g = typeKeys(spec({ key: { tonic: "G", mode: "major" } }), ["f"]);
    expect(g.value.startsWith("F#4:4")).toBe(true);
    const s2 = typeKeys(spec(), ["c", "ArrowLeft", "#"]);
    expect(s2.value.startsWith("C#5:4")).toBe(true);
  });
  test("b is always the note B: g a b writes G A B; an accidental alters a placed note once", () => {
    expect(typeKeys(spec(), ["b"]).value.startsWith("B4:4")).toBe(true);
    expect(typeKeys(spec(), ["g", "a", "b"]).value).toBe("G4:4 A4:4 B4:4 r:4");
    expect(typeKeys(spec(), ["e", "-", "b"]).value.startsWith("Eb5:4 B4:4")).toBe(true);
  });
  test("arrows on a placed note repitch it in the key; Shift a semitone; Mod an octave", () => {
    const s = spec({ key: { tonic: "D", mode: "major" } });
    const r = typeKeys(s, ["e", "ArrowLeft", "ArrowUp"]);
    expect(r.value.startsWith("F#5:4")).toBe(true);
    const r2 = typeKeys(s, ["e", "ArrowLeft", { key: "ArrowDown", mod: true }]);
    expect(r2.value.startsWith("E4:4")).toBe(true);
    const r3 = typeKeys(s, ["e", "ArrowLeft", { key: "ArrowUp", shift: true }]);
    expect(r3.value.startsWith("E#5:4")).toBe(true);
  });
  test("durations: digits pick palette values only; a half note fills two beats", () => {
    const s = spec({ palette: { durations: ["4", "2"], accidentals: false, ties: false, rests: true } });
    const r = typeKeys(s, ["5", "c", "4", "d", "e"]);
    expect(r.value).toBe("C5:2 D5:4 E5:4");
    const refused = typeKeys(s, ["3"]);
    expect(refused.said[0]).toBe("This answer has no eighth notes.");
  });
  test("at the end the cursor stays on the last note (typing overwrites it); no room is refused", () => {
    const s = spec({ palette: { durations: ["2"], accidentals: false, ties: false, rests: true } });
    expect(typeKeys(s, ["c", "d", "e"]).value).toBe("C5:2 E5:2");
    const s2 = spec({ palette: { durations: ["4", "2"], accidentals: false, ties: false, rests: true } });
    const r = typeKeys(s2, ["c", "d", "e", "f", "5"]);
    expect(r.value).toBe("C5:4 D5:4 E5:4 F5:4");
    expect(r.said.at(-1)).toBe("No room for a half here.");
    expect(typeKeys(s2, ["c", "d", "e", "5", "f"]).said.at(-1)).toContain("No room for a half here");
  });
  test("Backspace deletes the note before the cursor; rests with 0", () => {
    const r = typeKeys(spec(), ["c", "d", "Backspace"]);
    expect(r.value).toBe("C5:4 r:4 r:2");
    const rest = typeKeys(spec(), ["0", "d"]);
    expect(rest.value).toBe("r:4 D5:4 r:2");
  });
  test("accidentals off: the palette says so instead of altering", () => {
    const s = spec({ palette: { durations: ["4"], accidentals: false, ties: false, rests: false } });
    const r = typeKeys(s, ["c", "ArrowLeft", "#"]);
    expect(r.value.startsWith("C5:4")).toBe(true);
    expect(r.said.at(-1)).toBe("This answer has no sharps or flats to add.");
  });
  test("bass clef: the ghost starts on D3 (the middle line)", () => {
    const s = spec({ clef: "bass" });
    expect(pitchAt(initialCursor(s).dia, null).name).toBe("D3");
    expect(typeKeys(s, ["g"]).value.startsWith("G3:4")).toBe(true);
  });
  test("grand staff: one voice split at middle C", () => {
    const s = spec({ clef: "grand", bars: 1 });
    const down = Array.from({ length: 12 }, () => "ArrowDown");
    const r = typeKeys(s, [...down, "c", "g", "c"]);
    expect(r.value).toBe("C3:4 G2:4 C3:4 r:4");
    const e = engrave(r.value, staffContext(s));
    expect(e.ok && staffNotes(e.score).map((n) => n.staff)).toEqual(["LH", "LH", "LH"]);
  });
  test("grand staff: a right-hand note over a left-hand one keeps both hands", () => {
    const s = spec({ clef: "grand", bars: 1 });
    const out = staffEditOutcome(
      "C3:4 r:4 r:2",
      { op: "insert", onset: [0, 1] as Rat, dur: [1, 4] as Rat, pitch: "E4" },
      staffContext(s),
    );
    expect(out?.list).toMatch(/C3/);
    expect(out?.list).toMatch(/E4/);
  });
});

describe("reading notes aloud", () => {
  test('"E4, quarter, bar 1 beat 2"', () => {
    const e = engrave("C4:4 E4:4 F#4:8 G4:8 r:4 | Bb4:2.", staffContext(spec({ bars: 2 })));
    if (!e.ok) throw new Error(e.error);
    const lines = staffNotes(e.score).map(describeNote);
    expect(lines).toEqual([
      "C4, quarter, bar 1 beat 1",
      "E4, quarter, bar 1 beat 2",
      "F sharp4, eighth, bar 1 beat 3",
      "G4, eighth, bar 1 the and of beat 3",
      "B flat4, dotted half, bar 2 beat 1",
    ]);
  });
});

describe("palette", () => {
  test("durations longest first; the grid is the shortest", () => {
    const s = spec({ palette: { durations: ["8", "4", "2"], accidentals: false, ties: false, rests: true } });
    expect(paletteDurations(s).map((d) => d.token)).toEqual(["2", "4", "8"]);
    expect(snapGrid(s)).toEqual([1, 8] as Rat);
  });
});

describe("pointer", () => {
  const bar = { x0: 100, x1: 300, cycle: 0 };
  test("onsets map through the engraved anchors, not linearly", () => {
    const anchors = [
      { x: 110, onset: [0, 1] as Rat },
      { x: 150, onset: [1, 4] as Rat },
      { x: 260, onset: [1, 2] as Rat },
    ];
    expect(xOfOnset(bar, anchors, [0, 1])).toBe(110);
    expect(xOfOnset(bar, anchors, [1, 4])).toBe(150);
    expect(xOfOnset(bar, [], [1, 2])).toBe(200);
    expect(xOfOnset(bar, anchors, [3, 4])).toBe(280);
    expect(snapX(bar, anchors, 240, [1, 4]).onset).toEqual([1, 2]);
    expect(snapX(bar, anchors, 155, [1, 4]).onset).toEqual([1, 4]);
  });
  test("y snaps to lines and spaces; the key applies", () => {
    const geom: StaffGeometry = {
      staves: [
        {
          staff: "S1",
          clef: "treble",
          system: 0,
          topLineY: 50,
          lineSpacing: 10,
          y0: 0,
          y1: 140,
          bars: [bar],
        },
      ],
      notes: [],
    };
    const s = spec({ key: { tonic: "D", mode: "major" } });
    const meter = staffContext(s).meter;
    const top = pointerHit(geom, [], { x: 101, y: 51 }, s, meter);
    expect(top?.pitch.name).toBe("F#5");
    expect(top?.onset).toEqual([0, 1]);
    const bottom = pointerHit(geom, [], { x: 290, y: 88 }, s, meter);
    expect(bottom?.pitch.name).toBe("E4");
    expect(bottom?.step).toBe(8);
    expect(bottom?.onset).toEqual([3, 4]);
    const below = pointerHit(geom, [], { x: 160, y: 101 }, s, meter);
    expect(below?.pitch.name).toBe("C#4");
    expect(pointerHit({ staves: [], notes: [] }, [], { x: 0, y: 0 }, s, meter)).toBeNull();
  });
});

describe("an edit that does not fit says why", () => {
  // Durations and onsets are in cycles (one bar of 4/4 = 1).
  const r = (n: number, d: number): Rat => [n, d] as Rat;
  test("a half note on beat 4 is shortened to the bar line (no ties in this palette)", () => {
    const s = spec({
      bars: 2,
      palette: { durations: ["2", "4"], accidentals: true, ties: false, rests: true },
    });
    const out = staffEditOutcome(
      "",
      { op: "insert", onset: r(3, 4), dur: r(1, 2), pitch: "G4" },
      staffContext(s),
    );
    expect(out?.clipped).toBe(true);
    expect(out?.refused).toBeNull();
    expect(refusalText(out as never)).toMatch(/bar line/);
  });
  test("a note past the end of the answer is refused, and the value is unchanged", () => {
    const s = spec();
    const out = staffEditOutcome(
      "C4:4",
      { op: "insert", onset: r(2, 1), dur: r(1, 4), pitch: "G4" },
      staffContext(s),
    );
    expect(out?.refused).toBe("outside");
    expect(refusalText(out as never)).toMatch(/past the end/);
  });
  test("ties and dots follow the palette", () => {
    expect(staffContext(spec()).ties).toBe(false);
    expect(staffContext(spec()).dots).toBe(false);
    const dotted = spec({ palette: { durations: ["4.", "8"], accidentals: false, ties: true, rests: true } });
    expect(staffContext(dotted)).toMatchObject({ ties: true, dots: true });
    expect(refusalText({ refused: null, clipped: false })).toBeNull();
  });
});
