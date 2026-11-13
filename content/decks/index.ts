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
  newPerDay: 1,
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
  newPerDay: 1,
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
  newPerDay: 1,
  fastRtMs: 5000,
  answer: "text",
});

// --- U10–U11: minor keys, minor-key chords, scales as degrees, the twelve bars, dominant sevenths -----

/** A text card with its accepted alternatives. */
const card = (
  id: string,
  text: string,
  answer: string[],
  opts: { gate?: LessonId; accept?: string[][] } = {},
): FactCardDef => ({
  id: `fact.${id}` as FactId,
  ...(opts.gate ? { gate: opts.gate } : {}),
  prompt: { text },
  answer: { text: answer },
  ...(opts.accept ? { accept: opts.accept.map((t) => ({ text: t })) } : {}),
});
const KEY_FORMAT = "Write the key: its letter (with # or b if it has one), then major or minor.";

/**
 * Relative pairs (U10.L02): [major tonic, its relative minor's tonic], the keys U10 and its Makes move between,
 * up to three sharps or flats.
 */
export const RELATIVE_PAIRS: readonly [string, string][] = [
  ["C", "A"],
  ["G", "E"],
  ["D", "B"],
  ["A", "F#"],
  ["F", "D"],
  ["Bb", "G"],
  ["Eb", "C"],
];
const slug = (tonic: string) => tonic.replace("#", "s");
/**
 * Minor keys and their twins (S06, S07, S08): the relative minor of a major key and back (U10.L02), the parallel
 * minor's three extra flats and where the relative minor's home sits, then the degrees harmonic minor (U10.L06)
 * and melodic minor (U10.L08) raise.
 */
export const MINOR_KEYS: FactDeck = defineDeck({
  id: "deck.key.minor" as DeckId,
  title: "Minor keys and their twins",
  unlock: { skill: "S06", lesson: "U10.L02" },
  cards: [
    ...RELATIVE_PAIRS.map(([major, minor]) =>
      card(
        `minor.relative-of-${slug(major)}`,
        `What is the relative minor of ${display(major)} major? ${KEY_FORMAT}`,
        [`${minor} minor`],
        {
          accept: [[`${minor}m`]],
        },
      ),
    ),
    ...RELATIVE_PAIRS.filter(([, minor]) => ["A", "E", "D", "G"].includes(minor)).map(([major, minor]) =>
      card(
        `minor.relative-major-of-${slug(minor)}`,
        `What is the relative major of ${display(minor)} minor? ${KEY_FORMAT}`,
        [`${major} major`],
        {
          accept: [[major]],
        },
      ),
    ),
    card(
      "minor.relative-home",
      "A major key's relative minor has its home on which degree of the major key? Write the number.",
      ["6"],
      { accept: [["la"]] },
    ),
    card(
      "minor.parallel-flats",
      "A parallel minor (C minor beside C major) has how many more flats, or fewer sharps, than its major? Write the number.",
      ["3"],
      { accept: [["three"]] },
    ),
    card(
      "minor.harmonic-raises",
      "Harmonic minor raises which degree of natural minor? Write the number.",
      ["7"],
      { gate: "U10.L06", accept: [["ti"]] },
    ),
    card(
      "minor.melodic-raises",
      "Melodic minor, going up, raises which two degrees of natural minor? Write the numbers, separated by a space.",
      ["6", "7"],
      { gate: "U10.L08", accept: [["la", "ti"]] },
    ),
  ],
  newPerDay: 1,
  fastRtMs: 5000,
  answer: "text",
});

const MINOR_NUMERAL_FORMAT =
  "Write the Roman numeral: upper case for a major triad, lower case for minor, lower case with o after it for diminished.";
