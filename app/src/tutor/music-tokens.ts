// What a music token in tutor text means and does (contracts §10.7, ux §6.4). Pure: the chip component renders
// this. Every musical fact comes from @oak/theory (spelling, function, chord tones, keys, intervals), never from
// a table here.
//
// The key: the panel passes the subject's key (the lesson's declared key, the `.scale()` of the code on screen,
// the capstone's brief) as `ctx.key`. Degrees, numerals and intervals then sound in that key, a note says which
// degree it is there, a chord which numeral. Without a key, playback is in C major and the hover says so.
//
// Wave 3 vocabulary inside the closed grammar of contracts §10.7 (no new token kinds):
// - degrees with alterations (`[[deg:b3]]`, `[[deg:#4]]`) carry their movable-do syllable (do-based minor);
//   markdown.ts also reads `[[deg:♭3]]` and a syllable (`[[deg:me]]`) as the same degree;
// - a `term` that is not a glossary ID but names an interval (`[[term:m3]]`, `[[term:perfect-fifth]]`), a key
//   (`[[term:e-flat-major]]`) or a key signature (`[[term:2-sharps]]`) becomes a playable chip described by
//   @oak/theory; a glossary ID always wins (`[[term:tritone]]` is the glossary's, and it also plays one).
import type { MusicToken } from "@oak/api";
import type { TermEntry, ToolEntry } from "@oak/content-kit";
import {
  chordPcs,
  type Degree,
  degreeSemitones,
  displayName,
  displayRN,
  functionOf,
  type KeySpec,
  keyOf,
  labelPitch,
  noteToMidi,
  parseChordSymbol,
  parseChordWithBass,
  parseInterval,
  parseRN,
  relativeKey,
  rnToChord,
  romanOf,
  scaleNotes,
  signatureOf,
  syllableOf,
  toLeadSheet,
} from "@oak/theory";
import type { FormViewSection } from "../lib/form-view.ts";
import { barsPhrase, barsWhere, type ChordAt, runsOf } from "./harmony-chips.ts";

export const PLAY_KEY: KeySpec = { tonic: "C", mode: "major" } as KeySpec;

/** Which labels the learner sees (the lenses, docs/design/wave3.md §4.3): extras on chips follow them. */
export interface TokenLabels {
  degrees: boolean;
  solfege: boolean;
}

export interface TokenContext {
  terms: readonly TermEntry[];
  /** Term IDs from completed lessons (`GET /terms/introduced`); null while unknown (no badge then). */
  introduced: ReadonlySet<string> | null;
  tools: readonly ToolEntry[];
  /** Unlocked item IDs (`GET /unlocks`); null while unknown. */
  unlocked: ReadonlySet<string> | null;
  /** The subject's key; null or absent: C major, said in the hover. */
  key?: KeySpec | null;
  /** Shown lenses (preference ∧ unlocked). Absent: no extra labels. */
  labels?: TokenLabels;
  /**
   * Wave 4: the chords of the music on screen, bar by bar (harmony-chips.ts), so a chord or numeral chip can light
   * the bars it sounds in. Absent or empty: the chip only plays.
   */
  harmony?: readonly ChordAt[];
  /**
   * Wave 5: the sections of the music on screen (the form view's), so section names in tutor text become chips that
   * select them. Absent or empty: section names stay plain words.
   */
  sections?: readonly FormViewSection[];
  /** Wave 5: the music on screen has a pickup (section and bar numbers count from the first full bar). */
  pickup?: boolean;
}

export type TokenVariant = "interval" | "key" | "signature";

export interface TokenInfo {
  kind: MusicToken["kind"];
  /** A term chip that names an interval, a key or a key signature. */
  variant?: TokenVariant;
  /** What the chip shows. */
  label: string;
  /** A quieter second label on the chip: a degree's syllable, a note's degree in the key. */
  sub?: string;
  /** Hover and focus text: the definition. */
  title: string;
  /** Spoken name (aria-label). */
  aria: string;
  /** Degree number for the colour (deg tokens and the root function of numerals). */
  degree?: string;
  /** Chords to play one after another (MIDI numbers; one note is a one-element chord). */
  play?: number[][];
  bars?: { from: number; to: number };
  /** A note to light on the staff and the roll (note tokens). */
  midi?: number;
  href?: string;
  /** A term beyond the learner's vocabulary, or a tool they have not unlocked. */
  preview?: boolean;
  /** For a locked tool: where it unlocks. */
  unlocksAt?: string;
  /** Wave 4: bars a chord or numeral chip lights on the roll and the staff (the first run of where it sounds). */
  highlight?: { from: number; to: number };
  /** Wave 4: every bar it sounds in. */
  where?: number[];
}

