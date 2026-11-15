// Wave 7, the jazz track's answer logic (docs/design/wave7.md §11; contracts §2.6 J1–J5): chord symbols with
// extensions and alterations read forgivingly and shown back in lead-sheet form (and in jazz glyphs when the
// learner reads charts that way); the voicing a set of keys or a written chord makes (shell, close, drop-2,
// rootless A and B, octave-aware, by the content-kit definitions the grader grades with); what a melody note is
// over a chord (a chord tone, a tension, a clash) from `AVAILABLE_TENSIONS`; the jazz numerals (the dominants on
// every degree, the tritone substitute ♭II7, the backdoor iv7 ♭VII7, the minor ii iiø7) and the ii–V brackets drawn
// over a strip of numerals. Pure: tested with `bun test` (jazz.test.ts), every musical claim against @oak/theory.
import type { ChordQuality, KeySpec } from "@oak/api";
import type { MeterSpec } from "@oak/content-kit";
import {
  AVAILABLE_TENSIONS,
  VOICING_SHAPES,
  type VoicedChord,
  type VoicingShape,
  voicingShapeOf,
} from "@oak/content-kit";
import { parseNoteList } from "@oak/notation";
import {
  type ChordId,
  chordOf,
  chordPcs,
  parseChordWithBass,
  parseRN,
  toCode,
  toJazzGlyph,
  toLeadSheet,
  voicingType,
} from "@oak/theory";
import { keyName } from "./normalize.ts";
import { normalizeStaffValue } from "./staff/model.ts";

const mod12 = (n: number) => ((n % 12) + 12) % 12;

// --- chord symbols ------------------------------------------------------------------------------------------

/** How chord symbols are printed back: lead-sheet (`Cmaj7`, `Cm7♭5`) or jazz glyphs (`C∆7`, `Cø7`, `C–7`). */
export type ChordStyle = "lead-sheet" | "jazz";

export interface JazzPickerQuality {
  quality: ChordQuality;
  /** The suffix as the picker prints it, in the style asked for. */
  label: string;
  spoken: string;
}

/**
 * The jazz picker's rows (J1.L02, J2.L02–L03), in teaching order: every quality is a row of the one chord table,
 * so the labels are that table's own spellings (`toLeadSheet`, `toJazzGlyph`), never a second list.
 */
export const JAZZ_PICKER_ROWS: readonly { id: string; label: string; qualities: readonly ChordQuality[] }[] =
  [
    { id: "sevenths", label: "Sevenths", qualities: ["maj7", "m7", "7", "m7b5", "dim7", "mMaj7"] },
    { id: "sixths", label: "Sixths, sus", qualities: ["6", "m6", "69", "sus4", "7sus4"] },
    { id: "extensions", label: "Extended", qualities: ["maj9", "m9", "9", "m11", "13", "maj7#11"] },
    { id: "altered", label: "Altered", qualities: ["7b9", "7#9", "7#11", "7b13", "7alt"] },
  ];

const SPOKEN_SUFFIX: Partial<Record<ChordQuality, string>> = {
  maj7: "major 7",
  m7: "minor 7",
  "7": "dominant 7",
  m7b5: "half-diminished (minor 7 flat 5)",
  dim7: "diminished 7",
  mMaj7: "minor with a major 7",
  "6": "6",
  m6: "minor 6",
  "69": "6 add 9",
  sus4: "suspended 4",
  "7sus4": "7 suspended 4",
  maj9: "major 9",
  m9: "minor 9",
  "9": "dominant 9",
  m11: "minor 11",
  "13": "dominant 13",
  "maj7#11": "major 7 sharp 11",
  "7b9": "7 flat 9",
  "7#9": "7 sharp 9",
  "7#11": "7 sharp 11",
  "7b13": "7 flat 13",
  "7alt": "7 altered",
};

/** One quality's suffix in a style: `maj7` → "maj7" (lead sheet) or "∆7" (jazz). */
export function suffixOf(quality: ChordQuality, style: ChordStyle = "lead-sheet"): string {
  const c = chordOf("C", quality);
  return (style === "jazz" ? toJazzGlyph(c) : toLeadSheet(c)).slice(1);
}

