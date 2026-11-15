// The ten fact decks of the advanced tracks (contracts 1.8 §7.3): jazz symbols, ii–V–I in every key, voicings,
// tensions and chord-scales, forms, substitutions; meters and groupings, Euclidean patterns, claves; sound
// controls. Written from the work order Foundation left in content/decks/planned.ts, exactly those ids, with the
// §7.3 rows' gates. Every answer is computed by @oak/theory (or content-kit's timing tables) or checked against it
// and headless Strudel in content/decks/wave7-decks.test.ts; every prompt states the form of its answer; no card
// shows its own answer; the alternatives a learner may reasonably write are accepted through `accept`. One new
// card a day each, like every deck since Wave 5 (packages/srs simulation-wave7.test.ts proves §7.4 with them).
import {
  CLAVE_GRIDS,
  type DeckId,
  defineDeck,
  type FactCardDef,
  type FactDeck,
  type FactId,
  type LessonId,
  METER_GROUPINGS,
  type MeterId,
  polymeterPeriodBars,
  type SkillId,
} from "@oak/content-kit";
import { euclid } from "@oak/theory";

/** A text card with its accepted alternatives (each alternative is a whole answer). */
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
  ...(opts.accept && opts.accept.length > 0 ? { accept: opts.accept.map((t) => ({ text: t })) } : {}),
});
const deck = (id: string, title: string, skill: SkillId, lesson: LessonId, cards: FactCardDef[]): FactDeck =>
  defineDeck({
    id: id as DeckId,
    title,
    unlock: { skill, lesson },
    cards,
    newPerDay: 1,
    fastRtMs: 7000,
    answer: "text",
  });
