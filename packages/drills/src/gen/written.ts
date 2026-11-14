// Written rhythms of Rhythm II (U13): notes with lengths, so a dotted value, a tie over a beat or a bar line, a
// triplet and a compound bar are in the code the way U13.L03 writes them — shares of the bracket with `@`
// (`[cp@3 cp cp@2 cp@2]` is a dotted quarter, an eighth and two quarters), a bracket of three for a triplet, and
// a two-bar bracket inside `< >` for a note held across a bar line (`<[… cp@3 …]@2>`). The events carry the
// lengths, so the staff shows the dot and the tie (@oak/notation engraves from the events) and a tap or a
// dictation is graded on the onsets as before.
//
// The older levels of the rhythm families (quarters, rests, sixteenths: gen/rhythm.ts `VOCAB`) are built beat by
// beat and print rests between hits; they are unchanged.
import type { MeterId } from "@oak/content-kit";
import { alt, atom, type Node, rest, seq } from "../pat.ts";
import type { Rng } from "../types.ts";

/** One written value: `len` units long; a rest, a note, or a beat cut into `split` equal notes (a triplet). */
export interface Value {
  len: number;
  hit: boolean;
  split?: number;
}
/** A cell: the values that fill a whole number of beats. */
export type Cell = readonly Value[];
/** A span of one or two bars written in one bracket (two bars when a note is held across the bar line). */
export interface Span {
  bars: 1 | 2;
  values: Value[];
}

const N = (len: number): Value => ({ len, hit: true });
const Z = (len: number): Value => ({ len, hit: false });
/** A triplet: one beat (4 sixteenths) cut into three. */
const T: Value = { len: 4, hit: true, split: 3 };

/** The figure a written-rhythm category is about, and the plain cells around it. Lengths are sixteenths in 4/4. */
export type WrittenCategory = "dotted" | "tied" | "syncopation" | "triplets" | "three-four" | "compound";

/** Two-beat cells of plain quarters, eighths and a half note (met since U01). */
const PLAIN: readonly Cell[] = [
  [N(4), N(4)],
  [N(8)],
  [N(4), N(2), N(2)],
  [N(2), N(2), N(4)],
  [N(2), N(2), N(2), N(2)],
  [N(4), Z(4)],
];
/** Dotted values (U13.L03): the dotted quarter with its eighth, the dotted eighth with its sixteenth. */
const DOTTED: readonly Cell[] = [
  [N(6), N(2)],
  [N(6), N(2)],
  [N(3), N(1), N(4)],
  [N(4), N(3), N(1)],
  [N(3), N(1), N(2), N(2)],
];
/**
 * Notes that start between the beats and hold over the next one (U13.L01 heard them as pushes, U13.L03 writes
 * them as ties): eighth–quarter–eighth, and an eighth before a dotted quarter. Eighths only: a sixteenth push is
 * never tapped (content/specs/U13.md).
 */
const TIED: readonly Cell[] = [
  [N(2), N(4), N(2)],
  [N(2), N(6)],
  [N(4), N(2), N(2)],
];
/** A whole bar whose third beat arrives an eighth early: quarter, eighth, a note tied over beat 3, quarter. */
const TIED_BARS: readonly Cell[] = [
  [N(4), N(2), N(6), N(4)],
  [N(2), N(2), N(2), N(6), N(4)],
  [N(4), N(2), N(10)],
];
/** Triplets (U13.L05): a beat of three, beside quarters and eighths. */
const TRIPLETS: readonly Cell[] = [
  [T, N(4)],
  [N(4), T],
  [T, T],
  [T, N(2), N(2)],
  [N(2), N(2), T],
];
/** One-beat cells of 3/4 (sixteenths) and its whole-bar figures. */
const THREE_BEATS: readonly Cell[] = [[N(4)], [N(2), N(2)], [N(4)], [Z(4)]];
const THREE_BARS: readonly Cell[] = [
  [N(8), N(4)],
  [N(6), N(2), N(4)],
  [N(4), N(2), N(2), N(4)],
];
/** Compound beats (6/8, units are eighths, three to the beat): U13.L04's "1 la li". */
const COMPOUND: readonly Cell[] = [[N(3)], [N(1), N(1), N(1)], [N(2), N(1)], [N(1), N(2)], [N(3)]];
/** The cells that make a category's own figure (at least one is in every phrase). */
const OWN: Readonly<Record<WrittenCategory, readonly Cell[]>> = {
  dotted: DOTTED,
  tied: TIED.slice(0, 2),
  syncopation: TIED.slice(0, 2),
  triplets: TRIPLETS,
  "three-four": THREE_BARS,
  compound: COMPOUND.slice(1, 4),
};

