// Chord symbols for the lint: family (toolbox row), canonical spelling, and membership in a voicing
// dictionary. `@oak/theory` owns the one chord table (contracts §6.7 rule 7) and is asked first. While a
// theory function is still a stub (Wave 1 is built in parallel) the lint falls back to the measured
// matrix of STYLE §5.2 below, which is data about Strudel 1.2.6's dictionaries, not a second spelling
// table; content CI re-derives both against Strudel.
import type { ChordFamilyId } from "@oak/content-kit";
import * as theory from "@oak/theory";

export type DictVerdict = "ok" | "missing" | "wrong" | "unknown-chord";
export const VOICING_DICTS = ["ireal", "ireal-ext", "triads", "lefthand", "guidetones"] as const;
type Dict = (typeof VOICING_DICTS)[number];

type Row = { family: ChordFamilyId; dicts: Partial<Record<Dict, "ok" | "wrong">>; alias?: string };
const IREAL = { ireal: "ok", "ireal-ext": "ok" } as const;
const SEVENTHS = { ...IREAL, lefthand: "ok", guidetones: "ok" } as const;

/** Suffix after the root → row (STYLE §5.1 and §5.2, executed against 1.2.6 in spike S1). */
const SUFFIXES: Readonly<Record<string, Row>> = {
  "": { family: "chord.triad", dicts: { ...IREAL, triads: "ok" } },
  m: { family: "chord.triad", dicts: { ...IREAL, triads: "ok" } },
  o: { family: "chord.triad", dicts: { ...IREAL, triads: "ok" } },
  aug: { family: "chord.triad", dicts: { ...IREAL, triads: "wrong" } },
  "^7": { family: "chord.seventh", dicts: SEVENTHS },
  "7": { family: "chord.dom7", dicts: SEVENTHS },
  m7: { family: "chord.seventh", dicts: SEVENTHS },
  m7b5: { family: "chord.seventh-dim", dicts: SEVENTHS },
  o7: { family: "chord.seventh-dim", dicts: SEVENTHS },
  m6: { family: "chord.sixth-sus", dicts: SEVENTHS },
  "69": { family: "chord.sixth-sus", dicts: { ...IREAL, lefthand: "wrong", guidetones: "ok" } },
  "6": { family: "chord.sixth-sus", dicts: { ...IREAL, guidetones: "ok" } },
  "7b9": { family: "chord.alt", dicts: SEVENTHS },
  "7#9": { family: "chord.alt", dicts: SEVENTHS },
  "7#11": { family: "chord.alt", dicts: SEVENTHS },
  "7b13": { family: "chord.alt", dicts: SEVENTHS },
  "7alt": { family: "chord.alt", dicts: IREAL },
  "m^7": { family: "chord.alt", dicts: IREAL },
  mM7: { family: "chord.alt", dicts: { lefthand: "ok", guidetones: "ok" } },
  "^9": { family: "chord.ext", dicts: { ...IREAL, guidetones: "ok" } },
  m9: { family: "chord.ext", dicts: { ...IREAL, guidetones: "ok" } },
  "9": { family: "chord.ext", dicts: IREAL },
  "13": { family: "chord.ext", dicts: IREAL },
  m11: { family: "chord.ext", dicts: IREAL },
  "^7#11": { family: "chord.ext", dicts: IREAL },
  sus: { family: "chord.sixth-sus", dicts: IREAL },
  "7sus": { family: "chord.sixth-sus", dicts: IREAL },
  "2": { family: "chord.sixth-sus", dicts: IREAL },
  add9: { family: "chord.sixth-sus", dicts: IREAL },
  // ireal-only aliases: they sound in the ireal dictionaries only and are never authored.
  "-": { family: "chord.triad", dicts: IREAL, alias: "m" },
  "-7": { family: "chord.seventh", dicts: IREAL, alias: "m7" },
  h7: { family: "chord.seventh-dim", dicts: IREAL, alias: "m7b5" },
  M: { family: "chord.triad", dicts: IREAL, alias: "" },
  M7: { family: "chord.seventh", dicts: IREAL, alias: "^7" },
};

/** Spellings that are silent (or a parse error) in Strudel, with the canonical code to suggest. */
const SUGGEST: Readonly<Record<string, string>> = {
  maj7: "^7",
  maj: "",
  maj9: "^9",
  dim: "o",
  dim7: "o7",
  min: "m",
  mi: "m",
  min7: "m7",
  sus4: "sus",
  sus2: "2",
  "+": "aug",
  "°": "o",
  "°7": "o7",
  ø: "m7b5",
  ø7: "m7b5",
  mmaj7: "m^7",
  "7sus4": "7sus",
};

export interface ChordParse {
  root: string;
  suffix: string;
}

export function splitChord(symbol: string): ChordParse | null {
  const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(symbol);
  return m ? { root: `${m[1]}${m[2]}`, suffix: m[3] as string } : null;
}

function fromTheory<T>(fn: () => T): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    if (/not implemented/i.test(String((e as { message?: unknown }).message ?? e))) return { ok: false };
    throw e;
  }
}

export interface ChordCheck {
  /** Parsed and known to Strudel in at least one dictionary (possibly as an ireal-only alias). */
  known: boolean;
  /** The canonical Oak spelling (STYLE §5.1); false for aliases and unknown spellings. */
  canonical: boolean;
  family: ChordFamilyId | null;
  /** Canonical code to suggest for a non-canonical or silent spelling. */
  suggest: string | null;
  lowercaseRoot: boolean;
}

export function checkChord(symbol: string): ChordCheck {
  const parts = splitChord(symbol);
  if (!parts) return { known: false, canonical: false, family: null, suggest: null, lowercaseRoot: false };
  const lowercaseRoot = /^[a-g]/.test(parts.root);
  const upper = `${(parts.root[0] as string).toUpperCase()}${parts.root.slice(1)}`;
  const row = SUFFIXES[parts.suffix];
  const suggestSuffix = row?.alias ?? SUGGEST[parts.suffix];
  const suggest =
    suggestSuffix !== undefined
      ? `${upper}${suggestSuffix}`
      : lowercaseRoot
        ? `${upper}${parts.suffix}`
        : null;
  const family = fromTheory(() => theory.chordFamilyOf(lowercaseRoot ? `${upper}${parts.suffix}` : symbol));
  const canonical = fromTheory(() => theory.isCanonicalCode(symbol));
  const fam = family.ok ? family.value : (row?.family ?? null);
  return {
    known: !lowercaseRoot && (row !== undefined || (family.ok && family.value !== null)),
    canonical: canonical.ok
      ? canonical.value
      : !lowercaseRoot && row !== undefined && row.alias === undefined,
    family: fam,
    suggest,
    lowercaseRoot,
  };
}

/** Does `dict` voice `symbol`, and with the right notes? */
export function chordInDict(symbol: string, dict: string): DictVerdict {
  const viaTheory = fromTheory(() => theory.chordInDict(symbol, dict as theory.VoicingDict));
  if (viaTheory.ok) return viaTheory.value;
  const parts = splitChord(symbol);
  const row = parts ? SUFFIXES[parts.suffix] : undefined;
  if (!parts || !row || /^[a-g]/.test(parts.root)) return "unknown-chord";
  const verdict = row.dicts[dict as Dict];
  return verdict ?? "missing";
}

/** Dictionaries that voice `symbol` correctly: for the fix text. */
export function dictsFor(symbol: string): string[] {
  return VOICING_DICTS.filter((d) => chordInDict(symbol, d) === "ok");
}
