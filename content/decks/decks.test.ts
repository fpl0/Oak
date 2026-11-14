// The fact decks against @oak/theory and headless Strudel: every answer is the right one, every chord
// symbol is one `chord()` plays as that chord, and the card IDs are exactly the locked ones.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defineDeck, type FactDeck, type KeySpec } from "@oak/content-kit";
import { bindDeck } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { units } from "../syllabus.ts";
import {
  A_MINOR_CHORDS,
  CADENCE_NAMES,
  CADENCE_ROWS,
  CHORD_ROOTS,
  CHORD_SYMBOL_ROWS,
  CHORD_SYMBOLS,
  chordCardId,
  DIATONIC_TRIADS,
  DOMINANT_SEVENTH_ROWS,
  DOMINANT_SEVENTHS,
  decks,
  FLAT_ORDER,
  INTERVAL_NAMES,
  INTERVAL_ROWS,
  KEY_SIGNATURES,
  MAJOR_SIGNATURES,
  MINOR_CHORDS,
  MINOR_KEYS,
  MINOR_SIGNATURES,
  MINOR_TRIADS,
  NUMERAL_CHORDS,
  NUMERALS,
  PENDING_DECKS,
  RELATIVE_PAIRS,
  SCALE_DEGREE_ROWS,
  SCALE_DEGREES,
  SCALE_SPELLING_ROWS,
  SHARP_ORDER,
  STAFF_NAMES,
  signatureText,
  TRIAD_ROWS,
  TRIAD_SPELLINGS,
  TWELVE_BAR,
  TWELVE_BAR_ROWS,
  TWELVE_BARS,
  WAVE5_DECKS,
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
    const prefixes = new Set(ours.map((id) => id.split(".")[1]));
    const deckLocked = locked.filter((id) => prefixes.has(id.split(".")[1] as string));
    // The eighteen decks' own prefixes (contracts 1.6 promoted nine decks, 1.7 the six U12–U17 ones): none is
    // shared with a term card.
    expect([...prefixes].sort()).toEqual(
      [
        "blues",
        "cadence",
        "chord",
        "dom7",
        "int",
        "keysig",
        "minor",
        "rn",
        "scale",
        "staff",
        "triad",
        "seventh",
        "diatonic7",
        "mode",
        "applied",
        "borrowed",
        "pivot",
      ].sort(),
    );
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

  test("interval names (in the catalog since contracts 1.6): half steps and names as @oak/theory measures them, Strudel's strings too", () => {
    expect(() => defineDeck(INTERVAL_NAMES)).not.toThrow();
    expect(decks.map((d) => d.id as string)).toContain(INTERVAL_NAMES.id);
    expect(INTERVAL_NAMES.newPerDay).toBe(1);
    for (const [name, semis, code, , gate] of INTERVAL_ROWS) {
      const info = theory.intervalOf(60, 60 + semis);
      expect([name, info.semitones]).toEqual([name, semis]);
      if (name !== "TT") expect([name, info.name]).toEqual([name, name]);
      else expect(info.tritone).toBe(true);
      expect([code, theory.parseStrudelInterval(code)?.semitones]).toEqual([code, semis]);
      const semisCard = INTERVAL_NAMES.cards.find((c) => c.id === `fact.int.semis-${semis}`);
      expect(semisCard?.gate).toBe(gate);
      // The reverse direction (name → half steps) is dealt from U12.L06, where intervals come back.
      expect(INTERVAL_NAMES.cards.find((c) => c.id === `fact.int.${name}-semis`)?.gate).toBe("U12.L06");
    }
    expect(INTERVAL_NAMES.cards.filter((c) => c.gate !== "U12.L06")).toHaveLength(18);
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

describe("U05–U07 fact decks (in the catalog since contracts 1.6)", () => {
  const C = { tonic: "C", mode: "major" } as const;
  const credit = (deck: FactDeck, id: string, text: string[]) => {
    const card = deck.cards.find((c) => c.id === id) as FactDeck["cards"][number];
    return bindDeck(deck).grade(card, { text }, 1000).credit;
  };
  test("they are in the catalog: valid, gated on real lessons at or after their unlock, IDs unique", () => {
    const pending = [TRIAD_SPELLINGS, NUMERALS, CADENCE_NAMES];
    const ids = pending.flatMap((d) => d.cards.map((c) => c.id as string));
    expect(new Set(ids).size).toBe(ids.length);
    const live = new Set(
      decks.filter((d) => !pending.includes(d)).flatMap((d) => d.cards.map((c) => c.id as string)),
    );
    for (const d of pending) {
      expect(() => defineDeck(d)).not.toThrow();
      expect(decks.map((x) => x.id as string)).toContain(d.id);
      expect(PENDING_DECKS).not.toContain(d);
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

describe("U10–U11 fact decks (in the catalog since contracts 1.6): every answer as @oak/theory gives it", () => {
  const credit = (deck: FactDeck, id: string, text: string[]) => {
    const card = deck.cards.find((c) => c.id === id) as FactDeck["cards"][number];
    expect(card).toBeDefined();
    return bindDeck(deck).grade(card, { text }, 1000).credit;
  };
  const answerOf = (deck: FactDeck, id: string) =>
    (deck.cards.find((c) => c.id === id)?.answer.text ?? []) as string[];
  const order = (id: string) => units.flatMap((u) => u.lessons.map((l) => l.id as string)).indexOf(id);
  test("in the catalog, valid, gated on real lessons no earlier than the deck, IDs unique", () => {
    const ids = WAVE5_DECKS.flatMap((d) => d.cards.map((c) => c.id as string));
    expect(new Set(ids).size).toBe(ids.length);
    const others = new Set(
      [...decks, ...PENDING_DECKS]
        .filter((d) => !WAVE5_DECKS.includes(d))
        .flatMap((d) => d.cards.map((c) => c.id as string)),
    );
    for (const d of WAVE5_DECKS) {
      expect(() => defineDeck(d)).not.toThrow();
      expect(decks.map((x) => x.id as string)).toContain(d.id);
      expect(PENDING_DECKS).not.toContain(d);
      expect(lessons.has(d.unlock.lesson)).toBe(true);
      for (const c of d.cards) {
        expect(others.has(c.id as string)).toBe(false);
        // Every prompt states the answer format ("Write …").
        expect([c.id, /Write /.test(c.prompt.text ?? "")]).toEqual([c.id, true]);
        if (c.gate) {
          expect([c.id, lessons.has(c.gate)]).toEqual([c.id, true]);
          expect([c.id, order(c.gate) >= order(d.unlock.lesson)]).toEqual([c.id, true]);
        }
      }
    }
  });
  test("relative pairs: @oak/theory's relative minor and major", () => {
    for (const [major, minor] of RELATIVE_PAIRS) {
      const rel = theory.relativeKey({ tonic: major, mode: "major" });
      expect([major, theory.pcOf(rel.tonic), rel.mode]).toEqual([major, theory.pcOf(minor), "minor"]);
      expect(answerOf(MINOR_KEYS, `fact.minor.relative-of-${major.replace("#", "s")}`)).toEqual([
        `${minor} minor`,
      ]);
    }
    for (const c of MINOR_KEYS.cards.filter((x) => x.id.startsWith("fact.minor.relative-major-of-"))) {
      const m = /of (\S+) minor/.exec(c.prompt.text ?? "") as RegExpExecArray;
      const minor = (m[1] as string).replace("♯", "#").replace("♭", "b");
      const rel = theory.relativeKey({ tonic: minor, mode: "minor" });
      expect([c.id, c.answer.text?.[0]]).toEqual([c.id, `${rel.tonic} major`]);
    }
    expect(credit(MINOR_KEYS, "fact.minor.relative-of-F", ["d minor"])).toBe(1);
    expect(credit(MINOR_KEYS, "fact.minor.relative-of-F", ["Dm"])).toBe(1);
    expect(credit(MINOR_KEYS, "fact.minor.relative-of-F", ["F minor"])).toBe(0);
    expect(credit(MINOR_KEYS, "fact.minor.melodic-raises", ["6 7"])).toBe(1);
    // The parallel minor has three flats more: C major 0, C minor 3 flats.
    const sig = (k: KeySpec) => theory.keySignature(k).accidentals;
    for (const t of ["C", "D", "G", "A", "E", "F"])
      expect([t, sig({ tonic: t, mode: "major" }) - sig({ tonic: t, mode: "minor" })]).toEqual([t, 3]);
  });
  test("chords of a minor key: as @oak/theory's minorKeyChords names them, natural then harmonic", () => {
    const natural = theory.minorKeyChords("A");
    for (const [degree, numeral, q] of MINOR_TRIADS) {
      const k = natural[degree - 1] as theory.KeyChord;
      expect([degree, k.rn, k.chord.quality]).toEqual([
        degree,
        numeral,
        { major: "maj", minor: "min", diminished: "dim" }[q],
      ]);
    }
    const harmonic = theory.minorKeyChords("A", { form: "harmonic" });
    const A: KeySpec = { tonic: "A", mode: "minor" };
    for (const [numeral, symbol] of A_MINOR_CHORDS) {
      const want = (["V", "viio"].includes(numeral) ? harmonic : natural).find(
        (k) => k.rn === numeral,
      ) as theory.KeyChord;
      const got = theory.parseChordSymbol(symbol.replace(/o$/, "dim")) as theory.ChordId;
      expect([numeral, got.rootPc, got.quality]).toEqual([numeral, want.chord.rootPc, want.chord.quality]);
      expect(theory.chordOfRoman(numeral, A)).not.toBeNull();
    }
    const syms = (rns: string[]) => rns.map((rn) => theory.chordOfRoman(rn, A) as theory.ChordId);
    expect(syms(answerOf(MINOR_CHORDS, "fact.minor.aeolian-loop")).map((c) => c.rootPc)).toEqual(
      theory.schemaChords("schema.aeolian", A).map((c) => c.rootPc),
    );
    expect(syms(answerOf(MINOR_CHORDS, "fact.minor.andalusian")).map((c) => [c.rootPc, c.quality])).toEqual(
      theory.schemaChords("schema.andalusian", A).map((c) => [c.rootPc, c.quality]),
    );
    expect(credit(MINOR_CHORDS, "fact.minor.A-viio", ["G#°"])).toBe(1);
    expect(credit(MINOR_CHORDS, "fact.minor.A-V", ["Em"])).toBe(0);
    expect(credit(MINOR_CHORDS, "fact.minor.A-v", ["E minor"])).toBe(1);
    expect(credit(MINOR_CHORDS, "fact.minor.aeolian-loop", ["i vi iii vii"])).toBeLessThan(1);
    // The major V and vii° wait for U10.L06; the Andalusian cadence for U10.L07.
    expect(MINOR_CHORDS.cards.find((c) => c.id === "fact.minor.A-V")?.gate).toBe("U10.L06");
    expect(MINOR_CHORDS.cards.find((c) => c.id === "fact.minor.andalusian")?.gate).toBe("U10.L07");
  });
  test("scales as degrees and spelled: @oak/theory's scales, each from its own lesson", () => {
    const modes: Record<string, string> = {
      "natural-minor": "minor",
      "harmonic-minor": "harmonic minor",
      "melodic-minor": "melodic minor",
      "major-pentatonic": "major pentatonic",
      "minor-pentatonic": "minor pentatonic",
      blues: "blues",
    };
    for (const [id, , degrees] of SCALE_DEGREE_ROWS)
      expect<unknown>([id, theory.scaleDegrees({ tonic: "C", mode: modes[id] as KeySpec["mode"] })]).toEqual([
        id,
        degrees,
      ]);
    for (const [scale, tonic, notes] of SCALE_SPELLING_ROWS) {
      const want = theory.scaleNotes({ tonic, mode: scale as KeySpec["mode"] });
      expect([scale, tonic, notes.map((n) => theory.pcOf(n))]).toEqual([
        scale,
        tonic,
        want.map((n) => theory.pcOf(n)),
      ]);
    }
    expect(credit(SCALE_DEGREES, "fact.scale.natural-minor-degrees", ["1 2 ♭3 4 5 ♭6 ♭7"])).toBe(1);
    expect(credit(SCALE_DEGREES, "fact.scale.harmonic-minor-degrees", ["1 2 b3 4 5 b6 b7"])).toBeLessThan(1);
    expect(credit(SCALE_DEGREES, "fact.scale.A-blues", ["A C D D# E G"])).toBe(1);
    expect(credit(SCALE_DEGREES, "fact.scale.A-blues", ["A C D Eb E G"])).toBe(1);
    expect(credit(SCALE_DEGREES, "fact.scale.blues-adds", ["#4"])).toBe(1);
    expect(credit(SCALE_DEGREES, "fact.scale.C-minor-pentatonic", ["C D# F G A#"])).toBeLessThan(1);
    expect(SCALE_DEGREES.cards.find((c) => c.id === "fact.scale.minor-pentatonic-degrees")?.gate).toBe(
      "U11.L02",
    );
  });
  test("the twelve bars: @oak/theory's 12-bar plan (standard, quick change, turnaround)", () => {
    const plan = theory
      .twelveBarPlan({ variant: "standard", turnaround: true })
      .map((rn) => rn.replace("7", ""));
    expect(plan).toEqual([...TWELVE_BARS]);
    for (const [bar, numeral] of TWELVE_BAR_ROWS) expect([bar, plan[bar - 1]]).toEqual([bar, numeral]);
    const quick = theory.twelveBarPlan({ variant: "quick-change", turnaround: false });
    expect(answerOf(TWELVE_BAR, "fact.blues.quick-change")).toEqual([quick[1]?.replace("7", "") as string]);
    const inC = theory.twelveBarChords("C", { variant: "standard", turnaround: true });
    const sym = answerOf(TWELVE_BAR, "fact.blues.chords-in-C").map(
      (s) => theory.parseChordSymbol(s) as theory.ChordId,
    );
    expect<unknown>(sym.map((c) => [c.rootPc, c.quality])).toEqual(
      [0, 4, 8].map((i) => [inC[i]?.rootPc, inC[i]?.quality]),
    );
    // Corrections pass: C F G are a blues's three chords too, so the prompt names the dominant sevenths it wants.
    expect(TWELVE_BAR.cards.find((c) => c.id === "fact.blues.chords-in-C")?.prompt.text).toContain(
      "each a dominant seventh",
    );
    expect(credit(TWELVE_BAR, "fact.blues.chords-in-C", ["C7 F7 G7"])).toBe(1);
    expect(credit(TWELVE_BAR, "fact.blues.bar-9", ["V7"])).toBe(1);
    expect(credit(TWELVE_BAR, "fact.blues.bar-10", ["V"])).toBe(0);
    expect(credit(TWELVE_BAR, "fact.blues.bar-10", ["iv"])).toBe(0);
  });
  test("dominant sevenths: @oak/theory's chord on each root, stacked in thirds", async () => {
    for (const [root, notes] of DOMINANT_SEVENTH_ROWS) {
      const want = theory.chordNotes(theory.dominantSeventh(root));
      expect([root, notes.map((n) => theory.pcOf(n))]).toEqual([root, want.map((n) => theory.pcOf(n))]);
      const letters = notes.map((n) => "CDEFGAB".indexOf(n[0] as string));
      for (let i = 1; i < 4; i++)
        expect([root, ((letters[i] as number) - (letters[i - 1] as number) + 7) % 7]).toEqual([root, 2]);
      expect(theory.isDominantSeventhSymbol(`${root}7`)).toBe(true);
    }
    // And Strudel's chord() plays the same notes.
    const res = await evalHeadless('chord("C7").voicing()', 1);
    expect(new Set(res.events.map((e) => (((e.midi as number) % 12) + 12) % 12))).toEqual(
      new Set([0, 4, 7, 10]),
    );
    expect(credit(DOMINANT_SEVENTHS, "fact.dom7.E7", ["E G# B D"])).toBe(1);
    expect(credit(DOMINANT_SEVENTHS, "fact.dom7.E7", ["E Ab B D"])).toBeLessThan(1);
    expect(credit(DOMINANT_SEVENTHS, "fact.dom7.seventh", ["minor 7th"])).toBe(1);
  });
});
