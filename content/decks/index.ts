// The fact decks of contracts §7.3: staff note names, key signatures and chord symbols. This is the one
// source of truth for fact cards (decision 11 of docs/decisions.md): the card IDs are locked in
// content/ids.lock.json, the server and the app read the decks from here through content/families.ts,
// and @oak/drills only grades them (`bindDeck`). Every answer is checked against @oak/theory in
// content/decks/decks.test.ts.
import {
  type DeckId,
  defineDeck,
  type FactCardDef,
  type FactDeck,
  type FactId,
  type LessonId,
} from "@oak/content-kit";

// --- staff names ----------------------------------------------------------------------------------

/** Treble: middle C to A5 (lines, spaces and the first ledger lines). Bass: E2 to middle C. */
export const TREBLE_NOTES = [
  "C4",
  "D4",
  "E4",
  "F4",
  "G4",
  "A4",
  "B4",
  "C5",
  "D5",
  "E5",
  "F5",
  "G5",
  "A5",
] as const;
export const BASS_NOTES = [
  "E2",
  "F2",
  "G2",
  "A2",
  "B2",
  "C3",
  "D3",
  "E3",
  "F3",
  "G3",
  "A3",
  "B3",
  "C4",
] as const;
const staffCard = (clef: "treble" | "bass", note: string, gate?: LessonId): FactCardDef => ({
  id: `fact.staff.${clef}.${note}` as FactId,
  ...(gate ? { gate } : {}),
  prompt: { text: "Name this note (the letter only).", staff: { clef, notes: [note] } },
  answer: { text: [note.replace(/\d/, "")] },
});

// --- key signatures -------------------------------------------------------------------------------

/** [tonic, signed accidentals, gate]: sharps from U03.L06, flats from U03.L07, minor keys from U10.L02. */
export const MAJOR_SIGNATURES: readonly [string, number, LessonId | undefined][] = [
  ["G", 1, undefined],
  ["D", 2, undefined],
  ["A", 3, undefined],
  ["E", 4, undefined],
  ["B", 5, undefined],
  ["F#", 6, undefined],
  ["F", -1, "U03.L07"],
  ["Bb", -2, "U03.L07"],
  ["Eb", -3, "U03.L07"],
  ["Ab", -4, "U03.L07"],
  ["Db", -5, "U03.L07"],
];
/** Relative minors of the keys above, with the same signatures. */
export const MINOR_SIGNATURES: readonly [string, number][] = [
  ["E", 1],
  ["B", 2],
  ["F#", 3],
  ["C#", 4],
  ["D", -1],
  ["G", -2],
  ["C", -3],
  ["F", -4],
];
/** The typed answer: "2#", "3b". */
export const signatureText = (n: number): string => (n === 0 ? "0" : n > 0 ? `${n}#` : `${-n}b`);
const display = (tonic: string): string => tonic.replace("#", "♯").replace(/^([A-G])b/, "$1♭");
const keyCard = (
  tonic: string,
  mode: "major" | "minor",
  accidentals: number,
  gate?: LessonId,
): FactCardDef => ({
  id: `fact.keysig.${tonic.replace("#", "s")}-${mode}` as FactId,
  ...(gate ? { gate } : {}),
  prompt: { text: `How many sharps or flats in ${display(tonic)} ${mode}? Write it as 2#, 3b, …` },
  answer: { text: [signatureText(accidentals)] },
});

// --- chord symbols --------------------------------------------------------------------------------

/**
 * [code suffix of STYLE §5.1, quality name, gate]. Roots are fixed so the deck stays small; the answer is
 * the symbol as Strudel's `chord()` takes it (`C^7`, not `Cmaj7`, which is silent there).
 */
export const CHORD_SYMBOL_ROWS: readonly [string, string, LessonId][] = [
  ["", "major", "U05.L04"],
  ["m", "minor", "U05.L04"],
  ["o", "diminished", "U05.L04"],
  ["aug", "augmented", "U05.L04"],
  ["7", "dominant seventh", "U11.L04"],
  ["^7", "major seventh", "U12.L01"],
  ["m7", "minor seventh", "U12.L01"],
  ["m7b5", "half-diminished seventh", "U12.L03"],
  ["o7", "diminished seventh", "U12.L03"],
  ["6", "major sixth", "J1.L02"],
  ["m6", "minor sixth", "J1.L02"],
  ["sus", "suspended fourth", "J1.L02"],
];
export const CHORD_ROOTS = ["C", "F", "G", "D", "Bb"] as const;
/** The locked card ID of a symbol: `^` → `maj`, `o` → `dim` (`fact.chord.Bbm7b5`, `fact.chord.Cdim7`). */
export const chordCardId = (root: string, suffix: string): FactId =>
  `fact.chord.${root}${suffix.replace("^", "maj").replace("o", "dim")}` as FactId;

// --- the decks ------------------------------------------------------------------------------------

export const STAFF_NAMES: FactDeck = defineDeck({
  id: "deck.pit.staff-names" as DeckId,
  title: "Staff note names",
  unlock: { skill: "N02", lesson: "U02.L04" },
  cards: [
    ...TREBLE_NOTES.map((n) => staffCard("treble", n)),
    ...BASS_NOTES.map((n) => staffCard("bass", n, "U05.L06")),
  ],
  newPerDay: 4,
  fastRtMs: 2500,
  answer: "text",
});

export const KEY_SIGNATURES: FactDeck = defineDeck({
  id: "deck.key.signature" as DeckId,
  title: "Key signatures",
  unlock: { skill: "S04", lesson: "U03.L06" },
  cards: [
    ...MAJOR_SIGNATURES.map(([k, n, gate]) => keyCard(k, "major", n, gate)),
    ...MINOR_SIGNATURES.map(([k, n]) => keyCard(k, "minor", n, "U10.L02")),
  ],
  newPerDay: 3,
  fastRtMs: 3000,
  answer: "text",
});

export const CHORD_SYMBOLS: FactDeck = defineDeck({
  id: "deck.chd.symbols" as DeckId,
  title: "Chord symbols",
  unlock: { skill: "N05", lesson: "U05.L04" },
  cards: CHORD_SYMBOL_ROWS.flatMap(([suffix, name, gate]) =>
    CHORD_ROOTS.map(
      (root): FactCardDef => ({
        id: chordCardId(root, suffix),
        ...(gate !== "U05.L04" ? { gate } : {}),
        prompt: { text: `Write ${display(root)} ${name} as a chord symbol for \`chord()\`.` },
        answer: { text: [`${root}${suffix}`] },
      }),
    ),
  ),
  newPerDay: 3,
  fastRtMs: 3000,
  answer: "text",
});

export const decks: readonly FactDeck[] = [STAFF_NAMES, KEY_SIGNATURES, CHORD_SYMBOLS];
export const deckById: ReadonlyMap<string, FactDeck> = new Map(decks.map((d) => [d.id, d] as const));
