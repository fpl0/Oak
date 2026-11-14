// The answer guard for the Wave 4 step kinds (contracts §10.4, §10.5; wave4.md §5.6): on a graded step below the
// reveal rung, a hint on a chord, numeral, voice-leading or dictation step must not contain the expected chord,
// numeral or notes. Redaction keeps them out of everything the model is given; this is the second layer, on what
// the model writes back: streamed text, code cards and their explanations.
//
// Short answers are the problem the leak markers of leak-markers.ts cannot see: "vi", "Am", "G/B", "5 4 3 2 1"
// are far shorter than the 8-character literals they look for, and a plain substring search for "vi" would hit
// "review". So each expected answer is split into elements (a numeral, a chord symbol, a note with its octave, a
// degree) and matched as a whole word or as a music token (`[[rn:vi]]`), and the whole answer as a sequence in
// any separator.
//
// What may appear at which rung: the answer, whole or any one element of it, only at 4 (or after a pass). This is
// stricter than the matrix's "fix for the first issue at rung 3" on purpose: on these steps the expected value IS
// the answer, so redaction.ts withholds a fix or expected value that names it below 4 too. Elements the learner is shown anyway (in the prompt, the starter code or a constraint) are not
// secrets. Pure; the streaming guard is incremental like markup-guard.ts.
import type { Rung, StepSource } from "./domain.ts";
import { MIN_LEVEL } from "./redaction.ts";
import { DEGREE_SYLLABLES, MODE_COLOUR, MODE_DEGREES, modeOf, tonicPcOf } from "./vocabulary.ts";

export type AnswerElementKind = "rn" | "chord" | "note" | "deg" | "word";

export interface AnswerForm {
  /** For failure messages: what was found. */
  label: string;
  re: RegExp;
  /** Lowest level at which this form may appear. */
  minLevel: Rung;
  /** The words the form is made of (flat spelling), so the streaming guard knows what may still be arriving. */
  tokens: readonly string[];
  /**
   * Wave 5: a match counts only when this accepts it (a scale given as a set in any order, a bar of a chart named
   * with its chord). Absent: every match counts.
   */
  accept?: (m: RegExpExecArray) => boolean;
  /**
   * Wave 5: the form spans ordinary words ("bar 2 is IV7"), so the streaming guard holds the whole sentence until it
   * ends instead of only trailing answer-like words.
   */
  sentence?: boolean;
}

/** Text that replaces a withheld answer in what the learner sees. */
export const WITHHELD = "(withheld until you reveal it)";

