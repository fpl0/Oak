// Wave 6 review (review:journey): a seventh chord typed the ways a learner types it reads as the one symbol the
// grader takes, including the words Oak itself speaks for it ("C major 7"); and the first letter on a fresh treble
// staff lands in middle C's octave.
import { describe, expect, test } from "bun:test";
import { chordTyped, readsAs, spokenChord } from "./normalize.ts";
import { responseOf } from "./response.ts";
import { engrave, initialCursor, staffContext, staffKey, staffNotes } from "./staff/model.ts";
import type { AnswerSpec } from "./types.ts";

const canonical = (t: string) => {
  const r = readsAs("chord", t);
  return r.state === "ok" ? r.canonical : null;
};

describe("Cmaj7, typed every way", () => {
  test("symbols, the triangle, and the words Oak speaks for it all read as Cmaj7", () => {
    for (const t of [
      "Cmaj7",
      "CM7",
      "CΔ7",
      "CΔ",
      "Cmaj 7",
      "cmaj7",
      "C^7",
      "C major 7",
      "C major seventh",
      "c maj 7th",
    ])
      expect(`${t} → ${canonical(t)}`).toBe(`${t} → C^7`);
  });
  test("the other sevenths in words; triads and symbols are unchanged", () => {
    expect(canonical("C dominant 7")).toBe("C7");
    expect(canonical("C minor seventh")).toBe("Cm7");
    expect(canonical("B flat minor 7 flat 5")).toBe("Bbm7b5");
    expect(canonical("F sharp half-diminished")).toBe("F#m7b5");
    expect(canonical("C diminished 7")).toBe("Co7");
    expect(canonical("E flat major 7")).toBe("Eb^7");
    expect(canonical("C major")).toBe("C");
    expect(canonical("Am/G")).toBe("Am/G");
    expect(canonical("C7")).toBe("C7");
  });
  test("what Oak says aloud for a symbol reads back as that symbol", () => {
    for (const sym of ["Cmaj7", "Dm7", "G7", "F♯m7♭5", "B♭maj7", "C°7"]) {
      const said = spokenChord(sym);
      expect(`${said} → ${canonical(said)}`).toBe(`${said} → ${canonical(sym)}`);
    }
  });
  test("the response carries the symbol the preview showed", () => {
    expect(chordTyped("C major 7")).toBe("C^7");
    const spec = { ui: "text", normalize: "chord" } as unknown as AnswerSpec;
    expect(responseOf(spec, "C major 7")).toEqual({ answer: { text: ["C^7"] } });
  });
});

describe("the first letter on a fresh treble staff", () => {
  const spec = {
    ui: "staff-input",
    clef: "treble",
    bars: 1,
    palette: { durations: ["4"], accidentals: true, ties: false, rests: true },
  } as const;
  test("C, D and E land on C4, D4, E4 (middle C's octave), as the course's melodies sit", () => {
    const ctx = staffContext(spec as never);
    let cursor = initialCursor(spec as never);
    let value = "r:1";
    const said: string[] = [];
    for (const key of ["c", "d", "e"]) {
      const e = engrave(value, ctx);
      if (!e.ok) throw new Error(e.error);
      const r = staffKey(cursor, { key }, { spec: spec as never, ctx, notes: staffNotes(e.score) });
      if (!r) throw new Error(key);
      cursor = r.cursor;
      said.push(r.say ?? "");
      if (r.edit?.op === "insert") {
        const notes = value === "r:1" ? [] : value.split(" ").filter((n) => !n.startsWith("r"));
        notes.push(`${r.edit.pitch}:4`);
        value = [...notes, ...Array.from({ length: 4 - notes.length }, () => "r:4")].join(" ");
      }
    }
    expect(said).toEqual([
      "C4, quarter, bar 1 beat 1",
      "D4, quarter, bar 1 beat 2",
      "E4, quarter, bar 1 beat 3",
    ]);
  });
});
