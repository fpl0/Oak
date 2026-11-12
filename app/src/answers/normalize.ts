// Forgiving input, exact canonical display (exercises §3.9). What the learner types is sent as typed; the grader
// normalises it with `@oak/theory` `normalizeText` (or a lower-cased "free" form). This module shows the learner
// what Oak reads before they check ("reads as E♭"), with the SAME normaliser, so the preview never promises
// something the grader would reject. It also parses numbers, scale degrees and note ranges for the other
// widgets. Pure: tested with `bun test`.
import type { Degree } from "@oak/api";
import { normalizeText, noteToMidi, parseChordWithBass, toLeadSheet } from "@oak/theory";
import { accidentals } from "../lib/format.ts";

export type TextKind = "note" | "chord" | "rn" | "interval" | "key" | "free";

export type ReadsAs =
  /** Nothing typed yet. */
  | { state: "empty" }
  /** `canonical` is what the grader compares; `display` is how Oak prints it; `spoken` names it in words. */
  | { state: "ok"; canonical: string; display: string; spoken: string }
  /** Oak cannot read it as this kind; `hint` says what it expects, calmly. */
  | { state: "unknown"; hint: string };

const EXPECT: Record<TextKind, string> = {
  note: "a note name, like E♭ or F♯4",
  chord: "a chord symbol, like Cmaj7 or Am/G",
  rn: "a Roman numeral, like IV, V7 or vii°",
  interval: "an interval, like m3, P5 or major sixth",
  key: "a key, like E♭ major or F♯ minor",
  free: "a word or a few words",
};

/** What Oak expects for this kind, for placeholders and hints. */
export function expectedText(kind: TextKind): string {
  return EXPECT[kind];
}

const QUALITY_WORD: Record<string, string> = {
  P: "perfect",
  M: "major",
  m: "minor",
  A: "augmented",
  d: "diminished",
};
const ORDINAL: Record<string, string> = {
  "1": "unison",
  "2": "second",
  "3": "third",
  "4": "fourth",
  "5": "fifth",
  "6": "sixth",
  "7": "seventh",
  "8": "octave",
  "9": "ninth",
  "10": "tenth",
  "11": "eleventh",
  "12": "twelfth",
  "13": "thirteenth",
};

const ACC_WORD: Record<string, string> = {
  "♭♭": "double flat",
  "♭": "flat",
  "♯♯": "double sharp",
  "♯": "sharp",
};

/** `Eb4` → `E♭4`, `F##` → `F𝄪`-free form `F♯♯`. */
export function displayNote(name: string): string {
  return accidentals(name);
}

/** `E♭4` → "E flat 4". */
export function spokenNote(display: string): string {
  const m = /^([A-G])(♭♭|♯♯|♭|♯)?(-?\d)?$/.exec(display);
  if (!m) return display;
  return [m[1], m[2] ? ACC_WORD[m[2]] : null, m[3] ?? null].filter(Boolean).join(" ");
}