const pretty = (s: string) => s.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯");
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];

/** "E♭ major", "F♯ minor". */
export function keyName(key: KeySpec): string {
  return `${displayName(key.tonic)} ${key.mode}`;
}

/** The tonic's MIDI note between G3 and F♯4, so a degree played above it stays in a comfortable register. */
export function tonicMidi(key: KeySpec): number {
  const m = noteToMidi(`${key.tonic}4`) ?? 60;
  return m > 66 ? m - 12 : m;
}

/** MIDI notes of a chord: the root in octave 3, every other tone stacked above it. */
export function chordMidis(rootPc: number, pcs: readonly number[]): number[] {
  const root = 48 + rootPc;
  return pcs.map((pc) => root + ((((pc - rootPc) % 12) + 12) % 12));
}

/** The modes whose home chord is minor: their cadence is i iv V i (V from the raised 7, as Oak teaches minor). */
const MINOR_HOME = new Set([
  "minor",
  "harmonic minor",
  "melodic minor",
  "dorian",
  "phrygian",
  "minor pentatonic",
]);

/**
 * I IV V I in a key (i iv V i in the minor modes, I7 IV7 V7 I7 in a blues key): what sets up the key before a degree
 * is played (ux §6.4). Wave 5: a harmonic-minor or minor-pentatonic key is set up in minor, never in major.
 */
export function cadenceIn(key: KeySpec): number[][] {
  const plan = MINOR_HOME.has(key.mode)
    ? ["i", "iv", "V", "i"]
    : key.mode === "blues"
      ? ["I7", "IV7", "V7", "I7"]
      : ["I", "IV", "V", "I"];
  return plan.map((t) => {
    const rn = parseRN(t, key);
    const chord = rn ? rnToChord(rn, key) : null;
    return chord ? chordMidis(chord.rootPc, chordPcs(chord)) : [];
  });
}

/** The cadence in C major (Wave 2's constant; `cadenceIn` for any key). */
export const CADENCE: readonly number[][] = cadenceIn(PLAY_KEY);

const where = (key: KeySpec | null | undefined) => (key ? `in ${keyName(key)}` : "in C major");