export const WRITTEN_CATEGORIES: readonly WrittenCategory[] = [
  "dotted",
  "tied",
  "syncopation",
  "triplets",
  "three-four",
  "compound",
];
export const isWritten = (category: string): category is WrittenCategory =>
  (WRITTEN_CATEGORIES as readonly string[]).includes(category);
/** The meter a written category is in. */
export const writtenMeter = (category: WrittenCategory): MeterId =>
  category === "compound" ? "6/8" : category === "three-four" ? "3/4" : "4/4";
/** Units in a bar: sixteenths in the simple meters, eighths in 6/8. */
export const unitsPerBar = (category: WrittenCategory): number =>
  category === "compound" ? 6 : category === "three-four" ? 12 : 16;

const sum = (vs: readonly Value[]): number => vs.reduce((s, v) => s + v.len, 0);
const startsWithNote = (c: Cell): boolean => c[0]?.hit === true;

function bar44(rng: Rng, own: readonly Cell[], forceOwn: boolean, first: boolean): Value[] {
  const pool = [...PLAIN, ...own];
  const pick = (must: boolean, lead: boolean): Cell => {
    const from = (must ? own : pool).filter((c) => !lead || startsWithNote(c));
    return rng.pick(from.length > 0 ? from : pool);
  };
  const ownAt = forceOwn ? rng.int(0, 1) : -1;
  const a = pick(ownAt === 0, first);
  // The bar never ends on a rest that leaves it with one note, and never repeats one cell twice.
  let b = pick(ownAt === 1, false);
  for (let i = 0; i < 6 && (b === a || (a.length === 1 && b.length === 1)); i++) b = pick(ownAt === 1, false);
  return [...a, ...b];
}

/**
 * A phrase of `bars` bars for a category: every bar starts the phrase's first bar on a note, holds at least two
 * notes, and the category's own figure appears at least once. With `acrossBar` (two bars or more) the last
 * eighth of bar 1 is tied into bar 2: the two bars are one span.
 */