/** [degree, natural-minor numeral, quality word]: the chords of a minor key (U10.L04). */
export const MINOR_TRIADS: readonly [number, string, "major" | "minor" | "diminished"][] = [
  [1, "i", "minor"],
  [2, "iio", "diminished"],
  [3, "III", "major"],
  [4, "iv", "minor"],
  [5, "v", "minor"],
  [6, "VI", "major"],
  [7, "VII", "major"],
];
const MINOR_DEGREE_WORDS = ["1", "2", "♭3", "4", "5", "♭6", "♭7"];
/** [numeral, the chord in A minor]: the numerals of A minor, the key U10 plays in, as chords. */
export const A_MINOR_CHORDS: readonly [string, string, LessonId | undefined][] = [
  ["iv", "Dm", undefined],
  ["v", "Em", undefined],
  ["VI", "F", undefined],
  ["III", "C", undefined],
  ["VII", "G", undefined],
  ["V", "E", "U10.L06"],
  ["viio", "G#o", "U10.L06"],
];
/**
 * Chords of a minor key (H07, H08, H09): the quality on each degree of natural minor and the numerals of A minor
 * (U10.L04), the Aeolian loop (U10.L05), the major V and vii° of harmonic minor (U10.L06), the Andalusian
 * cadence (U10.L07).
 */
export const MINOR_CHORDS: FactDeck = defineDeck({
  id: "deck.har.minor" as DeckId,
  title: "Chords of a minor key",
  unlock: { skill: "H07", lesson: "U10.L04" },
  cards: [
    ...MINOR_TRIADS.map(([degree, , q]) =>
      card(
        `minor.quality-${degree}`,
        `In natural minor, what quality is the triad on degree ${MINOR_DEGREE_WORDS[degree - 1]}? Write major, minor or diminished.`,
        [q],
        { accept: q === "major" ? [["maj"]] : q === "minor" ? [["min"], ["m"]] : [["dim"]] },
      ),
    ),
    ...A_MINOR_CHORDS.map(([numeral, symbol, gate]) =>
      card(
        `minor.A-${numeral}`,
        `In A minor, which chord is ${numeral === "viio" ? "vii°" : numeral}? ${SYMBOL_FORMAT}`,
        [symbol],
        { ...(gate ? { gate } : {}), accept: symbolWords(symbol).map((t) => [t]) },
      ),
    ),
    card(
      "minor.aeolian-loop",
      `Write the Aeolian loop (Am F C G in A minor) in numerals. ${MINOR_NUMERAL_FORMAT} Separate them with spaces.`,
      ["i", "VI", "III", "VII"],
      { gate: "U10.L05" },
    ),
    card(
      "minor.harmonic-v-quality",
      "In harmonic minor, what quality is the triad on 5? Write major, minor or diminished.",
      ["major"],
      { gate: "U10.L06", accept: [["maj"]] },
    ),
    card(
      "minor.andalusian",
      `Write the Andalusian cadence (Am G F E in A minor) in numerals. ${MINOR_NUMERAL_FORMAT} Separate them with spaces.`,
      ["i", "VII", "VI", "V"],
      { gate: "U10.L07" },
    ),
  ],
  newPerDay: 1,
  fastRtMs: 5000,
  answer: "text",
});

const DEGREE_FORMAT =
  "Write the degrees in order from 1, separated by spaces, with b before a flattened degree (b3).";
const SPELL_FORMAT = "Write the notes from the tonic up, separated by spaces, with # or b where needed.";
/** [id, scale words, degrees, gate]: the scales of U10–U11 as degrees against major on the same home. */
export const SCALE_DEGREE_ROWS: readonly [string, string, string[], LessonId][] = [
  ["natural-minor", "natural minor", ["1", "2", "b3", "4", "5", "b6", "b7"], "U10.L01"],
  ["harmonic-minor", "harmonic minor", ["1", "2", "b3", "4", "5", "b6", "7"], "U10.L06"],
  ["melodic-minor", "melodic minor going up", ["1", "2", "b3", "4", "5", "6", "7"], "U10.L08"],
  ["major-pentatonic", "the major pentatonic scale", ["1", "2", "3", "5", "6"], "U11.L01"],
  ["minor-pentatonic", "the minor pentatonic scale", ["1", "b3", "4", "5", "b7"], "U11.L02"],
  ["blues", "the blues scale", ["1", "b3", "4", "b5", "5", "b7"], "U11.L03"],
];
/** [scale, tonic, notes, gate]: spellings worth knowing by heart (the keys U11 plays in). */
export const SCALE_SPELLING_ROWS: readonly [string, string, string[], LessonId][] = [
  ["major pentatonic", "C", ["C", "D", "E", "G", "A"], "U11.L01"],
  ["major pentatonic", "G", ["G", "A", "B", "D", "E"], "U11.L01"],
  ["minor pentatonic", "A", ["A", "C", "D", "E", "G"], "U11.L02"],
  ["minor pentatonic", "C", ["C", "Eb", "F", "G", "Bb"], "U11.L02"],
  ["blues", "A", ["A", "C", "D", "Eb", "E", "G"], "U11.L03"],
  ["blues", "C", ["C", "Eb", "F", "Gb", "G", "Bb"], "U11.L03"],
];
/**
 * Scales as degrees (S05, S07–S11): each scale of U10–U11 written as degrees against the major scale on the same
 * home, what each one changes, and the pentatonic and blues spellings in the keys U11 plays in. The blues
 * spellings accept the blue note as ♯4 (D♯ for E♭), as U11.L03 spells it going up.
 */
