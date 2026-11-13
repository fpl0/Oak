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
  accept: signatureWords(accidentals).map((w) => ({ text: [w] })),
});
/** The count in words, also accepted: "2 sharps", "1 flat". */
export function signatureWords(n: number): string[] {
  if (n === 0) return ["none", "0 sharps", "0 flats"];
  const k = Math.abs(n);
  return [`${k} ${n > 0 ? "sharp" : "flat"}${k === 1 ? "" : "s"}`];
}

/** The order of sharps and of flats on the staff. */
export const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;
export const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"] as const;
/** The sharps or flats of a major key, spelled, in written order: A major → F# C# G#. */
export function signatureSpelled(accidentals: number): string[] {
  return accidentals >= 0
    ? SHARP_ORDER.slice(0, accidentals).map((l) => `${l}#`)
    : FLAT_ORDER.slice(0, -accidentals).map((l) => `${l}b`);
}
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Key from its signature (can-do cd.read.keysig): "Which major key has 3 flats?" → E♭. */
const keyFromSignatureCard = ([tonic, n, gate]: [string, number, LessonId | undefined]): FactCardDef => ({
  id: `fact.keysig.from-${Math.abs(n)}${n > 0 ? "s" : "b"}` as FactId,
  ...(gate ? { gate } : {}),
  prompt: {
    text: `Which major key has ${plural(Math.abs(n), n > 0 ? "sharp" : "flat")}? Write the key's letter, with # or b if it has one.`,
  },
  answer: { text: [tonic] },
  accept: [{ text: [`${tonic} major`] }],
});
/** A major key's signature spelled, in written order: the scale's sharps or flats. */
const spelledCard = ([tonic, n, gate]: [string, number, LessonId | undefined]): FactCardDef => ({
  id: `fact.keysig.spell-${tonic.replace("#", "s")}-major` as FactId,
  ...(gate ? { gate } : {}),
  prompt: {
    text: `Which notes are ${n > 0 ? "sharp" : "flat"} in ${display(tonic)} major? Write them in the order they appear in the key signature, separated by spaces.`,
  },
  answer: { text: signatureSpelled(n) },
});
/** The order of sharps and of flats, and where the last accidental sits in the key. */
const ORDER_CARDS: FactCardDef[] = [
  {
    id: "fact.keysig.order-sharps" as FactId,
    prompt: { text: "Write the order of sharps in a key signature: the seven letters, separated by spaces." },
    answer: { text: [...SHARP_ORDER] },
    accept: [{ text: SHARP_ORDER.map((l) => `${l}#`) }],
  },
  {
    id: "fact.keysig.order-flats" as FactId,
    gate: "U03.L07",
    prompt: { text: "Write the order of flats in a key signature: the seven letters, separated by spaces." },
    answer: { text: [...FLAT_ORDER] },
    accept: [{ text: FLAT_ORDER.map((l) => `${l}b`) }],
  },
  {
    id: "fact.keysig.last-sharp" as FactId,
    prompt: {
      text: "In a major key with sharps, the last sharp of the signature is which degree of the key? Write the number.",
    },
    // The leading tone, a half step below home: D major's last sharp is C♯.
    answer: { text: ["7"] },
    accept: [{ text: ["ti"] }],
  },
  {
    id: "fact.keysig.last-flat" as FactId,
    gate: "U03.L07",
    prompt: {
      text: "In a major key with flats, the last flat of the signature is which degree of the key? Write the number.",
    },
    // Degree 4: E♭ major's last flat is A♭.
    answer: { text: ["4"] },
    accept: [{ text: ["fa"] }],
  },
];

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
    ...MAJOR_SIGNATURES.map(keyFromSignatureCard),
    ...MAJOR_SIGNATURES.map(spelledCard),
    ...ORDER_CARDS,
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

// --- interval names (U04) ---------------------------------------------------------------------------

/**
 * [name as quality + number, half steps, Strudel's string for `.transpose()`, words, gate]. The tritone
 * is named in U04.L03; augmented and diminished as words wait for U05.L03, so its card asks for "tritone"
 * and accepts the spellings U04.CP allows (4A, 5d) and the short ones.
 */
