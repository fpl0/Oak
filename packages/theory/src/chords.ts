// Chord symbols in every dialect Oak meets, all derived from the one table in chord-table.ts.
import { CHORD_QUALITIES, type ChordFamilyId, type ChordQuality } from "@oak/content-kit";
import { ALIAS_DICTS, DICT_CODE, ROWS, toneSemis } from "./chord-table.ts";
import {
  addFifths,
  degreeFifths,
  fifthsOf,
  fromFifths,
  mod,
  nameOf,
  parseDegreeLabel,
  parsePcName,
  pcOfSpelled,
  type Spelled,
} from "./pitch.ts";
import type { ChordId, ChordSpelling, Pc, VoicingDict } from "./types.ts";

/** The single chord-spelling table, one row per `ChordQuality`. */
export const CHORD_TABLE: readonly ChordSpelling[] = ROWS.map(
  ({ tones: _t, tensions: _x, optional: _o, accept: _a, ...spelling }) => spelling,
);

const BY_QUALITY = new Map(ROWS.map((r) => [r.quality, r]));
export function rowOf(q: ChordQuality): (typeof ROWS)[number] {
  const r = BY_QUALITY.get(q);
  if (!r) throw new RangeError(`@oak/theory: unknown chord quality "${q}"`);
  return r;
}
export function chordSpelling(q: ChordQuality): ChordSpelling {
  return CHORD_TABLE.find((r) => r.quality === q) as ChordSpelling;
}

/** Unicode and punctuation to the ASCII suffix alphabet: ∆ Δ → ^, ø → h, ° → o, − – → -, ♭ ♯ → b #. */
export function normSuffix(s: string): string {
  return s
    .replace(/[∆Δ△]/g, "^")
    .replace(/[øØ]/g, "h")
    .replace(/[°º˚]/g, "o")
    .replace(/[−–—]/g, "-")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/[\s()]/g, "");
}

const SUFFIX_TO_QUALITY = new Map<string, ChordQuality>();
for (const r of ROWS) {
  for (const s of [r.code, ...r.forbidden, ...r.accept]) {
    const k = normSuffix(s);
    if (!SUFFIX_TO_QUALITY.has(k)) SUFFIX_TO_QUALITY.set(k, r.quality);
  }
  for (const s of [r.leadSheet, r.jazz, r.abc]) {
    const k = normSuffix(s);
    if (!SUFFIX_TO_QUALITY.has(k)) SUFFIX_TO_QUALITY.set(k, r.quality);
  }
}
for (const [alias] of Object.entries(ALIAS_DICTS)) {
  if (!SUFFIX_TO_QUALITY.has(alias)) throw new Error(`alias ${alias} has no quality`);
}

