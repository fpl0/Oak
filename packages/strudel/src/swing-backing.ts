// A swing rhythm section from a chart (Wave 7, the jazz track): ride, walking bass and rootless comping, written
// from changes bar by bar. Pure text, no Strudel import. It writes the three Band layers (`drums:`, `bass:`,
// `chords:` bodies, each without its label) of the swing Bands (packages/strudel/e2e/wave7-bands.ts: the ii–V–I in
// any key, the jazz blues, rhythm changes) and the backing of a standard from its verified changes
// (content/repertoire, author:repertoire's: Georgia on My Mind, Body and Soul, I Got Rhythm).
//
//   drums   the ride's "ding, ding-a" (quarters, a skip note on the swung "and" of 2 and 4), the hi-hat's foot on 2
//           and 4, a feathered bass drum on 1 (`ride`); or brushes for a ballad (`brushes`): the swish on 1 and 3,
//           the tap on 2 and 4. Swung by `.swingBy(1/3, 4)` (contracts §5.10: the "and" on the last triplet).
//   bass    walking: a note on every quarter, the root on 1, a chord tone on 3 (the 5th, or the second chord's
//           root in a bar of two), the 3rd on 2, and on 4 a half step from the next bar's root (below it when the
//           line rises to it, above when it falls) — the four things the `walking-bass` rule reads (contracts §5.6).
//           Or the two-feel (`feel: "two"`): root on 1, 5th on 3. Roots between A♯1 and A2 in C, so between E1
//           and D3 in every key once a Band's register is folded.
//   chords  rootless A and B voicings (@oak/theory `rootlessVoicing`: 3–5–7–9 and 7–9–3–5, a dominant's 13th for
//           its 5th), chosen over the whole chart for the least movement (each voice's move squared) with the
//           hand kept near E3, from C3 up; comped on 1 and
//           the "and" of 2 (one chord a bar) or on 1 and 3 (two).
//
// Relative (`relative: true`, the Bands): every pitch is half steps from C4 and the layer adds the step's tonic
// (`.add(n("0").scale("{{key}}"))`, content/bands' TONIC), so the chart is written in C and plays in any key.
import { type ChordId, chordPcs, parseChordSymbol, rootlessVoicing } from "@oak/theory";

/** One bar of a chart: one chord, or two (a half bar each), as code spellings (STYLE §5.1). */
export type ChartBar = readonly string[];

export interface SwingBackingOptions {
  /** Walking in four (default) or the two-feel. */
  feel?: "four" | "two";
  /** The ride (default) or brushes. */
  drums?: "ride" | "brushes";
  /** Half steps from C4 plus the step's tonic (Bands), or note names (a standard's own key). */
  relative?: boolean;
  bank?: string;
  /** The ride figure's sound (default `rd`; a bank without a ride, as the TR-808, plays it on `hh`). */
  rideSound?: string;
  bassSound?: string;
  chordSound?: string;
  /** Linear gains, as content/bands writes them (`.gain()` sets a level; it does not multiply). */
  rideGain?: number;
  bassGain?: number;
  chordGain?: number;
  bassLpf?: number;
}

export interface SwingBar {
  symbols: readonly string[];
  /** Bass MIDI on beats 1–4 (two-feel: beats 1 and 3). */
  bass: readonly number[];
  /** The voicing struck at each comp hit, lowest note first. */
  chords: readonly (readonly number[])[];
}

export interface SwingLayers {
  drums: string;
  bass: string;
  chords: string;
}

/** The qualities the comping voices (rootless voicings exist for sevenths and sixths). */
const VOICED = new Set([
  "maj7",
  "m7",
  "7",
  "m7b5",
  "dim7",
  "6",
  "m6",
  "maj9",
  "m9",
  "9",
  "13",
  "7b9",
  "7#9",
  "7#11",
  "7b13",
  "7alt",
  "mMaj7",
  "maj7#11",
  "m11",
  "69",
]);
// Written in C, a Band plays up to a fourth higher (F) or a tritone lower (F♯) after the register fold
// (band.ts foldBandRegister): roots between A♯1 and A2 stay between E1 and D3 in every key.
const BASS_LOW = 34; // A♯1
const BASS_HIGH = 45; // A2: the root's highest place; the line climbs a 5th from it at most
const VOICING_LOW = 52; // E3
const VOICING_FLOOR = 48; // C3: a voicing an octave down never starts under it
const mod12 = (x: number): number => ((x % 12) + 12) % 12;

