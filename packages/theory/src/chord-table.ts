// The single chord-spelling table (STYLE §5.1, §5.2; contracts §6.7 rules 6 and 7). Every chord string Oak
// shows or writes comes from here. The dictionary matrix was measured against Strudel 1.2.6 and is re-derived
// by `chords.strudel.test.ts`, which voices every row in every dictionary and compares pitch classes.
import type { ChordFamilyId, ChordQuality } from "@oak/content-kit";
import type { ChordSpelling, VoicingDict } from "./types.ts";

type Dicts = Record<VoicingDict, "ok" | "missing" | "wrong">;
const d = (
  ireal: Dicts["ireal"],
  irealExt: Dicts["ireal-ext"],
  triads: Dicts["triads"],
  lefthand: Dicts["lefthand"],
  guidetones: Dicts["guidetones"],
  legacy: Dicts["legacy"],
): Dicts => ({ ireal, "ireal-ext": irealExt, triads, lefthand, guidetones, legacy });

const TRIAD_DICTS = d("ok", "ok", "ok", "missing", "missing", "ok");
const SEVENTH_DICTS = d("ok", "ok", "missing", "ok", "ok", "ok");
const IREAL_ONLY = d("ok", "ok", "missing", "missing", "missing", "missing");
const IREAL_GUIDE = d("ok", "ok", "missing", "missing", "ok", "missing");

interface Row extends ChordSpelling {
  /** Chord tones as degree labels above the root (9 11 13 for tensions), for spelling. */
  tones: string[];
  /** Tones a pitch-class check may also accept from a dictionary (usual tensions), in semitones. */
  tensions: number[];
  /** Tones `identifyChord` does not require (the 5th always; 9 under 13 and 11). */
  optional: string[];
  /** Other spellings `parseChordSymbol` reads (lead sheet, tonal, iReal), already normalized (see `normSuffix`). */
  accept: string[];
}

const MIN_T = [2, 5, 9];
const DOM_T = [1, 2, 3, 6, 8, 9];

function row(
  quality: ChordQuality,
  code: string,
  leadSheet: string,
  jazz: string,
  abc: string,
  family: ChordFamilyId,
  tones: string[],
  dicts: Dicts,
  extra: { forbidden?: string[]; accept?: string[]; tensions?: number[]; optional?: string[] } = {},
): Row {
  return {
    quality,
    code,
    forbidden: extra.forbidden ?? [],
    leadSheet,
    jazz,
    abc,
    family,
    intervals: tones.map(toneSemis),
    dicts,
    tones,
    tensions: extra.tensions ?? [],
    optional: extra.optional ?? ["5"],
    accept: extra.accept ?? [],
  };
}

