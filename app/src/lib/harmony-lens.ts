// Wave 6 (docs/design/wave6.md §4.3): how deep the chord lens writes, and what the degree lens says about a
// chromatic note. Not switches: gates. A chord label never shows a thing the course has not taught yet: a seventh
// before U11.L04 / U12.L01 (the jazz-soul Band plays sevenths from U03), an applied numeral before U15.L02, a
// borrowed chord's numeral before U16.L01, a chromatic syllable before U15.L01. Inside the lesson that teaches a
// thing, the host adds that lesson to `completed`, so its own steps already show it (as `unlocksOf(currentSession)`
// does for tools). Frozen after Foundation: read it, never fork it.
import type { ChordColourView } from "@oak/grader";
import {
  type ChordId,
  chromaticLabel,
  degreeLens,
  type KeySpec,
  romanText,
  toLeadSheet,
  triadCore,
} from "@oak/theory";

/** What opens each depth: a toolbox row, or a completed lesson where the unlock table has no row for it. */
export const HARMONY_DEPTH_GATES = {
  /** Seventh chords in symbols and numerals: the dominant seventh (U11.L04) or the seventh family (U12.L01). */
  sevenths: { tools: ["chord.dom7", "chord.seventh"], lesson: null },
  /** Applied numerals ("V7/V"): U15.L02 "Five of Five" (skill H12). */
  applied: { tools: [], lesson: "U15.L02" },
  /** Borrowed chords' numerals ("♭VI", "iv" in major): U16.L01 "The Sad IV" (skill H13). */
  borrowed: { tools: [], lesson: "U16.L01" },
  /** Chromatic degrees and their syllables (♯4 "fi", ♭2 "ra"): `tb.n.chromatic` (U15.L01). */
  chromatic: { tools: ["tb.n.chromatic"], lesson: null },
} as const;
export type HarmonyDepthId = keyof typeof HARMONY_DEPTH_GATES;
export type HarmonyDepth = Record<HarmonyDepthId, boolean>;

/** Which depths are open, from the unlocked set and the completed lessons (the host adds the lesson being taken). */
export function harmonyDepth(unlocked: ReadonlySet<string>, completed: ReadonlySet<string>): HarmonyDepth {
  const open = (id: HarmonyDepthId): boolean => {
    const g = HARMONY_DEPTH_GATES[id];
    return g.tools.some((t) => unlocked.has(t)) || (g.lesson !== null && completed.has(g.lesson));
  };
  return {
    sevenths: open("sevenths"),
    applied: open("applied"),
    borrowed: open("borrowed"),
    chromatic: open("chromatic"),
  };
}
/** Everything open: Studio after the core, tests, the tutor's own cards. */
export const FULL_HARMONY_DEPTH: HarmonyDepth = {
  sevenths: true,
  applied: true,
  borrowed: true,
  chromatic: true,
};

export interface ChordLensText {
  /** Lead-sheet symbol as the chord lens writes it: "Dm7", or "Dm" while sevenths are closed. */
  symbol: string;
  /** The numeral, or `null` when the chord stands outside what the learner has been taught to name. */
  rn: string | null;
  /** True when something was held back (a view may show the symbol in a quieter colour, never a lock or a "?"). */
  reduced: boolean;
}
/**
 * One chord of `chromaticHarmonyView().chords` as the chord lens writes it at a depth. The chord is never renamed
 * wrongly: with sevenths closed it is its triad ("G" and "V" for G7), with applied or borrowed closed the symbol
 * stays and the numeral is left out.
 */
export function chordLensText(
  c: Pick<ChordColourView, "chord" | "key" | "kind" | "rn" | "symbol" | "seventh">,
  depth: HarmonyDepth,
): ChordLensText {
  const root: ChordId = { ...c.chord, bassPc: c.chord.rootPc };
  const held = !depth.sevenths && root.quality !== triadCore(root).quality;
  const shown: ChordId = held ? { ...root, quality: triadCore(root).quality, ext: [] } : root;
  const outside =
    (c.kind === "applied" && !depth.applied) ||
    ((c.kind === "borrowed" || c.kind === "picardy" || c.kind === "dorian-iv") && !depth.borrowed) ||
    c.kind === "other";
  return {
    symbol: held ? toLeadSheet(shown) : c.symbol,
    rn: outside ? null : held ? romanText(shown, c.key) : c.rn,
    reduced: held || (outside && c.kind !== "other"),
  };
}

export interface DegreeLensText {
  /** "♯4", "♭7", "3". */
  degree: string;
  /** The syllable, or `""` for a chromatic note while chromatic solfège is closed (before U15.L01). */
  syllable: string;
  chromatic: boolean;
}
/**
 * One note as the degree and solfège lenses label it. A note of the key reads as always (`degreeLens`: ♭3 "me" in
 * minor). A chromatic note is named by the chord under it or by its direction (`chromaticLabel`: G♯ under E7 is ♯5
 * "si"); until `depth.chromatic` it keeps the label the earlier units gave it and, when that label has no syllable
 * the learner knows (di ri fi si li ra), shows the degree alone. The blue notes (me, se, te) are known from U11, the
 * minor key's le from U10, and its raised 6 and 7 (la, ti: harmonic and melodic minor) from U10.L06 and U10.L08.
 */
/** Chromatic-note syllables taught before chromatic solfège opens (U15.L01). */
const EARLY_SYLLABLES: ReadonlySet<string> = new Set(["me", "se", "te", "le", "la", "ti"]);

export function degreeLensText(
  midi: number,
  key: KeySpec,
  depth: Pick<HarmonyDepth, "chromatic">,
  ctx: { chord?: ChordId; direction?: 1 | -1 } = {},
): DegreeLensText {
  const label = chromaticLabel(midi, key, depth.chromatic ? ctx : {});
  if (!label.chromatic) {
    const d = degreeLens(midi, key);
    return { degree: d.degree, syllable: d.syllable, chromatic: false };
  }
  const known = depth.chromatic || EARLY_SYLLABLES.has(label.syllable);
  return { degree: label.display, syllable: known ? label.syllable : "", chromatic: true };
}
