// Ties, dotted values and triplets in the staff input (docs/design/wave6.md §3.4): what a palette offers, each edit
// on the note list, what the grader will read (a tied note is one event, a triplet three events of a third of the
// beat), and the keyboard grammar. Every list here is engraved by @oak/notation, so the spellings are real.
import { describe, expect, test } from "bun:test";
import { R } from "@oak/content-kit";
import { editNoteList, parseNoteList, scoreRhythm } from "@oak/notation";
import { METERS } from "@oak/theory";
import {
  describeNote,
  engrave,
  initialCursor,
  type StaffCursor,
  type StaffSpec,
  staffContext,
  staffKey,
  staffNotes,
} from "./model.ts";
import {
  applyRhythmEdit,
  canonicalRhythmList,
  groupStart,
  lengthName,
  parseTriplet,
  RHYTHM_KEYS,
  type RhythmEdit,
  rhythmContext,
  rhythmKey,
  rhythmPalette,
  rhythmRefusalText,
  tokenCycles,
  tripletGroupsOfValue,
  tripletTokens,
} from "./rhythm.ts";

const spec = (durations: string[], ties: boolean, bars = 2): StaffSpec =>
  ({
    ui: "staff-input",
    clef: "treble",
    bars,
    palette: { durations, accidentals: false, ties, rests: true },
  }) as StaffSpec;

const FULL = spec(["1", "2", "4", "4.", "8", "8t"], true);
const P = rhythmPalette(FULL);
const CTX = rhythmContext(staffContext(FULL, METERS["4/4"]), P);
const idOf = (list: string, i: number, meter = METERS["4/4"]) =>
  (parseNoteList(list, { meter })[i] as { id: string }).id;
const edit = (list: string, e: RhythmEdit, ctx = CTX, p = P) => applyRhythmEdit(list, e, ctx, p);
const events = (list: string, meter = METERS["4/4"]) =>
  parseNoteList(list, { meter }).map((e) => `${e.written}@${R.str(e.onset)}+${R.str(e.dur)}`);

describe("the rhythm palette", () => {
  test("ties, dots and triplet values are read from the palette", () => {
    expect(rhythmPalette(spec(["4", "8"], false))).toEqual({ ties: false, dots: false, triplets: [] });
    expect(rhythmPalette(spec(["4", "4.", "8", "8t", "4t"], true))).toEqual({
      ties: true,
      dots: true,
      triplets: [
        { token: "4t", base: 4 },
        { token: "8t", base: 8 },
      ],
    });
    expect(parseTriplet("8t")).toEqual({ token: "8t", base: 8 });
    expect(parseTriplet("8.")).toBeNull();
    expect(parseTriplet("2t")).toBeNull();
  });
  test("the notation context takes ties and dots from it", () => {
    const s = spec(["4", "4.", "8"], true);
    const ctx = rhythmContext(staffContext(s, METERS["4/4"]), rhythmPalette(s));
    expect([ctx.ties, ctx.dots]).toEqual([true, true]);
  });
  test("lengths in words and in cycles", () => {
    expect(lengthName("4.")).toBe("dotted quarter");
    expect(lengthName("8t")).toBe("eighth-note triplet");
    expect(tokenCycles("8t", METERS["4/4"])).toEqual([1, 12]);
    expect(tokenCycles("4.", METERS["6/8"])).toEqual([1, 2]);
    expect(tokenCycles("x", METERS["4/4"])).toBeNull();
    expect(RHYTHM_KEYS).toEqual({ tie: "t", dot: ".", triplet: ";" });
  });
});