export const INTERVAL_ROWS: readonly [string, number, string, string, LessonId | undefined][] = [
  ["m2", 1, "2m", "minor 2nd", undefined],
  ["M2", 2, "2M", "major 2nd", undefined],
  ["m3", 3, "3m", "minor 3rd", undefined],
  ["M3", 4, "3M", "major 3rd", undefined],
  ["P4", 5, "4P", "perfect 4th", undefined],
  ["TT", 6, "4A", "tritone", "U04.L03"],
  ["P5", 7, "5P", "perfect 5th", undefined],
  ["m6", 8, "6m", "minor 6th", undefined],
  ["M6", 9, "6M", "major 6th", undefined],
  ["m7", 10, "7m", "minor 7th", undefined],
  ["M7", 11, "7M", "major 7th", undefined],
  ["P8", 12, "8P", "octave", undefined],
];
const article = (w: string) => (/^[aeiou]/.test(w) ? "an" : "a");
/** The name from the half steps: "Which interval spans 4 half steps?" → M3 (also 3M, "major 3rd"). */
const semisToName = ([name, semis, code, words, gate]: (typeof INTERVAL_ROWS)[number]): FactCardDef => ({
  id: `fact.int.semis-${semis}` as FactId,
  ...(gate ? { gate } : {}),
  prompt: {
    text: `Which interval spans ${plural(semis, "half step")}? Write its quality letter and number (M for major, m for minor, P for perfect), or its name.`,
  },
  answer: { text: [name === "TT" ? "tritone" : name] },
  accept: [...(name === "TT" ? ["TT", "A4", "d5", "4A", "5d"] : [code, words]).map((t) => ({ text: [t] }))],
});
/** The half steps from the name: "How many half steps in a major 3rd?" → 4. */
const nameToSemis = ([name, semis, , words, gate]: (typeof INTERVAL_ROWS)[number]): FactCardDef => ({
  id: `fact.int.${name}-semis` as FactId,
  ...(gate ? { gate } : {}),
  prompt: { text: `How many half steps in ${article(words)} ${words}? Write the number.` },
  answer: { text: [String(semis)] },
});
/** Strudel's string for an interval (U04.L02 `.transpose("3M")`): quality after the number. */
const CODE_FORMS = ["m3", "M3", "P4", "P5", "M2", "P8"];
const nameToCode = ([name, , code, words]: (typeof INTERVAL_ROWS)[number]): FactCardDef => ({
  id: `fact.int.code-${name}` as FactId,
  prompt: {
    text: `Write ${article(words)} ${words} up as \`.transpose()\` takes it: the number, then the quality letter.`,
  },
  answer: { text: [code] },
});

/**
 * Interval names (I02, I03): ready, not yet in `decks`. Contracts §7.3 lists the course's fact decks and
 * content/validate/contracts-sync.test.ts holds the catalog to it, so this deck joins `decks` (and its card
 * IDs the ledger) when the row is added there (Wave 3 report).
 */
export const INTERVAL_NAMES: FactDeck = defineDeck({
  id: "deck.int.names" as DeckId,
  title: "Interval names",
  unlock: { skill: "I02", lesson: "U04.L02" },
  cards: [
    ...INTERVAL_ROWS.map(semisToName),
    ...INTERVAL_ROWS.map(nameToSemis),
    ...INTERVAL_ROWS.filter(([name]) => CODE_FORMS.includes(name)).map(nameToCode),
  ],
  newPerDay: 3,
  fastRtMs: 4000,
  answer: "text",
});
// --- U05–U07: triad spellings, numerals and qualities in a key, cadence names ----------------------

const lead = (name: string): string => name.replace("#", "♯").replace(/^([A-G])b/, "$1♭");
const QUALITY_WORDS: Readonly<Record<"maj" | "min" | "dim" | "aug", string>> = {
  maj: "major",
  min: "minor",
  dim: "diminished",
  aug: "augmented",
};
/**
 * [root, quality, the notes from the root up, gate]: the major and minor triads of the keys the course plays in
 * (U05.L02), and the diminished and augmented triads U05.L03 builds (B°, C+). Small on purpose: the spelling of
 * any triad is `fam.chd.spell`'s; these are the ones worth knowing by heart. Spelled by stacked letters (@oak/theory
 * checks each in decks.test.ts).
 */