// Wave 6: seventh suffixes on diminished and half-diminished numerals (viiø7, viio7) and the seventh-chord symbols
// code writes (C^7, Bo7, Bm7b5).
const RN =
  /^[b#♭♯]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:maj7|M7|ø7|o7|o|°|ø|\+|7|6|64|65|43|42|2)?(?:\/[b#]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))?$/;
const CHORD =
  /^[A-G][#b♯♭]?(?:m7b5|maj7|maj9|M7|\^7|m7|m9|m6|dim7|o7|dim|aug|sus2|sus4|m|o|°|ø7?|\+|7|6|9)?(?:\/[A-G][#b♯♭]?)?$/;
const NOTE = /^[A-Ga-g][#b♯♭]?-?\d$/;
const DEG = /^[b#♭♯]?[1-7]$/;
const QUALITY = /^(?:major|minor|diminished|augmented|maj|min|dim|aug)$/i;

const flat = (s: string) => s.replace(/♭/g, "b").replace(/♯/g, "#").replace(/°/g, "o");
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** A spelling-tolerant pattern for one element: b or ♭, # or ♯, o or ° are the same sign. */
function spell(token: string, caseless: boolean): string {
  let out = "";
  for (const ch of flat(token)) {
    if (ch === "b" && out !== "") out += "[b♭]";
    else if (ch === "#") out += "[#♯]";
    else if (ch === "o") out += "[o°]";
    else if (caseless && /[a-g]/i.test(ch)) out += `[${ch.toLowerCase()}${ch.toUpperCase()}]`;
    else out += esc(ch);
  }
  return out;
}

/**
 * What one word of an answer is. `b3` is a degree (flat 3) in prose and a note (B3) inside note(): `notes`
 * says which reading wins.
 */
export function classifyElement(token: string, notes = false): AnswerElementKind | null {
  const t = flat(token.trim());
  if (t === "") return null;
  if (notes && NOTE.test(t)) return "note";
  if (DEG.test(t)) return "deg";
  // Wave 6: outside note(), a capital root with 7 or 9 is a seventh chord (G7, F#7), not a note in octave 7.
  if (/^[A-G][#b]?[79]$/.test(t)) return "chord";
  if (NOTE.test(t)) return "note";
  if (RN.test(t)) return "rn";
  if (CHORD.test(t)) return "chord";
  if (QUALITY.test(t)) return "word";
  return null;
}

const TOKEN_KIND: Record<AnswerElementKind, string> = {
  rn: "rn",
  chord: "chord",
  note: "note",
  deg: "deg",
  word: "term",
};

/** The movable-do names of every degree with this number (do-based minor: 3 is mi or me). */
function syllablesOf(num: string): string[] {
  const out = Object.entries(DEGREE_SYLLABLES)
    .filter(([d]) => d.replace(/^[b#]/, "") === num)
    .map(([, syl]) => syl);
  if (num === "5") out.push("so");
  return out;
}

/**
 * A degree in every spelling Oak teaches: `[[deg:b3]]`, `b3`, `♭3`, `flat 3`, and with `syllables` its movable-do
 * names. `exact`: only this accidental (a single secret degree); otherwise any accidental on the same number (a
 * sequence: "1 ♭3 5" and "1 3 5" name the same line in a minor key).
 */
function degreePattern(
  token: string,
  bare: boolean,
  o: { exact?: boolean; syllables?: boolean } = {},
): string {
  const t = flat(token);
  const num = t.replace(/^[b#]/, "");
  const acc = o.exact
    ? t.startsWith("b")
      ? "(?:[b♭]|flat\\s)"
      : t.startsWith("#")
        ? "(?:[#♯]|sharp\\s)"
        : ""
    : "(?:[b#♭♯]|flat\\s|sharp\\s)?";
  const tokenAcc = o.exact ? (t.startsWith("b") ? "[b♭]" : t.startsWith("#") ? "[#♯]" : "") : "[b#♭♯]?";
  const asToken = `\\[\\[deg:\\s*${tokenAcc}${num}\\s*\\]\\]`;
  if (!bare) return asToken;
  const word = `(?<![A-Za-z0-9#♯♭°ø+/.])${acc}${num}(?![A-Za-z0-9#♯°ø+/]|\\.\\d)`;
  const syl = o.syllables ? `|(?<![A-Za-z])(?:${syllablesOf(num).join("|")})(?![A-Za-z])` : "";
  return `(?:${asToken}|${word}${syl})`;
}

/** One element, as a music token or a bare word; `bare: false` matches the token form only. */
function elementPattern(token: string, kind: AnswerElementKind, bare: boolean, syllables = false): string {
  if (kind === "deg") return degreePattern(token, bare, { exact: !syllables && bare === false, syllables });
  // A numeral's leading b or # is its accidental (bVI, ♭VI); a note's leading b is the note B.
  const lead = kind === "rn" ? /^[b#]/.exec(flat(token))?.[0] : undefined;
  const body = lead
    ? `${lead === "b" ? "[b♭]" : "[#♯]"}${spell(flat(token).slice(1), false)}`
    : spell(token, kind === "note");
  const asToken = `\\[\\[${TOKEN_KIND[kind]}:\\s*${body}\\s*\\]\\]`;
  if (!bare) return asToken;
  // A whole word: no letter, digit, accidental or quality sign glued to either side.
  return `(?:${asToken}|(?<![A-Za-z0-9#♯♭°ø+/])${body}(?![A-Za-z0-9#♯°ø+/]))`;
}

/** Is a bare word for this element specific enough to mask? "I", "a", "C" and lone degree digits are not. */
function bareIsSpecific(token: string, kind: AnswerElementKind): boolean {
  const t = flat(token);
  if (kind === "deg") return false;
  if (kind === "word") return false;
  if (kind === "rn") return t !== "I" && t !== "i";
  if (kind === "chord") return t.length >= 2;
  return true;
}

const SEP = "(?:\\s*(?:[,;|>→–—-]|->)?\\s*(?:\\band\\b|\\bthen\\b)?\\s*)";
/** Words that may join the elements of an answer (`1, ♭3, 4 and 5`): the streaming guard holds them too. */
const CONNECTORS = new Set(["and", "then"]);

/** Elements of an answer: split on spaces and separators, each classified. */
export function answerElements(answer: string, notes = false): { token: string; kind: AnswerElementKind }[] {
  return answer
    .split(/[\s,;|→–—]+|(?<=\S)-(?=\S)|->/)
    .map((t) => t.replace(/^[[<(]+|[\]>)~.!?:]+$/g, ""))
    .filter((t) => t !== "")
    .map((token) => ({ token, kind: classifyElement(token, notes) }))
    .filter((e): e is { token: string; kind: AnswerElementKind } => e.kind !== null);
}

/** String literals passed to chord(), note(), n() and friends in a code solution. */
function codeLiterals(code: string): { fn: string; literal: string }[] {
  const out: { fn: string; literal: string }[] = [];
  for (const m of code.matchAll(/\b(chord|note|n|rn|degrees?)\(\s*["'`]([^"'`]*)["'`]/g))
    out.push({ fn: m[1] as string, literal: m[2] as string });
  return out;
}

const looksLikeCode = (s: string) => /\w\s*\(\s*["'`]/.test(s) || /\n/.test(s) || /\barrange\s*\(/.test(s);

/** Wave 5: the section names a form answer is made of (content-kit `FORM_SECTION_NAMES`, with the spellings prose uses). */
const SECTION_WORDS = ["intro", "verse", "prechorus", "pre-chorus", "chorus", "bridge", "solo", "outro"];
const SECTION_RE = new RegExp(`^(${SECTION_WORDS.join("|")})\\s*(\\d+)?$`, "i");
const LETTER_RE = /^[A-H]$/;

/** A form answer's sections, or null when the answer is not one ("verse chorus verse chorus", "A A B A", "AABA"). */
export function formSequence(answer: string): { kind: "names" | "letters"; items: string[] } | null {
  const t = answer.trim();
  if (/^[A-H]{2,16}$/.test(t)) return { kind: "letters", items: t.split("") };
  const parts = t
    .split(/[\s,;|→–—]+|(?<=\S)-(?=\S)(?<!pre-)/i)
    .map((x) => x.replace(/[.()[\]]/g, ""))
    .filter((x) => x !== "");
  if (parts.length < 2) return null;
  if (parts.every((x) => LETTER_RE.test(x))) return { kind: "letters", items: parts };
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i] as string;
    const next = parts[i + 1];
    // "chorus 2" is one section.
    if (next !== undefined && /^\d+$/.test(next) && SECTION_RE.test(cur)) {
      names.push(`${cur} ${next}`);
      i++;
    } else if (SECTION_RE.test(cur)) names.push(cur);
    else return null;
  }
  return { kind: "names", items: names };
}

/** Section names as letters by first appearance, the way the form is graded (contracts §6.3 item 4). */
export function formLettersOf(items: readonly string[]): string[] {
  const types: string[] = [];
  return items.map((x) => {
    const type = x
      .toLowerCase()
      .replace(/\s*\d+$/, "")
      .replace(/^pre-chorus$/, "prechorus");
    if (!types.includes(type)) types.push(type);
    return String.fromCharCode(65 + types.indexOf(type));
  });
}

/** Sections as named in code (`[4, chordsVerse]`, `[8, melChorus2]`), in arrange() order, or null. */
export function arrangeSequence(code: string): string[] | null {
  const m = /\barrange\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(code);
  if (!m) return null;
  const out: string[] = [];
  for (const x of (m[1] as string).matchAll(/\[\s*\d+\s*,\s*([A-Za-z_$][\w$]*)\s*\]/g)) {
    const sec = /(Intro|Verse|Prechorus|PreChorus|Chorus|Bridge|Solo|Outro)(\d*)$/.exec(x[1] as string);
    if (!sec) return null;
    out.push(`${(sec[1] as string).toLowerCase()}${sec[2] ? ` ${sec[2]}` : ""}`);
  }
  return out.length >= 2 ? out : null;
}

/** One section name in prose: "chorus", "Chorus 2", "chorus2", "the pre-chorus". */
function sectionPattern(name: string): string {
  const [word, n] = name.toLowerCase().split(/\s+/) as [string, string | undefined];
  const ci = (x: string) => x.replace(/[a-z]/g, (c) => `[${c}${c.toUpperCase()}]`);
  const w = word === "prechorus" || word === "pre-chorus" ? `${ci("pre")}-?${ci("chorus")}` : ci(word);
  // A plain name also matches a numbered one ("chorus" ~ "Chorus 2"): the form is graded on its shape.
  const num = n === undefined ? "(?:\\s*\\d+)?" : `\\s*${n}`;
  return `(?<![A-Za-z])${w}${num}(?![A-Za-z0-9])`;
}

/** The form as letters in prose: "AABA", "A A B A", "A-A-B-A", "A, A, B, A". */
function lettersPattern(letters: readonly string[]): string {
  return `(?<![A-Za-z0-9])${letters.join("[\\s,–—-]*")}(?![A-Za-z0-9])`;
}

/** A run of degrees in any spelling (a scale given as a set): at least `n` of them. */
function degreeRun(n: number): string {
  const one = `(?:\\[\\[deg:\\s*[b#♭♯]?[1-7]\\s*\\]\\]|(?<![A-Za-z0-9#♯♭°ø+/.])(?:[b#♭♯]|flat\\s|sharp\\s)?[1-7](?![A-Za-z0-9#♯°ø+/]|\\.\\d)|(?<![A-Za-z])(?:do|di|ra|re|ri|me|mi|fa|fi|se|sol|so|si|le|la|li|te|ti)(?![A-Za-z]))`;
  return `${one}(?:${SEP}${one}){${n - 1},}`;
}

const SYL_DEGREE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(DEGREE_SYLLABLES).map(([d, syl]) => [syl, d])),
  so: "5",
};

/** The degrees a run names, normalised (`♭3`, `flat 3`, `[[deg:b3]]`, `me` → `b3`). */
export function degreesIn(text: string): string[] {
  const out: string[] = [];
  const re =
    /\[\[deg:\s*([b#♭♯]?[1-7])\s*\]\]|(?<![A-Za-z0-9#♯♭°ø+/.])((?:[b#♭♯]|flat\s|sharp\s)?[1-7])(?![A-Za-z0-9#♯°ø+/])|(?<![A-Za-z])(do|di|ra|re|ri|me|mi|fa|fi|se|sol|so|si|le|la|li|te|ti)(?![A-Za-z])/gi;
  for (const m of text.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? "").replace(/^flat\s/i, "b").replace(/^sharp\s/i, "#");
    out.push(raw ? flat(raw) : (SYL_DEGREE[(m[3] as string).toLowerCase()] ?? "?"));
  }
  return out;
}

const PC: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** Pitch class of a note name (`Eb`, `F#4`), or null. */
function pcOf(name: string): number | null {
  const m = /^([A-Ga-g])([#b♯♭]?)/.exec(name);
  if (!m) return null;
  const base = PC[(m[1] as string).toLowerCase()] as number;
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  return (base + acc + 12) % 12;
}

/** A run of note names (a scale given as notes on a keyboard): at least `n`. */
function noteRun(n: number): string {
  const one = `(?:\\[\\[note:\\s*[A-G][#b♯♭]?-?\\d\\s*\\]\\]|(?<![A-Za-z0-9#♯♭])[A-G][#b♯♭]?-?\\d?(?![A-Za-z0-9#♯♭]))`;
  return `${one}(?:${SEP}${one}){${n - 1},}`;
}

/** The degrees of `n()` values in a mode: n counts the scale's own notes (pentatonic and blues have 5 and 6). */
export function degreesOfN(nums: readonly number[], mode: string | null): string[] {
  const scale = MODE_DEGREES[mode ?? "major"] ?? (MODE_DEGREES.major as readonly string[]);
  return nums.map((x) => scale[((x % scale.length) + scale.length) % scale.length] as string);
}

// --- Wave 6 (wave6.md §11): seventh qualities, applied and borrowed numerals, modes, chromatic degrees, keys --------

/** Each seventh and triad quality in the spellings prose and code use. Keys are content-kit's quality IDs. */
const QUALITY_SPELLINGS: Readonly<Record<string, string>> = {
  maj7: "(?:[Mm]aj(?:or)?[\\s-]*(?:7(?:th)?|seven(?:th)?)|M7|\\^7|Δ7?)",
  "7": "(?:[Dd]om(?:inant)?[\\s-]*(?:7(?:th)?|seven(?:th)?)|[Dd]ominant)",
  m7: "(?:[Mm]in(?:or)?[\\s-]*(?:7(?:th)?|seven(?:th)?)|m7(?!b5|♭5))",
  m7b5: "(?:[Hh]alf[\\s-]*dim(?:inished)?(?:[\\s-]*(?:7(?:th)?|seven(?:th)?))?|m7[b♭]5|ø7?|[Mm]in(?:or)?[\\s-]*seven(?:th)?[\\s-]*flat[\\s-]*(?:5|five))",
  dim7: "(?:(?:[Ff]ully[\\s-]*)?[Dd]im(?:inished)?[\\s-]*(?:7(?:th)?|seven(?:th)?)|[o°]7)",
  major: "(?:[Mm]ajor|[Mm]aj)(?![\\s-]*(?:7|seven))",
  minor: "(?:[Mm]inor|[Mm]in)(?![\\s-]*(?:7|seven))",
  diminished: "(?:[Dd]iminished|[Dd]im)(?![\\s-]*(?:7|seven))",
  augmented: "(?:[Aa]ugmented|[Aa]ug)",
};
const QUALITY_ALIASES: Readonly<Record<string, string>> = {
  maj: "major",
  min: "minor",
  dim: "diminished",
  aug: "augmented",
  dom7: "7",
  M7: "maj7",
  "^7": "maj7",
  min7: "m7",
  ø7: "m7b5",
  ø: "m7b5",
  o7: "dim7",
  "°7": "dim7",
};

/** The qualities of a quality-pad answer (`"maj7 m7 7"`), or null when a word is not a quality. */
export function qualitySequence(answer: string): string[] | null {
  const parts = answer
    .replace(/\bmajor[\s-]+seventh\b/gi, "maj7")
    .replace(/\bminor[\s-]+seventh\b/gi, "m7")
    .replace(/\bdominant[\s-]+seventh\b/gi, "7")
    .replace(/\bhalf[\s-]*diminished(?:[\s-]+seventh)?\b/gi, "m7b5")
    .replace(/\bdiminished[\s-]+seventh\b/gi, "dim7")
    .trim()
    .split(/[\s,;|]+/)
    .filter((x) => x !== "");
  if (parts.length === 0) return null;
  const out: string[] = [];
  for (const raw of parts) {
    const q = QUALITY_ALIASES[raw] ?? QUALITY_ALIASES[raw.toLowerCase()] ?? raw;
    const id = q in QUALITY_SPELLINGS ? q : q.toLowerCase();
    if (!(id in QUALITY_SPELLINGS)) return null;
    out.push(id);
  }
  return out;
}

/**
 * A quality as a whole word, in any spelling. `listed`: inside a list of qualities the dominant seventh may be the
 * bare suffix ("maj7 m7 7 maj7"); alone, a bare 7 is any 7. A quality may hang on a chord's root ("C^7", "Bø7").
 */
const qualityPattern = (id: string, listed = false) =>
  `(?<![A-Za-z0-9#♯♭])(?:[A-G][#b♯♭]?)?${
    listed && id === "7"
      ? `(?:${QUALITY_SPELLINGS[id] as string}|dom7|7(?![\\d.]))`
      : (QUALITY_SPELLINGS[id] as string)
  }(?![A-Za-z0-9])`;

const ORDINAL_INDEX: Readonly<Record<string, number>> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
  sixth: 6,
  "6th": 6,
  seventh: 7,
  "7th": 7,
  eighth: 8,
  "8th": 8,
};
const BAR_REF =
  "(?:\\[\\[bars:\\s*(\\d+)(?:\\s*-\\s*(\\d+))?\\s*\\]\\]|\\b[Bb]ars?\\s+(\\d+)(?:\\s*(?:-|–|—|to|through|and|&)\\s*(\\d+))?)";

const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven"];
const RN_INDEX: Readonly<Record<string, number>> = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

interface NumeralParts {
  acc: -1 | 0 | 1;
  /** 0-based scale step of the roman. */
  step: number;
  upper: boolean;
  suffix: string;
  /** The numeral after the slash (`V7/V` → `V`), or null. */
  target: string | null;
}

function numeralParts(token: string): NumeralParts | null {
  const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)([^/]*)(?:\/(.+))?$/.exec(flat(token));
  if (!m) return null;
  const roman = m[2] as string;
  return {
    acc: m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0,
    step: RN_INDEX[roman.toLowerCase()] as number,
    upper: roman === roman.toUpperCase(),
    suffix: m[3] ?? "",
    target: m[4] ?? null,
  };
}

/** Semitones above the tonic of a numeral's root, in a major-family or minor-family key (Oak's numerals: VI in minor is ♭6). */
function numeralRoot(p: Pick<NumeralParts, "acc" | "step">, minor: boolean): number {
  return (((((minor ? MINOR_STEPS : MAJOR_STEPS)[p.step] as number) + p.acc) % 12) + 12) % 12;
}

/** Is the numeral one of the key's own triads (so it is neither applied nor borrowed)? */
function diatonicNumeral(p: NumeralParts, minor: boolean): boolean {
  if (p.target !== null || p.acc !== 0) return false;
  const major = [true, false, false, true, true, false, false][p.step] as boolean;
  // Minor keys as Oak teaches them: i ii° III iv v VI VII, with V and vii° from the raised 7.
  const inMinor = [false, false, true, false, null, true, null][p.step];
  return minor ? inMinor === null || inMinor === p.upper : major === p.upper;
}

const PC_SPELLINGS: readonly string[][] = [
  ["C", "B#"],
  ["C#", "Db"],
  ["D"],
  ["D#", "Eb"],
  ["E", "Fb"],
  ["F", "E#"],
  ["F#", "Gb"],
  ["G"],
  ["G#", "Ab"],
  ["A"],
  ["A#", "Bb"],
  ["B", "Cb"],
];

/**
 * The other names an applied or borrowed numeral goes by: in words ("five of five", "flat six", "minor four") and,
 * when the key is known, as its chord symbol (V7/V in C is D7). Diatonic numerals have none here.
 */
function outsideNumeralPatterns(token: string, key: string | null | undefined): string[] {
  const p = numeralParts(token);
  if (!p) return [];
  const mode = modeOf(key);
  const minor = mode !== null && MODE_DEGREES[mode]?.[2] === "b3";
  if (diatonicNumeral(p, minor)) return [];
  const out: string[] = [];
  const tonic = tonicPcOf(key);
  const symbol = (pc: number, quality: string) => {
    const roots = PC_SPELLINGS[pc] as string[];
    const body = `(?:${roots.map((r) => spell(r, false)).join("|")})${quality}`;
    out.push(`(?:\\[\\[chord:\\s*${body}\\s*\\]\\]|(?<![A-Za-z0-9#♯♭°ø+/])${body}(?![A-Za-z0-9#♯♭°ø+/^]))`);
  };
  if (p.target !== null) {
    const t = numeralParts(p.target);
    if (!t) return out;
    const targetWord = NUMBER_WORDS[t.step] as string;
    const targetRn = spell(p.target, false);
    const of = `\\s*(?:of|/)\\s*(?:the\\s+)?(?:${targetRn}|${t.acc < 0 ? "flat[\\s-]*" : ""}${targetWord})(?![A-Za-z0-9])`;
    const leading = p.step === 6;
    out.push(
      leading
        ? `(?<![A-Za-z])(?:vii[o°ø]?7?|[Ss]even(?:[\\s-]*diminished)?|[Ll]eading[\\s-]tone(?:\\s+chord)?)${of}`
        : `(?<![A-Za-z])(?:V7?|[Ff]ive(?:[\\s-]*seven(?:th)?)?|[Dd]ominant(?:\\s+seventh)?)${of}`,
    );
    if (tonic !== null) {
      const root = (tonic + numeralRoot(t, minor) + (leading ? 11 : 7)) % 12;
      // A bare letter is also a note name: the triad is matched with its seventh, or as a token.
      if (leading) symbol(root, "(?:[o°]7?|dim7?|m7[b♭]5|ø7?)");
      else {
        symbol(root, "(?:7|9|13)");
        out.push(
          `\\[\\[chord:\\s*(?:${(PC_SPELLINGS[root] as string[]).map((r) => spell(r, false)).join("|")})\\s*\\]\\]`,
        );
      }
    }
    return out;
  }
  // A borrowed chord: a flat-side numeral in words, the minor iv in major, the major I or IV in minor.
  const word = NUMBER_WORDS[p.step] as string;
  const roman = ["I", "II", "III", "IV", "V", "VI", "VII"][p.step] as string;
  const either = `(?:${roman}|${roman.toLowerCase()}|${word}|${p.step + 1})`;
  if (p.acc < 0) out.push(`(?<![A-Za-z])(?:[Ff]lat(?:ted)?|[Ll]owered)[\\s-]*${either}(?![A-Za-z0-9])`);
  else if (p.acc > 0) out.push(`(?<![A-Za-z])(?:[Ss]harp(?:ened)?|[Rr]aised)[\\s-]*${either}(?![A-Za-z0-9])`);
  else {
    const q = p.upper ? "[Mm]ajor" : "[Mm]inor";
    out.push(
      `(?<![A-Za-z])(?:${q}[\\s-]+(?:${roman}|${roman.toLowerCase()}|${word})|(?:${roman}|${roman.toLowerCase()}|${word})[\\s-]+${q})(?![A-Za-z0-9])`,
    );
  }
  if (tonic !== null) {
    const root = (tonic + numeralRoot(p, minor)) % 12;
    const letters = PC_SPELLINGS[root] as string[];
    const sharpOrFlat = letters.filter((r) => r.length >= 2);
    if (p.upper) {
      // Major: a two-character root is a word of its own (A♭); a plain letter only as a token or with a seventh.
      if (sharpOrFlat.length > 0)
        out.push(
          `(?:\\[\\[chord:\\s*(?:${letters.map((r) => spell(r, false)).join("|")})(?:maj7|\\^7|7)?\\s*\\]\\]|(?<![A-Za-z0-9#♯♭°ø+/])(?:${sharpOrFlat.map((r) => spell(r, false)).join("|")})(?:maj7|\\^7|7)?(?![A-Za-z0-9#♯♭°ø+/^]))`,
        );
      else symbol(root, "(?:maj7|\\^7|7)");
    } else symbol(root, "m(?!aj)(?:7|6)?");
  }
  return out;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
/** Syllables that are also everyday English words are never matched alone ("tell me", "do", "so", "la la"). */
const PLAIN_WORD_SYLLABLES = new Set(["me", "do", "so", "la", "re", "mi", "fa", "ti"]);

/**
 * An altered degree in every way it is said: `♯4`, `[[deg:#4]]`, "sharp 4", "raised fourth", and its chromatic
 * syllable ("fi"). `natural`: the degree is the scale's own note raised back (Dorian's 6): only the words name it.
 */
function alteredDegreePatterns(degree: string, o: { natural?: boolean } = {}): string[] {
  const t = flat(degree);
  const num = Number(t.replace(/^[b#]/, ""));
  const nth = `(?:${num}(?:st|nd|rd|th)?|${ORDINALS[num - 1]}|${NUMBER_WORDS[num - 1]})`;
  const out: string[] = [];
  if (o.natural) {
    out.push(`(?<![A-Za-z])(?:raised|natural|major|♮)[\\s-]*${nth}(?![A-Za-z0-9])`);
    return out;
  }
  out.push(degreePattern(t, true, { exact: true }));
  const words = t.startsWith("b")
    ? "(?:lowered|flat(?:ted|tened)?|minor)"
    : "(?:raised|sharp(?:ened)?|augmented)";
  out.push(`(?<![A-Za-z])${words}[\\s-]*${nth}(?![A-Za-z0-9])`);
  const syl = DEGREE_SYLLABLES[t];
  if (syl && !PLAIN_WORD_SYLLABLES.has(syl)) out.push(`(?<![A-Za-z])${syl}(?![A-Za-z])`);
  return out;
}

/** A mode name an answer may be ("Dorian (minor with ♮6)", "Natural minor", "mixolydian"), or null. */
export function modeAnswer(answer: string): string | null {
  const head = (answer.split(/[(:]/)[0] ?? "").trim().toLowerCase();
  if (head in MODE_COLOUR) return head;
  if (head === "major" || head === "ionian") return "major";
  if (head === "natural minor" || head === "minor" || head === "aeolian") return "minor";
  return null;
}

/** The ways a mode is named: its name, and for a colour mode its one changed note against the parent scale. */
function modePatterns(mode: string): string[] {
  const c = MODE_COLOUR[mode];
  if (!c) {
    // "Major" and "minor" are everyday words: only a sentence that says what the mode or scale IS counts.
    const word = mode === "major" ? "(?:major|[Ii]onian)" : "(?:(?:natural\\s+)?minor|[Aa]eolian)";
    return [
      `\\b(?:[Mm]ode|[Ss]cale|[Ii]t|[Tt]his|[Tt]hat|[Aa]nswer)\\b[^.!?\\n]{0,30}?\\b(?:is|sounds|reads)\\s+(?:in\\s+)?(?:plain\\s+|just\\s+|a\\s+|the\\s+)?${word}\\b(?!\\s+(?:with|but|except))`,
    ];
  }
  const ci = (x: string) => x.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`);
  const out = [`(?<![A-Za-z])${ci(mode)}(?![A-Za-z])`, `\\[\\[term:\\s*(?:term\\.)?${mode}\\s*\\]\\]`];
  const natural = !/^[b#]/.test(c.tone);
  for (const pat of alteredDegreePatterns(c.tone, { natural })) out.push(pat);
  return out;
}

/** The standard choice sets of U13–U17 (content-kit `*_OPTIONS`): the head of each label, and how prose says it. */
const CHOICE_PHRASES: Readonly<Record<string, string>> = {
  "on the beat": "on\\s+the\\s+beat",
  pushed:
    "(?:pushed|a\\s+push|anticipat\\w*|arrives\\s+early|(?:an?\\s+)?(?:eighth|sixteenth|8th|16th)(?:[\\s-]note)?\\s+(?:early|ahead))",
  simple: "(?:simple(?:\\s+meter)?|splits?\\s+in(?:to)?\\s+two|in\\s+twos)",
  compound: "(?:compound(?:\\s+meter)?|splits?\\s+in(?:to)?\\s+three|in\\s+threes)",
  "no key change":
    "(?:no\\s+key\\s+change|stays\\s+in\\s+(?:the|one)\\s+(?:same\\s+)?key|does(?:n't|\\s+not)\\s+change\\s+key)",
  "through a pivot chord": "(?:pivot(?:\\s+chord)?)",
  direct: "(?:direct(?:\\s+modulation)?|just\\s+lifts|truck[\\s-]driver\\w*)",
  "in the key": "(?:in\\s+the\\s+key|diatonic)",
  "a secondary dominant": "(?:secondary\\s+dominant|(?:V7?|five)\\s*(?:of|/)\\s*\\w+)",
  "an applied vii°": "(?:applied\\s+vii\\S*|leading[\\s-]tone\\s+chord|vii[o°ø]?7?\\s*(?:of|/)\\s*\\w+)",
  "borrowed from the parallel minor": "(?:borrowed|parallel\\s+(?:minor|major)|modal\\s+mixture)",
};

/** How a standard choice answer is said in prose, or null for any other label. */
export function choicePhrase(answer: string): { head: string; source: string } | null {
  const head = flat((answer.split(/[(:]/)[0] ?? "").trim().toLowerCase());
  const key = Object.keys(CHOICE_PHRASES).find((k) => flat(k) === head);
  return key ? { head: key, source: `(?<![A-Za-z])${CHOICE_PHRASES[key] as string}(?![A-Za-z])` } : null;
}

/** A key as text (`"D major"`, `"D4:major"`, `"F#3:harmonic:minor"`): its tonic letter with accidental, and its mode. */
export function keyParts(text: string): { tonic: string; mode: string } | null {
  const t = text.trim();
  const m = /^([A-Ga-g])([#b♯♭]?)(?:-?\d)?(?::|\s+)(.+)$/.exec(t);
  if (!m) return null;
  const mode = modeOf(`C ${(m[3] as string).replace(/:/g, " ")}`);
  if (mode === null) return null;
  return { tonic: `${(m[1] as string).toUpperCase()}${flat(m[2] ?? "")}`, mode };
}

/** The keys of every `.scale("…")` in a code solution, in order of appearance, each once. */
export function scaleKeysOf(code: string): { tonic: string; mode: string }[] {
  const out: { tonic: string; mode: string }[] = [];
  for (const m of code.matchAll(/\.scale\(\s*["'`]([^"'`]+)["'`]/g)) {
    for (const item of (m[1] as string).replace(/[<>[\]{},]/g, " ").split(/\s+/)) {
      const k = keyParts(item.replace(/[!@*]\d+(?:\.\d+)?$/, ""));
      if (k && !out.some((x) => x.tonic === k.tonic && x.mode === k.mode)) out.push(k);
    }
  }
  return out;
}

/** A key named in prose, in code or as a token: "D major", "D4:major", "the key of D", `[[term:d-major]]`. */
function keyPattern(k: { tonic: string; mode: string }): string {
  const tonic = spell(k.tonic, false);
  const ci = (x: string) => x.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`);
  const modeWords = k.mode.split(" ").map(ci).join("[\\s:-]+");
  const slug = `${k.tonic[0]?.toLowerCase()}${k.tonic.length > 1 ? `-?(?:${k.tonic[1] === "b" ? "flat|b" : "sharp|s"})` : ""}-${k.mode.replace(/ /g, "-")}`;
  return [
    `(?<![A-Za-z0-9#♯♭])${tonic}-?\\d?(?:\\s*:\\s*|\\s+)${modeWords}(?![A-Za-z])`,
    `\\b[Kk]ey\\s+(?:of\\s+)?${tonic}(?![A-Za-z0-9#♯♭b])`,
    `\\[\\[term:\\s*(?:term\\.)?${slug}\\s*\\]\\]`,
  ].join("|");
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];
/** "up 2 half steps", "up a whole step", "a half step higher": the move from one key's home note to another's. */
function keyMovePattern(fromPc: number, toPc: number): string | null {
  const up = (toPc - fromPc + 12) % 12;
  if (up === 0) return null;
  const steps = up <= 6 ? up : 12 - up;
  const dir =
    up <= 6 ? "(?:up|higher|above|raise[sd]?|lift(?:s|ed)?)" : "(?:down|lower|below|drop(?:s|ped)?)";
  const amount = [
    `(?:${steps}|${COUNT_WORDS[steps]})\\s+half[\\s-]steps?`,
    ...(steps === 1 ? ["a\\s+half[\\s-]step"] : []),
    ...(steps === 2 ? ["(?:a|one)\\s+whole[\\s-]step", "a\\s+(?:whole\\s+)?tone"] : []),
  ].join("|");
  return `(?:\\b${dir}\\b[^.!?\\n]{0,24}?(?:${amount})|(?:${amount})[^.!?\\n]{0,16}?\\b${dir}\\b)`;
}

/** A degree of `n()` with a chromatic mark: `"3#"` is the scale step above raised, `"6b"` the step lowered. */
function alterDegree(degree: string, mark: string): string {
  if (mark === "") return degree;
  const d = flat(degree);
  const num = d.replace(/^[b#]/, "");
  const cur = d.startsWith("b") ? -1 : d.startsWith("#") ? 1 : 0;
  const next = cur + (mark === "#" ? 1 : -1);
  return next === 0 ? num : next > 0 ? `#${num}` : `b${num}`;
}

const setEq = (a: readonly (string | number)[], b: ReadonlySet<string | number>) => {
  const sa = new Set(a);
  return sa.size === b.size && [...b].every((x) => sa.has(x));
};

/**
 * The forms of a step's expected answers that must not appear below their level. Empty for Make steps, steps
 * without a reference, and ungraded steps. `alsoShown`: text the learner already has in front of them (their
 * own answer or code): an element they already wrote is not a secret, so "your V in bar 2" is not withheld.
 *
 * Wave 5 kinds (`StepSource.answerKind`, wave5.md §11): a `form` answer is withheld as its section order and as its
 * letters (each name alone is ordinary vocabulary); a `bar-grid` chart as the whole chart, any line of four bars
 * and any "bar N is X" statement; a `scale-builder` scale as the set of its degrees or notes in any order (and each
 * altered degree the learner has not found); a minor or pentatonic `n()` line as its degrees in that mode, in any
 * spelling, syllables included.
 */
export function answerForms(step: StepSource, alsoShown: string | null = null): AnswerForm[] {
  if (step.grading !== "graded" || step.solutions.length === 0) return [];
  const kind = step.answerKind ?? null;
  const shownRaw = [step.prompt, step.starterCode ?? "", ...step.constraints].join(" ");
  const shownText = flat(shownRaw);
  const learnerText = flat(alsoShown ?? "");
  const shown = new Set(answerElements(shownText).map((e) => flat(e.token)));
  for (const lit of codeLiterals(step.starterCode ?? ""))
    for (const e of answerElements(lit.literal.replace(/[<>[\]{}~*!@,]/g, " "), lit.fn === "note"))
      shown.add(flat(e.token));
  const own = new Set(answerElements(learnerText).map((e) => flat(e.token)));
  for (const lit of codeLiterals(learnerText))
    for (const e of answerElements(lit.literal.replace(/[<>[\]{}~*!@,]/g, " "), lit.fn === "note"))
      own.add(flat(e.token));

  // Wave 6: the degrees of the step's own scale: a ♭3 in a minor key is the key's own note, a ♯4 never is.
  const keyDegrees = new Set((MODE_DEGREES[modeOf(step.key) ?? "major"] ?? []).map(flat));

  const forms: AnswerForm[] = [];
  const seen = new Set<string>();
  const add = (
    label: string,
    source: string,
    minLevel: Rung,
    tokens: readonly string[],
    extra: Pick<AnswerForm, "accept" | "sentence"> = {},
  ) => {
    const key = `${minLevel}|${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    forms.push({ label, re: new RegExp(source, "g"), minLevel, tokens: tokens.map(flat), ...extra });
  };

  // --- Wave 5: a form (section order) ---
  const formOf = (items: readonly string[], kindOf: "names" | "letters", from: string) => {
    const letters = kindOf === "letters" ? [...items] : formLettersOf(items);
    const shownOrder = formSequenceIn(shownRaw);
    if (shownOrder !== null && shownOrder.join("") === letters.join("")) return;
    if (kindOf === "names") {
      add(
        `${from} form: ${items.join(" ")}`,
        items.map(sectionPattern).join(SEP),
        MIN_LEVEL.solution,
        items.flatMap((x) => x.split(/\s+/)),
      );
    }
    add(`${from} form letters: ${letters.join("")}`, lettersPattern(letters), MIN_LEVEL.solution, [
      letters.join(""),
      ...letters,
    ]);
  };

  // --- Wave 5: a chart of bars (a 12-bar blues in numerals or symbols) ---
  const gridOf = (answer: string) => {
    const els = answerElements(answer);
    if (els.length < 4) return false;
    const toks = els.map((e) => e.token);
    // The whole chart and every line of four bars, in order.
    add(
      `bar-grid chart: ${toks.join(" ")}`,
      els.map((e) => elementPattern(e.token, e.kind, true)).join(SEP),
      MIN_LEVEL.solution,
      toks,
    );
    // The learner's own chart, bar by bar: what they already have right is not a secret.
    const mine = answerElements(learnerText).map((e) => flat(e.token));
    const mineOk = (bar: number) =>
      mine.length === els.length && mine[bar - 1] === flat(toks[bar - 1] as string);
    for (let i = 0; i + 4 <= els.length; i += 4) {
      const row = els.slice(i, i + 4);
      if ([1, 2, 3, 4].every((k) => mineOk(i + k))) continue;
      add(
        `bar-grid line ${i / 4 + 1}: ${row.map((e) => e.token).join(" ")}`,
        row.map((e) => elementPattern(e.token, e.kind, true)).join(SEP),
        MIN_LEVEL.solution,
        row.map((e) => e.token),
      );
    }
    // "bar 2 is IV7", "bars 5-6: [[rn:IV7]]", "IV7 in bar 2": the chord of a bar the chart has not shown.
    const flatToks = toks.map(flat);
    // Bars the prompt already fills ("Bar 1 is I7").
    const given = new Set<number>();
    for (const m of shownRaw.matchAll(/\b[Bb]ars?\s+(\d+)\b([^.!?\n]{0,40})/g)) {
      const b = Number(m[1]);
      const words = (m[2] as string)
        .split(/[\s,;:]+/)
        .map((w) => flat(w.replace(/[[\]]|^(?:rn|chord):/g, "")));
      if (words.includes(flatToks[b - 1] as string)) given.add(b);
    }
    for (const sym of [...new Set(flatToks)]) {
      const e = els[flatToks.indexOf(sym)] as { token: string; kind: AnswerElementKind };
      const el = elementPattern(e.token, e.kind, true);
      const barRef =
        "(?:\\[\\[bars:\\s*(\\d+)(?:\\s*-\\s*(\\d+))?\\s*\\]\\]|\\b[Bb]ars?\\s+(\\d+)(?:\\s*(?:-|–|—|to|through|and|&)\\s*(\\d+))?)";
      const accept = (m: RegExpExecArray) => {
        const nums = m
          .slice(1)
          .filter((x): x is string => x !== undefined && /^\d+$/.test(x))
          .map(Number);
        if (nums.length === 0) return false;
        const lo = Math.min(...nums);
        const hi = Math.max(...nums);
        for (let b = lo; b <= hi && b - lo < 12; b++)
          if (flatToks[b - 1] === sym && !mineOk(b) && !given.has(b)) return true;
        return false;
      };
      add(`bar-grid bar: ${e.token}`, `${barRef}[^.!?\\n]{0,40}?${el}`, MIN_LEVEL.solution, [e.token], {
        accept,
        sentence: true,
      });
      add(
        `bar-grid bar: ${e.token} (named first)`,
        `${el}[^.!?\\n]{0,24}?\\b(?:in|on|at|for)\\s+${barRef}`,
        MIN_LEVEL.solution,
        [e.token],
        { accept, sentence: true },
      );
    }
    return true;
  };

  // --- Wave 5: a scale as a set ---
  const scaleOf = (answer: string) => {
    const nums = answer.trim().split(/[\s,]+/);
    if (nums.length >= 3 && nums.every((x) => /^\d{2,3}$/.test(x))) {
      // A keyboard answer in MIDI numbers: the notes as a set of pitch classes.
      const pcs = new Set(nums.map((x) => Number(x) % 12));
      add(`scale notes: ${nums.join(" ")}`, noteRun(pcs.size), MIN_LEVEL.solution, [], {
        accept: (m) => {
          const got = (m[0].match(/[A-G][#b♯♭]?/g) ?? []).map((n) => pcOf(n)).filter((x) => x !== null);
          return setEq(got as number[], pcs as ReadonlySet<number>);
        },
      });
      return true;
    }
    const els = answerElements(answer).filter((e) => e.kind === "deg");
    if (els.length < 3) return false;
    const want = new Set(els.map((e) => flat(e.token)));
    add(`scale degrees: ${[...want].join(" ")}`, degreeRun(want.size), MIN_LEVEL.solution, [...want], {
      accept: (m) => setEq(degreesIn(m[0]), want as ReadonlySet<string>),
    });
    // An altered degree the learner has not found is the missing piece itself.
    for (const e of els) {
      const t = flat(e.token);
      if (!/^[b#]/.test(t) || own.has(t) || shown.has(t)) continue;
      add(`scale degree: ${t}`, degreePattern(t, true, { exact: true }), MIN_LEVEL.solution, [t]);
    }
    return true;
  };

  // --- Wave 6: a built scale that is a colour mode: its name and its one changed note, in words ---
  const scaleModeOf = (answer: string) => {
    const want = new Set(
      answerElements(answer)
        .filter((e) => e.kind === "deg")
        .map((e) => flat(e.token)),
    );
    for (const [mode, c] of Object.entries(MODE_COLOUR)) {
      if (!setEq(MODE_DEGREES[mode] ?? [], want as ReadonlySet<string>)) continue;
      if (!new RegExp(`(?<![A-Za-z])${mode}(?![A-Za-z])`, "i").test(shownRaw))
        add(
          `mode: ${mode}`,
          `(?<![A-Za-z])${mode.replace(/[a-z]/g, (ch) => `[${ch}${ch.toUpperCase()}]`)}(?![A-Za-z])`,
          MIN_LEVEL.solution,
          [mode],
        );
      const tone = flat(c.tone);
      if (own.has(tone) && /^[b#]/.test(tone)) continue;
      alteredDegreePatterns(tone, { natural: !/^[b#]/.test(tone) }).forEach((src, i) => {
        add(
          `scale colour tone ${tone} (${i + 1})`,
          src,
          MIN_LEVEL.solution,
          [tone, DEGREE_SYLLABLES[tone] ?? tone],
          {
            sentence: true,
          },
        );
      });
    }
  };

  // --- Wave 6: a form map's boundaries (the first bar of each section) ---
  const mapBarsOf = (answer: string) => {
    const bars = answer
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const mine = new Set((learnerText.match(/\d+/g) ?? []).map(Number));
    add(
      `form map bars: ${bars.join(" ")}`,
      `(?<![\\d.])${bars.join(SEP)}(?!\\d|\\.\\d)`,
      MIN_LEVEL.solution,
      bars.map(String),
      { sentence: true },
    );
    for (const b of bars) {
      // Bar 1 starts every tune; a boundary the learner has already placed is theirs.
      if (b <= 1 || mine.has(b)) continue;
      add(
        `form map boundary: bar ${b}`,
        `(?:\\[\\[bars:\\s*${b}(?:\\s*-\\s*\\d+)?\\s*\\]\\]|\\b[Bb]ars?\\s+${b}(?!\\d))`,
        MIN_LEVEL.solution,
        [String(b)],
        { sentence: true },
      );
    }
  };

  const fromElements = (answer: string, from: string) => {
    const els = answerElements(answer, from === "note");
    if (els.length === 0) return;
    const secret = els.filter((e) => !shown.has(flat(e.token)));
    if (secret.length === 0) return;
    // The whole answer is withheld even when the learner has typed some of it; single elements they typed are not.
    const unknown = secret.filter((e) => !own.has(flat(e.token)));
    if (els.length >= 2) {
      // The whole answer, in any separator, tokens or words (degrees in any spelling, syllables from three on).
      const seq = els.map((e) => elementPattern(e.token, e.kind, true, els.length >= 3)).join(SEP);
      const words = els.map((e) => e.token);
      add(`${from} sequence: ${words.join(" ")}`, seq, MIN_LEVEL.solution, words);
    }
    // One element alone is withheld as long as the whole answer: on these steps the expected chord, numeral or
    // note is the answer, so not even the first issue's fix may name it before hint 4 (wave4.md §5.6).
    const minLevel: Rung = MIN_LEVEL.solution;
    for (const e of unknown) {
      if (e.kind === "word" || (e.kind === "deg" && els.length >= 2)) continue;
      add(
        `${from} ${e.kind}: ${e.token}`,
        elementPattern(e.token, e.kind, bareIsSpecific(e.token, e.kind)),
        minLevel,
        [e.token],
      );
    }
    // Wave 6: an applied or borrowed numeral in its other names ("five of five", "flat six", and its chord symbol
    // in the step's key), and a chromatic degree in words and as its syllable ("raised 4th", "fi").
    for (const e of unknown) {
      if (e.kind === "rn")
        outsideNumeralPatterns(e.token, step.key).forEach((src, i) => {
          add(`${from} rn ${e.token} (other name ${i + 1})`, src, minLevel, [e.token], { sentence: true });
        });
      else if (e.kind === "deg" && from !== "note") {
        const t = flat(e.token);
        if (!/^[b#]/.test(t) || keyDegrees.has(t)) continue;
        alteredDegreePatterns(t).forEach((src, i) => {
          add(`${from} chromatic degree ${t} (${i + 1})`, src, minLevel, [t, DEGREE_SYLLABLES[t] ?? t], {
            sentence: true,
          });
        });
      }
    }
  };

  // --- Wave 6: seventh (and triad) qualities named on a quality pad ---
  const qualitiesOf = (answer: string): boolean => {
    const qs = qualitySequence(answer);
    if (qs === null) return false;
    const words = qs.flatMap((q) => [q, ...(q.includes("7") ? ["seventh", "seven", "7th"] : [])]);
    if (qs.length === 1) {
      // One chord asked: its quality is the whole answer.
      add(`quality: ${qs[0]}`, qualityPattern(qs[0] as string), MIN_LEVEL.solution, words, {
        sentence: true,
      });
      return true;
    }
    // Several chords: the qualities in order, within one sentence, whatever words join them.
    add(
      `quality sequence: ${qs.join(" ")}`,
      qs.map((q) => qualityPattern(q, true)).join("[^.!?\\n]{0,40}?"),
      MIN_LEVEL.solution,
      words,
      { sentence: true },
    );
    // One chord's quality said with its place ("bar 2 is a minor seventh", "the second chord is m7"), unless the
    // learner already has that chord right; and a bare quality that is the whole text (the checker's expected value).
    const mine = qualitySequence(learnerText.replace(/^[^:]*:\s*/, "")) ?? [];
    const mineOk = (bar: number) => mine.length === qs.length && mine[bar - 1] === qs[bar - 1];
    for (const q of new Set(qs)) {
      if (qs.every((x, i) => x !== q || mineOk(i + 1))) continue;
      const el = qualityPattern(q, true);
      const inBars = (m: RegExpExecArray) => {
        const nums = m
          .slice(1)
          .filter((x): x is string => x !== undefined && /^\d+$/.test(x))
          .map(Number);
        if (nums.length === 0) return false;
        for (let b = Math.min(...nums); b <= Math.max(...nums) && b <= qs.length; b++)
          if (qs[b - 1] === q && !mineOk(b)) return true;
        return false;
      };
      add(`quality of a bar: ${q}`, `${BAR_REF}[^.!?\\n]{0,40}?${el}`, MIN_LEVEL.solution, words, {
        accept: inBars,
        sentence: true,
      });
      add(
        `quality of a bar: ${q} (named first)`,
        `${el}[^.!?\\n]{0,24}?\\b(?:in|on|at|for)\\s+${BAR_REF}`,
        MIN_LEVEL.solution,
        words,
        { accept: inBars, sentence: true },
      );
      add(
        `quality by place: ${q}`,
        `\\b(${Object.keys(ORDINAL_INDEX).join("|")})\\b[^.!?\\n]{0,30}?${el}`,
        MIN_LEVEL.solution,
        words,
        {
          accept: (m) => {
            const i = ORDINAL_INDEX[(m[1] ?? "").toLowerCase()] ?? 0;
            return qs[i - 1] === q && !mineOk(i);
          },
          sentence: true,
        },
      );
      add(`quality value: ${q}`, `^\\s*${el}\\s*$`, MIN_LEVEL.solution, words);
    }
    return true;
  };

  // --- Wave 6: a mode named by ear, a standard choice (push, meter feel, key change, outside chord), a key ---
  const modeNamed = (answer: string): boolean => {
    const mode = modeAnswer(answer);
    if (mode === null) return false;
    if (new RegExp(`(?<![A-Za-z])${mode}(?![A-Za-z])`, "i").test(shownRaw) && mode in MODE_COLOUR)
      return true;
    modePatterns(mode).forEach((src, i) => {
      add(`mode: ${mode} (${i + 1})`, src, MIN_LEVEL.solution, [mode], { sentence: true });
    });
    return true;
  };
  const choiceNamed = (answer: string): boolean => {
    const c = choicePhrase(answer);
    if (c === null) return false;
    add(`choice: ${c.head}`, c.source, MIN_LEVEL.solution, c.head.split(/\s+/), { sentence: true });
    return true;
  };
  const keyShown = (k: { tonic: string; mode: string }, text: string) =>
    new RegExp(keyPattern(k)).test(text) || new RegExp(keyPattern(k)).test(flat(text));
  const stepKey = step.key ? keyParts(step.key) : null;
  const keySecret = (k: { tonic: string; mode: string }) =>
    !(stepKey !== null && stepKey.tonic === k.tonic && stepKey.mode === k.mode) &&
    !keyShown(k, shownRaw) &&
    !keyShown(k, alsoShown ?? "");
  const keyNamed = (answer: string): boolean => {
    const k = keyParts(answer);
    if (k === null) return false;
    if (keySecret(k)) keyForm(k, stepKey);
    return true;
  };
  const keyForm = (k: { tonic: string; mode: string }, from: { tonic: string } | null) => {
    add(`key: ${k.tonic} ${k.mode}`, keyPattern(k), MIN_LEVEL.solution, [k.tonic, ...k.mode.split(" ")], {
      sentence: true,
    });
    const a = from ? tonicPcOf(from.tonic) : null;
    const b = tonicPcOf(k.tonic);
    const move = a !== null && b !== null ? keyMovePattern(a, b) : null;
    if (move)
      add(`key move to ${k.tonic} ${k.mode}`, move, MIN_LEVEL.solution, ["half", "step", "whole"], {
        sentence: true,
      });
  };

  for (const s of step.solutions) {
    if (looksLikeCode(s)) {
      // Wave 5: an arranged piece's section order, unless the step already shows it (the chords line's arrange()).
      const sections = arrangeSequence(s);
      if (sections !== null) formOf(sections, "names", "arrange");
      const mode = modeOf(/\.scale\(\s*["'`]<?\s*([^"'`\s>]+)/.exec(s)?.[1] ?? null);
      // Wave 6: a key the piece moves to (a patterned `.scale()`), unless the step or the learner already shows it.
      const keys = scaleKeysOf(s);
      if (keys.length >= 2 || (step.keyPlan?.length ?? 0) >= 2)
        keys.forEach((k, i) => {
          if (keySecret(k)) keyForm(k, keys[i - 1] ?? keys[0] ?? null);
        });
      // Wave 6: how far a line is pushed or delayed (`.early(1/8)`), unless the step already shows the call.
      for (const m of s.matchAll(/\.(early|late)\(\s*["'`]?\s*(\d+)\s*\/\s*(\d+)\s*["'`]?\s*\)/g)) {
        const call = new RegExp(`\\.${m[1]}\\(\\s*["'\`]?\\s*${m[2]}\\s*/\\s*${m[3]}\\s*["'\`]?\\s*\\)`);
        if (call.test(shownRaw) || call.test(alsoShown ?? "")) continue;
        const unit = { "4": "(?:quarter|4th)", "8": "(?:eighth|8th)", "16": "(?:sixteenth|16th)" }[
          m[3] as string
        ];
        const when =
          m[1] === "early" ? "(?:early|earlier|ahead|before|sooner)" : "(?:late|later|after|behind)";
        add(
          `shift: .${m[1]}(${m[2]}/${m[3]})`,
          [
            call.source,
            `\\b(?:early|late)\\b[^.!?\\n]{0,24}?(?<![\\d/])${m[2]}\\s*/\\s*${m[3]}(?![\\d/])`,
            `(?<![\\d/])${m[2]}\\s*/\\s*${m[3]}(?![\\d/])[^.!?\\n]{0,24}?\\b${when}\\b`,
            ...(unit
              ? [`\\b(?:an?|one|${m[2]})\\s+${unit}(?:[\\s-]notes?)?(?:\\s+of\\s+a\\s+bar)?\\s+${when}\\b`]
              : []),
          ].join("|"),
          MIN_LEVEL.solution,
          [m[1] as string, `${m[2]}/${m[3]}`],
          { sentence: true },
        );
      }
      for (const { fn, literal } of codeLiterals(s)) {
        // Lengths and repeats (`0@3`, `C!2`, `hh*8`) are not notes.
        const unweighted = literal.replace(/[@!*]\s*\d+(?:\.\d+)?/g, " ");
        const plain = unweighted.replace(/[<>[\]{}~*!@,]/g, " ").replace(/:\d+/g, "");
        if (fn === "n" || fn.startsWith("degree")) {
          // n() values are degree − 1 in major; in another mode they count that scale's notes. A several-note line
          // is withheld as a sequence, in code or as degrees in any spelling (and as syllables). Wave 6: a chromatic
          // step (`3#`, `6b`) is the scale step raised or lowered.
          const steps = plain
            .trim()
            .split(/\s+/)
            .map((t) => /^(-?\d+)([#b]?)$/.exec(t))
            .filter((m): m is RegExpExecArray => m !== null);
          const nums = steps.map((m) => `${m[1]}${m[2]}`);
          if (nums.length >= 3 && !shownText.includes(nums.join(" "))) {
            add(
              `n sequence: ${nums.join(" ")}`,
              `(?<![\\d.])${nums.join("\\s+")}(?![\\d.#b])`,
              MIN_LEVEL.solution,
              nums,
            );
            const base =
              fn === "n"
                ? degreesOfN(
                    steps.map((m) => Number(m[1])),
                    mode,
                  )
                : steps.map((m) => String(Number(m[1]) + 1));
            const degs = base.map((d, i) => alterDegree(d, (steps[i] as RegExpExecArray)[2] ?? ""));
            // A chromatic degree the learner has not written is the missing note itself.
            for (const d of new Set(degs)) {
              const t = flat(d);
              if (!/^[b#]/.test(t) || keyDegrees.has(t) || (MODE_DEGREES[mode ?? "major"] ?? []).includes(t))
                continue;
              if (own.has(t) || shown.has(t)) continue;
              alteredDegreePatterns(t).forEach((src, i) => {
                add(
                  `chromatic degree ${t} (${i + 1})`,
                  src,
                  MIN_LEVEL.solution,
                  [t, DEGREE_SYLLABLES[t] ?? t],
                  {
                    sentence: true,
                  },
                );
              });
            }
            add(
              `degree sequence: ${degs.join(" ")}`,
              degs.map((d) => degreePattern(d, true, { syllables: true })).join(SEP),
              MIN_LEVEL.solution,
              degs,
            );
          }
        } else fromElements(plain, fn);
      }
    } else if (kind === "form" || formSequence(s) !== null) {
      const f = formSequence(s);
      if (f) formOf(f.items, f.kind, "answer");
      else if (/^\d+(?:[\s,]+\d+)+$/.test(s.trim())) mapBarsOf(s);
    } else if (kind === "bar-grid") {
      if (!gridOf(s)) fromElements(s, "answer");
    } else if (kind === "scale-builder") {
      if (!scaleOf(s)) fromElements(s, "answer");
      else scaleModeOf(s);
    } else if ((kind === "quality-pad" || /7|seventh/i.test(s)) && qualitiesOf(s)) {
      // A quality pad's qualities (Wave 6: the five sevenths).
    } else if (modeNamed(s) || choiceNamed(s) || keyNamed(s)) {
      // A mode, a standard choice or a key, named in words.
    } else fromElements(s, "answer");
  }
  return forms;
}

/** The first form written in a text (a prompt that already shows the order), as letters, or null. */
function formSequenceIn(text: string): string[] | null {
  const code = arrangeSequence(text);
  if (code) return formLettersOf(code);
  return null;
}

/** Labels of the forms found in `text` although `level` is below their allowance (tests and card checks). */
export function answerLeaks(text: string, forms: readonly AnswerForm[], level: Rung): string[] {
  const found: string[] = [];
  for (const f of forms) {
    if (level >= f.minLevel) continue;
    f.re.lastIndex = 0;
    if (f.accept === undefined ? f.re.test(text) : [...text.matchAll(f.re)].some((m) => f.accept?.(m)))
      found.push(f.label);
  }
  return found;
}

/** A replace callback's arguments as the match array `accept` reads. */
function asMatch(m: string, rest: unknown[]): RegExpExecArray {
  const i = rest.findIndex((x) => typeof x === "number");
  const arr = [m, ...(rest.slice(0, i) as (string | undefined)[])] as unknown as RegExpExecArray;
  arr.index = rest[i] as number;
  arr.input = rest[i + 1] as string;
  return arr;
}

/** `text` with every form not allowed at `level` replaced by WITHHELD. Matches before `from` are left alone. */
export function maskAnswers(text: string, forms: readonly AnswerForm[], level: Rung, from = 0): string {
  let out = text;
  // Longest forms first, so a sequence is masked whole before its elements are.
  const active = forms
    .filter((f) => level < f.minLevel)
    .sort((a, b) => b.re.source.length - a.re.source.length);
  for (const f of active) {
    let shift = 0;
    out = out.replace(f.re, (m: string, ...rest: unknown[]) => {
      const at = rest.find((x) => typeof x === "number") as number;
      if (at + shift < from) return m;
      if (f.accept && !f.accept(asMatch(m, rest))) return m;
      shift += WITHHELD.length - m.length;
      return WITHHELD;
    });
  }
  return out;
}

/** A held run longer than this cannot be an answer still arriving: it is released. */
export const GUARD_MAX_HOLD = 400;

/**
 * Where the text that may still become an answer begins: the trailing run of words that are, or may be the start
 * of, one of the answer's own words (`tokens`), or of a music token. Everything before it can be released: an
 * answer form is made of those words and separators only, so no match can cross a word outside the run.
 */
export function holdFrom(buf: string, tokens: ReadonlySet<string>): number {
  let start = buf.length;
  const words = [...buf.matchAll(/[^\s,;|→–—]+/g)];
  const endsOpen = words.length > 0 && /[^\s,;|→–—]$/.test(buf);
  const prefixOf = (w: string) => {
    for (const t of tokens) if (t.startsWith(w) || t.toLowerCase().startsWith(w.toLowerCase())) return true;
    return false;
  };
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i] as RegExpMatchArray;
    const raw = w[0];
    // A sentence mark ends any answer form (no separator allows it): nothing before it can still change.
    if (/[.!?:]["')\]*_]*$/.test(raw) && !/\[\[[^\]]*$/.test(raw)) break;
    const open = i === words.length - 1 && endsOpen;
    const bare = flat(raw.replace(/^[[<("'*_]+|[\]>)"'.!?:*_]+$/g, ""));
    const token = /\[\[(?:[a-z]+:?)?([^\]]*)\]?\]?/.exec(raw);
    const answerLike =
      (token !== null && (open || !raw.includes("]]") || prefixOf(flat(token[1] ?? "")))) ||
      bare === "" ||
      tokens.has(bare) ||
      tokens.has(bare.toLowerCase()) ||
      (tokens.size > 0 && (CONNECTORS.has(bare.toLowerCase()) || /^(?:flat|sharp)$/i.test(bare))) ||
      (open && prefixOf(bare)) ||
      raw.split("-").every((p) => p === "" || tokens.has(flat(p)));
    if (!answerLike) break;
    start = w.index as number;
  }
  return buf.length - start > GUARD_MAX_HOLD ? buf.length : start;
}

/** Where the sentence still being written begins (after the last `.`, `!`, `?` or line break followed by space). */
export function sentenceStart(buf: string): number {
  let at = 0;
  for (const m of buf.matchAll(/[.!?\n](?=\s)|\n/g)) at = (m.index as number) + 1;
  return buf.length - at > GUARD_MAX_HOLD ? buf.length : at;
}

/**
 * Streaming form of `maskAnswers`. Holds back only the trailing words that could still turn into an answer
 * (`holdFrom`), so prose streams as it comes and an answer split across deltas is seen whole before any of it
 * is forwarded.
 */
export class AnswerGuard {
  #buf = "";
  /** The last character already forwarded: the left context for whole-word matches. */
  #ctx = "";
  readonly #forms: readonly AnswerForm[];
  readonly #level: Rung;
  readonly #tokens: ReadonlySet<string>;
  /** Labels of what was withheld, for the log and tests. */
  readonly hits: string[] = [];

  constructor(forms: readonly AnswerForm[], level: Rung) {
    this.#forms = forms.filter((f) => level < f.minLevel);
    this.#level = level;
    const tokens = this.#forms.flatMap((f) => f.tokens);
    // Degrees may arrive as syllables, section names in any case.
    const syl = this.#forms.some((f) => f.label.startsWith("degree sequence") || f.label.includes("sequence"))
      ? Object.values(DEGREE_SYLLABLES).concat("so")
      : [];
    this.#tokens = new Set([...tokens, ...tokens.map((t) => t.toLowerCase()), ...syl]);
    this.#sentence = this.#forms.some((f) => f.sentence === true);
  }

  readonly #sentence: boolean;

  get active(): boolean {
    return this.#forms.length > 0;
  }

  push(chunk: string): string {
    if (!this.active) return chunk;
    this.#buf += chunk;
    return this.#release(false);
  }

  flush(): string {
    if (!this.active) return "";
    return this.#release(true);
  }

  #release(final: boolean): string {
    for (const l of answerLeaks(this.#buf, this.#forms, this.#level))
      if (!this.hits.includes(l)) this.hits.push(l);
    const masked = maskAnswers(this.#ctx + this.#buf, this.#forms, this.#level, this.#ctx.length).slice(
      this.#ctx.length,
    );
    let at = final
      ? masked.length
      : Math.min(holdFrom(masked, this.#tokens), this.#sentence ? sentenceStart(masked) : masked.length);
    // Never release the inside of a replacement.
    const w = masked.lastIndexOf(WITHHELD, at);
    if (w >= 0 && w < at && w + WITHHELD.length > at) at = w + WITHHELD.length;
    const out = masked.slice(0, at);
    this.#buf = masked.slice(at);
    if (out !== "") this.#ctx = out.slice(-1);
    return out;
  }
}

/**
 * How a graded step is answered, for the `answer_kind` context line: the content's own `answerKind` when the
 * adapter sends it, else what the expected answer is made of (`numerals`, `chords`, `notes`, `degrees`).
 */
export function answerKindOf(step: StepSource): string | null {
  if (step.answerKind) return step.answerKind;
  const forms = answerForms(step);
  const kinds = new Set(forms.map((f) => /^\S+ (rn|chord|note|sequence)/.exec(f.label)?.[1] ?? f.label));
  if (forms.some((f) => f.label.startsWith("key: "))) return "key plan";
  if (forms.some((f) => f.label.startsWith("shift: "))) return "rhythm shift";
  if ([...kinds].some((k) => k === "rn")) return "numerals";
  if ([...kinds].some((k) => k === "chord")) return "chords";
  if ([...kinds].some((k) => k === "note")) return "notes";
  if (forms.some((f) => f.label.startsWith("n sequence") || f.label.startsWith("degree sequence")))
    return "degrees";
  return null;
}