export const SCALE_DEGREES: FactDeck = defineDeck({
  id: "deck.scl.degrees" as DeckId,
  title: "Scales as degrees",
  unlock: { skill: "S05", lesson: "U10.L01" },
  cards: [
    ...SCALE_DEGREE_ROWS.map(([id, words, degrees, gate]) =>
      card(`scale.${id}-degrees`, `Write ${words} as degrees. ${DEGREE_FORMAT}`, degrees, {
        ...(gate !== "U10.L01" ? { gate } : {}),
        accept: [degrees.map((d) => d.replace("b", "♭"))],
      }),
    ),
    card(
      "scale.natural-minor-lowers",
      "Natural minor lowers which three degrees of major on the same home? Write the numbers, separated by spaces.",
      ["3", "6", "7"],
    ),
    card(
      "scale.major-pentatonic-leaves",
      "The major pentatonic scale leaves out which two degrees of major? Write the numbers, separated by a space.",
      ["4", "7"],
      { gate: "U11.L01", accept: [["fa", "ti"]] },
    ),
    card(
      "scale.blues-adds",
      "The blues scale adds which note to the minor pentatonic? Write it as a degree, with b (b5).",
      ["b5"],
      { gate: "U11.L03", accept: [["#4"], ["♯4"], ["♭5"], ["se"]] },
    ),
    ...SCALE_SPELLING_ROWS.map(([scale, tonic, notes, gate]) =>
      card(
        `scale.${slug(tonic)}-${scale.replace(" ", "-")}`,
        `Spell ${display(tonic)} ${scale}. ${SPELL_FORMAT}`,
        notes,
        {
          gate,
          ...(scale === "blues"
            ? {
                accept: [notes.map((n, i) => (i === 3 ? `${String.fromCharCode(n.charCodeAt(0) - 1)}#` : n))],
              }
            : {}),
        },
      ),
    ),
  ],
  newPerDay: 1,
  fastRtMs: 8000,
  answer: "text",
});

const BLUES_NUMERAL_FORMAT = "Write its Roman numeral: I, IV or V (I7, IV7, V7 also count).";
/** [bar, numeral in the standard form, gate]: the bars of a 12-bar blues worth knowing cold. */
export const TWELVE_BAR_ROWS: readonly [number, string, LessonId][] = [
  [5, "IV", "U11.L05"],
  [7, "I", "U11.L05"],
  [9, "V", "U11.L05"],
  [10, "IV", "U11.L05"],
  [11, "I", "U11.L05"],
];
/** The standard twelve bars (bar 12 the turnaround's V, U11.L06), as numerals. */
export const TWELVE_BARS = ["I", "I", "I", "I", "IV", "IV", "I", "I", "V", "IV", "I", "V"] as const;
/**
 * The twelve bars (F04, H10): which chord in the bars that matter (U11.L05), the three lines of four, the
 * chords of a blues in C as symbols, the quick change and the turnaround (U11.L06).
 */