export const TRIAD_ROWS: readonly [string, "maj" | "min" | "dim" | "aug", string[], LessonId | undefined][] =
  [
    ["C", "maj", ["C", "E", "G"], undefined],
    ["D", "maj", ["D", "F#", "A"], undefined],
    ["F", "maj", ["F", "A", "C"], undefined],
    ["G", "maj", ["G", "B", "D"], undefined],
    ["A", "maj", ["A", "C#", "E"], undefined],
    ["A", "min", ["A", "C", "E"], undefined],
    ["D", "min", ["D", "F", "A"], undefined],
    ["E", "min", ["E", "G", "B"], undefined],
    ["C", "min", ["C", "Eb", "G"], undefined],
    ["B", "dim", ["B", "D", "F"], "U05.L03"],
    ["C", "aug", ["C", "E", "G#"], "U05.L03"],
  ];
const triadId = (root: string, q: string): FactId => `fact.triad.${root.replace("#", "s")}-${q}` as FactId;
export const TRIAD_SPELLINGS: FactDeck = defineDeck({
  id: "deck.chd.triads" as DeckId,
  title: "Triad spellings",
  unlock: { skill: "C02", lesson: "U05.L02" },
  cards: TRIAD_ROWS.map(([root, q, notes, gate]) => ({
    id: triadId(root, q),
    ...(gate ? { gate } : {}),
    prompt: {
      text: `Spell ${lead(root)} ${QUALITY_WORDS[q]} from the root up. Write its three note names, separated by spaces.`,
    },
    answer: { text: notes },
  })),
  newPerDay: 2,
  fastRtMs: 6000,
  answer: "text",
});

/** Diatonic triads of a major key: [degree, numeral, quality]. */
export const DIATONIC_TRIADS: readonly [number, string, "maj" | "min" | "dim"][] = [
  [1, "I", "maj"],
  [2, "ii", "min"],
  [3, "iii", "min"],
  [4, "IV", "maj"],
  [5, "V", "maj"],
  [6, "vi", "min"],
  [7, "viio", "dim"],
];
const NUMERAL_FORMAT =
  "Write the Roman numeral: upper case for a major triad, lower case for minor, lower case with o after it for diminished.";