const ROOT_RE = /^([A-G])(##|bb|#|b|♯♯|♭♭|♯|♭|𝄪|𝄫)?(.*)$/u;

interface Split {
  root: Spelled;
  rootText: string;
  suffix: string;
}
function splitRoot(symbol: string): Split | null {
  const m = ROOT_RE.exec(symbol.trim());
  if (!m) return null;
  const root = parsePcName(`${m[1]}${m[2] ?? ""}`);
  if (!root) return null;
  return { root, rootText: `${m[1]}${m[2] ?? ""}`, suffix: m[3] ?? "" };
}

function makeChord(root: Spelled, quality: ChordQuality, bass?: Spelled): ChordId {
  const rootPc = pcOfSpelled(root);
  const c: ChordId = { rootPc, root: nameOf(root), quality, bassPc: rootPc, ext: [] };
  if (bass && pcOfSpelled(bass) !== rootPc) {
    c.bassPc = pcOfSpelled(bass);
    c.bass = nameOf(bass);
  }
  return c;
}

/** A chord from a root name and a quality ("Eb", "m7"). */
export function chordOf(root: string, quality: ChordQuality, bass?: string): ChordId {
  const r = parsePcName(root);
  if (!r) throw new RangeError(`@oak/theory: not a root: "${root}"`);
  const b = bass === undefined ? undefined : parsePcName(bass);
  if (b === null) throw new RangeError(`@oak/theory: not a bass note: "${bass}"`);
  return makeChord(r, quality, b);
}

/**
 * Parses a chord symbol in any dialect Oak meets: code spelling (`C^7`, `Cm7b5`), forbidden Strudel
 * spellings (`C-7`, `Ch7`), lead sheet (`Cmaj7`, `Cø7`), Unicode glyphs (∆ ø ° − ♭ ♯). Roots are
 * upper-case. Returns `null` for anything else, including a slash chord (`C/E`).
 */
export function parseChordSymbol(symbol: string): ChordId | null {
  const sp = splitRoot(symbol);
  if (!sp) return null;
  const q = SUFFIX_TO_QUALITY.get(normSuffix(sp.suffix));
  if (q === undefined) return null;
  return makeChord(sp.root, q);
}

/** Like `parseChordSymbol`, but also reads a slash chord's bass (`C/E`, `Cm7/Bb`, `C6/9/E`). */
export function parseChordWithBass(symbol: string): ChordId | null {
  const plain = parseChordSymbol(symbol);
  if (plain) return plain;
  const i = symbol.lastIndexOf("/");
  if (i < 0) return null;
  const head = parseChordSymbol(symbol.slice(0, i));
  const bass = parsePcName(
    symbol
      .slice(i + 1)
      .replace(/♭/g, "b")
      .replace(/♯/g, "#"),
  );
  if (!head || !bass || !/^[A-G]/.test(symbol.slice(i + 1).trim())) return null;
  const root = parsePcName(head.root) as Spelled;
  return makeChord(root, head.quality, bass);
}

function rootDisplay(name: string, unicode: boolean): string {
  return unicode ? name.replace(/#/g, "♯").replace(/b/g, "♭") : name;
}
function bassSuffix(c: ChordId, unicode: boolean): string {
  if (c.bassPc === c.rootPc) return "";
  return `/${rootDisplay(bassName(c), unicode)}`;
}
/** The bass as spelled: the chord tone it matches, else its own spelling, else flats/sharps from the root. */
export function bassName(c: ChordId): string {
  if (c.bass) return c.bass;
  const tones = chordNotes(c);
  const hit = tones.find((t) => pcOfSpelled(parsePcName(t) as Spelled) === c.bassPc);
  if (hit) return hit;
  return defaultPcName(c.bassPc);
}

/** The one code spelling: `C^7`, `Cm7b5`, `Caug`. Code has no slash chords, so the bass is dropped. */
export function toCode(chord: ChordId, dict?: VoicingDict): string {
  const special = dict ? DICT_CODE[dict]?.[chord.quality] : undefined;
  return `${chord.root}${special ?? rowOf(chord.quality).code}`;
}
/** Lead-sheet display: `Cmaj7`, `Cm7♭5`, `E♭7`, `C/E` for an inversion. */
export function toLeadSheet(chord: ChordId): string {
  return `${rootDisplay(chord.root, true)}${rowOf(chord.quality).leadSheet}${bassSuffix(chord, true)}`;
}
/** Jazz-glyph display (J1.L02 toggle): `C∆7`, `C–7`, `Cø7`, `C°7`. */
export function toJazzGlyph(chord: ChordId): string {
  return `${rootDisplay(chord.root, true)}${rowOf(chord.quality).jazz}${bassSuffix(chord, true)}`;
}
/**
 * Chord text abcjs prints as the lead-sheet display (never a literal "h7"). abcjs itself turns `b`/`#` into
 * ♭/♯ and `o` into °, so the text is ASCII: `Ebmaj7`, `Cm7b5`, `Bo7`.
 */
export function toAbcChord(chord: ChordId): string {
  return `${chord.root}${rowOf(chord.quality).abc}${bassSuffix(chord, false)}`;
}

/** Whether a symbol is written in the one canonical code spelling (`CmM7`, the `lefthand` spelling, counts). */
export function isCanonicalCode(symbol: string): boolean {
  const sp = splitRoot(symbol);
  if (!sp || !/^[A-G][#b]?$/.test(sp.rootText)) return false;
  if (ROWS.some((r) => r.code === sp.suffix)) return true;
  return Object.values(DICT_CODE).some((m) => Object.values(m ?? {}).includes(sp.suffix));
}

/** The chord family the lint maps a symbol to (`chord.triad`, `chord.dom7`, ...), or `null` if it is no chord. */
export function chordFamilyOf(symbol: string): ChordFamilyId | null {
  const c = parseChordSymbol(symbol);
  return c ? rowOf(c.quality).family : null;
}

/**
 * Whether `dict` voices `symbol` correctly: `missing` when the dictionary does not carry it, `wrong`
 * when Strudel 1.2.6 voices it wrongly (STYLE §5.2). Both are the lint error `code.chord-not-in-dict`.
 * A spelling Strudel cannot read at all (`Cmaj7`, `Cdim`, `C+`, `C∆7`) is `missing` everywhere.
 */
export function chordInDict(symbol: string, dict: VoicingDict): "ok" | "missing" | "wrong" | "unknown-chord" {
  const c = parseChordSymbol(symbol);
  const sp = splitRoot(symbol);
  if (!c || !sp) return "unknown-chord";
  if (!/^[A-G][#b]?$/.test(sp.rootText)) return "missing";
  const r = ROWS.find((x) => x.code === sp.suffix);
  if (r) return r.dicts[dict];
  const alias = ALIAS_DICTS[sp.suffix];
  if (alias) return alias[dict];
  return "missing";
}

/** Spelled chord tones, root first: Eb7 → ["Eb", "G", "Bb", "Db"]. */
export function chordNotes(chord: ChordId): string[] {
  const root = parsePcName(chord.root) ?? fromFifths(0);
  return rowOf(chord.quality).tones.map((t) => {
    const p = parseDegreeLabel(t);
    if (!p) throw new Error(`bad tone ${t}`);
    return nameOf(addFifths(root, degreeFifths(p.num, p.alt)));
  });
}

/** Pitch classes of a chord, root first. */
export function chordPcs(chord: ChordId): Pc[] {
  const out: Pc[] = [];
  for (const i of rowOf(chord.quality).intervals) {
    const pc = mod(chord.rootPc + i, 12) as Pc;
    if (!out.includes(pc)) out.push(pc);
  }
  return out;
}

const TRIAD_CORE: Record<ChordQuality, "maj" | "min" | "dim" | "aug" | "sus2" | "sus4"> = {
  maj: "maj",
  min: "min",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  maj7: "maj",
  "7": "maj",
  m7: "min",
  m7b5: "dim",
  dim7: "dim",
  mMaj7: "min",
  "6": "maj",
  m6: "min",
  "69": "maj",
  add9: "maj",
  "9": "maj",
  maj9: "maj",
  m9: "min",
  m11: "min",
  "7b9": "maj",
  "7#9": "maj",
  "7#11": "maj",
  "7b13": "maj",
  "13": "maj",
  "7alt": "maj",
  "maj7#11": "maj",
  "7sus4": "sus4",
};
/** The seventh-level quality: extensions and alterations dropped (C13 → C7, Cm11 → Cm7, C69 → C6, Cadd9 → C). */
export const SEVENTH_CORE: Record<ChordQuality, ChordQuality> = {
  maj: "maj",
  min: "min",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  maj7: "maj7",
  "7": "7",
  m7: "m7",
  m7b5: "m7b5",
  dim7: "dim7",
  mMaj7: "mMaj7",
  "6": "6",
  m6: "m6",
  "69": "6",
  add9: "maj",
  "9": "7",
  maj9: "maj7",
  m9: "m7",
  m11: "m7",
  "7b9": "7",
  "7#9": "7",
  "7#11": "7",
  "7b13": "7",
  "13": "7",
  "7alt": "7",
  "maj7#11": "maj7",
  "7sus4": "7sus4",
};

/** Root pitch class + triad quality: what progressions compare on, so sevenths and extensions pass. */
export function triadCore(chord: ChordId): {
  rootPc: Pc;
  quality: "maj" | "min" | "dim" | "aug" | "sus2" | "sus4";
} {
  return { rootPc: chord.rootPc, quality: TRIAD_CORE[chord.quality] };
}
export function triadQuality(q: ChordQuality): "maj" | "min" | "dim" | "aug" | "sus2" | "sus4" {
  return TRIAD_CORE[q];
}

/** Same chord by root pitch class and quality at a depth (default `seventh`), and by bass when asked. */
export function sameChord(
  a: ChordId,
  b: ChordId,
  opts?: { bass?: boolean; depth?: "triad" | "seventh" | "extended" },
): boolean {
  if (a.rootPc !== b.rootPc) return false;
  if (opts?.bass && a.bassPc !== b.bassPc) return false;
  const depth = opts?.depth ?? "seventh";
  if (depth === "triad") return TRIAD_CORE[a.quality] === TRIAD_CORE[b.quality];
  if (depth === "seventh") return SEVENTH_CORE[a.quality] === SEVENTH_CORE[b.quality];
  return a.quality === b.quality;
}

// --- recognition -----------------------------------------------------------------------------------

const PREFERRED_PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
/** The usual spelling of a bare pitch class (flats except F♯). */
export function defaultPcName(pc: number): string {
  return PREFERRED_PC_NAMES[mod(pc, 12)] as string;
}

const setKey = (xs: number[]): string =>
  [...new Set(xs.map((x) => mod(x, 12)))].sort((a, b) => a - b).join(",");
const QUALITY_BY_SET = new Map<string, ChordQuality>();
const QUALITY_BY_SET_NO5 = new Map<string, ChordQuality>();
for (const r of ROWS) {
  const k = setKey(r.intervals);
  if (!QUALITY_BY_SET.has(k)) QUALITY_BY_SET.set(k, r.quality);
  if (r.tones.includes("5")) {
    const k5 = setKey(r.intervals.filter((_, i) => r.tones[i] !== "5"));
    if (!QUALITY_BY_SET_NO5.has(k5)) QUALITY_BY_SET_NO5.set(k5, r.quality);
  }
}

/** Quality of a triad or seventh from its intervals in semitones above the root (the 5th may be omitted). */
export function qualityOf(intervals: number[]): ChordQuality | null {
  const all = [0, ...intervals];
  const k = setKey(all);
  return QUALITY_BY_SET.get(k) ?? QUALITY_BY_SET_NO5.get(k) ?? null;
}

const TONE_WEIGHT = (tone: string): number => {
  const p = parseDegreeLabel(tone);
  if (!p) return 0.5;
  if (p.written === 1) return 1;
  if (p.written === 3 || p.written === 7 || (p.written === 6 && tone !== "13")) return 1.5;
  if (p.written === 2 || p.written === 4) return tone.length === 1 ? 1.5 : 0.5; // sus tones carry the chord
  if (p.written === 5) return 0.5;
  return 0.5;
};

/**
 * Candidate chords for sounding notes, best fit first. Only for hand-voiced note lists and `n()` stacks:
 * the identity of a `voicing()` always comes from its symbol (contracts §6.7). Fit = Σ weights of present
 * chord tones (3rd and 7th 1.5, root 1, 5th 0.5, extensions 0.5) − 1 per non-chord pitch class.
 */
export function identifyChord(
  midis: number[],
  opts?: { allowRootless?: boolean; bassPc?: Pc },
): (ChordId & { fit: number })[] {
  if (midis.length === 0) return [];
  const lowest = Math.min(...midis);
  const bassPc = (opts?.bassPc ?? mod(Math.round(lowest), 12)) as Pc;
  // A bass from another track sounds too.
  const pcs = [...new Set([...midis.map((m) => mod(Math.round(m), 12)), bassPc])];
  const roots = new Set<number>(pcs);
  if (opts?.allowRootless) roots.add(bassPc);
  type Cand = ChordId & { fit: number; extras: number; size: number; order: number };
  const cands: Cand[] = [];
  for (const root of roots) {
    for (const r of ROWS) {
      const tonePcs = r.intervals.map((i) => mod(root + i, 12));
      const present = new Set(pcs);
      if (!present.has(root) && !(opts?.allowRootless && root === bassPc)) continue;
      let fit = 0;
      let required = true;
      let alterations = 0;
      r.tones.forEach((t, i) => {
        const pc = tonePcs[i] as number;
        if (present.has(pc)) {
          fit += TONE_WEIGHT(t);
          if (r.quality === "7alt" && r.optional.includes(t)) alterations++;
        } else if (t !== "1" && !r.optional.includes(t)) required = false;
      });
      if (!required) continue;
      if (r.quality === "7alt" && alterations < 2) continue;
      const extras = pcs.filter((pc) => !tonePcs.includes(pc)).length;
      fit -= extras;
      const covered = pcs.length - extras;
      if (covered < 2) continue;
      const rootName = defaultPcName(root);
      const c = makeChord(parsePcName(rootName) as Spelled, r.quality);
      if (bassPc !== c.rootPc) {
        c.bassPc = bassPc;
      }
      cands.push({ ...c, fit, extras, size: r.tones.length, order: CHORD_QUALITIES.indexOf(r.quality) });
    }
  }
  cands.sort(
    (a, b) =>
      b.fit - a.fit ||
      Number(b.rootPc === bassPc) - Number(a.rootPc === bassPc) ||
      a.extras - b.extras ||
      a.size - b.size ||
      a.order - b.order,
  );
  return cands.map(({ extras: _e, size: _s, order: _o, ...c }) => {
    if (c.bassPc !== c.rootPc) {
      const named = { ...c } as ChordId & { fit: number };
      named.bass = bassName({ ...c, ext: [] });
      return named;
    }
    return c;
  });
}

/** Spells a chord's root in a key's context: the scale's spelling when the root is diatonic. */
export function respellRoot(chord: ChordId, rootName: string): ChordId {
  const r = parsePcName(rootName);
  if (!r || pcOfSpelled(r) !== chord.rootPc) return chord;
  const out: ChordId = { ...chord, root: nameOf(r) };
  if (out.bass !== undefined) delete out.bass;
  if (chord.bassPc !== chord.rootPc) out.bass = bassName(out);
  return out;
}

export { fifthsOf, toneSemis };