export const TWELVE_BAR: FactDeck = defineDeck({
  id: "deck.frm.twelve-bar" as DeckId,
  title: "The twelve bars",
  unlock: { skill: "F04", lesson: "U11.L05" },
  cards: [
    ...TWELVE_BAR_ROWS.map(([bar, numeral]) =>
      card(
        `blues.bar-${bar}`,
        `In a standard 12-bar blues, which chord is in bar ${bar}? ${BLUES_NUMERAL_FORMAT}`,
        [numeral],
        {
          accept: [[`${numeral}7`]],
        },
      ),
    ),
    card("blues.lines", "A 12-bar blues is three lines of how many bars each? Write the number.", ["4"], {
      accept: [["four"]],
    }),
    card(
      "blues.chords-in-C",
      "Write the three chords of a blues in C as chord symbols for `chord()`, I then IV then V, separated by spaces.",
      ["C7", "F7", "G7"],
    ),
    card(
      "blues.quick-change",
      `In a quick-change blues, which chord is in bar 2? ${BLUES_NUMERAL_FORMAT}`,
      ["IV"],
      { gate: "U11.L06", accept: [["IV7"]] },
    ),
    card("blues.turnaround", `With a turnaround, which chord is in bar 12? ${BLUES_NUMERAL_FORMAT}`, ["V"], {
      gate: "U11.L06",
      accept: [["V7"]],
    }),
  ],
  newPerDay: 1,
  fastRtMs: 5000,
  answer: "text",
});

/** [root, the dominant seventh from the root up]: the roots of the blues keys U11 plays in, and A minor's V7. */
export const DOMINANT_SEVENTH_ROWS: readonly [string, string[]][] = [
  ["C", ["C", "E", "G", "Bb"]],
  ["F", ["F", "A", "C", "Eb"]],
  ["G", ["G", "B", "D", "F"]],
  ["D", ["D", "F#", "A", "C"]],
  ["A", ["A", "C#", "E", "G"]],
  ["E", ["E", "G#", "B", "D"]],
  ["Bb", ["Bb", "D", "F", "Ab"]],
];
/** Dominant sevenths (C06, U11.L04): spellings, and the chord as a major triad plus a minor 7th. */
export const DOMINANT_SEVENTHS: FactDeck = defineDeck({
  id: "deck.chd.dom7" as DeckId,
  title: "Dominant sevenths",
  unlock: { skill: "C06", lesson: "U11.L04" },
  cards: [
    ...DOMINANT_SEVENTH_ROWS.map(([root, notes]) =>
      card(
        `dom7.${slug(root)}7`,
        `Spell ${display(root)}7 from the root up. Write its four note names, separated by spaces.`,
        notes,
      ),
    ),
    card(
      "dom7.degrees",
      "A dominant seventh on 1 uses which degrees? Write them from 1 up, separated by spaces, with b before a flattened degree.",
      ["1", "3", "5", "b7"],
      { accept: [["1", "3", "5", "♭7"]] },
    ),
    card(
      "dom7.seventh",
      "A dominant seventh is a major triad plus which interval above the root? Write its quality letter and number (m7) or its name.",
      ["m7"],
      { accept: [["minor 7th"], ["7m"], ["minor seventh"]] },
    ),
  ],
  newPerDay: 1,
  fastRtMs: 6000,
  answer: "text",
});

/**
 * The U10–U11 decks, each waiting for its contracts §7.3 row (see INTERVAL_NAMES). One new card a day each: U10
 * opens three of them in eight lessons, and at two a day the 25-minute simulation's oldest due card waited
 * 14 days on one seed (contracts §7.4 allows 7); at one a day every run holds (packages/srs
 * simulation-wave5.test.ts).
 */
export const WAVE5_DECKS: readonly FactDeck[] = [
  MINOR_KEYS,
  MINOR_CHORDS,
  SCALE_DEGREES,
  TWELVE_BAR,
  DOMINANT_SEVENTHS,
];

/**
 * Decks written and tested but waiting for their contracts row (see INTERVAL_NAMES). The U05–U07 and U10–U11 decks
 * bring one new card a day: at two, U05–U07's decks alone pushed the 15-minute simulation's oldest due card to 13
 * days on a held-out seed (contracts §7.4 allows 7); at one, every gate and held-out run holds with all of them.
 */
export const PENDING_DECKS: readonly FactDeck[] = [
  INTERVAL_NAMES,
  TRIAD_SPELLINGS,
  NUMERALS,
  CADENCE_NAMES,
  ...WAVE5_DECKS,
];

export const decks: readonly FactDeck[] = [STAFF_NAMES, KEY_SIGNATURES, CHORD_SYMBOLS];
export const deckById: ReadonlyMap<string, FactDeck> = new Map(decks.map((d) => [d.id, d] as const));