function chordOf(symbol: string): ChordId {
  const c = parseChordSymbol(symbol);
  if (!c) throw new Error(`swingBacking: unknown chord "${symbol}"`);
  if (!VOICED.has(c.quality))
    throw new Error(
      `swingBacking: "${symbol}" is a triad; the comping voices sevenths and sixths (write ^7 or 6)`,
    );
  return c;
}

/** Semitones above the root of the chord's 3rd and 5th. */
function thirdAndFifth(c: ChordId): [number, number] {
  const rel = chordPcs(c).map((pc) => mod12(pc - c.rootPc));
  const third = rel.includes(4) ? 4 : rel.includes(3) ? 3 : rel.includes(5) ? 5 : 4;
  const fifth = rel.includes(7) ? 7 : rel.includes(6) ? 6 : rel.includes(8) ? 8 : 7;
  return [third, fifth];
}

/** The root nearest `previous` within the bass's root range. */
function placeRoot(c: ChordId, previous: number): number {
  let best = BASS_LOW + mod12(c.rootPc - BASS_LOW);
  for (let m = best; m <= BASS_HIGH; m += 12)
    if (Math.abs(m - previous) < Math.abs(best - previous)) best = m;
  return best;
}

/** The voicings a chord may take: A and B from E3 up, and each an octave lower while it starts on or above C3. */
function candidatesOf(c: ChordId): number[][] {
  const a = rootlessVoicing(c, "A", VOICING_LOW);
  const b = rootlessVoicing(c, "B", VOICING_LOW);
  return [a, b, ...[a, b].map((v) => v.map((m) => m - 12))].filter((v) => (v[0] as number) >= VOICING_FLOOR);
}
/** A change's cost: each voice's move squared (one leap costs more than several steps). */
const moveCost = (a: readonly number[], b: readonly number[]): number =>
  b.reduce((s, m, i) => s + (m - (a[i] ?? m)) ** 2, 0);
/** Where the hand sits: a little cost for each half step its lowest note strays from E3. */
const placeCost = (v: readonly number[]): number => Math.abs((v[0] as number) - VOICING_LOW);

/**
 * The comping's voicings for the whole chart at once (a shortest path over each chord's candidates), so the hand
 * never drifts into the bass by small steps and then leaps back: the least squared movement plus placement.
 */
function voiceChart(chords: readonly ChordId[]): number[][] {
  const options = chords.map(candidatesOf);
  let costs = (options[0] as number[][]).map((v) => placeCost(v) + (v === options[0]?.[0] ? 0 : 1));
  const back: number[][] = [];
  for (let i = 1; i < options.length; i++) {
    const here = options[i] as number[][];
    const prev = options[i - 1] as number[][];
    const step: number[] = [];
    const from: number[] = [];
    for (const v of here) {
      let best = Number.POSITIVE_INFINITY;
      let arg = 0;
      prev.forEach((p, j) => {
        const c = (costs[j] as number) + moveCost(p, v);
        if (c < best) {
          best = c;
          arg = j;
        }
      });
      step.push(best + placeCost(v));
      from.push(arg);
    }
    costs = step;
    back.push(from);
  }
  let k = costs.indexOf(Math.min(...costs));
  const out: number[][] = [(options.at(-1) as number[][])[k] as number[]];
  for (let i = back.length - 1; i >= 0; i--) {
    k = (back[i] as number[])[k] as number;
    out.unshift((options[i] as number[][])[k] as number[]);
  }
  return out;
}