/** The picker's row of one quality, labelled in a style. */
export function pickerQuality(q: ChordQuality, style: ChordStyle = "lead-sheet"): JazzPickerQuality {
  return { quality: q, label: suffixOf(q, style), spoken: SPOKEN_SUFFIX[q] ?? suffixOf(q) };
}

/** A chord in one of the two printed styles. */
export function styledSymbol(chord: ChordId, style: ChordStyle): string {
  return style === "jazz" ? toJazzGlyph(chord) : toLeadSheet(chord);
}

/**
 * The extensions and alterations a learner types beyond the chord table's own spellings, rewritten so the table
 * reads them: `C7(♭9)`, `C7(b9)` → `C7b9`; `C-11` stays (the table reads `-`); `Cmaj7(#11)` → `Cmaj7#11`;
 * `C7 alt`, `C7(alt)` → `C7alt`; `C-^7`, `C–∆7` → `Cm^7`; `C6/9`, `C6add9` → `C69`; `Cdom7` → `C7`.
 * Spaces and parentheses are dropped only after the root (a slash bass keeps its own letter).
 */
export function jazzTyped(text: string): string {
  const m = /^\s*([A-Ga-g](?:##|bb|#|b|♯|♭)?)(.*)$/.exec(text);
  if (!m) return text;
  const root = `${(m[1] as string).charAt(0).toUpperCase()}${(m[1] as string).slice(1)}`;
  let rest = (m[2] ?? "").trim();
  const slash = /\/\s*([A-Ga-g](?:#|b|♯|♭)?)\s*$/.exec(rest);
  let bass = "";
  // `6/9` is a quality, not a slash chord.
  if (slash && !/6\s*\/\s*9$/.test(rest)) {
    bass = `/${(slash[1] as string).charAt(0).toUpperCase()}${(slash[1] as string).slice(1)}`;
    rest = rest.slice(0, slash.index).trim();
  }
  rest = rest
    .replace(/[()\s,]/g, "")
    .replace(/^dom(?=\d)/i, "")
    .replace(/6\/9|6add9/i, "69")
    .replace(/^(?:-|–|−|—)(?:\^|∆|Δ|△|maj)7?$/i, "m^7")
    .replace(/^min(?=\d|$)/i, "m");
  return `${root}${rest}${bass}`;
}

export type JazzReading =
  | { state: "empty" }
  | {
      state: "ok";
      chord: ChordId;
      /** The code spelling Oak sends (`C^7`, `G7b9`): what `chord()` takes. */
      code: string;
      leadSheet: string;
      glyph: string;
      spoken: string;
    }
  | { state: "unknown"; hint: string };

/**
 * What Oak reads in a typed jazz chord (feature `text.jazz-chord`): forgiving (C7b9, C7(♭9), Cmaj9, C∆9, C-11,
 * Cm11, D–7, Dmin7, Bø, G7alt), shown back in lead-sheet form and in glyphs. Never throws.
 */
export function jazzReading(text: string): JazzReading {
  if (text.trim() === "") return { state: "empty" };
  const typed = jazzTyped(text).replace(/[∆Δ△](?!\d)/g, "^7");
  let chord: ChordId | null = null;
  try {
    chord = parseChordWithBass(typed);
  } catch {
    chord = null;
  }
  if (!chord)
    return {
      state: "unknown",
      hint: "Oak reads a chord symbol, like Cmaj9, D–7, G7♭9 or Bø7.",
    };
  const leadSheet = toLeadSheet(chord);
  return {
    state: "ok",
    chord,
    code: chord.bass ? `${toCode(chord)}/${chord.bass}` : toCode(chord),
    leadSheet,
    glyph: toJazzGlyph(chord),
    spoken: spokenJazz(chord),
  };
}

const ACC_WORD = (s: string) => s.replace(/♭|b(?=$)/g, " flat").replace(/♯|#/g, " sharp");

/** "D flat dominant 7 flat 9", "B half-diminished (minor 7 flat 5) over F". */
export function spokenJazz(chord: ChordId): string {
  const root = ACC_WORD(chord.root.replace(/b$/, "♭"));
  const q = SPOKEN_SUFFIX[chord.quality] ?? suffixOf(chord.quality).replace(/♭/g, " flat ");
  const tri: Partial<Record<ChordQuality, string>> = {
    maj: "major",
    min: "minor",
    dim: "diminished",
    aug: "augmented",
  };
  const words = `${root} ${tri[chord.quality] ?? q}`.replace(/\s+/g, " ").trim();
  return chord.bass ? `${words} over ${ACC_WORD(chord.bass.replace(/b$/, "♭"))}` : words;
}

/** The text the picker writes into the field for a root and quality (the code spelling: one answer). */
export function composeJazz(root: string, quality: ChordQuality): string {
  return toCode(chordOf(root, quality));
}

// --- voicings -----------------------------------------------------------------------------------------------

/** The chord a symbol names, as the voicing shapes read it (content-kit `VoicedChord`), or null. */
export function voicedChordOf(symbol: string): VoicedChord | null {
  const c = parseChordWithBass(jazzTyped(symbol));
  if (!c) return null;
  const iv = new Set<number>(chordPcs(chordOf("C", c.quality)));
  const pick = (...xs: number[]) => xs.find((x) => iv.has(x));
  const third = pick(4, 3, 5) ?? 4;
  const fifth = pick(7, 6, 8) ?? 7;
  // The 7th, or the 6th of a sixth chord (content-kit `VOICING_SHAPES`: a shell is root–3–7 or root–3–6).
  const seventh = pick(10, 11) ?? pick(9) ?? 10;
  const dominant = third === 4 && seventh === 10;
  const ninth = c.quality === "7b9" || c.quality === "7alt" ? 1 : c.quality === "7#9" ? 3 : 2;
  const r = c.rootPc;
  return {
    root: r,
    third: mod12(r + third),
    fifth: mod12(r + fifth),
    seventh: mod12(r + seventh),
    ninth: mod12(r + ninth),
    ...(dominant ? { thirteenth: mod12(r + 9) } : {}),
  };
}

export const VOICING_SHAPE_TEXT: Readonly<Record<VoicingShape, { name: string; recipe: string }>> = {
  shell: { name: "a shell voicing", recipe: "the root at the bottom, the 3rd and the 7th above it" },
  close: { name: "a close voicing", recipe: "four notes inside one octave" },
  "drop-2": {
    name: "a drop-2 voicing",
    recipe: "a close voicing with its second note from the top dropped an octave",
  },
  "rootless-a": { name: "a rootless A voicing", recipe: "no root, the 3rd at the bottom (3–5–7–9)" },
  "rootless-b": { name: "a rootless B voicing", recipe: "no root, the 7th at the bottom (7–9–3–5)" },
};

/** The ordinal word of a note's role over a chord: "root", "3rd", "♭9", "13th". */
export function roleName(semis: number, chord: VoicedChord): string {
  const pc = mod12(chord.root + semis);
  if (pc === chord.root) return "root";
  if (pc === chord.third) return mod12(pc - chord.root) === 5 ? "4th" : "3rd";
  if (pc === chord.fifth) return "5th";
  // The 6th of a sixth chord sits where a diminished seventh chord has its (double-flat) 7th.
  if (pc === chord.seventh)
    return mod12(pc - chord.root) === 9 && mod12(chord.fifth - chord.root) !== 6 ? "6th" : "7th";
  const names: Record<number, string> = {
    1: "♭9",
    2: "9th",
    3: "♯9",
    4: "3rd",
    5: "11th",
    6: "♯11",
    7: "5th",
    8: "♭13",
    9: "13th",
    10: "♭7",
    11: "7th",
  };
  return names[mod12(semis)] ?? "?";
}

export interface VoicingReadout {
  symbol: string;
  /** The shape the notes make (the grader's own reading), or null. */
  shape: VoicingShape | null;
  /** Each note, lowest first: "D3 (root)". */
  notes: { midi: number; name: string; role: string }[];
  /** One sentence: "D3 F3 C4: root, 3rd, 7th. A shell voicing of Dm7." */
  text: string;
  /** Whether the shape is one the step asked for (null when the step names none). */
  asked: boolean | null;
}

/**
 * What a set of keys (or a written chord) is as a voicing of `symbol` (J1.L05 shells, J3.L01 rootless A and B,
 * J3.L02 drop-2): each note's role and the shape, read octave-aware by content-kit `voicingShapeOf` (what the
 * grader grades with). Two notes that are only the 3rd and the 7th are named guide tones (theory `voicingType`).
 * Descriptive only: it names what was built, never what to build.
 */
export function voicingReadout(
  midis: readonly number[],
  symbol: string,
  want?: VoicingShape | readonly VoicingShape[],
): VoicingReadout | null {
  const chord = voicedChordOf(symbol);
  const read = jazzReading(symbol);
  if (!chord || read.state !== "ok") return null;
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  const notes = sorted.map((m) => ({
    midi: m,
    name: keyName(m, "sharp"),
    role: roleName(m - chord.root, chord),
  }));
  const shape = sorted.length > 0 ? voicingShapeOf(sorted, chord) : null;
  const wanted = want === undefined ? null : typeof want === "string" ? [want] : [...want];
  const asked = wanted === null ? null : shape !== null && wanted.includes(shape);
  const name = read.leadSheet;
  let tail: string;
  if (sorted.length === 0) tail = "";
  else if (shape) tail = ` ${cap(VOICING_SHAPE_TEXT[shape].name)} of ${name}.`;
  else if (
    sorted.length === 2 &&
    voicingType(sorted, read.code.split("/")[0] as string).type === "guide-tones"
  )
    tail = ` The guide tones of ${name}: its 3rd and 7th.`;
  else tail = ` Not one of the named voicings of ${name} yet.`;
  const list = notes.map((n) => n.name).join(" ");
  const roles = notes.map((n) => n.role).join(", ");
  return {
    symbol: name,
    shape,
    notes,
    text: sorted.length === 0 ? "" : `${list}: ${roles}.${tail}`,
    asked,
  };
}

/**
 * The chords written on a staff answer (notes that start together), in order, as MIDI lists, for the staff's
 * voicing readout (`staff-expect.voicing`). A value that does not parse yet reads as no chords.
 */
export function staffChordMidis(value: string, meter?: MeterSpec): number[][] {
  let events: ReturnType<typeof parseNoteList>;
  try {
    events = parseNoteList(normalizeStaffValue(value), meter ? { meter } : {});
  } catch {
    return [];
  }
  const by = new Map<string, number[]>();
  const order: string[] = [];
  for (const e of events) {
    if (e.midi === null || e.midi === undefined) continue;
    const k = `${e.onset[0]}/${e.onset[1]}`;
    if (!by.has(k)) {
      by.set(k, []);
      order.push(k);
    }
    by.get(k)?.push(e.midi);
  }
  return order.map((k) => [...new Set(by.get(k) ?? [])].sort((a, b) => a - b));
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Every voicing shape, for a host that lists them. */
export const SHAPES: readonly VoicingShape[] = VOICING_SHAPES;

// --- tensions -----------------------------------------------------------------------------------------------

/** What a melody note is over a chord: an id of content-kit `TENSION_OPTIONS`. */
export type TensionId = "chord-tone" | "9" | "b9" | "#9" | "11" | "#11" | "13" | "b13" | "avoid";

const TENSION_OF_SEMIS: Readonly<Record<number, TensionId>> = {
  1: "b9",
  2: "9",
  3: "#9",
  5: "11",
  6: "#11",
  8: "b13",
  9: "13",
};
const TENSION_WORD: Readonly<Record<Exclude<TensionId, "chord-tone" | "avoid">, string>> = {
  "9": "the 9th",
  b9: "the ♭9",
  "#9": "the ♯9",
  "11": "the 11th",
  "#11": "the ♯11",
  "13": "the 13th",
  b13: "the ♭13",
};

export interface TensionReading {
  id: TensionId | null;
  /** "D over Cmaj7 is the 9th: a common colour on this chord." */
  fact: string;
}

/**
 * What a melody note is over a chord (J2.L03), as `AVAILABLE_TENSIONS` reads it: a chord tone, an available
 * tension (named), or the avoid note (a half step above a chord tone: it clashes when held). A note in neither
 * list reads `null` ("outside the usual choices"). Conventions, not laws: the fact says "a common choice".
 */
export function tensionOf(note: string | number, chordSymbol: string): TensionReading | null {
  const read = jazzReading(chordSymbol);
  if (read.state !== "ok") return null;
  const midi = typeof note === "number" ? note : noteMidi(note);
  if (midi === null) return null;
  const c = read.chord;
  const table = AVAILABLE_TENSIONS[c.quality];
  const semis = mod12(midi - c.rootPc);
  const voiced = voicedChordOf(chordSymbol);
  const noteText =
    typeof note === "string"
      ? note
          .trim()
          .replace(/-?\d+$/, "")
          .replace(/^([a-g])/, (l) => l.toUpperCase())
          .replace(/(?<=^[A-G])b/, "♭")
          .replace("#", "♯")
      : keyName(midi, "flat").replace(/-?\d+$/, "");
  const chordText = read.leadSheet;
  const tones = table?.chordTones ?? chordPcs(chordOf("C", c.quality));
  if (tones.includes(semis)) {
    const role = voiced ? roleName(semis, voiced) : "a chord tone";
    return { id: "chord-tone", fact: `${noteText} over ${chordText} is a chord tone: the ${role}.` };
  }
  if (table?.avoid.includes(semis)) {
    const below = tones.find((t) => mod12(t + 1) === semis);
    const under = below !== undefined && voiced ? roleName(below, voiced) : "a chord tone";
    return {
      id: "avoid",
      fact: `${noteText} over ${chordText} sits a half step above the ${under}: held, it clashes. On a passing note it is fine.`,
    };
  }
  const t = TENSION_OF_SEMIS[semis];
  if (table?.tensions.includes(semis) && t && t !== "chord-tone" && t !== "avoid")
    return {
      id: t,
      fact: `${noteText} over ${chordText} is ${TENSION_WORD[t]}: a common colour on this chord.`,
    };
  if (table?.tensions.includes(semis)) {
    const below = tones.find((t) => mod12(t + 2) === semis);
    const under = below !== undefined && voiced ? roleName(below, voiced) : "a chord tone";
    return {
      id: null,
      fact: `${noteText} over ${chordText} is a whole step above the ${under}: a common colour on this chord.`,
    };
  }
  return { id: null, fact: `${noteText} over ${chordText} is outside the usual choices for this chord.` };
}

/** "D5" → 74, "Eb4" → 63; a bare letter is octave 4. */
export function noteMidi(name: string): number | null {
  const m = /^([A-Ga-g])(#|b|♯|♭)?(-?\d)?$/.exec(name.trim());
  if (!m) return null;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = m[2] === "#" || m[2] === "♯" ? 1 : m[2] === "b" || m[2] === "♭" ? -1 : 0;
  const oct = m[3] === undefined ? 4 : Number(m[3]);
  return 12 * (oct + 1) + (base[(m[1] as string).toUpperCase()] as number) + acc;
}

// --- numerals ----------------------------------------------------------------------------------------------

export interface JazzRnButton {
  rn: string;
  /** What the chord does, in a few words: "the tritone sub of V7". */
  role: string;
}

/**
 * The jazz row of the numeral palette (J4.L01, J5): the dominants on the key's other degrees (II7 VI7 III7: the
 * iii–VI–ii–V turnaround and the rhythm-changes bridge), the tritone substitute ♭II7, the backdoor iv7 ♭VII7 and,
 * in major, the minor ii iiø7. In minor the ii is already iiø7 and iv7 is the key's own: the row keeps ♭II7 and
 * ♭VII7.
 */
export function jazzRnButtons(mode: "major" | "minor" | "harmonic"): JazzRnButton[] {
  if (mode !== "major")
    return [
      { rn: "bII7", role: "the tritone sub of V7" },
      { rn: "bVII7", role: "the backdoor dominant" },
    ];
  return [
    { rn: "II7", role: "V7 of V" },
    { rn: "VI7", role: "V7 of ii" },
    { rn: "III7", role: "V7 of vi" },
    { rn: "bII7", role: "the tritone sub of V7" },
    { rn: "iv7", role: "the backdoor ii" },
    { rn: "bVII7", role: "the backdoor dominant" },
    { rn: "iiø7", role: "the minor ii" },
  ];
}

export type BracketKind = "ii–V" | "ii–♭II" | "sub" | "backdoor";
export interface RnBracket {
  /** First and last slot (0-based) the bracket spans. */
  from: number;
  to: number;
  kind: BracketKind;
  /** Spoken: "Slots 2 and 3: a ii–V into F". */
  text: string;
}

const MINOR_QUALITIES: readonly ChordQuality[] = ["m7", "m7b5", "m9", "m11", "m6"];
const DOMINANTS: readonly ChordQuality[] = ["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt", "7sus4"];

interface Slot {
  root: number;
  quality: ChordQuality;
}
function slotChord(rn: string, key: KeySpec): Slot | null {
  if (!rn) return null;
  const r = parseRN(rn.split("/")[0] as string, key as never);
  if (!r) return null;
  // Read the numeral's chord through the theory's own numerals (the tonic is irrelevant: intervals only).
  const scale = key.mode === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const applied = rn.includes("/") ? parseRN(rn.split("/")[1] as string, key as never) : null;
  let root = mod12((scale[r.degree - 1] as number) + r.alt);
  if (applied) root = mod12(root + (scale[applied.degree - 1] as number) + applied.alt);
  return { root, quality: r.quality as ChordQuality };
}

/**
 * The brackets a lead sheet draws over a strip of numerals (J2, J4, J5): a ii–V (a minor seventh, or m7♭5, then a
 * dominant a 4th above it), a ii–♭II (the ii, then the tritone sub a half step below it), a lone tritone sub (a
 * dominant resolving down a half step) and the backdoor (♭VII7 to I). Descriptive: it marks what the learner wrote.
 */
export function rnBrackets(
  slots: readonly string[],
  key: KeySpec = { tonic: "C", mode: "major" },
): RnBracket[] {
  const chords = slots.map((rn) => slotChord(rn, key));
  const out: RnBracket[] = [];
  const used = new Set<number>();
  for (let i = 0; i + 1 < chords.length; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    if (!a || !b) continue;
    if (!MINOR_QUALITIES.includes(a.quality) || !DOMINANTS.includes(b.quality)) continue;
    const step = mod12(b.root - a.root);
    if (step !== 5 && step !== 11) continue;
    // The backdoor ii–V (iv7 ♭VII7): a ii–V into ♭III that goes home a whole step up instead.
    const c = chords[i + 2];
    if (step === 5 && c && mod12(c.root - b.root) === 2 && !MINOR_QUALITIES.includes(c.quality)) {
      out.push({
        from: i,
        to: i + 2,
        kind: "backdoor",
        text: `Slots ${i + 1} to ${i + 3}: the backdoor home`,
      });
      used.add(i + 1);
      continue;
    }
    const kind: BracketKind = step === 5 ? "ii–V" : "ii–♭II";
    out.push({
      from: i,
      to: i + 1,
      kind,
      text: `Slots ${i + 1} and ${i + 2}: ${kind === "ii–V" ? "a ii–V" : "a ii, then the tritone sub"}`,
    });
    used.add(i + 1);
  }
  for (let i = 0; i + 1 < chords.length; i++) {
    const a = chords[i];
    const b = chords[i + 1];
    if (!a || !b || used.has(i) || !DOMINANTS.includes(a.quality)) continue;
    const step = mod12(b.root - a.root);
    if (step === 11)
      out.push({
        from: i,
        to: i,
        kind: "sub",
        text: `Slot ${i + 1}: a dominant that slides down a half step`,
      });
    else if (step === 2 && !MINOR_QUALITIES.includes(b.quality) && DOMINANTS.includes(b.quality) === false)
      out.push({
        from: i,
        to: i + 1,
        kind: "backdoor",
        text: `Slots ${i + 1} and ${i + 2}: the backdoor home`,
      });
  }
  return out.sort((x, y) => x.from - y.from || x.to - y.to);
}