const SYMBOL_FORMAT = "Write its chord symbol: the root, then m for minor or o for diminished.";
/** [key, numeral, the chord's symbol] for the numeral-to-chord cards (the keys U06 moves the loops into). */
export const NUMERAL_CHORDS: readonly [string, string, string][] = [
  ["G", "ii", "Am"],
  ["G", "vi", "Em"],
  ["F", "IV", "Bb"],
  ["F", "ii", "Gm"],
  ["D", "V", "A"],
  ["D", "vi", "Bm"],
];
const symbolWords = (symbol: string): string[] => {
  const m = /^([A-G][#b]?)(m|o)?$/.exec(symbol) as RegExpExecArray;
  const root = m[1] as string;
  if (m[2] === "m") return [`${root}min`, `${root} minor`];
  if (m[2] === "o") return [`${root}dim`, `${root}°`, `${root} diminished`];
  return [`${root}maj`, `${root} major`];
};
export const NUMERALS: FactDeck = defineDeck({
  id: "deck.har.rn" as DeckId,
  title: "Roman numerals in a key",
  unlock: { skill: "N06", lesson: "U06.L02" },
  cards: [
    // The triad on each degree of C major, as a numeral.
    ...DIATONIC_TRIADS.map(([degree, numeral]) => ({
      id: `fact.rn.C-${degree}` as FactId,
      prompt: {
        text: `In C major, which numeral names the triad built on degree ${degree}? ${NUMERAL_FORMAT}`,
      },
      answer: { text: [numeral] },
      ...(numeral === "viio" ? { accept: [{ text: ["vii°"] }] } : {}),
    })),
    // The quality on each degree of any major key.
    ...DIATONIC_TRIADS.map(([degree, , q]) => ({
      id: `fact.rn.quality-${degree}` as FactId,
      prompt: {
        text: `In any major key, what quality is the triad on degree ${degree}? Write major, minor or diminished.`,
      },
      answer: { text: [QUALITY_WORDS[q]] },
      accept:
        q === "maj"
          ? [{ text: ["maj"] }]
          : q === "min"
            ? [{ text: ["min"] }, { text: ["m"] }]
            : [{ text: ["dim"] }],
    })),
    // A numeral in G, F or D as the chord it names.
    ...NUMERAL_CHORDS.map(([key, numeral, symbol]) => ({
      id: `fact.rn.${key}-${numeral}` as FactId,
      prompt: {
        text: `In ${lead(key)} major, which chord is ${numeral === "viio" ? "vii°" : numeral}? ${SYMBOL_FORMAT}`,
      },
      answer: { text: [symbol] },
      accept: symbolWords(symbol).map((t) => ({ text: [t] })),
    })),
  ],
  newPerDay: 2,
  fastRtMs: 5000,
  answer: "text",
});

const CADENCE_FORMAT = "Write its abbreviation (PAC, IAC, HC, PC or DC) or its name.";
/** [id, prompt, answer, accepted names, gate]: deceptive from U06.L06, plagal from U06.L07. */
export const CADENCE_ROWS: readonly [string, string, string[], string[], LessonId | undefined][] = [
  [
    "pac",
    "A phrase ends V to I, both in root position, with the tune on 1. Which cadence is it?",
    ["PAC"],
    ["perfect authentic", "perfect authentic cadence"],
    undefined,
  ],
  [
    "iac",
    "A phrase ends V to I with the tune on 3. Which cadence is it?",
    ["IAC"],
    ["imperfect authentic", "imperfect authentic cadence"],
    undefined,
  ],
  [
    "hc",
    "A phrase stops on V, as if asking a question. Which cadence is it?",
    ["HC"],
    ["half", "half cadence"],
    undefined,
  ],
  [
    "dc",
    "A phrase goes V to vi where you expected I. Which cadence is it?",
    ["DC"],
    ["deceptive", "deceptive cadence"],
    "U06.L06",
  ],
  [
    "pc",
    "A phrase ends IV to I, the soft amen. Which cadence is it?",
    ["PC"],
    ["plagal", "plagal cadence"],
    "U06.L07",
  ],
];
export const CADENCE_NAMES: FactDeck = defineDeck({
  id: "deck.har.cadence" as DeckId,
  title: "Cadence names",
  unlock: { skill: "H03", lesson: "U06.L04" },
  cards: [
    ...CADENCE_ROWS.map(([id, text, answer, names, gate]) => ({
      id: `fact.cadence.${id}` as FactId,
      ...(gate ? { gate } : {}),
      prompt: { text: `${text} ${CADENCE_FORMAT}` },
      answer: { text: answer },
      accept: names.map((n) => ({ text: [n] })),
    })),
    {
      id: "fact.cadence.half-chord" as FactId,
      prompt: { text: `A half cadence ends on which chord? ${NUMERAL_FORMAT}` },
      answer: { text: ["V"] },
    },
    {
      id: "fact.cadence.deceptive-chord" as FactId,
      gate: "U06.L06",
      prompt: { text: `In a deceptive cadence, V goes to which chord? ${NUMERAL_FORMAT}` },
      answer: { text: ["vi"] },
    },
    {
      id: "fact.cadence.plagal-chords" as FactId,
      gate: "U06.L07",
      prompt: {
        text: `Which two chords make a plagal cadence, in order? Write their numerals, separated by a space.`,
      },
      answer: { text: ["IV", "I"] },
    },
  ],
  newPerDay: 2,
  fastRtMs: 5000,
  answer: "text",
});

/** Decks written and tested but waiting for their contracts row (see INTERVAL_NAMES). */
export const PENDING_DECKS: readonly FactDeck[] = [INTERVAL_NAMES, TRIAD_SPELLINGS, NUMERALS, CADENCE_NAMES];

export const decks: readonly FactDeck[] = [STAFF_NAMES, KEY_SIGNATURES, CHORD_SYMBOLS];
export const deckById: ReadonlyMap<string, FactDeck> = new Map(decks.map((d) => [d.id, d] as const));