describe("ties", () => {
  test("a tie joins a note to the same note after it: one event for the grader", () => {
    const a = "E4:4 E4:4 G4:2";
    const r = edit(a, { op: "tie", eventId: idOf(a, 0), on: true });
    // Two quarters tied inside the bar are a half note: the staff writes the one value.
    expect(r).toEqual({ list: "E4:2 G4:2 | r:1", refused: null, clipped: false });
    expect(events(r.list)).toEqual(["E4@0+1/2", "G4@1/2+1/2"]);
  });
  test("over the bar line the tie is written, and it is still one note", () => {
    const a = "C4:2 D4:4 E4:4 | E4:4 r:4 r:2";
    const r = edit(a, { op: "tie", eventId: idOf(a, 2), on: true });
    expect(r.list).toBe("C4:2 D4:4 E4:4~ | E4:4 r:4 r:2");
    expect(events(r.list)).toEqual(["C4@0+1/2", "D4@1/2+1/4", "E4@3/4+1/2"]);
    const e = engrave(r.list, CTX);
    expect(e.ok && scoreRhythm(e.score)).toMatchObject({ ties: 1, tiesAcrossBar: 1 });
    expect(e.ok && staffNotes(e.score).map((n) => n.tied)).toEqual([false, false, true]);
    // Untie: both notes come back.
    const back = edit(r.list, { op: "tie", eventId: idOf(r.list, 2), on: false });
    expect(back.list).toBe(a);
    expect(events(back.list)).toHaveLength(4);
  });
  test("with nothing after it, a fill length holds the note on over a rest or the bar line", () => {
    const a = "C4:2 D4:4 E4:4 | r:1";
    const r = edit(a, { op: "tie", eventId: idOf(a, 2), on: true, fill: "4" });
    expect(r.list).toBe("C4:2 D4:4 E4:4~ | E4:4 r:4 r:2");
    // Another note is in the way, or the answer ends: refused, the list is unchanged.
    const b = "C4:2 D4:4 E4:4 | F4:1";
    expect(edit(b, { op: "tie", eventId: idOf(b, 2), on: true, fill: "4" })).toEqual({
      list: b,
      refused: "no-next-note",
      clipped: false,
    });
    const c = "C4:1 | D4:2 E4:2";
    expect(edit(c, { op: "tie", eventId: idOf(c, 2), on: true, fill: "4" }).refused).toBe("no-next-note");
    expect(edit(c, { op: "tie", eventId: idOf(c, 0), on: true }).refused).toBe("no-next-note");
    expect(rhythmRefusalText("no-next-note")).toContain("A tie joins a note to the same note after it");
  });
  test("a note written as one value has no tie to remove; a palette without ties refuses", () => {
    const a = "C4:2 D4:2";
    expect(edit(a, { op: "tie", eventId: idOf(a, 0), on: false }).refused).toBe("no-tie");
    const plain = spec(["4"], false);
    expect(
      applyRhythmEdit(
        a,
        { op: "tie", eventId: idOf(a, 0), on: true },
        staffContext(plain),
        rhythmPalette(plain),
      ),
    ).toEqual({ list: a, refused: "not-offered", clipped: false });
    expect(edit(a, { op: "tie", eventId: "nope", on: true }).refused).toBe("not-found");
  });
  test("in 6/8 a quarter is held over the bar line", () => {
    const s = spec(["4.", "4", "8"], true);
    const ctx = rhythmContext(staffContext(s, METERS["6/8"]), rhythmPalette(s));
    const a = "C4:4 D4:4 E4:4 | r:2.";
    const r = applyRhythmEdit(
      a,
      { op: "tie", eventId: idOf(a, 2, METERS["6/8"]), on: true, fill: "4" },
      ctx,
      rhythmPalette(s),
    );
    expect(r.list).toBe("C4:4 D4:4 E4:4~ | E4:4 r:4 r:4");
  });
});

describe("dots", () => {
  test("a dot makes the note half as long again and takes the time from what follows", () => {
    const a = "C4:4 D4:4 E4:2";
    const r = edit(a, { op: "dot", eventId: idOf(a, 0), dots: 1 });
    expect(r.list).toBe("C4:4. D4:8 E4:2 | r:1");
    const e = engrave(r.list, CTX);
    expect(e.ok && scoreRhythm(e.score).dotted).toBe(1);
    // Undotting leaves a rest where the dot was.
    const back = edit(r.list, { op: "dot", eventId: idOf(r.list, 0), dots: 0 });
    expect(back.list).toBe("C4:4 r:8 D4:8 E4:2 | r:1");
  });
  test("a palette without dotted values refuses", () => {
    const s = spec(["4", "8"], true);
    const a = "C4:4 D4:4 E4:2";
    expect(
      applyRhythmEdit(a, { op: "dot", eventId: idOf(a, 0), dots: 1 }, staffContext(s), rhythmPalette(s))
        .refused,
    ).toBe("not-offered");
  });
});

