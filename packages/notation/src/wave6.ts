// Wave 6 seam (docs/design/wave6.md §3.3). The engraver has written ties, dotted values, compound meters, tuplets,
// key changes and chord-aware spelling since Waves 1–4 (build.ts, abc.ts; pinned again in wave6.test.ts). What was
// missing is what a HOST passes for the U12–U17 material, in one call each:
//   keyChangesOf        a key plan (content-kit `KeyPlanEntry[]`, or the grader's key spans) → `key` + `keyChanges`
//   modalSignatureKey   which signature a modal piece shows (decided here: see MODAL_SIGNATURE_DEFAULT)
//   scoreRhythm         ties, dotted values and tuplets of a Score, as the staff writes them
//   harmonyLabels       seventh-chord symbols above and applied / borrowed numerals below, from one chord list
import type { KeyPlanEntry, KeySpec } from "@oak/content-kit";
import { isMinorish } from "@oak/theory";
import type { KeyChange, NotationInput, Score, TupletMark } from "./types.ts";

// --- key changes ---------------------------------------------------------------------------------------------

/** A key in force from a bar on, as the grader's `keyPlanView` and `AnalysisKeyContext` give it (1-based bars). */
export interface KeySpanInput {
  fromBar: number;
  key: KeySpec;
}
/**
 * `key` and `keyChanges` of a `NotationInput` from a key plan. Plans count bars from 1 (the pickup bar is 0);
 * `NotationInput.keyChanges` counts 0-based cycles, where a pickup is cycle 0, so with `pickup` bar n is cycle n and
 * without it cycle n − 1. The staff writes the new signature after a double barline at each change (`[K:…]`). An
 * entry that repeats the key in force is dropped.
 */
export function keyChangesOf(
  plan: readonly (KeyPlanEntry | KeySpanInput)[],
  opts: {
    pickup?: boolean;
    /**
     * How the modal keys of the plan show their signature (`modalSignatureKey`). `parallel` for a lesson that sets a
     * scale beside its mode in one line (U14.L01: `.scale("<G3:major!2 G3:mixolydian!2>")`; U14.L06's Mode Lab): the
     * signature stays the tonic's major or minor one and each colour tone is an accidental, so nothing on the staff
     * changes but that note. Default `mode`.
     */
    modal?: ModalSignatureStyle;
  } = {},
): Pick<NotationInput, "key" | "keyChanges"> {
  const entries = plan
    .map((e) => ({
      bar: "fromBar" in e ? e.fromBar : e.bar,
      key: opts.modal ? modalSignatureKey(e.key, opts.modal) : e.key,
    }))
    .sort((a, b) => a.bar - b.bar);
  const first = entries[0];
  if (!first) return { key: null };
  const keyChanges: KeyChange[] = [];
  let current = first.key;
  for (const e of entries.slice(1)) {
    if (e.key.tonic === current.tonic && e.key.mode === current.mode) continue;
    keyChanges.push({ bar: opts.pickup ? e.bar : e.bar - 1, key: e.key });
    current = e.key;
  }
  return keyChanges.length > 0 ? { key: first.key, keyChanges } : { key: first.key };
}

// --- modal signatures ------------------------------------------------------------------------------------------

/**
 * How a modal piece shows its key signature.
 * - `mode`: the mode's own signature, the notes of its parent scale (D Dorian: no sharps or flats; G Mixolydian:
 *   none; abcjs `K:Ddor`). The characteristic tone needs no accidental. This is how the folk repertoire is printed
 *   (Scarborough Fair, Drunken Sailor, Old Joe Clark) and what the engraver has done since Wave 1.
 * - `parallel`: the signature of the major or natural-minor key on the same tonic, with the characteristic tone
 *   written as an accidental every time (G Mixolydian: one sharp, each F with a natural sign). The colour tone is
 *   visible on the page, which is what U14.L01 "Modes as Colours" teaches ("major with ♭7").
 */
export const MODAL_SIGNATURE_STYLES = ["mode", "parallel"] as const;
export type ModalSignatureStyle = (typeof MODAL_SIGNATURE_STYLES)[number];
/**
 * Decided in Wave 6 Foundation (contracts are silent): a staff shows the mode's OWN signature unless the host asks
 * for `parallel`. Lessons that compare a mode with its parent major or minor (U14.L01, L03–L05 "raise or lower one
 * note") pass `parallel`; repertoire, lead sheets, the Workbench and Transcribe keep `mode`.
 */