/** `viio` → `vii°`, `bVII` → `♭VII`, `#iv` → `♯iv`; applied chords keep their slash. */
export function displayRn(rn: string): string {
  return rn
    .split("/")
    .map((part) =>
      part
        .replace(/^b/, "♭")
        .replace(/^#/, "♯")
        .replace(/o(?=\d*$)/, "°"),
    )
    .join("/");
}

/** `M3` → "major third", `TT` → "tritone". */
export function spokenInterval(name: string): string {
  if (name === "TT") return "tritone";
  const m = /^([PMmAd])(\d{1,2})$/.exec(name);
  if (!m) return name;
  const q = QUALITY_WORD[m[1] as string] ?? m[1];
  const n = ORDINAL[m[2] as string] ?? `${m[2]}th`;
  if (m[2] === "1" || m[2] === "8") return m[1] === "P" ? n : `${q} ${n}`;
  return `${q} ${n}`;
}

const acc = (s: string) => s.replace(/♭/g, " flat").replace(/♯/g, " sharp");

/** `F♯m7♭5` → "F sharp minor 7 flat 5", `Am7/G` → "A minor 7 over G". */
export function spokenChord(display: string): string {
  const [head = "", bass] = display.split("/");
  const m = /^([A-G][♭♯]?)(.*)$/.exec(head);
  if (!m) return display;
  const suffix = (m[2] ?? "")
    .replace(/^maj/, " major ")
    .replace(/^m(?!aj)/, " minor ")
    .replace(/^dim/, " diminished ")
    .replace(/^aug/, " augmented ")
    .replace(/^sus/, " suspended ")
    .replace(/♭/g, " flat ")
    .replace(/♯/g, " sharp ");
  const words = `${acc(m[1] as string)} ${suffix}`.replace(/\s+/g, " ").trim();
  return bass ? `${words} over ${acc(bass)}` : words;
}

function free(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * What Oak reads in `text` for a text answer of `kind`: the grader's canonical string, the display form and a
 * spoken form for screen readers. Never throws.
 */
export function readsAs(kind: TextKind, text: string): ReadsAs {
  if (text.trim() === "") return { state: "empty" };
  const one = readOne(kind, text);
  if (one.state !== "unknown") return one;
  // A list of notes or numerals ("D E F# G A B C#": a scale to spell, a key signature) reads token by token;
  // as one note it read "Oak reads a note name" while the grader took it, and its reveal showed "F#". A
  // single note in words ("e flat") is read whole first.
  const tokens = text.trim().split(/[\s,]+/);
  if ((kind === "note" || kind === "rn") && tokens.length > 1) {
    const each = tokens.map((t) => readOne(kind, t));
    if (each.every((r) => r.state === "ok")) {
      const ok = each as Extract<ReadsAs, { state: "ok" }>[];
      return {
        state: "ok",
        canonical: ok.map((r) => r.canonical).join(" "),
        display: ok.map((r) => r.display).join(" "),
        spoken: ok.map((r) => r.spoken).join(", "),
      };
    }
    return { state: "unknown", hint: `Oak reads ${EXPECT[kind]}, separated by spaces.` };
  }
  return one;
}

function readOne(kind: TextKind, text: string): ReadsAs {
  if (kind === "free") {
    const c = free(text);
    return { state: "ok", canonical: c, display: c, spoken: c };
  }
  let canonical: string | null = null;
  try {
    canonical = normalizeText(kind, text);
  } catch {
    canonical = null;
  }
  if (!canonical) return { state: "unknown", hint: `Oak reads ${EXPECT[kind]}.` };
  switch (kind) {
    case "note": {
      const display = displayNote(canonical);
      return { state: "ok", canonical, display, spoken: spokenNote(display) };
    }
    case "chord": {
      const c = parseChordWithBass(canonical);
      const display = c ? toLeadSheet(c) : accidentals(canonical);
      return { state: "ok", canonical, display, spoken: spokenChord(display) };
    }
    case "rn": {
      const display = displayRn(canonical);
      return { state: "ok", canonical, display, spoken: display };
    }
    case "interval":
      return { state: "ok", canonical, display: canonical, spoken: spokenInterval(canonical) };
    case "key": {
      const display = accidentals(canonical);
      return { state: "ok", canonical, display, spoken: acc(display) };
    }
  }
}

// --- numbers ------------------------------------------------------------------------------------

const VULGAR: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
};
const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  sixteen: 16,
};
const UNITS =
  /\s*(bpm|beats?|bars?|steps?|notes?|semitones?|half[- ]?steps?|cents?|¢|hz|times|x|×|per bar|per beat)\.?$/i;

/**
 * A number as a learner types it: `120`, `120 BPM`, `1,5`, `1.5`, `1/3`, `⅓`, `1 1/2`, `-2`, `three`.
 * Units are dropped (the question names them). Returns `null` for anything else.
 */