describe("triplets", () => {
  test("a group is three values in the time of two, written as triplet values", () => {
    const a = "C4:4 D4:4 E4:2";
    const r = edit(a, { op: "triplet", onset: [0, 1], base: 8, pitches: ["C4", "D4", "E4"] });
    expect(r.list).toBe("C4:8t D4:8t E4:8t D4:4 E4:2 | r:1");
    // Three events of a third of the beat: what the `events` matcher compares.
    expect(events(r.list).slice(0, 3)).toEqual(["C4@0+1/12", "D4@1/12+1/12", "E4@1/6+1/12"]);
    const e = engrave(r.list, CTX);
    expect(e.ok && scoreRhythm(e.score).tuplets).toEqual([{ p: 3, q: 2, r: 3, bar: 0 }]);
    expect(e.ok && staffNotes(e.score).map((n) => n.tuplet)).toEqual([true, true, true, false, false]);
    expect(tripletGroupsOfValue(r.list, CTX)).toEqual([{ onset: [0, 1], span: [1, 4], base: 8 }]);
  });
  test("one value at a time: the first key writes the whole bracket, the others change it in place", () => {
    let v = edit("", { op: "triplet-note", onset: [0, 1], base: 8, pitch: "C4" }).list;
    expect(v).toBe("C4:8t C4:8t C4:8t r:4 r:2 | r:1");
    v = edit(v, { op: "triplet-note", onset: [1, 12], base: 8, pitch: "D4" }).list;
    v = edit(v, { op: "triplet-note", onset: [1, 6], base: 8, pitch: "E4" }).list;
    expect(v).toBe("C4:8t D4:8t E4:8t r:4 r:2 | r:1");
    // A rest inside the group keeps the group: rests fill it.
    v = edit(v, { op: "triplet-note", onset: [1, 12], base: 8, pitch: null }).list;
    expect(v).toBe("C4:8t r:8t E4:8t r:4 r:2 | r:1");
    expect(events(v)).toEqual(["C4@0+1/12", "E4@1/6+1/12"]);
    // A rest where no group is changes nothing.
    expect(edit("C4:4 D4:4 E4:2", { op: "triplet-note", onset: [1, 4], base: 8, pitch: null }).list).toBe(
      "C4:4 D4:4 E4:2",
    );
    // A new group on beat 4 replaces the plain note there and leaves the rest alone.
    expect(edit("C4:2 D4:4 E4:4", { op: "triplet-note", onset: [3, 4], base: 8, pitch: "A4" }).list).toBe(
      "C4:2 D4:4 A4:8t A4:8t A4:8t | r:1",
    );
  });
  test("a group starts on its own beat and stays in its bar; triplets belong to simple meters", () => {
    const a = "C4:4 D4:4 E4:2";
    expect(edit(a, { op: "triplet", onset: [1, 8], base: 8, pitches: ["C4", "D4", "E4"] })).toEqual({
      list: a,
      refused: "crosses-bar",
      clipped: false,
    });
    expect(edit(a, { op: "triplet", onset: [2, 1], base: 8, pitches: ["C4", null, null] }).refused).toBe(
      "crosses-bar",
    );
    expect(edit(a, { op: "triplet", onset: [0, 1], base: 4, pitches: ["C4", null, null] }).refused).toBe(
      "not-offered",
    );
    const s = spec(["4.", "8", "8t"], false);
    const ctx = staffContext(s, METERS["6/8"]);
    expect(
      applyRhythmEdit(
        "C4:4. D4:4.",
        { op: "triplet-note", onset: [0, 1], base: 8, pitch: "C4" },
        ctx,
        rhythmPalette(s),
      ).refused,
    ).toBe("not-offered");
    expect(groupStart([5, 12], 8, METERS["4/4"])).toEqual([1, 4]);
    expect(groupStart([5, 4], 4, METERS["4/4"])).toEqual([1, 1]);
  });
  test("a group goes back to two plain values", () => {
    const a = "C4:8t D4:8t E4:8t D4:4 E4:2 | r:1";
    expect(edit(a, { op: "untriplet", onset: [0, 1] }).list).toBe("C4:8 D4:8 D4:4 E4:2 | r:1");
    expect(edit(a, { op: "untriplet", onset: [1, 4] }).refused).toBe("not-found");
  });
  test("in 3/4 too, and the engraving's spelling is rewritten to triplet values", () => {
    const s = spec(["2.", "4", "8", "8t"], false);
    const ctx = staffContext(s, METERS["3/4"]);
    const r = applyRhythmEdit(
      "C4:4 D4:4 E4:4",
      { op: "triplet", onset: [1, 3], base: 8, pitches: ["G4", "A4", "B4"] },
      ctx,
      rhythmPalette(s),
    );
    expect(r.list).toBe("C4:4 G4:8t A4:8t B4:8t E4:4 | r:2 r:4");
    expect(tripletTokens("(3:2 C4:8 r:8 E4:8) F4:4 G4:2 | r:1")).toBe("C4:8t r:8t E4:8t F4:4 G4:2 | r:1");
    expect(tripletTokens("(3:2 C4:4~ E4:8) F4:4")).toBe("C4:4t~ E4:8t F4:4");
    expect(canonicalRhythmList("(3:2 C4:8 A4:8 E4:8) F4:4 G4:2 | r:1", CTX, P)).toBe(
      "C4:8t A4:8t E4:8t F4:4 G4:2 | r:1",
    );
    expect(canonicalRhythmList("C4:4 D4:4")).toBe("C4:4 D4:4");
  });
});