function degreeInfo(value: string, ctx: TokenContext): TokenInfo {
  const m = /^([b#]?)([1-7])$/.exec(value) as RegExpExecArray;
  const num = Number(m[2]);
  const alt = m[1] === "b" ? "lowered a half step" : m[1] === "#" ? "raised a half step" : null;
  // Syllables follow the solfège lens (none before U03.L08, wave3 §4.3); while the lenses are unknown, as in
  // Wave 2, the hover names it.
  const sylOn = ctx.labels === undefined || ctx.labels.solfege;
  const syl = syllableOf(value as Degree);
  const sylText = sylOn ? ` (${syl})` : "";
  const label = pretty(value);
  const n = num - 1;
  const key = ctx.key ?? PLAY_KEY;
  const tonic = tonicMidi(key);
  const midi = tonic + degreeSemitones(value as Degree);
  const name = displayName(labelPitch(midi, key).name.replace(/-?\d+$/, ""));
  const hear = `Hear it after a cadence ${where(ctx.key)}${ctx.key ? ` (${name})` : ""}.`;
  const title = alt
    ? `Degree ${label}${sylText}: degree ${num} ${alt}. ${hear}`
    : `Degree ${num}${sylText}: the ${ORDINAL[num - 1]} note of the key. In code it is n("${n}"), because n counts from 0. ${hear}`;
  return {
    kind: "deg",
    label,
    ...(ctx.labels?.solfege ? { sub: syl } : {}),
    title,
    aria: `degree ${label.replace("♭", "flat ").replace("♯", "sharp ")}${ctx.labels?.solfege ? `, ${syl}` : ""}`,
    degree: value,
    play: [...cadenceIn(key), [midi]],
  };
}

const FUNCTION_NAME: Record<string, string> = {
  T: "a home (tonic) chord",
  PD: "a chord that leads away from home (predominant)",
  D: "a chord that pulls back home (dominant)",
  chromatic: "a chord borrowed from outside the key",
};

function rnInfo(value: string, ctx: TokenContext): TokenInfo {
  const key = ctx.key ?? PLAY_KEY;
  const rn = parseRN(value, key);
  if (!rn)
    return { kind: "rn", label: value, title: `Roman numeral ${value}.`, aria: `Roman numeral ${value}` };
  const chord = rnToChord(rn, key);
  const label = displayRN(rn);
  const fn = functionOf(rn, key);
  const preview = beyond(ctx, NUMERALS_TERM);
  const at = located({ kind: "rn", value }, ctx);
  return {
    kind: "rn",
    label,
    title: `${preview ? "Roman numerals come later. " : ""}${label}: ${FUNCTION_NAME[fn] ?? "a chord in the key"}. ${ctx.key ? `In ${keyName(ctx.key)}` : "In C major"} it is ${toLeadSheet(chord)}.${at.title}`,
    aria: `Roman numeral ${label}${preview ? ", preview" : ""}${at.aria}`,
    ...(fn === "chromatic" ? {} : { degree: fn === "T" ? "1" : fn === "PD" ? "4" : "5" }),
    play: [chordMidis(chord.rootPc, chordPcs(chord))],
    ...(preview ? { preview: true } : {}),
    ...at.info,
  };
}

/** The glossary terms after which chord symbols and numerals are part of the learner's vocabulary. */
export const CHORD_SYMBOL_TERM = "term.chord-symbol";
export const NUMERALS_TERM = "term.roman-numeral";

/** A form the learner has not met yet (and we know what they have met): the chip is badged "preview". */
function beyond(ctx: TokenContext, term: string): boolean {
  return ctx.introduced !== null && !ctx.introduced.has(term);
}

/** Where a chord or numeral sounds in the music on screen, as chip info and hover/aria text. */
function located(
  token: { kind: "chord" | "rn"; value: string },
  ctx: TokenContext,
): { info: Pick<TokenInfo, "highlight" | "where">; title: string; aria: string } {
  const where = ctx.harmony && ctx.harmony.length > 0 ? barsWhere(ctx.harmony, token, ctx.key ?? null) : [];
  const first = runsOf(where)[0];
  if (!first) return { info: {}, title: "", aria: "" };
  const phrase = barsPhrase(where);
  return {
    info: { highlight: first, where },
    title: ` Sounds in ${phrase}: click to hear it and light it on the roll and the staff.`,
    aria: `, in ${phrase}`,
  };
}

function noteInfo(value: string, ctx: TokenContext): TokenInfo {
  const midi = noteToMidi(value);
  const label = value.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭");
  if (midi === null) return { kind: "note", label, title: label, aria: `note ${label}` };
  const key = ctx.key ?? null;
  const l = key ? labelPitch(midi, key) : null;
  const sylOn = ctx.labels === undefined || ctx.labels.solfege;
  const inKey = l
    ? ` In ${keyName(key as KeySpec)} it is degree ${l.degreeDisplay}${sylOn ? ` (${l.syllable})` : ""}.`
    : "";
  return {
    kind: "note",
    label,
    ...(l && ctx.labels?.degrees ? { sub: l.degreeDisplay } : {}),
    ...(l && ctx.labels?.degrees ? { degree: l.degree } : {}),
    title: `${label}: MIDI note ${midi}.${inKey} Click to hear it and find it in the music.`,
    aria: `note ${label}${l ? `, degree ${l.degreeDisplay}` : ""}`,
    play: [[midi]],
    midi,
  };
}

function chordInfo(value: string, ctx: TokenContext): TokenInfo {
  const chord = parseChordSymbol(value) ?? parseChordWithBass(value);
  if (!chord) return { kind: "chord", label: value, title: `Chord ${value}.`, aria: `chord ${value}` };
  const label = toLeadSheet(chord);
  const stacked = chordMidis(chord.rootPc, chordPcs(chord));
  // A slash chord sounds its bass below the stack.
  const names = chord.bassPc === chord.rootPc ? stacked : [36 + chord.bassPc, ...stacked];
  let inKey = "";
  if (ctx.key) {
    try {
      inKey = ` In ${keyName(ctx.key)} it is ${displayRN(romanOf(chord, ctx.key))}.`;
    } catch {
      inKey = "";
    }
  }
  const preview = beyond(ctx, CHORD_SYMBOL_TERM);
  const at = located({ kind: "chord", value }, ctx);
  return {
    kind: "chord",
    label,
    title: `${preview ? "Chord symbols come later. " : ""}${label}: ${names.length} notes stacked on ${label.replace(/^([A-G][♯♭]?).*$/, "$1")}.${inKey}${at.title || " Click to hear it."}`,
    aria: `chord ${label}${preview ? ", preview" : ""}${at.aria}`,
    play: [names],
    ...(preview ? { preview: true } : {}),
    ...at.info,
  };
}

function barsInfo(value: string): TokenInfo {
  // The same bars the highlight lights (`barsToCycles`): a range written backwards ("4-2") is bars 2–4, not bar 2.
  const [a, b0] = value.split("-").map(Number) as [number, number | undefined];
  const b = b0 ?? a;
  const from = Math.max(1, Math.min(a, b));
  const to = Math.max(from, a, b);
  const label = from === to ? `bar ${from}` : `bars ${from}–${to}`;
  return {
    kind: "bars",
    label,
    title: `Loop ${label} in the workbench and light it on the roll and the staff.`,
    aria: `Show ${label}`,
    bars: { from, to },
  };
}

function toolInfo(value: string, ctx: TokenContext): TokenInfo {
  const entry = ctx.tools.find((t) => t.id === value);
  const short = entry?.code ?? value.replace(/^tb\./, "");
  const at = entry ? (Array.isArray(entry.unlock.at) ? entry.unlock.at[0] : entry.unlock.at) : undefined;
  const locked = ctx.unlocked !== null && entry !== undefined && !ctx.unlocked.has(value);
  return {
    kind: "tool",
    label: short,
    title: entry
      ? `${short}: ${entry.concept}.${locked && at ? ` Unlocks in ${at}.` : ""}`
      : `${short} in the Toolbox.`,
    aria: `tool ${short}${locked ? ", locked" : ""}`,
    href: `/toolbox/${encodeURIComponent(value)}`,
    ...(locked ? { preview: true } : {}),
    ...(locked && at ? { unlocksAt: at } : {}),
  };
}

// --- intervals, keys and signatures named in a term token -------------------------------------------------

const QUALITY_WORD: Record<string, string> = {
  perfect: "P",
  major: "M",
  maj: "M",
  minor: "m",
  min: "m",
  augmented: "A",
  aug: "A",
  diminished: "d",
  dim: "d",
};
const NUMBER_WORD: Record<string, number> = {
  unison: 1,
  prime: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  octave: 8,
  ninth: 9,
  tenth: 10,
};

/** An Oak interval name ("m3", "P5", "A4") from a lower-case slug, or null. */
export function intervalFromSlug(slug: string): string | null {
  const s = slug.toLowerCase();
  // Short forms: p5, a4, d5, m3 (lower-case m is minor), maj3, min6.
  let m = /^(p|a|d|m|maj|min|aug|dim)(\d{1,2})$/.exec(s);
  if (m) {
    const q = m[1] === "p" ? "P" : m[1] === "a" ? "A" : m[1] === "d" ? "d" : m[1] === "m" ? "m" : null;
    const quality = q ?? QUALITY_WORD[m[1] as string];
    const name = `${quality}${m[2]}`;
    return parseInterval(name) ? name : null;
  }
  // Long forms: perfect-fifth, minor-3rd, major-third, augmented-4th.
  m = /^(perfect|major|minor|augmented|diminished)-(\w+)$/.exec(s);
  if (m) {
    const n = NUMBER_WORD[m[2] as string] ?? Number(/^(\d{1,2})(st|nd|rd|th)$/.exec(m[2] as string)?.[1]);
    if (!n) return null;
    const name = `${QUALITY_WORD[m[1] as string]}${n}`;
    return parseInterval(name) ? name : null;
  }
  return null;
}

const LONG_Q: Record<string, string> = {
  P: "perfect",
  M: "major",
  m: "minor",
  A: "augmented",
  d: "diminished",
  AA: "doubly augmented",
  dd: "doubly diminished",
};
const ORD = ["", "unison", "2nd", "3rd", "4th", "5th", "6th", "7th", "octave", "9th", "10th", "11th", "12th"];

function intervalInfo(name: string, ctx: TokenContext, glossary?: TermEntry): TokenInfo {
  const parts = parseInterval(name) as NonNullable<ReturnType<typeof parseInterval>>;
  const long =
    parts.num === 1 && parts.quality === "P"
      ? "unison"
      : parts.num === 8 && parts.quality === "P"
        ? "octave"
        : `${LONG_Q[parts.quality]} ${ORD[parts.num] ?? `${parts.num}th`}`;
  const key = ctx.key ?? PLAY_KEY;
  const low = tonicMidi(key);
  const high = low + parts.semitones;
  const lowName = displayName(labelPitch(low, key).name);
  const steps = parts.semitones === 1 ? "1 half step" : `${parts.semitones} half steps`;
  const tritone = parts.semitones % 12 === 6 ? " The tritone: it splits the octave in half." : "";
  const def = glossary ? `${glossary.term}: ${glossary.definition} ` : "";
  return {
    kind: "term",
    variant: "interval",
    label: glossary ? glossary.term : name,
    title: `${def}${glossary ? "" : `${name}, a ${long}: `}${steps}.${tritone} Hear it from ${lowName}: one note, then the other, then both.`,
    aria: `interval ${long}`,
    play: [[low], [high], [low, high]],
  };
}

/** A key from a slug: "g-major", "e-flat-major", "f-sharp-minor", "bb-major", "c-sharp-minor". */
export function keyFromSlug(slug: string): KeySpec | null {
  const m = /^([a-g])(?:-?(flat|sharp|b|s))?-(major|minor)$/.exec(slug.toLowerCase());
  if (!m) return null;
  const acc = m[2] === "flat" || m[2] === "b" ? "b" : m[2] === "sharp" || m[2] === "s" ? "#" : "";
  return keyOf(`${(m[1] as string).toUpperCase()}${acc} ${m[3]}`);
}

function signatureText(fifths: number): string {
  const s = signatureOf(fifths);
  if (fifths === 0) return "no sharps or flats";
  const list = (fifths > 0 ? s.sharps : s.flats).map((n) => displayName(n)).join(" ");
  const count = Math.abs(fifths);
  return `${count} ${fifths > 0 ? (count === 1 ? "sharp" : "sharps") : count === 1 ? "flat" : "flats"} (${list})`;
}

function scalePlay(key: KeySpec): number[][] {
  const t = tonicMidi(key);
  const notes = scaleNotes(key);
  const midis: number[] = [];
  let prev = t - 1;
  for (const n of [...notes, notes[0] as string]) {
    let m = noteToMidi(`${n}4`) ?? t;
    while (m <= prev) m += 12;
    while (m - 12 > prev) m -= 12;
    midis.push(m);
    prev = m;
  }
  return midis.map((m) => [m]);
}

function keyInfo(key: KeySpec): TokenInfo {
  const sig = signatureText(signatureOf(key).fifths);
  const rel = relativeKey(key);
  return {
    kind: "term",
    variant: "key",
    label: keyName(key),
    title: `${keyName(key)}: a key signature of ${sig}. Its relative ${key.mode === "major" ? "minor" : "major"} is ${keyName(rel)}. Click to hear its scale.`,
    aria: `key ${keyName(key)}`,
    play: scalePlay(key),
  };
}

function signatureInfo(fifths: number): TokenInfo {
  const s = signatureOf(fifths);
  const count = Math.abs(fifths);
  const label =
    fifths === 0
      ? "no sharps or flats"
      : `${count} ${fifths > 0 ? (count === 1 ? "sharp" : "sharps") : count === 1 ? "flat" : "flats"}`;
  return {
    kind: "term",
    variant: "signature",
    label,
    title: `A key signature of ${signatureText(fifths)}: ${keyName(s.major)} or ${keyName(s.minor)}. Click to hear ${keyName(s.major)}.`,
    aria: `key signature, ${label}`,
    play: scalePlay(s.major),
  };
}

/** "2-sharps", "1-flat", "no-sharps-or-flats" → fifths. */
export function fifthsFromSlug(slug: string): number | null {
  const s = slug.toLowerCase();
  if (s === "no-sharps-or-flats" || s === "0-sharps" || s === "0-flats") return 0;
  const m = /^([1-7])-(sharps?|flats?)$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * (m[2]?.startsWith("sharp") ? 1 : -1);
}

const GLOSSARY_INTERVAL: Record<string, string> = {
  "term.tritone": "A4",
  "term.octave": "P8",
  "term.semitone": "m2",
  "term.whole-step": "M2",
};

function termInfo(value: string, ctx: TokenContext): TokenInfo {
  const id = value.startsWith("term.") ? value : `term.${value}`;
  const entry = ctx.terms.find((t) => t.id === id);
  const preview = ctx.introduced !== null && !ctx.introduced.has(id);
  if (entry) {
    const iv = GLOSSARY_INTERVAL[id];
    if (iv)
      return {
        ...intervalInfo(iv, ctx, entry),
        aria: `term ${entry.term}${preview ? ", preview" : ""}`,
        ...(preview ? { preview: true } : {}),
      };
  } else {
    const slug = value.replace(/^term\./, "");
    const iv = intervalFromSlug(slug);
    if (iv) return intervalInfo(iv, ctx);
    const key = keyFromSlug(slug);
    if (key) return keyInfo(key);
    const fifths = fifthsFromSlug(slug);
    if (fifths !== null) return signatureInfo(fifths);
  }
  const word = entry?.term ?? value.replace(/^term\./, "").replace(/-/g, " ");
  return {
    kind: "term",
    label: word,
    title: entry
      ? `${entry.term}: ${entry.definition}${preview ? ` (Comes in ${entry.introducedBy}.)` : ""}`
      : `${word}: a word from the glossary.`,
    aria: `term ${word}${preview ? ", preview" : ""}`,
    ...(preview ? { preview: true } : {}),
  };
}

/** Everything the chip needs for one token. `reveal` has no info: the panel renders it as the Reveal button. */
export function describeToken(token: MusicToken, ctx: TokenContext): TokenInfo | null {
  switch (token.kind) {
    case "reveal":
      return null;
    case "deg":
      return degreeInfo(token.value, ctx);
    case "rn":
      return rnInfo(token.value, ctx);
    case "note":
      return noteInfo(token.value, ctx);
    case "chord":
      return chordInfo(token.value, ctx);
    case "bars":
      return barsInfo(token.value);
    case "tool":
      return toolInfo(token.value, ctx);
    case "term":
      return termInfo(token.value, ctx);
  }
}

// --- token values written in other notations ----------------------------------------------------------

const SYLLABLE_DEGREE: Record<string, Degree> = {
  do: "1",
  di: "#1",
  ra: "b2",
  re: "2",
  ri: "#2",
  me: "b3",
  mi: "3",
  fa: "4",
  fi: "#4",
  se: "b5",
  sol: "5",
  so: "5",
  si: "#5",
  le: "b6",
  la: "6",
  li: "#6",
  te: "b7",
  ti: "7",
};

/**
 * The canonical spelling of a token the tutor wrote in another notation Oak teaches, or the token unchanged:
 * Unicode accidentals (`[[deg:♭3]]`, `[[note:F♯4]]`, `[[chord:B♭]]`) and, for degrees, a movable-do syllable
 * (`[[deg:me]]` = `[[deg:b3]]`), and intervals named with a capital quality (`[[term:M3]]` = `[[term:major-3rd]]`).
 * Anything else is left for `parseTutorText` to accept or refuse.
 */
export function canonicalTokenRaw(raw: string): string {
  // An interval in Oak's own short names (`[[term:M3]]`, `[[term:P5]]`, `[[term:A4]]`): term IDs are lower case,
  // and lower-casing would turn a major third into a minor one, so the capital qualities are spelled out.
  const iv = /^\[\[term:([PMA])(\d{1,2})\]\]$/.exec(raw);
  if (iv) {
    const n = Number(iv[2]);
    const word = iv[1] === "P" ? "perfect" : iv[1] === "M" ? "major" : "augmented";
    const suffix =
      n % 10 === 1 && n !== 11
        ? "st"
        : n % 10 === 2 && n !== 12
          ? "nd"
          : n % 10 === 3 && n !== 13
            ? "rd"
            : "th";
    return `[[term:${word}-${n}${suffix}]]`;
  }
  const m = /^\[\[(deg|note|chord|rn):([^\][\n]{1,64})\]\]$/.exec(raw);
  if (!m) return raw;
  let value = (m[2] as string).trim().replace(/♭/g, "b").replace(/♯/g, "#");
  if (m[1] === "deg") value = SYLLABLE_DEGREE[value.toLowerCase()] ?? value;
  // A slash chord (`[[chord:G/B]]`) is not in the token grammar (contracts §10.7: a code symbol): it reads as the
  // lead-sheet text it names, never as raw brackets.
  const slash = m[1] === "chord" ? /^([A-G][#b]?[^/\s]{0,10})\/([A-G][#b]?)$/.exec(value) : null;
  if (slash) {
    const glyphs = (t: string) => t.replace(/(?<=^[A-G])b|(?<=[A-G])b(?=$)/g, "♭").replace(/#/g, "♯");
    return `${glyphs(slash[1] as string)}/${glyphs(slash[2] as string)}`;
  }
  return `[[${m[1]}:${value}]]`;
}
