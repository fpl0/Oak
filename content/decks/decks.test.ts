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
  CADENCE_NAMES,
  CADENCE_ROWS,
  CHORD_ROOTS,
  CHORD_SYMBOL_ROWS,
  CHORD_SYMBOLS,
  chordCardId,
  DIATONIC_TRIADS,
  decks,
  FLAT_ORDER,
  INTERVAL_NAMES,
  INTERVAL_ROWS,
  KEY_SIGNATURES,
  MAJOR_SIGNATURES,
  MINOR_SIGNATURES,
  NUMERAL_CHORDS,
  NUMERALS,
  PENDING_DECKS,
  SHARP_ORDER,
  STAFF_NAMES,
  signatureText,
  TRIAD_ROWS,
  TRIAD_SPELLINGS,
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
      const m = /^fact\.keysig\.([A-G]s?b?)-(major|minor)$/.exec(c.id);
      if (!m) continue;
      const tonic = (m[1] as string).replace("s", "#");
      const sig = theory.keySignature({ tonic, mode: m[2] as "major" }).accidentals;
      expect([c.id, c.answer.text?.[0]]).toEqual([c.id, signatureText(sig)]);
    }
  });

  test("key signatures: the key from its signature, the spelled signature and the order, as @oak/theory has them", () => {
    const byId = new Map(KEY_SIGNATURES.cards.map((c) => [c.id as string, c]));
    for (const [tonic, n, gate] of MAJOR_SIGNATURES) {
      const sig = theory.signatureOf(n);
      const from = byId.get(`fact.keysig.from-${Math.abs(n)}${n > 0 ? "s" : "b"}`);
      expect([n, from?.answer.text, from?.gate]).toEqual([n, [sig.major.tonic], gate]);
      expect(sig.major.tonic).toBe(tonic);
      const spell = byId.get(`fact.keysig.spell-${tonic.replace("#", "s")}-major`);
      expect([tonic, spell?.answer.text]).toEqual([tonic, n > 0 ? sig.sharps : sig.flats]);
      // The prompt names the key and never gives the answer away.
      for (const card of [from, spell]) {
        const text = card?.prompt.text ?? "";
        expect(text.length).toBeGreaterThan(20);
        for (const a of card?.answer.text ?? [])
          expect([card?.id, text.includes(` ${a} `)]).toEqual([card?.id, false]);
      }
    }
    expect(SHARP_ORDER.map((l) => `${l}#`)).toEqual([...theory.SHARP_ORDER]);
    expect(FLAT_ORDER.map((l) => `${l}b`)).toEqual([...theory.FLAT_ORDER]);
    // The last sharp is the leading tone (7), the last flat is degree 4, in every key of the deck.
    for (const [tonic, n] of MAJOR_SIGNATURES) {
      const sig = theory.signatureOf(n);
      const last = (n > 0 ? sig.sharps : sig.flats).at(-1) as string;
      const pc = (theory.parseNote(`${last}4`) as theory.ParsedNote).midi % 12;
      const tonicPc = (theory.parseNote(`${tonic}4`) as theory.ParsedNote).midi % 12;
      expect([tonic, (pc - tonicPc + 12) % 12]).toEqual([tonic, n > 0 ? 11 : 5]);
    }
    // Flat cards open with the flat keys (U03.L07); sharp cards with the deck (U03.L06).
    for (const [tonic, , gate] of MAJOR_SIGNATURES)
      expect(byId.get(`fact.keysig.spell-${tonic.replace("#", "s")}-major`)?.gate).toBe(gate);
    expect(
      ["order-sharps", "last-sharp", "order-flats", "last-flat"].map(
        (k) => byId.get(`fact.keysig.${k}`)?.gate,
      ),
    ).toEqual([undefined, undefined, "U03.L07", "U03.L07"]);
  });

  test("every prompt states the answer format, and each accepted alternative earns full credit", () => {
    for (const d of [...decks, ...PENDING_DECKS])
      for (const c of d.cards) {
        if (c.prompt.staff) continue;
        expect([c.id, /Write|write/.test(c.prompt.text ?? "")]).toEqual([c.id, true]);
        for (const alt of c.accept ?? []) {
          const r = bindDeck(d).grade(c, { text: [(alt.text ?? []).join(" ")] }, 1000);
          expect([c.id, alt.text, r.credit]).toEqual([c.id, alt.text, 1]);
        }
      }
  });

  test("sequences typed into one box are graded item by item", () => {
    const order = KEY_SIGNATURES.cards.find(
      (c) => c.id === "fact.keysig.order-sharps",
    ) as FactDeck["cards"][number];
    const g = (t: string) => bindDeck(KEY_SIGNATURES).grade(order, { text: [t] }, 1000).credit;
    expect(g("F C G D A E B")).toBe(1);
    expect(g("f, c, g, d, a, e, b")).toBe(1);
    expect(g("F# C# G# D# A# E# B#")).toBe(1);
    expect(g("F C G D A B E")).toBeCloseTo(5 / 7, 5);
  });

  test("interval names (pending deck): half steps and names as @oak/theory measures them, Strudel's strings too", () => {
    expect(() => defineDeck(INTERVAL_NAMES)).not.toThrow();
    expect(decks.map((d) => d.id as string)).not.toContain(INTERVAL_NAMES.id);
    for (const [name, semis, code, , gate] of INTERVAL_ROWS) {
      const info = theory.intervalOf(60, 60 + semis);
      expect([name, info.semitones]).toEqual([name, semis]);
      if (name !== "TT") expect([name, info.name]).toEqual([name, name]);
      else expect(info.tritone).toBe(true);
      expect([code, theory.parseStrudelInterval(code)?.semitones]).toEqual([code, semis]);
      const semisCard = INTERVAL_NAMES.cards.find((c) => c.id === `fact.int.semis-${semis}`);
      expect(semisCard?.gate).toBe(gate);
    }
    const grade = (id: string, t: string) => {
      const c = INTERVAL_NAMES.cards.find((x) => x.id === id) as FactDeck["cards"][number];
      return bindDeck(INTERVAL_NAMES).grade(c, { text: [t] }, 1000).credit;
    };
    // Major and minor differ only in the letter's case: never forgiven.
    expect(grade("fact.int.semis-4", "M3")).toBe(1);
    expect(grade("fact.int.semis-4", "3M")).toBe(1);
    expect(grade("fact.int.semis-4", "major 3rd")).toBe(1);
    expect(grade("fact.int.semis-4", "m3")).toBe(0);
    expect(grade("fact.int.semis-3", "M3")).toBe(0);
    expect(grade("fact.int.semis-6", "4A")).toBe(1);
    expect(grade("fact.int.semis-6", "tritone")).toBe(1);
    expect(grade("fact.int.M3-semis", "4")).toBe(1);
    expect(grade("fact.int.code-P5", "5P")).toBe(1);
    expect(grade("fact.int.code-P5", "P5")).toBe(0);
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
      for (const [i, c] of d.cards.entries()) expect(grade(d, i, (c.answer.text ?? []).join(" "))).toBe(1);
    expect(grade(STAFF_NAMES, 0, "c")).toBe(1);
    expect(grade(STAFF_NAMES, 0, "D")).toBe(0);
    expect(grade(KEY_SIGNATURES, 0, "2#")).toBe(0);
  });
});

