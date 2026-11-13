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
import { DEGREE_SYLLABLES, MODE_DEGREES, modeOf } from "./vocabulary.ts";

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

const RN =
  /^[b#♭♯]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(?:o|°|ø|\+|maj7|M7|7|6|64|65|43|42|2)?(?:\/[b#]?(?:VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i))?$/;
const CHORD =
  /^[A-G][#b♯♭]?(?:m7b5|maj7|M7|m7|m6|dim7|dim|aug|sus2|sus4|m|o|°|ø7?|\+|7|6|9)?(?:\/[A-G][#b♯♭]?)?$/;
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
  const body = spell(token, kind === "note");
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

const SEP = "(?:\\s*(?:[,;|>→–—-]|->|\\band\\b|\\bthen\\b)?\\s*)";
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
  };

  for (const s of step.solutions) {
    if (looksLikeCode(s)) {
      // Wave 5: an arranged piece's section order, unless the step already shows it (the chords line's arrange()).
      const sections = arrangeSequence(s);
      if (sections !== null) formOf(sections, "names", "arrange");
      const mode = modeOf(/\.scale\(\s*["'`]<?\s*([^"'`\s>]+)/.exec(s)?.[1] ?? null);
      for (const { fn, literal } of codeLiterals(s)) {
        const plain = literal.replace(/[<>[\]{}~*!@,]/g, " ").replace(/:\d+/g, "");
        if (fn === "n" || fn.startsWith("degree")) {
          // n() values are degree − 1 in major; in another mode they count that scale's notes. A several-note line
          // is withheld as a sequence, in code or as degrees in any spelling (and as syllables).
          const nums = plain
            .trim()
            .split(/\s+/)
            .filter((t) => /^-?\d+$/.test(t));
          if (nums.length >= 3 && !shownText.includes(nums.join(" "))) {
            add(
              `n sequence: ${nums.join(" ")}`,
              `(?<![\\d.])${nums.join("\\s+")}(?![\\d.])`,
              MIN_LEVEL.solution,
              nums,
            );
            const degs =
              fn === "n" ? degreesOfN(nums.map(Number), mode) : nums.map((x) => String(Number(x) + 1));
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
    } else if (kind === "bar-grid") {
      if (!gridOf(s)) fromElements(s, "answer");
    } else if (kind === "scale-builder") {
      if (!scaleOf(s)) fromElements(s, "answer");
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
  if ([...kinds].some((k) => k === "rn")) return "numerals";
  if ([...kinds].some((k) => k === "chord")) return "chords";
  if ([...kinds].some((k) => k === "note")) return "notes";
  if (forms.some((f) => f.label.startsWith("n sequence") || f.label.startsWith("degree sequence")))
    return "degrees";
  return null;
}