describe("the keys", () => {
  /** Types keys on an empty two-bar answer and returns the value, the cursor and what was said. */
  function typist(s: StaffSpec = FULL, start = "") {
    const palette = rhythmPalette(s);
    const ctx = rhythmContext(staffContext(s, METERS["4/4"]), palette);
    let value = start;
    let cursor: StaffCursor = initialCursor(s);
    let said = "";
    const press = (key: string, o: { fixedDia?: number } = {}) => {
      const e = engrave(value, ctx);
      const notes = e.ok ? staffNotes(e.score) : [];
      const k = { spec: s, ctx, notes, groups: tripletGroupsOfValue(value, ctx), ...o };
      const r = rhythmKey(cursor, { key }, k) ?? staffKey(cursor, { key }, k);
      if (!r) return null;
      let refused: string | null = null;
      if ("rhythm" in r && r.rhythm) {
        const out = applyRhythmEdit(value, r.rhythm, ctx, palette);
        refused = out.refused;
        value = out.list;
      } else if (r.edit) {
        const out = engrave(value, ctx);
        if (out.ok) {
          value = canonicalRhythmList(editNoteList(out.list, r.edit, ctx).list, ctx, palette);
        }
      }
      cursor = r.cursor;
      said = refused ? (rhythmRefusalText(refused as never) ?? "") : (r.say ?? "");
      return r;
    };
    return {
      press,
      get value() {
        return value;
      },
      get cursor() {
        return cursor;
      },
      get said() {
        return said;
      },
    };
  }

  test("; switches to triplet values and back; three letters fill one beat", () => {
    const t = typist();
    t.press(";");
    expect(t.cursor.dur).toBe("8t");
    expect(t.said).toBe("Next notes: eighth-note triplets, three to a beat.");
    t.press("c");
    expect(t.value).toBe("C5:8t C5:8t C5:8t r:4 r:2 | r:1");
    expect(t.said).toContain("A triplet from bar 1 beat 1");
    t.press("d");
    t.press("e");
    expect(t.value).toBe("C5:8t D5:8t E5:8t r:4 r:2 | r:1");
    // After the third value the cursor stands on the next beat, still writing triplets.
    expect(t.cursor.onset).toEqual([1, 4]);
    t.press(";");
    expect(t.cursor.dur).toBe("8");
    expect(t.said).toBe("Next note: eighth");
    // A plain quarter after the group.
    t.press("4");
    t.press("g");
    expect(t.value).toBe("C5:8t D5:8t E5:8t G5:4 r:2 | r:1");
  });
  test("arrows step through a group one value at a time, from either side", () => {
    const t = typist(FULL, "C5:8t D5:8t E5:8t G5:4 r:2 | r:1");
    // The cursor starts at bar 1 beat 1 with a plain quarter: → walks the three values, then the beat after.
    for (const want of [
      [1, 12],
      [1, 6],
      [1, 4],
    ]) {
      t.press("ArrowRight");
      expect(t.cursor.onset).toEqual(want as [number, number]);
    }
    t.press("ArrowLeft");
    expect(t.cursor.onset).toEqual([1, 6]);
    expect(t.said).toBe("On E5, eighth-note triplet, bar 1 beat 1, third of three");
    // A letter on a value of the group changes that value only, whatever length the cursor carries.
    t.press("a");
    expect(t.value).toBe("C5:8t D5:8t A5:8t G5:4 r:2 | r:1");
  });
  test("a plain length at the start of a group replaces it only when it is as long as the group", () => {
    const t = typist(FULL, "C5:8t D5:8t E5:8t G5:4 r:2 | r:1");
    t.press("3");
    expect(t.cursor.dur).toBe("8");
    t.press("f");
    expect(t.value).toBe("C5:8t D5:8t E5:8t G5:4 r:2 | r:1");
    expect(t.said).toContain("A triplet fills this beat.");
    t.press("4");
    t.press("f");
    expect(t.value).toBe("F4:4 G5:4 r:2 | r:1");
  });
  test("0 rests one value; 2–6 leave triplet values without stretching a triplet note", () => {
    const t = typist(FULL, "C5:8t D5:8t E5:8t G5:4 r:2 | r:1");
    t.press("ArrowRight");
    t.press("0");
    expect(t.value).toBe("C5:8t r:8t E5:8t G5:4 r:2 | r:1");
    t.press("5");
    expect(t.cursor.dur).toBe("2");
    expect(t.value).toBe("C5:8t r:8t E5:8t G5:4 r:2 | r:1");
    t.press(";");
    t.press(".");
    expect(t.said).toBe("Triplet values are not dotted here.");
  });
  test("t ties the note just placed over the bar line, and unties it again", () => {
    const t = typist(FULL, "C5:2 D5:4 r:4 | r:1");
    t.press("ArrowRight");
    for (let i = 0; i < 5; i++) t.press("ArrowRight");
    expect(t.cursor.onset).toEqual([3, 4]);
    t.press("e");
    expect(t.value).toBe("C5:2 D5:4 E5:4 | r:1");
    t.press("t");
    expect(t.value).toBe("C5:2 D5:4 E5:4~ | E5:4 r:4 r:2");
    expect(t.said).toBe("Tied: held on by a quarter. To hold it longer, pick that length (2–6) before T.");
    // The cursor stands after the held part: the next letter does not write into it.
    expect(t.cursor.onset).toEqual([5, 4]);
    t.press("d");
    expect(t.value).toBe("C5:2 D5:4 E5:4~ | E5:4 D5:4 r:2");
    // Back on the tied note, t again unties it.
    for (let i = 0; i < 6; i++) t.press("ArrowLeft");
    expect(t.cursor.onset).toEqual([3, 4]);
    t.press("t");
    expect(t.value).toBe("C5:2 D5:4 E5:4 | E5:4 D5:4 r:2");
    expect(t.said).toBe("Tie removed: two notes again.");
  });
  test("t after an eighth holds it by an eighth and says so; the length first holds it by a half", () => {
    const t = typist(FULL, "r:1 | r:1");
    t.press("3");
    for (let i = 0; i < 7; i++) t.press("ArrowRight");
    expect(t.cursor.onset).toEqual([7, 8]);
    t.press("g");
    t.press("t");
    expect(t.said).toBe("Tied: held on by an eighth. To hold it longer, pick that length (2–6) before T.");
    const u = typist(FULL, "r:1 | r:1");
    u.press("3");
    for (let i = 0; i < 7; i++) u.press("ArrowRight");
    u.press("g");
    u.press("5");
    u.press("t");
    expect(u.value).toMatch(/G\d:8~ \| G\d:2 /);
    expect(u.said).toBe("Tied: held on by a half. To hold it longer, pick that length (2–6) before T.");
  });
  test("the keys belong to the tools the palette offers; Shift+T stays the Workbench's", () => {
    const plain = spec(["4"], false);
    const ctx = staffContext(plain);
    const k = { spec: plain, ctx, notes: [] };
    const cursor = initialCursor(plain);
    expect(rhythmKey(cursor, { key: "t" }, k)).toBeUndefined();
    expect(rhythmKey(cursor, { key: ";" }, k)).toBeUndefined();
    expect(rhythmKey(cursor, { key: "c" }, k)).toBeUndefined();
    const full = { spec: FULL, ctx: CTX, notes: [] };
    expect(rhythmKey(cursor, { key: "T", shift: true }, full)).toBeUndefined();
    expect(rhythmKey(cursor, { key: "." }, full)).toBeUndefined();
    expect(rhythmKey(cursor, { key: "t" }, full)?.say).toBe("Put the cursor on a note first, then tie it.");
    expect(rhythmKey(cursor, { key: "t", mod: true }, full)).toBeUndefined();
  });
  test("a rhythm-only answer writes every note on one line: N or any letter, no pitch keys", () => {
    const t = typist(spec(["4", "8", "8t"], false, 1));
    const o = { fixedDia: initialCursor(FULL).dia };
    t.press("n", o);
    t.press("c", o);
    expect(t.value).toBe("B4:4 B4:4 r:2");
    expect(t.said).toBe("quarter, bar 1 beat 2");
    t.press("ArrowUp", o);
    expect(t.said).toBe("This answer is about the rhythm: every note sits on the same line.");
    t.press(";", o);
    t.press("n", o);
    expect(t.value).toBe("B4:4 B4:4 B4:8t B4:8t B4:8t r:4");
  });
});

