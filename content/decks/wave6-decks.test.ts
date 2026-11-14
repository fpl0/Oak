// The U12–U17 fact decks (`WAVE6_DECKS`) against @oak/theory and headless Strudel: every answer is the one the
// theory package computes, every chord symbol is one `chord()` plays as that chord, every prompt states the form
// of its answer, the alternatives a learner may reasonably write are accepted, and each card opens with the
// lesson that teaches it.
import { describe, expect, test } from "bun:test";
import { defineDeck, type FactDeck, type KeySpec } from "@oak/content-kit";
import { bindDeck } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import * as theory from "@oak/theory";
import { defaultOrder, units } from "../syllabus.ts";
import {
  APPLIED_DEGREE_ROWS,
  APPLIED_DOMINANTS_DECK,
  APPLIED_ROWS,
  BORROWED_CHORDS_DECK,
  BORROWED_ROWS,
  DIATONIC_SEVENTH_ROWS,
  DIATONIC_SEVENTHS_DECK,
  decks,
  MODE_ROWS,
  MODES_DECK,
  PENDING_DECKS,
  PIVOT_CHORDS_DECK,
  PIVOT_ROWS,
  SEVENTH_CHORDS_DECK,
  SEVENTH_FORMULA_ROWS,
  SEVENTH_NUMERAL_ROWS,
  SEVENTH_SPELLING_ROWS,
  WAVE6_DECKS,
} from "./index.ts";

const lessons = new Set(units.flatMap((u) => u.lessons.map((l) => l.id as string)));
const order = (id: string) => defaultOrder.indexOf(id as never);
const C: KeySpec = { tonic: "C", mode: "major" };
const credit = (deck: FactDeck, id: string, text: string[]) => {
  const card = deck.cards.find((c) => c.id === id) as FactDeck["cards"][number];
  expect([id, card !== undefined]).toEqual([id, true]);
  return bindDeck(deck).grade(card, { text }, 1000).credit;
};
const answerOf = (deck: FactDeck, id: string) =>
  (deck.cards.find((c) => c.id === id)?.answer.text ?? []) as string[];
const gateOf = (deck: FactDeck, id: string) =>
  deck.cards.find((c) => c.id === id)?.gate ?? deck.unlock.lesson;
/** A `chord()` symbol as @oak/theory reads it. */
const chordOf = (symbol: string) =>
  theory.parseChordSymbol(
    symbol.replace("^7", "maj7").replace(/o7$/, "dim7").replace(/o$/, "dim"),
  ) as theory.ChordId;
const pcs = (notes: readonly string[]) => notes.map((n) => theory.pcOf(n));