export function parseNumberText(text: string): number | null {
  let t = text.trim().replace(/−/g, "-");
  if (t === "") return null;
  t = t.replace(UNITS, "").trim();
  const word = NUMBER_WORDS[t.toLowerCase()];
  if (word !== undefined) return word;
  const vulgar = /^([+-]?)(\d+)?\s*([½⅓⅔¼¾⅛])$/.exec(t);
  if (vulgar) {
    const sign = vulgar[1] === "-" ? -1 : 1;
    return sign * (Number(vulgar[2] ?? 0) + (VULGAR[vulgar[3] as string] ?? 0));
  }
  const mixed = /^([+-]?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (mixed) {
    const d = Number(mixed[4]);
    if (d === 0) return null;
    const sign = mixed[1] === "-" ? -1 : 1;
    return sign * (Number(mixed[2]) + Number(mixed[3]) / d);
  }
  const frac = /^([+-]?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/.exec(t);
  if (frac) {
    const d = Number((frac[2] as string).replace(",", "."));
    if (d === 0) return null;
    return Number((frac[1] as string).replace(",", ".")) / d;
  }
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** A number for display: integers as is, others to at most 3 decimals, never "0.30000000000000004". */
export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

// --- scale degrees ------------------------------------------------------------------------------

/** Movable do with do = 1 (chromatic syllables for the altered degrees). */
export const SYLLABLES: Readonly<Record<Degree, string>> = {
  "1": "do",
  "#1": "di",
  b2: "ra",
  "2": "re",
  "#2": "ri",
  b3: "me",
  "3": "mi",
  "4": "fa",
  "#4": "fi",
  b5: "se",
  "5": "sol",
  "#5": "si",
  b6: "le",
  "6": "la",
  "#6": "li",
  b7: "te",
  "7": "ti",
};

const DEGREE_SET = new Set<string>(Object.keys(SYLLABLES));
const DIGIT_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
};
const BY_SYLLABLE: Record<string, Degree> = Object.fromEntries(
  (Object.entries(SYLLABLES) as [Degree, string][]).map(([d, s]) => [s, d]),
);
BY_SYLLABLE.so = "5";

/** `b3`, `♭3`, `flat 3`, `flat three`, `#4`, `sharp four`, `me`, `sol` → a degree, or `null`. */
export function parseDegreeText(text: string): Degree | null {
  const t = text.trim().toLowerCase().replace(/♭/g, "b").replace(/♯/g, "#");
  if (t === "") return null;
  const syl = BY_SYLLABLE[t];
  if (syl) return syl;
  const m = /^(b|#|flat|sharp)?\s*-?\s*([1-7]|one|two|three|four|five|six|seven)$/.exec(t);
  if (!m) return null;
  const acc = m[1] === "flat" || m[1] === "b" ? "b" : m[1] === "sharp" || m[1] === "#" ? "#" : "";
  const n = DIGIT_WORDS[m[2] as string] ?? (m[2] as string);
  const d = `${acc}${n}`;
  return DEGREE_SET.has(d) ? (d as Degree) : null;
}

/** "1 3 5", "1, b3, 5", "do mi sol" → degrees; `null` when any item is not a degree. */
export function parseDegreeList(text: string): Degree[] | null {
  const items = text
    .trim()
    .split(/[\s,]+/)
    .filter((x) => x !== "");
  // Re-join "flat 3" / "sharp 4" that the split took apart.
  const joined: string[] = [];
  for (const item of items) {
    const last = joined[joined.length - 1];
    if (last && /^(flat|sharp)$/i.test(last)) joined[joined.length - 1] = `${last} ${item}`;
    else joined.push(item);
  }
  const out: Degree[] = [];
  for (const item of joined) {
    const d = parseDegreeText(item);
    if (!d) return null;
    out.push(d);
  }
  return out;
}

/** `b7` → `♭7`. */
export function degreeDisplay(d: string): string {
  return d.replace(/^b/, "♭").replace(/^#/, "♯");
}

/** `b7` → "flat 7" (screen readers say "b 7" otherwise). */
export function degreeSpoken(d: string): string {
  return d.replace(/^b/, "flat ").replace(/^#/, "sharp ");
}

// --- notes and ranges ---------------------------------------------------------------------------

/** `["C4", "C5"]` → `[60, 72]`, low first. Throws on an unreadable bound (authoring error). */
export function midiRange(range: readonly [string, string]): [number, number] {
  const a = noteToMidi(range[0]);
  const b = noteToMidi(range[1]);
  if (a === null || b === null)
    throw new RangeError(`answers: keyboard range ${range.join("–")} is not two notes`);
  return a <= b ? [a, b] : [b, a];
}

const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] as const;

/** A piano key's name with its octave: white keys plain, black keys both spellings (`C♯/D♭4`). */
export function keyName(midi: number, style: "both" | "sharp" | "flat" = "both"): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const sharp = SHARP_NAMES[pc] as string;
  const flat = FLAT_NAMES[pc] as string;
  if (sharp === flat || style === "sharp") return `${sharp}${octave}`;
  if (style === "flat") return `${flat}${octave}`;
  return `${sharp}/${flat}${octave}`;
}

/** Spoken key name: `C♯/D♭4` → "C sharp or D flat 4". */
export function keySpoken(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const sharp = (SHARP_NAMES[pc] as string).replace("♯", " sharp");
  const flat = (FLAT_NAMES[pc] as string).replace("♭", " flat");
  return sharp === flat ? `${sharp} ${octave}` : `${sharp} or ${flat} ${octave}`;
}