describe("what a screen reader hears", () => {
  test("tied notes and triplet values are named", () => {
    const e = engrave("C4:8t D4:8t E4:8t F4:4 G4:4 A4:4~ | A4:4 r:4 r:2", CTX);
    const notes = e.ok ? staffNotes(e.score) : [];
    expect(notes.map((n) => describeNote(n))).toEqual([
      "C4, eighth-note triplet, bar 1 beat 1",
      "D4, eighth-note triplet, bar 1 beat 1, second of three",
      "E4, eighth-note triplet, bar 1 beat 1, third of three",
      "F4, quarter, bar 1 beat 2",
      "G4, quarter, bar 1 beat 3",
      "A4, quarter, tied on, bar 1 beat 4",
    ]);
  });
  test("in 6/8 the beat is the dotted quarter", () => {
    const s = spec(["4.", "8"], false, 1);
    const e = engrave("C4:4. D4:8 E4:8 F4:8", staffContext(s, METERS["6/8"]));
    const notes = e.ok ? staffNotes(e.score) : [];
    expect(notes.map((n) => describeNote(n))).toEqual([
      "C4, dotted quarter, bar 1 beat 1",
      "D4, eighth, bar 1 beat 2",
      "E4, eighth, bar 1 beat 2, second of three",
      "F4, eighth, bar 1 beat 2, third of three",
    ]);
  });
});