export const MODAL_SIGNATURE_DEFAULT: ModalSignatureStyle = "mode";
const MODAL: ReadonlySet<string> = new Set(["dorian", "phrygian", "lydian", "mixolydian", "locrian"]);
/**
 * The key to pass as `NotationInput.key` for a modal piece. `mode` returns the key unchanged. `parallel` returns the
 * major (Lydian, Mixolydian) or minor (Dorian, Phrygian, Locrian) key on the same tonic: the engraver then spells
 * every note against that signature, so the colour tone carries its accidental, and the degree labels still read
 * ♭7, ♯4, ♭2 and 6, because degrees are always counted against major. A key that is not a mode is returned as is.
 */
export function modalSignatureKey(
  key: KeySpec,
  style: ModalSignatureStyle = MODAL_SIGNATURE_DEFAULT,
): KeySpec {
  if (style === "mode" || !MODAL.has(key.mode)) return key;
  return { tonic: key.tonic, mode: isMinorish(key.mode) ? "minor" : "major" };
}

// --- rhythm as written -----------------------------------------------------------------------------------------

export interface ScoreRhythm {
  /** Notes tied to the next (a tie over a beat or over the bar line), and how many of those cross a bar line. */
  ties: number;
  tiesAcrossBar: number;
  /** Notes and chords written with a dot outside tuplets (a dotted quarter in 4/4; the beat itself in 6/8). */
  dotted: number;
  /** Tuplet groups, with the 0-based cycle they start in: `{ p: 3, q: 2, r: 3 }` is a triplet. */
  tuplets: (TupletMark & { bar: number })[];
  /** The score writes the music exactly (`!score.approximate`). */
  exact: boolean;
}
/** What U13 asks about a line on the staff: its ties, its dotted values, its tuplets. Rests are not counted. */
export function scoreRhythm(score: Score): ScoreRhythm {
  let ties = 0;
  let tiesAcrossBar = 0;
  let dotted = 0;
  const tuplets: ScoreRhythm["tuplets"] = [];
  for (const staff of score.staves)
    for (const voice of staff.voices)
      for (const bar of voice.bars)
        bar.items.forEach((it, i) => {
          if (it.tupletStart) tuplets.push({ ...it.tupletStart, bar: bar.index });
          if (it.kind === "rest") return;
          if (it.written.dots > 0 && !it.inTuplet) dotted++;
          if (it.tieToNext) {
            ties++;
            if (i === bar.items.length - 1) tiesAcrossBar++;
          }
        });
  return { ties, tiesAcrossBar, dotted, tuplets, exact: !score.approximate };
}

// --- chord symbols above, numerals below -------------------------------------------------------------------------

/** One chord of the piece as a staff host has it (the grader's `chromaticHarmonyView().chords` fits). */
export interface HarmonyLabelInput {
  /** 1-based bar (0 = the pickup bar) and 1-based beat in tempo units. */
  bar: number;
  beat: number;
  /** Code spelling: "C^7", "Bm7b5", "Co7", "D7". */
  symbol: string;
  /** Oak's numeral dialect: "V7/V", "bVI", "iiø7", "viio7/ii". */
  rn: string;
}
/**
 * `chords` and `romans` of a `NotationInput` from one chord list: seventh-chord symbols above the staff (printed
 * Cmaj7, Dm7, G7, Bm7♭5, C°7 through the chord table's abc column), applied and borrowed numerals under it (V7/V,
 * ♭VI, iiø7, vii°7/ii). Bars are converted to 0-based cycles as in `keyChangesOf`.
 */
export function harmonyLabels(
  chords: readonly HarmonyLabelInput[],
  opts: {
    pickup?: boolean;
    symbols?: boolean;
    numerals?: boolean;
    /** Label every stroke of a chord that is struck again inside its bar (default false: once a bar). */
    restrikes?: boolean;
  } = {},
): Pick<NotationInput, "chords" | "romans"> {
  const cycle = (bar: number): number => (opts.pickup ? bar : bar - 1);
  // A chord struck again inside its bar (comping stabs, `.struct("x ~ x ~")`) is one chord: its label stands once,
  // on the first stroke. The next bar names it again when it is struck again there, as a chart does.
  const sorted = [...chords].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const kept = opts.restrikes
    ? sorted
    : sorted.filter((c, i) => {
        const prev = sorted[i - 1];
        return !(prev && prev.bar === c.bar && prev.symbol === c.symbol && prev.rn === c.rn);
      });
  return {
    ...(opts.symbols === false
      ? {}
      : { chords: kept.map((c) => ({ bar: cycle(c.bar), beat: c.beat, symbol: c.symbol })) }),
    ...(opts.numerals === false
      ? {}
      : {
          romans: kept.filter((c) => c.rn !== "").map((c) => ({ bar: cycle(c.bar), beat: c.beat, rn: c.rn })),
        }),
  };
}