describe("U05–U07 fact decks (pending their contracts §7.3 rows and ledger IDs)", () => {
  const C = { tonic: "C", mode: "major" } as const;
  const credit = (deck: FactDeck, id: string, text: string[]) => {
    const card = deck.cards.find((c) => c.id === id) as FactDeck["cards"][number];
    return bindDeck(deck).grade(card, { text }, 1000).credit;
  };
  test("they are pending: valid, gated on real lessons at or after their unlock, IDs unique and new", () => {
    const pending = [TRIAD_SPELLINGS, NUMERALS, CADENCE_NAMES];
    const ids = pending.flatMap((d) => d.cards.map((c) => c.id as string));
    expect(new Set(ids).size).toBe(ids.length);
    const live = new Set(decks.flatMap((d) => d.cards.map((c) => c.id as string)));
    for (const d of pending) {
      expect(() => defineDeck(d)).not.toThrow();
      expect(decks.map((x) => x.id as string)).not.toContain(d.id);
      for (const c of d.cards) {
        expect(live.has(c.id as string)).toBe(false);
        if (c.gate) expect([c.id, lessons.has(c.gate)]).toEqual([c.id, true]);
      }
    }
  });
  test("triad spellings: stacked letters, and @oak/theory reads each as the asked quality on the asked root", () => {
    for (const [root, q, notes] of TRIAD_ROWS) {
      const id = theory.parseChordSymbol(
        `${root}${{ maj: "", min: "m", dim: "dim", aug: "aug" }[q]}`,
      ) as theory.ChordId;
      const pcs = notes.map((n) => theory.pcOf(n));
      expect([root, q, [...pcs].sort()]).toEqual([root, q, [...theory.chordPcs(id)].sort()]);
      const letters = notes.map((n) => "CDEFGAB".indexOf(n[0] as string));
      expect(
        [
          root,
          q,
          (letters[1] as number) - (letters[0] as number),
          (letters[2] as number) - (letters[1] as number),
        ].map((x) => (typeof x === "number" ? (x + 7) % 7 : x)),
      ).toEqual([root, q, 2, 2].map((x) => (typeof x === "number" ? (x + 7) % 7 : x)));
    }
    expect(credit(TRIAD_SPELLINGS, "fact.triad.C-min", ["C E♭ G"])).toBe(1);
    expect(credit(TRIAD_SPELLINGS, "fact.triad.C-min", ["c, eb, g"])).toBe(1);
    expect(credit(TRIAD_SPELLINGS, "fact.triad.C-min", ["C D# G"])).toBeLessThan(1);
  });
  test("numerals and qualities: as @oak/theory names the diatonic triads; numerals graded case-sensitively", () => {
    for (const [degree, numeral, q] of DIATONIC_TRIADS) {
      const chord = theory.diatonicChordOn(C, degree);
      expect([degree, theory.romanText(chord, C), chord.quality]).toEqual([degree, numeral, q]);
    }
    for (const [tonic, numeral, symbol] of NUMERAL_CHORDS) {
      const key = { tonic, mode: "major" } as const;
      const want = theory.chordOfRoman(numeral, key) as theory.ChordId;
      const got = theory.parseChordSymbol(symbol.replace(/o$/, "dim")) as theory.ChordId;
      expect([tonic, numeral, got.rootPc, got.quality]).toEqual([tonic, numeral, want.rootPc, want.quality]);
    }
    expect(credit(NUMERALS, "fact.rn.C-6", ["vi"])).toBe(1);
    expect(credit(NUMERALS, "fact.rn.C-6", ["VI"])).toBe(0);
    expect(credit(NUMERALS, "fact.rn.C-7", ["vii°"])).toBe(1);
    expect(credit(NUMERALS, "fact.rn.G-vi", ["E minor"])).toBe(1);
    expect(credit(NUMERALS, "fact.rn.G-vi", ["em"])).toBe(1);
    expect(credit(NUMERALS, "fact.rn.F-IV", ["bb"])).toBe(1);
    expect(credit(NUMERALS, "fact.rn.quality-2", ["m"])).toBe(1);
    expect(credit(NUMERALS, "fact.rn.quality-7", ["minor"])).toBe(0);
  });
  test("cadence names: as @oak/theory classifies the two chords (and the tune's last note)", () => {
    const sym = (s: string) => theory.parseChordSymbol(s) as theory.ChordId;
    const cases: Record<string, string> = {
      pac: theory.cadenceOf(sym("G"), sym("C"), C, { melodyMidi: 72 }),
      iac: theory.cadenceOf(sym("G"), sym("C"), C, { melodyMidi: 76 }),
      hc: theory.cadenceOf(sym("F"), sym("G"), C),
      dc: theory.cadenceOf(sym("G"), sym("Am"), C),
      pc: theory.cadenceOf(sym("F"), sym("C"), C),
    };
    for (const [id, , answer] of CADENCE_ROWS) expect([id, answer[0]]).toEqual([id, cases[id]]);
    expect(credit(CADENCE_NAMES, "fact.cadence.dc", ["deceptive"])).toBe(1);
    expect(credit(CADENCE_NAMES, "fact.cadence.pac", ["IAC"])).toBe(0);
    expect(credit(CADENCE_NAMES, "fact.cadence.plagal-chords", ["IV I"])).toBe(1);
    expect(credit(CADENCE_NAMES, "fact.cadence.plagal-chords", ["I IV"])).toBe(0);
    // Terms before they are taught: deceptive (U06.L06) and plagal (U06.L07) cards wait for their lessons.
    for (const c of CADENCE_NAMES.cards.filter((x) => /dc|pc|deceptive|plagal/.test(x.id)))
      expect([c.id, c.gate]).toEqual([c.id, /dc|deceptive/.test(c.id) ? "U06.L06" : "U06.L07"]);
  });
});
