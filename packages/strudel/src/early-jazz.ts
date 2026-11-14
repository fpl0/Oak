// The backing of a 1920s standard in an early-jazz two-beat feel (Wave 6, CF-T "Standard Transcription": Five Foot
// Two, Ain't She Sweet, Bye Bye Blackbird). Pure text, no Strudel import: given a tune's changes, bar by bar, it
// writes the three backing layers of a song's answer key (`SongDef.answerKey.layers`: each a labelled track's body
// without its label), the form content/repertoire/tunes.ts gives a song's bass and chords.
//
//   bass    the two-beat: the chord's root on beat 1 and its 5th on beat 3 (the 5th below the root when the root
//           sits high); a bar of two chords plays each root. Upright, low-passed. These are the notes a learner
//           takes down in CF-T's bass stage, so they are on the grid and nothing is ornamented.
//   chords  the stride pianist's right hand: every chord tone, close, around middle C, struck short on beats 2 and
//           4, each voicing the inversion nearest the one before (no voice moves more than a whole step where a
//           common tone or a step exists). A bar of two chords strikes the first on 2 and the second on 4.
//   drums   brushes on the jazz kit: a soft bass drum with the bass on 1 and 3, the brush tap on 2 and 4, closed
//           hats in eighths with the beat leaning.
//
// Everything is written straight. The swing is the pattern source's: a song that declares
// `swing: { subdivision: 8, amount: 1/3 }` is swung at realism R2 and above on every part but the one being
// transcribed (realism-pattern.ts), so the answer stays on the grid at every level (contracts §6.12). The quarter
// notes of bass and chords are untouched by swing; the hats' eighths carry it.
import { type ChordId, chordPcs, parseChordSymbol } from "@oak/theory";

/** One bar of harmony: one chord, or two (a half bar each), as code spellings (STYLE §5.1): `"C"`, `["D7", "G7"]`. */
export type BarChords = string | readonly [string, string];

export interface EarlyJazzOptions {
  /** A pickup bar before bar 1: every layer rests through it (cycle 0 of the song is the pickup, STYLE §12). */
  pickup?: boolean;
  /** The bass sound and its low-pass (default `upright`, 900 Hz: the jazz-soul kit's bass). */
  bassSound?: string;
  bassLpf?: number;
  /** The chord sound (default `piano`) and level. */
  chordSound?: string;
  chordGain?: number;
  /** MIDI of the lowest note a chord voicing may start on, and the highest (default D3 to C4). */
  voicingFloor?: number;
  voicingCeiling?: number;
}

export interface EarlyJazzLayers {
  drums: string;
  bass: string;
  chords: string;
}

/** What `earlyJazzBacking` played, bar by bar: for tests, and for an answer key's bass roots. */
export interface EarlyJazzBar {
  /** The bar's chords as given. */
  symbols: readonly string[];
  /** Bass MIDI notes on beats 1 and 3. */
  bass: readonly [number, number];
  /** The chord struck on beat 2 and the chord struck on beat 4, lowest note first. */
  chords: readonly [readonly number[], readonly number[]];
}