describe("the U12–U17 decks: shape, gates and formats", () => {
  test("six decks, valid, with unique card IDs that no other deck uses; in the catalog since contracts 1.7", () => {
    expect(WAVE6_DECKS.map((d) => [d.id as string, d.unlock.lesson, d.cards.length])).toEqual([
      ["deck.chd.sevenths", "U12.L01", 12],
      ["deck.har.sevenths", "U12.L04", 14],
      ["deck.scl.modes", "U14.L01", 16],
      ["deck.har.applied", "U15.L02", 12],
      ["deck.har.borrowed", "U16.L01", 12],
      ["deck.har.pivots", "U17.L01", 10],
    ]);
    const ids = WAVE6_DECKS.flatMap((d) => d.cards.map((c) => c.id as string));
    expect(new Set(ids).size).toBe(ids.length);
    const others = new Set(
      [...decks, ...PENDING_DECKS]
        .filter((d) => !WAVE6_DECKS.includes(d))
        .flatMap((d) => d.cards.map((c) => c.id as string)),
    );
    for (const id of ids) expect([id, others.has(id)]).toEqual([id, false]);
    for (const d of WAVE6_DECKS) {
      expect(() => defineDeck(d)).not.toThrow();
      // They joined `decks` with their contracts §7.3 rows (contracts-sync.test.ts holds the two together), last
      // in course order, and none waits in `PENDING_DECKS`.
      expect([d.id, decks.includes(d), PENDING_DECKS.includes(d)]).toEqual([d.id, true, false]);
      expect(d.newPerDay).toBe(1);
    }
    expect(decks.slice(-WAVE6_DECKS.length)).toEqual([...WAVE6_DECKS]);
  });
  test("every card opens at a real lesson no earlier than its deck, in the order the unit teaches it", () => {
    for (const d of WAVE6_DECKS) {
      expect([d.id, lessons.has(d.unlock.lesson)]).toEqual([d.id, true]);
      for (const c of d.cards) {
        if (!c.gate) continue;
        expect([c.id, lessons.has(c.gate)]).toEqual([c.id, true]);
        expect([c.id, order(c.gate) > order(d.unlock.lesson)]).toEqual([c.id, true]);
        // A deck stays inside its own unit.
        expect([c.id, c.gate.slice(0, 3)]).toEqual([c.id, d.unlock.lesson.slice(0, 3)]);
      }
    }
    // Each idea from the lesson that teaches it (content/specs/U12.md–U17.md).
    expect(gateOf(SEVENTH_CHORDS_DECK, "fact.seventh.Bm7b5")).toBe("U12.L03");
    expect(gateOf(DIATONIC_SEVENTHS_DECK, "fact.diatonic7.Am-V7")).toBe("U12.L05");
    expect(gateOf(MODES_DECK, "fact.mode.mixolydian-degree")).toBe("U14.L01");
    expect(gateOf(MODES_DECK, "fact.mode.mixolydian-chord")).toBe("U14.L02");
    expect(gateOf(MODES_DECK, "fact.mode.dorian-degree")).toBe("U14.L03");
    expect(gateOf(MODES_DECK, "fact.mode.lydian-chord")).toBe("U14.L04");
    expect(gateOf(MODES_DECK, "fact.mode.E-phrygian")).toBe("U14.L05");
    expect(gateOf(APPLIED_DOMINANTS_DECK, "fact.applied.C-V7-of-V")).toBe("U15.L02");
    expect(gateOf(APPLIED_DOMINANTS_DECK, "fact.applied.C-V7-of-vi")).toBe("U15.L03");
    expect(gateOf(APPLIED_DOMINANTS_DECK, "fact.applied.C-viio-of-V")).toBe("U15.L04");
    expect(gateOf(BORROWED_CHORDS_DECK, "fact.borrowed.C-iv")).toBe("U16.L01");
    expect(gateOf(BORROWED_CHORDS_DECK, "fact.borrowed.C-bVI")).toBe("U16.L02");
    expect(gateOf(BORROWED_CHORDS_DECK, "fact.borrowed.G-bIII")).toBe("U16.L03");
    expect(gateOf(BORROWED_CHORDS_DECK, "fact.borrowed.picardy")).toBe("U16.L04");
    expect(gateOf(PIVOT_CHORDS_DECK, "fact.pivot.lift-half")).toBe("U17.L02");
  });
  test("every prompt states the form of its answer, uses no ASCII accidental in prose, and its own answer earns full credit", () => {
    for (const d of WAVE6_DECKS)
      for (const c of d.cards) {
        const text = c.prompt.text ?? "";
        expect([c.id, /Write /.test(text)]).toEqual([c.id, true]);
        // Chord and note names in prose carry ♯ and ♭ (the format examples in brackets and code spans may not).
        const prose = text
          .replace(/`[^`]*`/g, "")
          .replace(/\([^)]*\)/g, "")
          .replace(/Write .*$/, "");
        expect([c.id, /\b[A-G](#|b)\b/.test(prose)]).toEqual([c.id, false]);
        expect([c.id, credit(d, c.id, c.answer.text as string[])]).toEqual([c.id, 1]);
        for (const alt of c.accept ?? [])
          expect([c.id, alt.text, credit(d, c.id, alt.text as string[])]).toEqual([c.id, alt.text, 1]);
        expect([c.id, credit(d, c.id, ["zzz"])]).toEqual([c.id, 0]);
      }
  });
});

describe("the U12–U17 decks: every answer as @oak/theory gives it", () => {
  test("seventh-chord spellings are the chord's notes from the root up in stacked thirds; what each adds to its triad", () => {
    for (const [root, suffix, , notes] of SEVENTH_SPELLING_ROWS) {
      const chord = chordOf(`${root}${suffix}`);
      expect([root, suffix, [...pcs(notes)].sort()]).toEqual([
        root,
        suffix,
        [...theory.chordPcs(chord)].sort(),
      ]);
      expect(theory.pcOf(notes[0] as string)).toBe(chord.rootPc);
      // Stacked letters: every other letter from the root.
      const letters = notes.map((n) => "CDEFGAB".indexOf(n[0] as string));
      expect(letters.map((l) => (l - (letters[0] as number) + 7) % 7)).toEqual([0, 2, 4, 6]);
    }
    for (const [id, , triad, interval] of SEVENTH_FORMULA_ROWS) {
      const info = theory.seventhInfo(id as never);
      expect([id, info.seventh]).toEqual([id, interval]);
      expect([id, { maj: "major", min: "minor", dim: "diminished" }[info.triad]]).toEqual([id, triad]);
      expect([id, info.intervals[3]]).toEqual([id, { M7: 11, m7: 10 }[interval] as number]);
    }
    // A diminished seventh is minor 3rds all the way up.
    const dim7 = theory.seventhInfo("dim7");
    expect(dim7.intervals).toEqual([0, 3, 6, 9]);
    expect(answerOf(SEVENTH_CHORDS_DECK, "fact.seventh.dim7-half-steps")).toEqual(["3"]);
    expect(credit(SEVENTH_CHORDS_DECK, "fact.seventh.Cmaj7", ["c e g b"])).toBe(1);
    expect(credit(SEVENTH_CHORDS_DECK, "fact.seventh.Cmaj7", ["C E G Bb"])).toBeLessThan(1);
    expect(credit(SEVENTH_CHORDS_DECK, "fact.seventh.Bdim7", ["B D F G#"])).toBeLessThan(1);
  });
  test("diatonic sevenths: the quality on each degree of a major key, and the numerals of C major and A minor as chords", async () => {
    const major = theory.keySevenths(C);
    const quality = { "^7": "maj7", m7: "m7", "7": "7", m7b5: "m7b5" } as const;
    for (const [degree, numeral, suffix] of DIATONIC_SEVENTH_ROWS) {
      const k = major[degree - 1] as theory.KeyChord;
      expect([degree, k.chord.quality]).toEqual([degree, quality[suffix as keyof typeof quality]]);
      expect([degree, k.rn.replace("ø", "ø")]).toEqual([degree, numeral]);
      expect(answerOf(DIATONIC_SEVENTHS_DECK, `fact.diatonic7.quality-${degree}`)).toEqual([
        quality[suffix as keyof typeof quality],
      ]);
    }
    const minor = theory.keySevenths({ tonic: "A", mode: "minor" }, { form: "harmonic" });
    for (const [key, numeral, , symbol] of SEVENTH_NUMERAL_ROWS) {
      const table = key === "C major" ? major : minor;
      const want = table.find((k) => k.rn === numeral) as theory.KeyChord;
      expect([key, numeral, want !== undefined]).toEqual([key, numeral, true]);
      const got = chordOf(symbol);
      expect([key, numeral, got.rootPc, got.quality]).toEqual([
        key,
        numeral,
        want.chord.rootPc,
        want.chord.quality,
      ]);
    }
    // Every symbol the deck asks for is one `chord()` plays as that chord.
    for (const [, , , symbol] of SEVENTH_NUMERAL_ROWS) {
      const res = await evalHeadless(`setcpm(30)\n\nchords: chord("${symbol}").voicing().s("piano")`, 1);
      expect([symbol, res.logs]).toEqual([symbol, []]);
      const id = chordOf(symbol);
      const played = new Set(res.events.map((e) => (((e.midi as number) % 12) + 12) % 12));
      const want = theory.chordPcs(id) as number[];
      // Every played note is a chord tone, and every chord tone sounds except a plain fifth, which the
      // voicing dictionary may leave out of a seventh chord.
      const fifth = (id.rootPc + 7) % 12;
      expect([symbol, [...played].every((pc) => want.includes(pc))]).toEqual([symbol, true]);
      expect([symbol, want.filter((pc) => pc !== fifth).every((pc) => played.has(pc))]).toEqual([
        symbol,
        true,
      ]);
    }
    expect(credit(DIATONIC_SEVENTHS_DECK, "fact.diatonic7.quality-7", ["half-diminished"])).toBe(1);
    expect(credit(DIATONIC_SEVENTHS_DECK, "fact.diatonic7.C-IVmaj7", ["Fmaj7"])).toBe(1);
    expect(credit(DIATONIC_SEVENTHS_DECK, "fact.diatonic7.C-IVmaj7", ["F7"])).toBe(0);
    expect(credit(DIATONIC_SEVENTHS_DECK, "fact.diatonic7.quality-5", ["maj7"])).toBe(0);
  });
  test("modes: one changed note against the scale each is compared with, the chord that shows it, the white-key spellings", () => {
    for (const [name, parent, degree, , chord, home, notes] of MODE_ROWS) {
      const mode = name.toLowerCase() as theory.TaughtMode;
      const colour = theory.modeColour(mode) as theory.ModeColour;
      expect([name, colour.family]).toEqual([name, parent === "major" ? "major" : "minor"]);
      // The deck writes Dorian's tone as "6" (raised); theory names it by its sound against major.
      const tone = colour.characteristic[0] as string;
      expect([name, tone]).toEqual([name, degree]);
      expect([name, colour.colourChords.includes(chord)]).toEqual([name, true]);
      // Exactly one note differs from the parent scale on the same home.
      const key: KeySpec = { tonic: home, mode };
      const own = theory.scaleNotes(key);
      const parentNotes = theory.scaleNotes({ tonic: home, mode: parent === "major" ? "major" : "minor" });
      expect([name, own]).toEqual([name, notes]);
      expect([name, own.filter((n, i) => n !== parentNotes[i]).length]).toEqual([name, 1]);
      // The spelling uses the white keys only (the four homes of U14).
      expect([name, notes.every((n) => /^[A-G]$/.test(n))]).toEqual([name, true]);
    }
    expect(credit(MODES_DECK, "fact.mode.mixolydian-degree", ["♭7"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.mixolydian-degree", ["te"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.mixolydian-degree", ["7"])).toBe(0);
    expect(credit(MODES_DECK, "fact.mode.dorian-degree", ["6"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.dorian-degree", ["b6"])).toBe(0);
    expect(credit(MODES_DECK, "fact.mode.lydian-chord", ["II"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.lydian-chord", ["ii"])).toBe(0);
    expect(credit(MODES_DECK, "fact.mode.phrygian-parent", ["natural minor"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.D-dorian", ["D E F G A Bb C"])).toBeLessThan(1);
  });
  test("modes: the chord card asks for the one MAJOR chord beside home that holds the colour note (corrections pass)", () => {
    // theory-f 5: "which chord shows the colour" had more right answers than the card took (v in G Mixolydian,
    // Dm, holds F too). Every mode has a minor and a diminished chord with the colour note, and exactly one
    // major chord beside home: the one the card asks for.
    for (const [name, , , , chord, home] of MODE_ROWS) {
      const key: KeySpec = { tonic: home, mode: name.toLowerCase() as theory.TaughtMode };
      const colour = theory.modeColour(key.mode as theory.TaughtMode) as theory.ModeColour;
      const notes = theory.scaleNotes(key);
      const degree = Number((colour.characteristic[0] as string).replace(/[b#]/g, ""));
      const colourPc = theory.pcOf(notes[degree - 1] as string);
      const withColour = theory
        .diatonicChords(key)
        .filter((c) => c.rootPc !== theory.pcOf(home) && theory.chordPcs(c).includes(colourPc));
      const majors = withColour.filter((c) => c.quality === "maj");
      expect([name, majors.map((c) => theory.formatRN(theory.romanOf(c, key)))]).toEqual([name, [chord]]);
      // The other chords that hold it are minor or diminished, which the prompt rules out by asking for major.
      expect([name, withColour.length]).toEqual([name, 3]);
      const card = MODES_DECK.cards.find((c) => c.id === `fact.mode.${name.toLowerCase()}-chord`);
      expect([name, card?.prompt.text?.includes("Which major chord")]).toEqual([name, true]);
    }
    expect(credit(MODES_DECK, "fact.mode.mixolydian-chord", ["bVII"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.mixolydian-chord", ["♭VII"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.mixolydian-chord", ["v"])).toBe(0);
    expect(credit(MODES_DECK, "fact.mode.dorian-chord", ["IV"])).toBe(1);
    expect(credit(MODES_DECK, "fact.mode.phrygian-chord", ["bII"])).toBe(1);
  });
  test("the Dorian IV card asks what the chord is named after, not where a minor key borrows it (corrections pass)", () => {
    // theory-g 7: D F♯ A in A minor is in A Dorian, A major and A melodic minor, and U16.L04 says it comes from
    // A major; the card now asks for the mode it is named after, the minor scale with only 6 raised.
    const A: KeySpec = { tonic: "A", mode: "minor" };
    const four = theory.dorianFour(A).chord;
    for (const mode of ["dorian", "major", "melodic minor"] as const) {
      const fours = theory.diatonicChords({ tonic: "A", mode }).filter((c) => c.rootPc === four.rootPc);
      expect([mode, fours.map((c) => c.quality)]).toEqual([mode, ["maj"]]);
    }
    const dorian = theory.scaleNotes({ tonic: "A", mode: "dorian" });
    const minor = theory.scaleNotes({ tonic: "A", mode: "minor" });
    expect(dorian.filter((n, i) => n !== minor[i])).toEqual(["F#"]);
    const card = BORROWED_CHORDS_DECK.cards.find((c) => c.id === "fact.borrowed.dorian-iv");
    expect(card?.prompt.text).toContain("named after which mode");
    expect(card?.prompt.text).toContain("only its 6th raised");
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.dorian-iv", ["Dorian"])).toBe(1);
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.dorian-iv", ["dorian mode"])).toBe(1);
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.dorian-iv", ["melodic minor"])).toBe(0);
  });
  test("secondary dominants: V7 of each target, the chromatic degree it brings, a fifth above its target, vii°/V", () => {
    for (const [tonic, target, symbol] of APPLIED_ROWS) {
      const key: KeySpec = { tonic, mode: "major" };
      const degree = { V: 5, vi: 6, ii: 2, IV: 4 }[target] as number;
      const applied = theory.appliedChord("V7", degree, key) as theory.AppliedChord;
      expect([tonic, target, applied.rn]).toEqual([tonic, target, `V7/${target}`]);
      const got = chordOf(symbol);
      expect([tonic, target, got.rootPc, got.quality]).toEqual([tonic, target, applied.chord.rootPc, "7"]);
      // Its root is a perfect 5th above its target's.
      expect((applied.chord.rootPc - applied.target.chord.rootPc + 12) % 12).toBe(7);
    }
    for (const [target, degree] of APPLIED_DEGREE_ROWS) {
      const n = { V: 5, vi: 6, ii: 2, IV: 4 }[target] as number;
      const applied = theory.appliedChord("V7", n, C) as theory.AppliedChord;
      // The one note from outside the key: the dominant's 3rd (its leading tone), or its 7th for V7/IV.
      const outside = applied.chromatic.map((name) => {
        // The degree by its letter (C♯ is a raised 1, B♭ a lowered 7), as U15.L01 names chromatic degrees.
        const n = "CDEFGAB".indexOf(name[0] as string) + 1;
        return `${name.endsWith("#") ? "#" : name.endsWith("b") ? "b" : ""}${n}`;
      });
      expect([target, outside]).toEqual([target, [degree]]);
    }
    const lt = theory.appliedChord("viio", 5, C) as theory.AppliedChord;
    const fSharpDim = chordOf(answerOf(APPLIED_DOMINANTS_DECK, "fact.applied.C-viio-of-V")[0] as string);
    expect([fSharpDim.rootPc, fSharpDim.quality]).toEqual([lt.chord.rootPc, lt.chord.quality]);
    expect(credit(APPLIED_DOMINANTS_DECK, "fact.applied.C-V7-of-V", ["d7"])).toBe(1);
    expect(credit(APPLIED_DOMINANTS_DECK, "fact.applied.C-V7-of-V", ["Dm7"])).toBe(0);
    expect(credit(APPLIED_DOMINANTS_DECK, "fact.applied.degree-of-V", ["fi"])).toBe(1);
    expect(credit(APPLIED_DOMINANTS_DECK, "fact.applied.degree-of-IV", ["♭7"])).toBe(1);
    expect(credit(APPLIED_DOMINANTS_DECK, "fact.applied.root-above-target", ["perfect 5th"])).toBe(1);
    expect(credit(APPLIED_DOMINANTS_DECK, "fact.applied.root-above-target", ["P4"])).toBe(0);
  });
  test("borrowed chords: each as @oak/theory's borrowedChords gives it in C and in G, in its lesson; iv lowers 6", () => {
    for (const [numeral, inC, inG, gate] of BORROWED_ROWS) {
      for (const [tonic, symbol] of [
        ["C", inC],
        ["G", inG],
      ] as const) {
        const b = theory
          .borrowedChords({ tonic, mode: "major" })
          .find((x) => x.rn === numeral) as theory.BorrowedChord;
        const got = chordOf(symbol);
        expect([tonic, numeral, got.rootPc, got.quality]).toEqual([
          tonic,
          numeral,
          b.chord.rootPc,
          b.chord.quality,
        ]);
        expect([numeral, b.lesson]).toEqual([numeral, gate ?? "U16.L01"]);
      }
    }
    const iv = theory.borrowedChords(C).find((x) => x.rn === "iv") as theory.BorrowedChord;
    expect(iv.lowered).toEqual(["b6"]);
    expect(answerOf(BORROWED_CHORDS_DECK, "fact.borrowed.iv-lowers")).toEqual(["6"]);
    const A: KeySpec = { tonic: "A", mode: "minor" };
    expect(theory.picardy(A).chord.quality).toBe("maj");
    expect(theory.dorianFour(A).chord.quality).toBe("maj");
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.C-iv", ["F minor"])).toBe(1);
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.C-iv", ["F"])).toBe(0);
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.C-bVI", ["Am"])).toBe(0);
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.source", ["relative"])).toBe(0);
    expect(credit(BORROWED_CHORDS_DECK, "fact.borrowed.dorian-iv", ["dorian"])).toBe(1);
  });
  test("pivots: one chord named in two keys as pivotChords names it; the confirming dominants; where a lift lands", () => {
    for (const [chord, inC, other, there] of PIVOT_ROWS) {
      const to: KeySpec = other === "G major" ? { tonic: "G", mode: "major" } : { tonic: "A", mode: "minor" };
      const shared = theory.pivotChords(C, to);
      const got = chordOf(chord);
      const p = shared.find(
        (x) => x.chord.rootPc === got.rootPc && x.chord.quality === got.quality,
      ) as theory.PivotChord;
      expect([chord, other, p !== undefined]).toEqual([chord, other, true]);
      expect([chord, other, p.from, p.to]).toEqual([chord, other, inC, there]);
    }
    // V7 of the new key.
    const d7 = chordOf(answerOf(PIVOT_CHORDS_DECK, "fact.pivot.confirm-G")[0] as string);
    expect([(d7.rootPc - theory.pcOf("G") + 12) % 12, d7.quality]).toEqual([7, "7"]);
    const e7 = chordOf(answerOf(PIVOT_CHORDS_DECK, "fact.pivot.confirm-Am")[0] as string);
    expect([(e7.rootPc - theory.pcOf("A") + 12) % 12, e7.quality]).toEqual([7, "7"]);
    expect(theory.pcOf("D") - theory.pcOf("C")).toBe(2);
    expect(theory.pcOf("Db") - theory.pcOf("C")).toBe(1);
    expect(credit(PIVOT_CHORDS_DECK, "fact.pivot.lift-half", ["C# major"])).toBe(1);
    expect(credit(PIVOT_CHORDS_DECK, "fact.pivot.lift-half", ["D major"])).toBe(0);
    expect(credit(PIVOT_CHORDS_DECK, "fact.pivot.Am-in-G-major", ["ii"])).toBe(1);
    expect(credit(PIVOT_CHORDS_DECK, "fact.pivot.Am-in-G-major", ["II"])).toBe(0);
  });
});