/** Semitones of a chord-tone label above the root: "b3" → 3, "9" → 14, "bb7" → 9, "#11" → 18. */
export function toneSemis(tone: string): number {
  const m = /^(bb|b|#)?(\d+)$/.exec(tone);
  if (!m) throw new Error(`bad tone ${tone}`);
  const n = Number(m[2]);
  const base = [0, 2, 4, 5, 7, 9, 11][(n - 1) % 7] as number;
  const alt = m[1] === "#" ? 1 : m[1] === "b" ? -1 : m[1] === "bb" ? -2 : 0;
  return base + 12 * Math.floor((n - 1) / 7) + alt;
}

export const ROWS: readonly Row[] = [
  row("maj", "", "", "", "", "chord.triad", ["1", "3", "5"], TRIAD_DICTS, {
    forbidden: ["M", "^"],
    accept: ["maj", "major", "ma"],
    tensions: [2, 9, 11],
  }),
  row("min", "m", "m", "–", "m", "chord.triad", ["1", "b3", "5"], TRIAD_DICTS, {
    forbidden: ["-"],
    accept: ["min", "mi", "minor"],
    tensions: MIN_T,
  }),
  row("dim", "o", "°", "°", "o", "chord.triad", ["1", "b3", "b5"], TRIAD_DICTS, {
    accept: ["dim"],
    tensions: [2, 5, 8, 9, 11],
  }),
  row(
    "aug",
    "aug",
    "+",
    "+",
    "+",
    "chord.triad",
    ["1", "3", "#5"],
    d("ok", "ok", "wrong", "missing", "missing", "wrong"),
    {
      forbidden: ["+"],
      accept: ["#5"],
      tensions: [2, 10, 11],
      optional: [],
    },
  ),
  row("sus2", "2", "sus2", "sus2", "sus2", "chord.sixth-sus", ["1", "2", "5"], IREAL_ONLY, {
    accept: ["sus2"],
    tensions: [9, 11],
  }),
  row("sus4", "sus", "sus4", "sus", "sus4", "chord.sixth-sus", ["1", "4", "5"], IREAL_ONLY, {
    accept: ["sus4"],
    tensions: [2, 9, 10],
  }),
  row("maj7", "^7", "maj7", "∆7", "maj7", "chord.seventh", ["1", "3", "5", "7"], SEVENTH_DICTS, {
    forbidden: ["M7"],
    accept: ["maj7", "Maj7", "ma7", "j7"],
    tensions: [2, 6, 9],
  }),
  row("7", "7", "7", "7", "7", "chord.dom7", ["1", "3", "5", "b7"], SEVENTH_DICTS, {
    accept: ["dom7", "dom"],
    tensions: DOM_T,
  }),
  row("m7", "m7", "m7", "–7", "m7", "chord.seventh", ["1", "b3", "5", "b7"], SEVENTH_DICTS, {
    forbidden: ["-7"],
    accept: ["min7", "mi7"],
    tensions: MIN_T,
  }),
  row("m7b5", "m7b5", "m7♭5", "ø7", "m7b5", "chord.seventh-dim", ["1", "b3", "b5", "b7"], SEVENTH_DICTS, {
    forbidden: ["h7", "h", "-7b5"],
    accept: ["07", "0", "min7b5", "mi7b5", "m7-5", "-7-5"],
    tensions: [2, 5, 8],
    optional: [],
  }),
  row("dim7", "o7", "°7", "°7", "o7", "chord.seventh-dim", ["1", "b3", "b5", "bb7"], SEVENTH_DICTS, {
    accept: ["dim7"],
    tensions: [2, 5, 8, 11],
    optional: [],
  }),
  row("mMaj7", "m^7", "m(maj7)", "–∆", "m(maj7)", "chord.alt", ["1", "b3", "5", "7"], IREAL_ONLY, {
    forbidden: ["-^7"],
    accept: ["mM7", "mmaj7", "-maj7", "minmaj7", "mMaj7", "-^", "m^", "-M7", "mM"],
    tensions: MIN_T,
  }),
  row(
    "6",
    "6",
    "6",
    "6",
    "6",
    "chord.sixth-sus",
    ["1", "3", "5", "6"],
    d("ok", "ok", "missing", "missing", "ok", "missing"),
    {
      accept: ["maj6", "M6"],
      tensions: [2, 6],
      optional: [],
    },
  ),
  row("m6", "m6", "m6", "–6", "m6", "chord.sixth-sus", ["1", "b3", "5", "6"], SEVENTH_DICTS, {
    forbidden: ["-6"],
    accept: ["min6", "mi6"],
    tensions: [2, 5],
    optional: [],
  }),
  row(
    "69",
    "69",
    "6/9",
    "6/9",
    "6/9",
    "chord.sixth-sus",
    ["1", "3", "5", "6", "9"],
    d("ok", "ok", "missing", "wrong", "ok", "wrong"),
    {
      accept: ["6/9", "6add9"],
      tensions: [6],
      optional: [],
    },
  ),
  row("add9", "add9", "add9", "add9", "add9", "chord.sixth-sus", ["1", "3", "5", "9"], IREAL_ONLY, {
    accept: ["add2"],
    tensions: [9, 11],
  }),
  row("9", "9", "9", "9", "9", "chord.ext", ["1", "3", "5", "b7", "9"], IREAL_ONLY, { tensions: DOM_T }),
  row("maj9", "^9", "maj9", "∆9", "maj9", "chord.ext", ["1", "3", "5", "7", "9"], IREAL_GUIDE, {
    forbidden: ["M9"],
    accept: ["maj9", "Maj9", "ma9"],
    tensions: [6, 9],
  }),
  row("m9", "m9", "m9", "–9", "m9", "chord.ext", ["1", "b3", "5", "b7", "9"], IREAL_GUIDE, {
    forbidden: ["-9"],
    accept: ["min9", "mi9"],
    tensions: [5, 9],
  }),
  row("m11", "m11", "m11", "–11", "m11", "chord.ext", ["1", "b3", "5", "b7", "9", "11"], IREAL_ONLY, {
    forbidden: ["-11"],
    accept: ["min11", "mi11"],
    tensions: [9],
    optional: ["5", "9"],
  }),
  row("7b9", "7b9", "7♭9", "7♭9", "7b9", "chord.alt", ["1", "3", "5", "b7", "b9"], SEVENTH_DICTS, {
    tensions: DOM_T,
  }),
  row("7#9", "7#9", "7♯9", "7♯9", "7#9", "chord.alt", ["1", "3", "5", "b7", "#9"], SEVENTH_DICTS, {
    tensions: DOM_T,
  }),
  row("7#11", "7#11", "7♯11", "7♯11", "7#11", "chord.alt", ["1", "3", "5", "b7", "#11"], SEVENTH_DICTS, {
    accept: ["7b5"],
    tensions: DOM_T,
  }),
  row("7b13", "7b13", "7♭13", "7♭13", "7b13", "chord.alt", ["1", "3", "5", "b7", "b13"], SEVENTH_DICTS, {
    tensions: DOM_T,
  }),
  row("13", "13", "13", "13", "13", "chord.ext", ["1", "3", "5", "b7", "9", "13"], IREAL_ONLY, {
    tensions: DOM_T,
    optional: ["5", "9"],
  }),
  row(
    "7alt",
    "7alt",
    "7alt",
    "7alt",
    "7alt",
    "chord.alt",
    ["1", "3", "b7", "b9", "#9", "#11", "b13"],
    IREAL_ONLY,
    {
      accept: ["alt"],
      tensions: [0, 1, 3, 6, 7, 8],
      optional: ["b9", "#9", "#11", "b13"],
    },
  ),
  row(
    "maj7#11",
    "^7#11",
    "maj7♯11",
    "∆♯11",
    "maj7#11",
    "chord.ext",
    ["1", "3", "5", "7", "#11"],
    IREAL_ONLY,
    {
      forbidden: ["M7#11"],
      accept: ["maj7#11", "Maj7#11", "^#11", "maj#11"],
      tensions: [2, 9],
    },
  ),
  row("7sus4", "7sus", "7sus4", "7sus", "7sus4", "chord.sixth-sus", ["1", "4", "5", "b7"], IREAL_ONLY, {
    accept: ["7sus4", "sus7"],
    tensions: [2, 9],
    optional: [],
  }),
];

/**
 * Suffixes Strudel resolves outside the canonical spelling, per dictionary. `mM7` is the minor-major
 * seventh's spelling under `lefthand`, `guidetones` (and `legacy`), where `m^7` is silent (STYLE §5.1).
 */
export const ALIAS_DICTS: Readonly<Record<string, Dicts>> = {
  M: d("ok", "ok", "ok", "missing", "missing", "ok"),
  "^": IREAL_ONLY,
  "-": IREAL_ONLY,
  "-7": IREAL_ONLY,
  "-6": IREAL_ONLY,
  "-9": IREAL_ONLY,
  "-11": IREAL_ONLY,
  "-^7": IREAL_ONLY,
  "-7b5": IREAL_ONLY,
  h: IREAL_ONLY,
  h7: IREAL_ONLY,
  M7: IREAL_ONLY,
  M9: IREAL_ONLY,
  "M7#11": IREAL_ONLY,
  mM7: d("missing", "missing", "missing", "ok", "ok", "ok"),
};

/** Dictionary-specific canonical spellings: the suffix Oak writes for a quality in that dictionary. */
export const DICT_CODE: Partial<Record<VoicingDict, Partial<Record<ChordQuality, string>>>> = {
  lefthand: { mMaj7: "mM7" },
  guidetones: { mMaj7: "mM7" },
};
