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

export type AnswerElementKind = "rn" | "chord" | "note" | "deg" | "word";

export interface AnswerForm {
  /** For failure messages: what was found. */
  label: string;
  re: RegExp;
  /** Lowest level at which this form may appear. */
  minLevel: Rung;
  /** The words the form is made of (flat spelling), so the streaming guard knows what may still be arriving. */
  tokens: readonly string[];
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

/** One element, as a music token or a bare word; `bare: false` matches the token form only. */
function elementPattern(token: string, kind: AnswerElementKind, bare: boolean): string {
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

const SEP = "(?:\\s*(?:[,;|>→–—-]|->)?\\s*)";

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

const looksLikeCode = (s: string) => /\w\s*\(\s*["'`]/.test(s) || /\n/.test(s);

/**
 * The forms of a step's expected answers that must not appear below their level. Empty for Make steps, steps
 * without a reference, and ungraded steps. `alsoShown`: text the learner already has in front of them (their
 * own answer or code): an element they already wrote is not a secret, so "your V in bar 2" is not withheld.
 */
export function answerForms(step: StepSource, alsoShown: string | null = null): AnswerForm[] {
  if (step.grading !== "graded" || step.solutions.length === 0) return [];
  const shownText = flat([step.prompt, step.starterCode ?? "", ...step.constraints].join(" "));
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
  const add = (label: string, source: string, minLevel: Rung, tokens: readonly string[]) => {
    const key = `${minLevel}|${source}`;
    if (seen.has(key)) return;
    seen.add(key);
    forms.push({ label, re: new RegExp(source, "g"), minLevel, tokens: tokens.map(flat) });
  };
  const fromElements = (answer: string, from: string) => {
    const els = answerElements(answer, from === "note");
    if (els.length === 0) return;
    const secret = els.filter((e) => !shown.has(flat(e.token)));
    if (secret.length === 0) return;
    // The whole answer is withheld even when the learner has typed some of it; single elements they typed are not.
    const unknown = secret.filter((e) => !own.has(flat(e.token)));
    if (els.length >= 2) {
      // The whole answer, in any separator, tokens or words.
      const seq = els.map((e) => elementPattern(e.token, e.kind, true)).join(SEP);
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
      for (const { fn, literal } of codeLiterals(s)) {
        const plain = literal.replace(/[<>[\]{}~*!@,]/g, " ").replace(/:\d+/g, "");
        if (fn === "n" || fn.startsWith("degree")) {
          // n() values are degree − 1: a several-note line is withheld as a sequence, in code or as degrees.
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
            const degs = nums.map((x) => String(Number(x) + 1));
            add(
              `degree sequence: ${degs.join(" ")}`,
              degs.map((d) => `(?:\\[\\[deg:${d}\\]\\]|(?<![\\d.])${d}(?![\\d.]))`).join(SEP),
              MIN_LEVEL.solution,
              degs,
            );
          }
        } else fromElements(plain, fn);
      }
    } else fromElements(s, "answer");
  }
  return forms;
}

/** Labels of the forms found in `text` although `level` is below their allowance (tests and card checks). */
export function answerLeaks(text: string, forms: readonly AnswerForm[], level: Rung): string[] {
  const found: string[] = [];
  for (const f of forms) {
    if (level >= f.minLevel) continue;
    f.re.lastIndex = 0;
    if (f.re.test(text)) found.push(f.label);
  }
  return found;
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
      (open && prefixOf(bare)) ||
      raw.split("-").every((p) => p === "" || tokens.has(flat(p)));
    if (!answerLike) break;
    start = w.index as number;
  }
  return buf.length - start > GUARD_MAX_HOLD ? buf.length : start;
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
    this.#tokens = new Set(this.#forms.flatMap((f) => f.tokens));
  }

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
    let at = final ? masked.length : holdFrom(masked, this.#tokens);
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