/** A spelled pitch class as prose shows it: "Bb" → "B♭". */
const shown = (s: string): string => s.replace(/#/g, "♯").replace(/(?<=[A-G])b/g, "♭");
/** An id-safe slug: "Bb^7" → "Bb-maj7", "F#" → "Fs". */
const slug = (s: string): string =>
  s
    .replace("^", "maj")
    .replace(/#/g, "s")
    .replace(/[^A-Za-z0-9-]/g, "-");
/** The other spelling of a black-key root, for the accepted alternatives ("Db" ↔ "C#"). */
export const ENHARMONIC: Readonly<Record<string, string>> = {
  Db: "C#",
  "C#": "Db",
  Eb: "D#",
  "D#": "Eb",
  Gb: "F#",
  "F#": "Gb",
  Ab: "G#",
  "G#": "Ab",
  Bb: "A#",
  "A#": "Bb",
  B: "Cb",
  Cb: "B",
};
/** The same chord symbol with its root spelled the other way, when it has one. */
export function respell(symbol: string): string | null {
  const m = /^([A-G][#b]?)(.*)$/.exec(symbol);
  const other = m ? ENHARMONIC[m[1] as string] : undefined;
  return other && m ? `${other}${m[2]}` : null;
}
/** A minor seventh may also be written with a dash, which `chord()` plays the same ("F-7"). */
const dashMinor = (symbol: string): string | null =>
  /^[A-G][#b]?m(?!aj)/.test(symbol) ? symbol.replace("m", "-") : null;
/** Every reasonable spelling of a sequence of chord symbols: each root respelled, minor with a dash. */
function spellings(symbols: readonly string[]): string[][] {
  const out: string[][] = [];
  const respelled = symbols.map((s) => respell(s) ?? s);
  if (respelled.some((s, i) => s !== symbols[i])) out.push(respelled);
  const dashed = symbols.map((s) => dashMinor(s) ?? s);
  if (dashed.some((s, i) => s !== symbols[i])) out.push(dashed);
  return out;
}

const CHORD_FORMAT = "Write it as `chord()` takes it (C^7, Am7, Bm7b5, Co7).";
const CHORDS_FORMAT = "Write the chords as `chord()` takes them, separated by spaces.";

// --- deck.jzz.symbols (J01, J02) ------------------------------------------------------------------------

/**
 * [glyph as a jazz chart prints it, the symbol in code, gate]. J1.L02 reads seventh chords, sixths and sus in
 * the glyphs ∆ – ø °; the ♭9 dominant comes with J2.L02 (the minor ii–V–i's one altered colour), ♯9, alt and the
 * extensions with J2.L03 (content/specs/J2.md: "♭9 at J2.L02, ♯9 and alt at J2.L03"). No glyph is its own code.
 */
export const SYMBOL_ROWS: readonly [string, string, LessonId | undefined][] = [
  ["B♭∆7", "Bb^7", undefined],
  ["F–7", "Fm7", undefined],
  ["Eø7", "Em7b5", undefined],
  ["B°7", "Bo7", undefined],
  ["E♭–6", "Ebm6", undefined],
  ["D7sus4", "D7sus", undefined],
  ["A7♭9", "A7b9", "J2.L02"],
  ["E♭7♯9", "Eb7#9", "J2.L03"],
  ["G7alt", "G7alt", "J2.L03"],
  ["F–9", "Fm9", "J2.L03"],
  ["E♭∆9", "Eb^9", "J2.L03"],
  ["D–11", "Dm11", "J2.L03"],
];
/** Glyphs whose code differs only by the same letters: "G7alt" is written the same, so its card asks the reverse. */
export const JAZZ_SYMBOLS_DECK = deck(
  "deck.jzz.symbols",
  "Jazz chord symbols",
  "J01",
  "J1.L02",
  SYMBOL_ROWS.map(([glyph, code, gate]) =>
    glyph === code
      ? card(
          `jzz.sym.${slug(code)}`,
          `On a jazz chart a dominant seventh with every alteration (♭9 ♯9 ♯11 ♭13) on G is written how? ${CHORD_FORMAT}`,
          [code],
          { ...(gate ? { gate } : {}), accept: spellings([code]) },
        )
      : card(`jzz.sym.${slug(code)}`, `A jazz chart shows ${glyph}. ${CHORD_FORMAT}`, [code], {
          ...(gate ? { gate } : {}),
          accept: spellings([code]),
        }),
  ),
);

// --- deck.jzz.ii-v (J04, J05, J06) ------------------------------------------------------------------------

/** The major ii–V–Is around the cycle of fourths, as @oak/theory `twoFiveOnesAllKeys` spells them. */
export const MAJOR_TWO_FIVES: readonly [string, string[]][] = [
  ["C", ["Dm7", "G7", "C^7"]],
  ["F", ["Gm7", "C7", "F^7"]],
  ["Bb", ["Cm7", "F7", "Bb^7"]],
  ["Eb", ["Fm7", "Bb7", "Eb^7"]],
  ["Ab", ["Bbm7", "Eb7", "Ab^7"]],
  ["Db", ["Ebm7", "Ab7", "Db^7"]],
  ["Gb", ["Abm7", "Db7", "Gb^7"]],
  ["B", ["C#m7", "F#7", "B^7"]],
  ["E", ["F#m7", "B7", "E^7"]],
  ["A", ["Bm7", "E7", "A^7"]],
  ["D", ["Em7", "A7", "D^7"]],
  ["G", ["Am7", "D7", "G^7"]],
];
/** J1.L03 deals C, F and B♭ (its keys and its Make's); J2.L01 the other nine. */
const FIRST_KEYS = new Set(["C", "F", "Bb"]);
/** The minor ii–V–i of J2.L02 with its ♭9 dominant (`twoFiveOne(t, "minor", { dominant: "7b9" })`). */
export const MINOR_TWO_FIVES: readonly [string, string[]][] = [
  ["C", ["Dm7b5", "G7b9", "Cm7"]],
  ["G", ["Am7b5", "D7b9", "Gm7"]],
  ["D", ["Em7b5", "A7b9", "Dm7"]],
  ["A", ["Bm7b5", "E7b9", "Am7"]],
  ["E", ["F#m7b5", "B7b9", "Em7"]],
];
/** The minor cadence's accepted forms: the V plain or altered, home a minor seventh or a minor sixth. */
function minorAccepts(chords: readonly string[]): string[][] {
  const [ii, v, i] = chords as [string, string, string];
  const root = v.replace("7b9", "");
  const home = i.replace("m7", "");
  const out: string[][] = [];
  for (const dom of [`${root}7b9`, `${root}7`, `${root}7alt`])
    for (const tonic of [`${home}m7`, `${home}m6`])
      if (!(dom === v && tonic === i)) out.push([ii, dom, tonic]);
  return [...out, ...spellings(chords)];
}
export const TWO_FIVE_DECK = deck("deck.jzz.ii-v", "ii–V–I in every key", "J04", "J1.L03", [
  ...MAJOR_TWO_FIVES.map(([key, chords]) =>
    card(`jzz.two-five.${slug(key)}-major`, `The ii–V–I in ${shown(key)} major. ${CHORDS_FORMAT}`, chords, {
      ...(FIRST_KEYS.has(key) ? {} : { gate: "J2.L01" as LessonId }),
      accept: spellings(chords),
    }),
  ),
  ...MINOR_TWO_FIVES.map(([key, chords]) =>
    card(
      `jzz.two-five.${slug(key)}-minor`,
      `The minor ii–V–i in ${shown(key)} minor, its V with the ♭9. ${CHORDS_FORMAT}`,
      chords,
      { gate: "J2.L02", accept: minorAccepts(chords) },
    ),
  ),
]);

// --- deck.jzz.voicings (J08, J09) ------------------------------------------------------------------------

const NOTES_FORMAT = "Write the notes lowest first, letters only (with # or b), separated by spaces.";
/** [chord in code, what is asked, the notes lowest first, gate, id]: computed by @oak/theory (`shellVoicing`, `rootlessVoicing`, `drop2`). */
export const VOICING_ROWS: readonly [string, string, string[], LessonId | undefined, string][] = [
  ["G7", "its shell: root, 3rd, 7th", ["G", "B", "F"], undefined, "shell-G7"],
  ["Dm7", "its shell: root, 3rd, 7th", ["D", "F", "C"], undefined, "shell-Dm7"],
  ["C^7", "its shell: root, 3rd, 7th", ["C", "E", "B"], undefined, "shell-Cmaj7"],
  ["F^7", "its shell: root, 7th, 3rd", ["F", "E", "A"], undefined, "shell-Fmaj7-73"],
  ["Dm7", "the rootless A voicing (3 5 7 9)", ["F", "A", "C", "E"], "J3.L01", "rootless-a-Dm7"],
  ["G7", "the rootless B voicing (♭7 9 3 13)", ["F", "A", "B", "E"], "J3.L01", "rootless-b-G7"],
  ["C^7", "the rootless A voicing (3 5 7 9)", ["E", "G", "B", "D"], "J3.L01", "rootless-a-Cmaj7"],
  ["G7", "the rootless A voicing (3 13 ♭7 9)", ["B", "E", "F", "A"], "J3.L01", "rootless-a-G7"],
  [
    "C^7",
    "the drop-2 of C E G B (the close voicing with C lowest)",
    ["G", "C", "E", "B"],
    "J3.L02",
    "drop2-Cmaj7",
  ],
  [
    "Dm7",
    "the drop-2 of D F A C (the close voicing with D lowest)",
    ["A", "D", "F", "C"],
    "J3.L02",
    "drop2-Dm7",
  ],
];
export const VOICINGS_DECK = deck(
  "deck.jzz.voicings",
  "Voicing types",
  "J08",
  "J1.L05",
  VOICING_ROWS.map(([chord, what, notes, gate, id]) =>
    card(
      `jzz.voicing.${id}`,
      `${chord.replace("^7", "maj7")}: ${what}. ${NOTES_FORMAT}`,
      notes,
      gate ? { gate } : {},
    ),
  ),
);

// --- deck.jzz.tensions (J02, J03) ------------------------------------------------------------------------

const TENSION_FORMAT =
  "Write the tension as its number, with b or # before it when it is altered, or write avoid if it clashes when held: a half step above a chord tone.";
/** [chord, the note, the answer]: content-kit `AVAILABLE_TENSIONS` (one table with @oak/theory `tensionsOf`). */
export const TENSION_ROWS: readonly [string, string, string][] = [
  ["Cmaj7", "D", "9"],
  ["Cmaj7", "F", "avoid"],
  ["Cmaj7", "A", "13"],
  ["G7", "Ab", "b9"],
  ["G7", "E", "13"],
  ["G7", "C", "avoid"],
  ["Dm7", "E", "9"],
  ["Dm7", "G", "11"],
  ["Dm7", "Eb", "avoid"],
  ["Bb7", "G", "13"],
];
const SCALE_FORMAT = "Write the scale's name as one word, or two for the altered and diminished scales.";
/** [chord, its job in the key, the key, the first choice @oak/theory `chordScales` gives, accepted]. */
export const CHORD_SCALE_ROWS: readonly [string, string, string, string, string[][]][] = [
  ["Dm7", "ii", "C major", "Dorian", [["D Dorian"], ["dorian"]]],
  ["G7", "V", "C major", "Mixolydian", [["G Mixolydian"], ["mixolydian"]]],
  ["Cmaj7", "I", "C major", "Ionian", [["major"], ["C major"], ["ionian"], ["Lydian"], ["lydian"]]],
  ["Fmaj7", "IV", "C major", "Lydian", [["F Lydian"], ["lydian"]]],
  ["Bm7♭5", "viiø7", "C major", "Locrian", [["B Locrian"], ["locrian"]]],
  [
    "Em7♭5",
    "iiø7",
    "D minor",
    "Locrian",
    [["E Locrian"], ["locrian"], ["Locrian #2"], ["Locrian natural 2"]],
  ],
];
export const TENSIONS_DECK = deck("deck.jzz.tensions", "Tensions and avoid notes", "J02", "J2.L03", [
  ...TENSION_ROWS.map(([chord, note, answer]) =>
    card(
      `jzz.tension.${slug(chord)}-${slug(note)}`,
      `Over ${chord.replace("b", "♭")}, the note ${shown(note)} held: what is it? ${TENSION_FORMAT}`,
      [answer],
      {
        // A held clash is "avoid" whatever its name: F over Cmaj7 is called the 11th, but held it clashes.
        accept: answer === "avoid" ? [["avoid note"], ["clash"]] : [],
      },
    ),
  ),
  ...CHORD_SCALE_ROWS.map(([chord, job, key, scale, accept]) =>
    card(
      `jzz.chord-scale.${slug(chord.replace("♭", "b"))}-${job.replace("ø7", "h")}`,
      `In ${key}, ${chord} is the ${job}. Which scale is a common first choice over it? ${SCALE_FORMAT}`,
      [scale],
      { gate: "J2.L04", accept },
    ),
  ),
]);

// --- deck.jzz.forms (J10, J11, J12) ------------------------------------------------------------------------

/** [prompt, chords, gate, id]: @oak/theory `turnaround`, `jazzBlues("F")`, `rhythmChanges("Bb")`. */
export const FORM_ROWS: readonly [string, string[], LessonId | undefined, string][] = [
  ["The I–vi–ii–V turnaround in C, one chord a bar.", ["C^7", "Am7", "Dm7", "G7"], undefined, "turn-C"],
  ["The I–vi–ii–V turnaround in F, one chord a bar.", ["F^7", "Dm7", "Gm7", "C7"], undefined, "turn-F"],
  [
    "The iii–VI–ii–V turnaround in E♭, one chord a bar.",
    ["Gm7", "C7", "Fm7", "Bb7"],
    undefined,
    "turn-iii-Eb",
  ],
  ["Bar 2 of a jazz blues in F.", ["Bb7"], "J4.L02", "blues-F-2"],
  ["Bar 4 of a jazz blues in F (two chords).", ["Cm7", "F7"], "J4.L02", "blues-F-4"],
  ["Bar 6 of a jazz blues in F.", ["Bo7"], "J4.L02", "blues-F-6"],
  ["Bar 8 of a jazz blues in F.", ["D7"], "J4.L02", "blues-F-8"],
  ["Bars 9 and 10 of a jazz blues in F, one chord a bar.", ["Gm7", "C7"], "J4.L02", "blues-F-9-10"],
  [
    "Bars 11 and 12 of a jazz blues in F (two chords a bar).",
    ["F7", "D7", "Gm7", "C7"],
    "J4.L02",
    "blues-F-11-12",
  ],
  [
    "The first two bars of rhythm changes in B♭ (two chords a bar).",
    ["Bb^7", "Gm7", "Cm7", "F7"],
    "J4.L03",
    "rhythm-A-1-2",
  ],
  [
    "The bridge of rhythm changes in B♭, one chord for each two bars.",
    ["D7", "G7", "C7", "F7"],
    "J4.L03",
    "rhythm-bridge",
  ],
  ["How many bars is the AABA form of rhythm changes? Write the number.", ["32"], "J4.L03", "rhythm-bars"],
];
export const FORMS_DECK = deck(
  "deck.jzz.forms",
  "Turnarounds, the jazz blues, rhythm changes",
  "J10",
  "J4.L01",
  FORM_ROWS.map(([prompt, chords, gate, id]) =>
    card(
      `jzz.form.${id}`,
      chords.length === 1 && /^\d+$/.test(chords[0] as string) ? prompt : `${prompt} ${CHORDS_FORMAT}`,
      chords,
      {
        ...(gate ? { gate } : {}),
        ...(/^\d+$/.test(chords[0] as string) ? { accept: [["thirty-two"]] } : { accept: spellings(chords) }),
      },
    ),
  ),
);

// --- deck.jzz.subs (J13, J14) ------------------------------------------------------------------------

/** [prompt, chords, gate, id, extra accepted answers]: @oak/theory `tritoneSub`, `backdoor`, `secondaryTwoFive`, `diminishedPassing`. */
export const SUB_ROWS: readonly [string, string[], LessonId | undefined, string, string[][]][] = [
  ["The tritone substitute of G7.", ["Db7"], undefined, "tritone-G7", []],
  ["The tritone substitute of D7.", ["Ab7"], undefined, "tritone-D7", []],
  ["The tritone substitute of C7.", ["Gb7"], undefined, "tritone-C7", []],
  ["The tritone substitute of F7.", ["B7"], undefined, "tritone-F7", []],
  ["The backdoor into C: the iv7 and the ♭VII7.", ["Fm7", "Bb7"], "J5.L02", "backdoor-C", []],
  ["The backdoor into F: the iv7 and the ♭VII7.", ["Bbm7", "Eb7"], "J5.L02", "backdoor-F", []],
  ["A ii–V into F^7 (in C, its IV).", ["Gm7", "C7"], "J5.L03", "two-five-into-F", []],
  [
    "A ii–V into Dm7 (in C, its ii), the minor form: a half-diminished ii and a V with a ♭9.",
    ["Em7b5", "A7b9"],
    "J5.L03",
    "two-five-into-Dm7",
    [["Em7b5", "A7"]],
  ],
  [
    "A ii–V into Am7 (in C, its vi), the minor form: a half-diminished ii and a V with a ♭9.",
    ["Bm7b5", "E7b9"],
    "J5.L03",
    "two-five-into-Am7",
    [["Bm7b5", "E7"]],
  ],
  ["The passing diminished chord between C^7 and Dm7.", ["C#o7"], "J5.L04", "passing-C-Dm", []],
  ["The passing diminished chord between Dm7 and Em7.", ["D#o7"], "J5.L04", "passing-Dm-Em", []],
  ["The passing diminished chord between F^7 and G7.", ["F#o7"], "J5.L04", "passing-F-G", []],
];
export const SUBS_DECK = deck(
  "deck.jzz.subs",
  "Substitutions",
  "J13",
  "J5.L01",
  SUB_ROWS.map(([prompt, chords, gate, id, extra]) =>
    card(`jzz.sub.${id}`, `${prompt} ${chords.length > 1 ? CHORDS_FORMAT : CHORD_FORMAT}`, chords, {
      ...(gate ? { gate } : {}),
      accept: [...extra, ...spellings(chords)],
    }),
  ),
);

// --- deck.rhy.meters (R16, R17) ------------------------------------------------------------------------

const unitWord = (meter: MeterId) => (meter === "5/4" ? "beats" : "eighths");
const startsOf = (grouping: readonly number[]): string[] => {
  const out: string[] = [];
  let at = 1;
  for (const g of grouping) {
    out.push(String(at));
    at += g;
  }
  return out;
};
/** Group starts of the groupings R2.L01 (5/4, 7/8) and R2.L02 (9/8) teach, from content-kit `METER_GROUPINGS`. */
const GROUPING_ROWS: readonly [MeterId, number[], LessonId | undefined][] = [
  ["5/4", [3, 2], undefined],
  ["5/4", [2, 3], undefined],
  ["7/8", [2, 2, 3], undefined],
  ["7/8", [2, 3, 2], undefined],
  ["7/8", [3, 2, 2], undefined],
  ["9/8i", [2, 2, 2, 3], "R2.L02"],
  ["9/8i", [3, 2, 2, 2], "R2.L02"],
];
/** [mini-notation, steps in its cycle, %n, gate]: `polymeterPeriodBars` (= Strudel's `{ }%n`). */
export const POLYMETER_ROWS: readonly [string, number, number][] = [
  ["{bd ~ ~}%4", 3, 4],
  ["{bd ~ ~ ~ ~}%4", 5, 4],
  ["{bd ~ ~ hh ~ ~}%4", 6, 4],
];
export const METERS_DECK = deck("deck.rhy.meters", "Meters and groupings", "R16", "R2.L01", [
  ...GROUPING_ROWS.filter(([m, g]) =>
    (METER_GROUPINGS[m] ?? []).some((x) => x.join("+") === g.join("+")),
  ).map(([meter, grouping, gate]) =>
    card(
      `rhy.meter.${meter.replace("/", "-")}-${grouping.join("")}`,
      `A bar of ${meter.replace("i", "")} grouped ${grouping.join("+")}: on which ${unitWord(meter)} do the groups start? Write the numbers counting from 1, separated by spaces.`,
      startsOf(grouping),
      gate ? { gate } : {},
    ),
  ),
  card(
    "rhy.meter.tempo-7-8",
    "The tempo line of a piece in 7/8 at 210 eighths a minute. Write the whole call.",
    ["setcpm(210/7)"],
    { accept: [["setcpm(30)"]] },
  ),
  card(
    "rhy.meter.hemiola-3-4",
    "A bar of 6/8 heard as 3/4 (a hemiola): how many beats does the bar then have? Write the number.",
    ["3"],
    { gate: "R2.L03", accept: [["three"]] },
  ),
  card(
    "rhy.meter.hemiola-6-8",
    "The same six eighths heard as 6/8: how many beats? Write the number.",
    ["2"],
    { gate: "R2.L03", accept: [["two"]] },
  ),
  ...POLYMETER_ROWS.map(([mini, steps, per]) =>
    card(
      `rhy.meter.polymeter-${steps}-${per}`,
      `\`${mini}\` lines up with the bar again after how many bars? Write the number.`,
      [String(polymeterPeriodBars(steps, per))],
      { gate: "R2.L05" },
    ),
  ),
]);

// --- deck.rhy.euclid (R18) ------------------------------------------------------------------------

const STEPS_FORMAT = "Write each step as x (a hit) or ~ (a rest), separated by spaces.";
/** [k, n, r, gate]: the steps Strudel's `x(k,n,r)` plays (checked by evaluation). */
export const EUCLID_ROWS: readonly [number, number, number, LessonId | undefined][] = [
  [3, 8, 0, undefined],
  [5, 8, 0, undefined],
  [2, 5, 0, undefined],
  [3, 8, 2, "R3.L03"],
  [5, 16, 10, "R3.L03"],
];
/** The steps of E(k,n) rotated by r, as Strudel 1.2.6 plays `x(k,n,r)` (@oak/theory `euclid`; the test evaluates both). */
export const euclidSteps = (k: number, n: number, r = 0): string[] =>
  euclid(k, n, r).map((x) => (x ? "x" : "~"));
export const EUCLID_DECK = deck("deck.rhy.euclid", "Euclidean patterns", "R18", "R3.L01", [
  ...EUCLID_ROWS.map(([k, n, r, gate]) =>
    card(
      `rhy.euclid.${k}-${n}${r ? `-${r}` : ""}`,
      `\`x(${k},${n}${r ? `,${r}` : ""})\` as ${n} steps. ${STEPS_FORMAT}`,
      euclidSteps(k, n, r),
      gate ? { gate } : {},
    ),
  ),
  card(
    "rhy.euclid.tresillo",
    "The tresillo (3 + 3 + 2 eighths) as a Euclidean rhythm. Write it as (k,n).",
    ["(3,8)"],
    { accept: [["3,8"], ["x(3,8)"]] },
  ),
  card(
    "rhy.euclid.cinquillo",
    "The cinquillo (five hits in a bar of eight eighths) as a Euclidean rhythm. Write it as (k,n).",
    ["(5,8)"],
    { accept: [["5,8"], ["x(5,8)"]] },
  ),
]);

// --- deck.rhy.clave (R18) ------------------------------------------------------------------------

const EIGHTHS_FORMAT = "Write the eighths it plays on, counting from 1, separated by spaces.";
/** The eighths (1–8) of one bar of a content-kit `CLAVE_GRIDS` clave. */
export const claveEighths = (type: "son" | "rumba", dir: "3-2" | "2-3", bar: 0 | 1): string[] =>
  CLAVE_GRIDS[type][dir][bar].map(([n, d]) => String((n * 8) / d + 1));
export const CLAVE_DECK = deck("deck.rhy.clave", "Claves", "R18", "R3.L02", [
  card("rhy.clave.son-3-2-bar-1", `Son clave 3-2, bar 1. ${EIGHTHS_FORMAT}`, claveEighths("son", "3-2", 0)),
  card("rhy.clave.son-3-2-bar-2", `Son clave 3-2, bar 2. ${EIGHTHS_FORMAT}`, claveEighths("son", "3-2", 1)),
  card("rhy.clave.son-2-3-bar-1", `Son clave 2-3, bar 1. ${EIGHTHS_FORMAT}`, claveEighths("son", "2-3", 0)),
  card(
    "rhy.clave.rumba-3-2-bar-1",
    `Rumba clave 3-2, bar 1. ${EIGHTHS_FORMAT}`,
    claveEighths("rumba", "3-2", 0),
  ),
  card(
    "rhy.clave.rumba-moves",
    "Rumba clave against son clave: which hit of the three-side moves, and to which eighth? Write the hit's number (1–3), then the eighth.",
    ["3", "8"],
    { accept: [["third", "8"]] },
  ),
  card(
    "rhy.clave.direction",
    "A clave whose first bar has two hits and whose second bar has three: which direction? Write 3-2 or 2-3.",
    ["2-3"],
    { accept: [["2–3"], ["two-three"]] },
  ),
]);

// --- deck.snd.controls (D03–D07, D10) ------------------------------------------------------------------------

const CONTROL_FORMAT = "Write the function with its dot, without arguments (.hpf).";
/** [what you hear, the control, its tool (content/toolbox.ts), gate, accepted]. Only controls marked audible (contracts §3.1 rule 7). */
export const CONTROL_ROWS: readonly [string, string, string, LessonId | undefined, string[][]][] = [
  ["The same notes, darker: which control goes down?", ".lpf", "tb.lpf", undefined, [[".cutoff"]]],
  [
    "A ringing peak at the filter's cutoff: which control goes up?",
    ".lpq",
    "tb.lpq",
    undefined,
    [[".resonance"]],
  ],
  [
    "The filter opens and closes on every note: which control sets how far?",
    ".lpenv",
    "tb.lpenv",
    undefined,
    [],
  ],
  ["A pluck: which envelope stage is short, with the sustain at 0?", ".decay", "tb.adsr", "A1.L03", []],
  ["A soft swell at the start of each note: which control is longer?", ".attack", "tb.adsr", "A1.L03", []],
  ["The tail after the note ends: which control is longer?", ".release", "tb.adsr", "A1.L03", []],
  [
    "More repeats of an echo: which control goes up?",
    ".delayfeedback",
    "tb.delayfeedback",
    "A1.L04",
    [[".dfb"]],
  ],
  [
    "A bigger room around the same reverb amount: which control goes up?",
    ".roomsize",
    "tb.roomsize",
    "A1.L04",
    [[".size"], [".rsize"]],
  ],
  ["The time between echoes: which control?", ".delaytime", "tb.delaytime", "A1.L04", [[".dt"]]],
  ["Lo-fi and grainy, fewer bits: which control?", ".crush", "tb.crush", "A1.L05", []],
  ["Warmer, thicker and louder, a saturated tone: which control?", ".distort", "tb.distort", "A1.L05", []],
  ["The pitch wobbles slowly: which control?", ".vib", "tb.vib", "A1.L06", []],
  [
    "A sweeping, swirling notch moving through the sound: which control?",
    ".phaser",
    "tb.phaser",
    "A1.L06",
    [],
  ],
  ["Bright, bell-like sidebands from one wave bending another: which control?", ".fm", "tb.fm", "A1.L07", []],
  [
    "Several detuned voices for one wide note on the supersaw: which control sets how many?",
    ".unison",
    "tb.unison",
    "A1.L07",
    [],
  ],
  [
    "The loud peaks squeezed so a part sits steady in the mix: which control?",
    ".compressor",
    "tb.compressor",
    "A2.L05",
    [],
  ],
  ["A part's level after its effects: which control?", ".postgain", "tb.postgain", "A2.L05", []],
];
/** A control answer may be written without the dot or with empty brackets. */
const controlAccepts = (fn: string, extra: string[][]): string[][] => [
  [fn.slice(1)],
  [`${fn}()`],
  [`${fn.slice(1)}()`],
  ...extra,
  ...extra.map(([x]) => [(x as string).slice(1)]),
];
export const CONTROLS_DECK = deck(
  "deck.snd.controls",
  "Sound controls",
  "D03",
  "A1.L02",
  CONTROL_ROWS.map(([what, fn, , gate, extra]) =>
    card(`snd.control.${fn.slice(1)}`, `${what} ${CONTROL_FORMAT}`, [fn], {
      ...(gate ? { gate } : {}),
      accept: controlAccepts(fn, extra),
    }),
  ),
);

/**
 * The advanced tracks' decks in the order of their first lessons (contracts 1.8 §7.3). In `decks` (content/decks
 * index.ts); the planned work order (content/decks/planned.ts) is empty now that every one is written.
 */
export const WAVE7_DECKS: readonly FactDeck[] = [
  CONTROLS_DECK,
  JAZZ_SYMBOLS_DECK,
  TWO_FIVE_DECK,
  VOICINGS_DECK,
  TENSIONS_DECK,
  FORMS_DECK,
  SUBS_DECK,
  METERS_DECK,
  EUCLID_DECK,
  CLAVE_DECK,
];
