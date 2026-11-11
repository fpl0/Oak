// The fact decks against @oak/theory and headless Strudel: every answer is the right one, every chord
// symbol is one `chord()` plays as that chord, and the card IDs are exactly the locked ones.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineDeck, type FactDeck } from "@oak/content-kit";
import { bindDeck } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { units } from "../syllabus.ts";
import {
  CHORD_ROOTS,
  CHORD_SYMBOL_ROWS,
  CHORD_SYMBOLS,
  chordCardId,
  decks,
  KEY_SIGNATURES,
  MAJOR_SIGNATURES,
  MINOR_SIGNATURES,
  STAFF_NAMES,
  signatureText,
} from "./index.ts";

const lessons = new Set(units.flatMap((u) => u.lessons.map((l) => l.id as string)));
const QUALITY: Record<string, string> = {
  "": "maj",
  m: "min",
  o: "dim",
  aug: "aug",
  "7": "7",
  "^7": "maj7",
  m7: "m7",
  m7b5: "m7b5",
  o7: "dim7",
  "6": "6",
  m6: "m6",
  sus: "sus4",
};

describe("fact decks", () => {
  test("the card IDs are exactly the locked fact IDs", () => {
    const lock = JSON.parse(readFileSync(join(import.meta.dir, "..", "ids.lock.json"), "utf8")) as {
      ids: { id: string; kind: string; retiredAt?: string }[];
    };
    const locked = lock.ids.filter((e) => e.id.startsWith("fact.") && !e.retiredAt).map((e) => e.id);
    const ours = decks.flatMap((d) => d.cards.map((c) => c.id as string));
    expect(new Set(ours).size).toBe(ours.length);
    // Term cards (fact.<term>) are also locked facts; every deck card is locked, and no locked deck card is missing.
    const deckLocked = locked.filter((id) => /^fact\.(staff|keysig|chord)\./.test(id));
    expect([...ours].sort()).toEqual([...deckLocked].sort());
  });

  test("decks validate; gates are real lessons, never before the deck opens", () => {
    for (const d of decks) {
      expect(() => defineDeck(d)).not.toThrow();
      for (const c of d.cards) if (c.gate) expect(lessons.has(c.gate)).toBe(true);
    }
    expect(lessons.has(STAFF_NAMES.unlock.lesson)).toBe(true);
  });

  test("staff names: the answer is the written note's letter; treble C4–A5, bass E2–C4", () => {
    for (const c of STAFF_NAMES.cards) {
      const note = c.prompt.staff?.notes[0] as string;
      const parsed = theory.parseNote(note) as theory.ParsedNote;
      expect(c.answer.text).toEqual([parsed.letter]);
      const midi = parsed.midi;
      if (c.prompt.staff?.clef === "treble") {
        expect(midi).toBeGreaterThanOrEqual(60);
        expect(midi).toBeLessThanOrEqual(81);
      } else {
        expect(c.gate).toBe("U05.L06");
        expect(midi).toBeGreaterThanOrEqual(40);
        expect(midi).toBeLessThanOrEqual(60);
      }
    }
  });

  test("key signatures: every count is @oak/theory's", () => {
    for (const [tonic, n] of MAJOR_SIGNATURES)
      expect([tonic, n]).toEqual([tonic, theory.keySignature({ tonic, mode: "major" }).accidentals]);
    for (const [tonic, n] of MINOR_SIGNATURES)
      expect([tonic, n]).toEqual([tonic, theory.keySignature({ tonic, mode: "minor" }).accidentals]);
    for (const c of KEY_SIGNATURES.cards) {
      const m = /^fact\.keysig\.([A-G]s?b?)-(major|minor)$/.exec(c.id) as RegExpExecArray;
      const tonic = (m[1] as string).replace("s", "#");
      const sig = theory.keySignature({ tonic, mode: m[2] as "major" }).accidentals;
      expect([c.id, c.answer.text?.[0]]).toEqual([c.id, signatureText(sig)]);
    }
  });

  test("chord symbols: @oak/theory reads each answer as the asked quality on the asked root", () => {
    for (const [suffix] of CHORD_SYMBOL_ROWS)
      for (const root of CHORD_ROOTS) {
        const card = CHORD_SYMBOLS.cards.find((c) => c.id === chordCardId(root, suffix));
        const sym = card?.answer.text?.[0] as string;
        const id = theory.parseChordSymbol(sym);
        expect([sym, id?.quality, id?.root]).toEqual([sym, QUALITY[suffix], root]);
      }
  });

  test("chord symbols: Strudel plays each one as that chord (default voicing dictionary)", async () => {
    for (const c of CHORD_SYMBOLS.cards) {
      const sym = c.answer.text?.[0] as string;
      const res = await evalHeadless(`setcpm(30)\n\nchords: chord("${sym}").voicing().s("piano")`, 1);
      expect([sym, res.logs]).toEqual([sym, []]);
      const id = theory.parseChordSymbol(sym) as theory.ChordId;
      const played = new Set(res.events.map((e) => (((e.midi as number) % 12) + 12) % 12));
      const want = theory.chordPcs(id) as number[];
      // Every played note is a chord tone, and every chord tone sounds except a plain fifth, which the
      // voicing dictionary may leave out of a seventh chord (D7 is voiced F♯ C D F♯ C).
      const fifth = (id.rootPc + 7) % 12;
      expect([sym, [...played].every((pc) => want.includes(pc))]).toEqual([sym, true]);
      expect([
        sym,
        want.filter((pc) => pc !== fifth || want.length === 3).every((pc) => played.has(pc)),
      ]).toEqual([sym, true]);
    }
  }, 60_000);

  test("grading: the answer earns full credit; note names and symbols are case-tolerant only on the letter", () => {
    const grade = (deck: FactDeck, i: number, text: string) =>
      bindDeck(deck).grade(deck.cards[i] as FactDeck["cards"][number], { text: [text] }, 1000).credit;
    for (const d of decks)
      for (const [i, c] of d.cards.entries()) expect(grade(d, i, c.answer.text?.[0] as string)).toBe(1);
    expect(grade(STAFF_NAMES, 0, "c")).toBe(1);
    expect(grade(STAFF_NAMES, 0, "D")).toBe(0);
    expect(grade(KEY_SIGNATURES, 0, "2#")).toBe(0);
  });
});