/** What the backing plays, bar by bar (for tests, and for a standard's answer-key bass). */
export function swingPlan(chart: readonly ChartBar[], options: SwingBackingOptions = {}): SwingBar[] {
  if (chart.length === 0) throw new Error("swingBacking: an empty chart");
  const bars = chart.map((bar) => {
    if (bar.length < 1 || bar.length > 2) throw new Error("swingBacking: one or two chords a bar");
    return bar.map(chordOf);
  });
  // Roots first (each nearest the one before), so beat 4 can lead to the next one, the last bar to bar 1.
  const roots: number[][] = [];
  let previous = 40;
  for (const bar of bars) {
    const placed = bar.map((c) => {
      previous = placeRoot(c, previous);
      return previous;
    });
    roots.push(placed);
  }
  const voiced = voiceChart(bars.flat());
  let at = 0;
  return bars.map((bar, i) => {
    const r = roots[i] as number[];
    const next = (roots[(i + 1) % roots.length] as number[])[0] as number;
    const first = bar[0] as ChordId;
    const [third, fifth] = thirdAndFifth(first);
    const r1 = r[0] as number;
    let bass: number[];
    if (options.feel === "two") bass = bar.length === 2 ? [r1, r[1] as number] : [r1, r1 + fifth];
    else {
      const three = bar.length === 2 ? (r[1] as number) : r1 + fifth;
      // The approach: a half step under the next root when the line rises to it, over it when it falls.
      const approach = next >= three ? next - 1 : next + 1;
      bass = [r1, r1 + third, three, approach];
    }
    const chords = bar.map(() => voiced[at++] as number[]);
    return { symbols: chart[i] as ChartBar, bass, chords };
  });
}

const NOTE_NAMES = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"] as const;
const noteName = (m: number): string => `${NOTE_NAMES[mod12(m)]}${Math.floor(m / 12) - 1}`;
const num = (x: number): string => String(x).replace(/^0\./, ".").replace(/^-0\./, "-.");
const TONIC = 'n("0").scale("{{key}}")';

/** The three layers' bodies. */
export function swingBacking(chart: readonly ChartBar[], options: SwingBackingOptions = {}): SwingLayers {
  const plan = swingPlan(chart, options);
  const pitch = (m: number) => (options.relative ? String(m - 60) : noteName(m));
  const chord = (v: readonly number[]) => `[${v.map(pitch).join(",")}]`;
  const add = options.relative ? `.add(${TONIC})` : "";
  const bank = options.bank ? `.bank("${options.bank}")` : "";
  const ride = num(options.rideGain ?? 0.55);
  const drums =
    options.drums === "brushes"
      ? `stack(s("sd:2 ~ sd:2 ~").gain(${ride}), s("~ sd ~ sd").velocity(.8).gain(${ride}), s("bd ~ ~ ~").velocity(.5).gain(${ride}))${bank}`
      : `stack(s("[${options.rideSound ?? "rd"} ~ ${options.rideSound ?? "rd"} ${options.rideSound ?? "rd"}]*2").velocity("[1 .86 .94 .86]*2").gain(${ride}), s("~ hh ~ hh").velocity(.8).gain(${ride}), s("bd ~ ~ ~").velocity(.45).gain(${ride}))${bank}.swingBy(1/3, 4)`;
  const bassBars = plan.map((b) => `[${b.bass.map(pitch).join(" ")}]`);
  // Walking, each quarter held 85% of its length: the next attack stands clear of the last note's ring (a full
  // quarter left two of sixteen downbeats under the ring before them, measured in wave7.pw.ts "jazz").
  const hold = options.feel === "two" ? "" : ".clip(.85)";
  const bass = `note("<${bassBars.join(" ")}>")${add}${hold}.s("${options.bassSound ?? "upright"}").lpf(${options.bassLpf ?? 900}).gain(${num(options.bassGain ?? 0.9)})`;
  const compBars = plan.map((b) =>
    b.chords.length === 2
      ? `[${chord(b.chords[0] as number[])} ~ ~ ~ ${chord(b.chords[1] as number[])} ~ ~ ~]`
      : `[${chord(b.chords[0] as number[])} ~ ~ ${chord(b.chords[0] as number[])} ~ ~ ~ ~]`,
  );
  const chords = `note("<${compBars.join(" ")}>")${add}.swingBy(1/3, 4).s("${options.chordSound ?? "rhodes"}").gain(${num(options.chordGain ?? 0.45)})`;
  return { drums, bass, chords };
}
