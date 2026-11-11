// What a music token in tutor text means and does (contracts §10.7, ux §6.4). Pure: the chip component renders
// this. Every musical fact comes from @oak/theory (spelling, function, chord tones), never from a table here.
//
// The tutor does not tell the panel which key the learner is in, so playback is in C major and the hover says
// so: "hear it in C major". Degrees and numerals are key-independent; the sound is an illustration.
import type { MusicToken } from "@oak/api";
import type { TermEntry, ToolEntry } from "@oak/content-kit";
import {
  chordPcs,
  type Degree,
  degreeSemitones,
  displayRN,
  functionOf,
  type KeySpec,
  noteToMidi,
  parseChordSymbol,
  parseRN,
  rnToChord,
  syllableOf,
  toLeadSheet,
} from "@oak/theory";

export const PLAY_KEY: KeySpec = { tonic: "C", mode: "major" } as KeySpec;
const TONIC_MIDI = 60;

export interface TokenContext {
  terms: readonly TermEntry[];
  /** Term IDs from completed lessons (`GET /terms/introduced`); null while unknown (no badge then). */
  introduced: ReadonlySet<string> | null;
  tools: readonly ToolEntry[];
  /** Unlocked item IDs (`GET /unlocks`); null while unknown. */
  unlocked: ReadonlySet<string> | null;
}

export interface TokenInfo {
  kind: MusicToken["kind"];
  /** What the chip shows. */
  label: string;
  /** Hover and focus text: the definition. */
  title: string;
  /** Spoken name (aria-label). */
  aria: string;
  /** Degree number for the colour (deg tokens and the root function of numerals). */
  degree?: string;
  /** Chords to play one after another (MIDI numbers; one note is a one-element chord). */
  play?: number[][];
  bars?: { from: number; to: number };
  href?: string;
  /** A term beyond the learner's vocabulary, or a tool they have not unlocked. */
  preview?: boolean;
  /** For a locked tool: where it unlocks. */
  unlocksAt?: string;
}

const pretty = (s: string) => s.replace(/b(?=\d)/g, "♭").replace(/#(?=\d)/g, "♯");
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];

/** MIDI notes of a chord: the root in octave 3, every other tone stacked above it. */
export function chordMidis(rootPc: number, pcs: readonly number[]): number[] {
  const root = 48 + rootPc;
  return pcs.map((pc) => root + ((((pc - rootPc) % 12) + 12) % 12));
}

const I = chordMidis(0, [0, 4, 7]);
const IV = chordMidis(5, [5, 9, 0]);
const V = chordMidis(7, [7, 11, 2]);
/** The cadence that sets up the key before a degree is played (ux §6.4: "plays cadence + degree"). */
export const CADENCE: readonly number[][] = [I, IV, V, I];

function degreeInfo(value: string): TokenInfo {
  const m = /^([b#]?)([1-7])$/.exec(value) as RegExpExecArray;
  const num = Number(m[2]);
  const alt = m[1] === "b" ? "lowered a half step" : m[1] === "#" ? "raised a half step" : null;
  const syl = syllableOf(value as Degree);
  const label = pretty(value);
  const n = num - 1;
  const title = alt
    ? `Degree ${label} (${syl}): degree ${num} ${alt}. Hear it after a cadence in C major.`
    : `Degree ${num} (${syl}): the ${ORDINAL[num - 1]} note of the key. In code it is n("${n}"), because n counts from 0. Hear it after a cadence in C major.`;
  return {
    kind: "deg",
    label,
    title,
    aria: `degree ${label.replace("♭", "flat ").replace("♯", "sharp ")}`,
    degree: value,
    play: [...CADENCE, [TONIC_MIDI + degreeSemitones(value as Degree)]],
  };
}

const FUNCTION_NAME: Record<string, string> = {
  T: "a home (tonic) chord",
  PD: "a chord that leads away from home (predominant)",
  D: "a chord that pulls back home (dominant)",
  chromatic: "a chord borrowed from outside the key",
};

function rnInfo(value: string): TokenInfo {
  const rn = parseRN(value, PLAY_KEY);
  if (!rn)
    return { kind: "rn", label: value, title: `Roman numeral ${value}.`, aria: `Roman numeral ${value}` };
  const chord = rnToChord(rn, PLAY_KEY);
  const label = displayRN(rn);
  const fn = functionOf(rn, PLAY_KEY);
  return {
    kind: "rn",
    label,
    title: `${label}: ${FUNCTION_NAME[fn] ?? "a chord in the key"}. In C major it is ${toLeadSheet(chord)}.`,
    aria: `Roman numeral ${label}`,
    degree: fn === "chromatic" ? undefined : fn === "T" ? "1" : fn === "PD" ? "4" : "5",
    play: [chordMidis(chord.rootPc, chordPcs(chord))],
  } as TokenInfo;
}

function noteInfo(value: string): TokenInfo {
  const midi = noteToMidi(value);
  const label = value.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭");
  return {
    kind: "note",
    label,
    title: midi === null ? label : `${label}: MIDI note ${midi}. Click to hear it.`,
    aria: `note ${label}`,
    ...(midi === null ? {} : { play: [[midi]] }),
  };
}

function chordInfo(value: string): TokenInfo {
  const chord = parseChordSymbol(value);
  if (!chord) return { kind: "chord", label: value, title: `Chord ${value}.`, aria: `chord ${value}` };
  const label = toLeadSheet(chord);
  const names = chordMidis(chord.rootPc, chordPcs(chord));
  return {
    kind: "chord",
    label,
    title: `${label}: ${names.length} notes stacked on ${label.replace(/^([A-G][♯♭]?).*$/, "$1")}. Click to hear it.`,
    aria: `chord ${label}`,
    play: [names],
  };
}

function barsInfo(value: string): TokenInfo {
  const [a, b] = value.split("-").map(Number) as [number, number | undefined];
  const from = Math.max(1, Math.min(a, b ?? a));
  const to = Math.max(from, b ?? a);
  const label = from === to ? `bar ${from}` : `bars ${from}–${to}`;
  return {
    kind: "bars",
    label,
    title: `Loop ${label} in the workbench.`,
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

function termInfo(value: string, ctx: TokenContext): TokenInfo {
  const id = value.startsWith("term.") ? value : `term.${value}`;
  const entry = ctx.terms.find((t) => t.id === id);
  const word = entry?.term ?? value.replace(/^term\./, "").replace(/-/g, " ");
  const preview = ctx.introduced !== null && !ctx.introduced.has(id);
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
      return degreeInfo(token.value);
    case "rn":
      return rnInfo(token.value);
    case "note":
      return noteInfo(token.value);
    case "chord":
      return chordInfo(token.value);
    case "bars":
      return barsInfo(token.value);
    case "tool":
      return toolInfo(token.value, ctx);
    case "term":
      return termInfo(token.value, ctx);
  }
}