export function writtenPhrase(
  rng: Rng,
  category: WrittenCategory,
  bars: number,
  opts: { acrossBar?: boolean } = {},
): Span[] {
  if (category === "compound") {
    const out: Span[] = [];
    const ownBar = rng.int(0, bars - 1);
    for (let b = 0; b < bars; b++) {
      let a = rng.pick(COMPOUND.filter(startsWithNote));
      let c = rng.pick(COMPOUND);
      if (b === ownBar && !OWN.compound.includes(a) && !OWN.compound.includes(c)) c = rng.pick(OWN.compound);
      if (a.length === 1 && c.length === 1) a = rng.pick(OWN.compound);
      out.push({ bars: 1, values: [...a, ...c] });
    }
    return out;
  }
  if (category === "three-four") {
    const out: Span[] = [];
    const ownBar = rng.int(0, bars - 1);
    for (let b = 0; b < bars; b++) {
      if (b === ownBar) {
        out.push({ bars: 1, values: [...rng.pick(THREE_BARS)] });
        continue;
      }
      const beats = [
        rng.pick(THREE_BEATS.filter(startsWithNote)),
        rng.pick(THREE_BEATS),
        rng.pick(THREE_BEATS),
      ];
      if (beats.filter((c) => c[0]?.hit).length < 2) beats[1] = [N(2), N(2)];
      out.push({ bars: 1, values: beats.flat() });
    }
    return out;
  }
  const own = OWN[category];
  const tied = category === "tied" || category === "syncopation";
  if (tied && opts.acrossBar && bars >= 2) {
    // Bar 1 up to its last eighth (14 sixteenths), the tied note, the rest of bar 2.
    const head = bar44(rng, [], false, true);
    let cut = [...head];
    // Shorten the bar's last value by an eighth (or drop a final eighth) to make room for the pushed note.
    const last = cut[cut.length - 1] as Value;
    if (last.len > 2 && !last.split) cut[cut.length - 1] = { ...last, len: last.len - 2 };
    else if (last.len === 2) cut = cut.slice(0, -1);
    else cut = [N(4), N(4), N(4), N(2)];
    if (sum(cut) !== 14) cut = [N(4), N(4), N(4), N(2)];
    const hold = rng.pick([2, 4, 6]);
    const tail = rng.pick(
      hold === 2
        ? [
            [N(2), N(4), N(4), N(4)],
            [N(2), N(2), N(2), N(8)],
            [N(6), N(8)],
          ]
        : hold === 4
          ? [
              [N(4), N(8)],
              [N(2), N(2), N(8)],
              [N(4), N(4), N(4)],
            ]
          : [[N(2), N(8)], [N(2), N(4), N(4)], [N(10)]],
    );
    const span: Span = { bars: 2, values: [...cut, N(2 + hold), ...tail.map((v) => ({ ...v }))] };
    const rest2 = Array.from({ length: bars - 2 }, () => ({
      bars: 1 as const,
      values: bar44(rng, own, false, false),
    }));
    return [span, ...rest2];
  }
  const out: Span[] = [];
  const ownBar = rng.int(0, bars - 1);
  for (let b = 0; b < bars; b++) {
    if (tied && b === ownBar && rng.next() < 0.4) {
      out.push({ bars: 1, values: [...rng.pick(TIED_BARS)] });
      continue;
    }
    out.push({ bars: 1, values: bar44(rng, own, b === ownBar, b === 0) });
  }
  return out;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** The node of one span: notes and rests with `@` weights in the largest unit that holds them all. */
function spanNode(span: Span, sound: string): Node {
  const g = span.values.reduce((d, v) => gcd(d, v.len), 0) || 1;
  const items = span.values.map((v) =>
    !v.hit ? rest : v.split ? seq(Array.from({ length: v.split }, () => atom(sound))) : atom(sound),
  );
  const weights = span.values.map((v) => v.len / g);
  return weights.every((w) => w === 1) ? seq(items) : seq(items, weights);
}
/** The whole phrase as a pattern: one bar plain, several inside `< >`, a two-bar span as `[…]@2`. */
export function writtenNode(spans: readonly Span[], sound: string): Node {
  const nodes = spans.map((s) => spanNode(s, sound));
  if (spans.length === 1 && spans[0]?.bars === 1) return nodes[0] as Node;
  return alt(
    nodes,
    spans.map((s) => s.bars),
  );
}

/** Onsets of a phrase in units from its start (a split value gives one onset per part, as fractions of a unit). */
export function writtenOnsets(spans: readonly Span[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const s of spans)
    for (const v of s.values) {
      if (v.hit) for (let i = 0; i < (v.split ?? 1); i++) out.push(at + (i * v.len) / (v.split ?? 1));
      at += v.len;
    }
  return out;
}
/** What the staff needs to write the phrase back: dotted values, ties (a value that crosses a beat), triplets. */
export function writtenNeeds(
  spans: readonly Span[],
  category: WrittenCategory,
): { dots: boolean; ties: boolean; triplets: boolean } {
  const beat = category === "compound" ? 3 : 4;
  let at = 0;
  let dots = false;
  let ties = false;
  let triplets = false;
  for (const s of spans)
    for (const v of s.values) {
      if (v.hit) {
        if (v.split === 3) triplets = true;
        else if ([3, 6, 12].includes(v.len) && at % (v.len === 3 && beat === 4 ? 4 : beat) === 0) dots = true;
        // A note that starts off the beat and sounds past the next beat, or one of five or seven units.
        const off = at % beat;
        if ((off !== 0 && off + v.len > beat) || [5, 7, 10].includes(v.len)) ties = true;
      }
      at += v.len;
    }
  return { dots, ties, triplets };
}