const NOTE_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"] as const;
/** A MIDI number as a Strudel note name, flats only (`bb2`): no `cb` or `b#`, whose octave numbers mislead. */
export function noteName(midi: number): string {
  const m = Math.round(midi);
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

/** The lowest and highest notes of the two-beat bass: G1 to B♭2, the middle of an upright's range. */
export const BASS_RANGE: readonly [number, number] = [31, 46];
/** A root at or above this (E2) takes its 5th below; a lower root takes it above. */
const FIFTH_BELOW_FROM = 40;

function chordOf(symbol: string): ChordId {
  const chord = parseChordSymbol(symbol);
  if (!chord) throw new Error(`earlyJazzBacking: unknown chord "${symbol}"`);
  return chord;
}

/** The root of a chord in the bass register: G1 up to F♯2 (C is C2, F is F2, G is G1). */
function bassRoot(chord: ChordId): number {
  const pc = ((chord.rootPc % 12) + 12) % 12;
  return 31 + ((pc - 7 + 12) % 12);
}

/** The 5th the bass plays on beat 3: the chord's own 5th (diminished or augmented where the chord has one). */
function bassFifth(chord: ChordId, root: number): number {
  const pcs = chordPcs(chord).map((pc) => (((pc - chord.rootPc) % 12) + 12) % 12);
  const fifth = pcs.find((i) => i === 7) ?? pcs.find((i) => i === 6 || i === 8) ?? 7;
  return root >= FIFTH_BELOW_FROM ? root + fifth - 12 : root + fifth;
}

/** Every close voicing of a chord's tones whose lowest note lies in [floor, ceiling]. */
function closeVoicings(chord: ChordId, floor: number, ceiling: number): number[][] {
  let pcs = [...new Set(chordPcs(chord).map((pc) => ((pc % 12) + 12) % 12))];
  // Five notes and more (a ninth): the bass has the root; the right hand keeps the rest.
  if (pcs.length > 4) pcs = pcs.filter((pc) => pc !== ((chord.rootPc % 12) + 12) % 12);
  const out: number[][] = [];
  for (const lowPc of pcs) {
    for (let low = floor; low <= ceiling; low++) {
      if (((low % 12) + 12) % 12 !== lowPc) continue;
      const notes = pcs.map((pc) => low + ((pc - lowPc + 12) % 12)).sort((a, b) => a - b);
      out.push(notes);
    }
  }
  return out;
}

/** How far a voicing is from the one before: each new note to its nearest old note, summed; then the top note's move. */
function distance(prev: readonly number[], next: readonly number[]): number {
  let sum = 0;
  for (const n of next) sum += Math.min(...prev.map((p) => Math.abs(p - n)));
  for (const p of prev) sum += Math.min(...next.map((n) => Math.abs(p - n)));
  return sum + Math.abs((prev.at(-1) as number) - (next.at(-1) as number)) * 0.25;
}

/**
 * The plan of the backing: per bar, the bass's two notes and the two chords struck. Deterministic: the same
 * changes always give the same notes.
 */
export function earlyJazzPlan(harmony: readonly BarChords[], opts: EarlyJazzOptions = {}): EarlyJazzBar[] {
  const floor = opts.voicingFloor ?? 50;
  const ceiling = opts.voicingCeiling ?? 60;
  let prev: number[] | null = null;
  const voice = (chord: ChordId): number[] => {
    const all = closeVoicings(chord, floor, ceiling);
    if (all.length === 0) throw new Error("earlyJazzBacking: no voicing in range");
    const centre = 57; // A3: the first chord sits around middle C
    const best = [...all].sort((a, b) =>
      prev
        ? distance(prev, a) - distance(prev, b) || (a[0] as number) - (b[0] as number)
        : Math.abs((a[0] as number) + (a.at(-1) as number) - 2 * centre - 6) -
            Math.abs((b[0] as number) + (b.at(-1) as number) - 2 * centre - 6) ||
          (a[0] as number) - (b[0] as number),
    )[0] as number[];
    prev = best;
    return best;
  };
  return harmony.map((bar) => {
    const symbols = typeof bar === "string" ? [bar] : [...bar];
    const chords = symbols.map(chordOf);
    const [first, second] = [chords[0] as ChordId, chords[1]];
    const root = bassRoot(first);
    const bass: [number, number] = second ? [root, bassRoot(second)] : [root, bassFifth(first, root)];
    const v1 = voice(first);
    const v2 = second ? voice(second) : v1;
    return { symbols, bass, chords: [v1, v2] };
  });
}

const stackOf = (notes: readonly number[]): string => `[${notes.map(noteName).join(",")}]`;
const num = (x: number): string => String(x).replace(/^0\./, ".");

/**
 * The backing layers for a tune's changes. `harmony` has one entry per full bar (the pickup, if any, is not in
 * it). Each layer is a labelled track's body: `drums: ${layers.drums}`.
 */
export function earlyJazzBacking(
  harmony: readonly BarChords[],
  opts: EarlyJazzOptions = {},
): EarlyJazzLayers {
  if (harmony.length === 0) throw new Error("earlyJazzBacking: no bars");
  const plan = earlyJazzPlan(harmony, opts);
  const lead = opts.pickup ? "~ " : "";
  const bass = plan.map((b) => `[${noteName(b.bass[0])} ${noteName(b.bass[1])}]`).join(" ");
  const chords = plan.map((b) => `[~ ${stackOf(b.chords[0])} ~ ${stackOf(b.chords[1])}]`).join(" ");
  // The kit plays every bar the same; with a pickup it rests through cycle 0 like the other layers.
  const kit = [
    's("bd ~ bd ~").gain(.45)',
    's("~ sd ~ sd").gain(.5)',
    's("hh*8").velocity("[1 .6]*4").gain(.3)',
  ];
  const drums = opts.pickup
    ? `stack(${kit.join(", ")}).bank("jazzkit").mask("<0 1!${harmony.length}>")`
    : `stack(${kit.join(", ")}).bank("jazzkit")`;
  return {
    drums,
    bass: `note("<${lead}${bass}>").s("${opts.bassSound ?? "upright"}").lpf(${opts.bassLpf ?? 900}).gain(.9)`,
    // `.clip(.5)`: the right hand's chords are short, the "chick" after the bass's "boom".
    chords: `note("<${lead}${chords}>").clip(.5).s("${opts.chordSound ?? "piano"}").gain(${num(opts.chordGain ?? 0.5)}).room(.25)`,
  };
}
