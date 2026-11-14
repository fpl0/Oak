// Wave 6 (U13, Rhythm II): tapped syncopations (pushes), triplets and compound-meter rhythms against a click.
// The grade is the one rule for taps (`gradeTaps`, contracts §8.4: the auto window, coarse offset, monotone
// alignment, F1 and timing), unchanged. This module adds what the feedback needs to be about the rhythm and not
// about "note 5": every target onset knows what it is in the bar (a beat, an off-beat, a push, a note of a
// triplet), each gets its early/late reading, and three mistakes are named for what they are:
//   - a push that landed on the beat it should come before (`tap.push-on-beat`), or late, leaning toward it;
//   - a triplet that came out as two-plus-one or as even eighths (`tap.triplet-uneven`);
//   - a compound bar tapped in quarter notes, three to the bar in 6/8 (`tap.grouping`).
// None of them changes `pass`: a push tapped on the beat already misses its window by an eighth.
import type { Diagnostic, LearnerProfile, MeterId, MeterSpec, Rat, TapTolerance } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { median } from "./math.ts";
import { gradeTaps } from "./taps.ts";
import type { TapResult } from "./types.ts";

const EPS = 1e-6;

/** What an onset is in its bar. */
export type RhythmOnsetKind =
  /** On a tempo unit: a quarter in 4/4, a dotted quarter in 6/8. */
  | "beat"
  /** The "&" of a simple beat, with a note on the beat after it (or none close enough to push to). */
  | "offbeat"
  /** A sixteenth of a simple beat (e, a), or an eighth of a compound beat (la, li). */
  | "sub"
  /** A third of a simple beat: -trip, -let. */
  | "triplet"
  /** An anticipation: off the beat, the last onset before a beat that has no onset of its own. */
  | "push";

export interface RhythmGrid {
  /** AudioContext time of bar 1, beat 1; taps are on the same clock (tap latency removed). */
  downbeat: number;
  /** Beats per minute in the meter's tempo unit (contracts §6.9): the dotted quarter in 6/8 and 12/8. */
  bpm: number;
  /** Default "4/4". */
  meter?: MeterId;
}
export interface RhythmPattern extends RhythmGrid {
  /** Target onsets in bars from the downbeat (1 cycle = 1 bar): numbers or exact fractions. */
  onsets: readonly (number | Rat)[];
  /**
   * The pattern loops after this many bars: an off-beat at the very end is then judged against bar 1's downbeat
   * (a push only when the loop does not start with a note). Without it, a last off-beat with nothing after it is
   * a push to the next bar.
   */
  bars?: number;
}

const meterOf = (g: Pick<RhythmGrid, "meter">): MeterSpec => METERS[g.meter ?? "4/4"];
const num = (x: number | Rat): number => (typeof x === "number" ? x : x[0] / x[1]);
const near = (a: number, b: number, tol = EPS) => Math.abs(a - b) <= tol;

/** Seconds one beat (tempo unit) and one bar last. */
export function rhythmBeatSec(grid: Pick<RhythmGrid, "bpm">): number {
  return 60 / grid.bpm;
}
export function rhythmBarSec(grid: Pick<RhythmGrid, "bpm" | "meter">): number {
  return rhythmBeatSec(grid) * meterOf(grid).unitsPerBar;
}

/** The pattern's onsets as tap targets, in seconds, in time order. */
export function rhythmTargets(pattern: RhythmPattern): number[] {
  const bar = rhythmBarSec(pattern);
  return pattern.onsets.map((o) => pattern.downbeat + num(o) * bar).sort((a, b) => a - b);
}

/**
 * The beats of `bars` bars, in bars from the downbeat: four a bar in 4/4, TWO a bar in 6/8 (the dotted quarter is
 * the beat, contracts §6.9), four in 12/8. What a tap step with target "beat" asks for. With `closing`, the
 * downbeat after the last bar is added (a take that ends on "one").
 */
export function beatOnsets(meter: MeterId, bars: number, opts: { closing?: boolean } = {}): number[] {
  const m = METERS[meter];
  const out: number[] = [];
  for (let b = 0; b < bars; b++) for (let u = 0; u < m.unitsPerBar; u++) out.push(b + u / m.unitsPerBar);
  if (opts.closing) out.push(bars);
  return out;
}

export interface RhythmOnset {
  /** Index into the sorted targets. */
  index: number;
  /** 0-based bar and position inside it (0 to 1). */
  bar: number;
  pos: number;
  /** 1-based beat number inside the bar, and how far into that beat the onset sits (0 to 1). */
  beat: number;
  inBeat: number;
  /** The count as Oak says it (contracts §6.9): "1", "2&", "3-trip", "1la"; "" off the counting grid. */
  label: string;
  kind: RhythmOnsetKind;
  /** A push: how far before its beat it sits, as a fraction of a beat (1/2: an eighth in 4/4), and that beat's time. */
  push?: { by: number; beatAt: number };
}

const SIMPLE_LABEL: readonly [number, string][] = [
  [0, ""],
  [1 / 4, "e"],
  [1 / 2, "&"],
  [3 / 4, "a"],
  [1 / 3, "-trip"],
  [2 / 3, "-let"],
];
const COMPOUND_LABEL: readonly [number, string][] = [
  [0, ""],
  [1 / 3, "la"],
  [2 / 3, "li"],
];

/**
 * What each onset of a pattern is in its bar. A push (an anticipation) is an onset off the beat, at most half a
 * beat (an eighth in 4/4; in compound meters the eighth before the beat) ahead of a beat that has no onset of its
 * own, with nothing between the two. Everything else is named by where it sits in its beat.
 */
export function classifyRhythm(pattern: RhythmPattern): RhythmOnset[] {
  const m = meterOf(pattern);
  const compound = m.tempoUnit === "dottedQuarter";
  const barSec = rhythmBarSec(pattern);
  const cycles = pattern.onsets.map(num).sort((a, b) => a - b);
  // In beats from the downbeat.
  const inBeats = cycles.map((c) => c * m.unitsPerBar);
  const onBeat = new Set(inBeats.filter((u) => near(u, Math.round(u))).map((u) => Math.round(u)));
  // A loop: the beat after the last bar is the first beat again.
  if (pattern.bars !== undefined && onBeat.has(0)) onBeat.add(Math.round(pattern.bars * m.unitsPerBar));
  return cycles.map((c, index) => {
    const u = inBeats[index] as number;
    const bar = Math.floor(c + EPS);
    const pos = Math.max(0, c - bar);
    const whole = Math.floor(u + EPS);
    const inBeat = Math.max(0, u - whole);
    const beat = whole - bar * m.unitsPerBar + 1;
    const sub = (compound ? COMPOUND_LABEL : SIMPLE_LABEL).find(([f]) => near(inBeat, f, 1e-4));
    const label = m.tempoUnit === "eighth" || !sub ? "" : `${beat}${sub[1]}`;
    let kind: RhythmOnsetKind;
    if (near(inBeat, 0, 1e-4)) kind = "beat";
    else if (!compound && (near(inBeat, 1 / 3, 1e-4) || near(inBeat, 2 / 3, 1e-4))) kind = "triplet";
    else if (!compound && near(inBeat, 1 / 2, 1e-4)) kind = "offbeat";
    else kind = "sub";
    const out: RhythmOnset = { index, bar, pos, beat, inBeat, label, kind };
    // An anticipation: the next beat is empty and this is the last onset before it.
    const nextBeat = whole + 1;
    const by = nextBeat - u;
    const nextOnset = inBeats[index + 1];
    const last = nextOnset === undefined || nextOnset > nextBeat + EPS;
    const triplet = kind === "triplet";
    if (kind !== "beat" && !triplet && by <= 0.5 + 1e-4 && !onBeat.has(nextBeat) && last) {
      out.kind = "push";
      out.push = { by, beatAt: pattern.downbeat + (nextBeat / m.unitsPerBar) * barSec };
    }
    return out;
  });
}

/** How one target went. */
export type RhythmVerdict = "on" | "early" | "late" | "missed" | "on-the-beat";
export interface RhythmOnsetReport extends RhythmOnset {
  /** AudioContext time of the target. */
  at: number;
  /** The tap matched to it (index into the sorted taps), or `null`. */
  tap: number | null;
  /**
   * Signed error of that tap, ms (positive: late); `null` when missed. Where the grade forgives a constant offset
   * (levels 1–2) it is taken out, measured on the take's on-beat notes.
   */
  errorMs: number | null;
  /**
   * `on`: inside the steady part of the window (|e| ≤ max(15 ms, 0.4 w)); `early` / `late`: matched, outside it;
   * `missed`: no tap; `on-the-beat`: a push with no tap of its own, and a tap on the beat it should come before.
   */
  verdict: RhythmVerdict;
}

export interface RhythmKindSummary {
  kind: RhythmOnsetKind;
  n: number;
  matched: number;
  /** Median signed error of the matched ones, ms; `null` when none matched. */
  medianMs: number | null;
  early: number;
  late: number;
}

/** How a tapped triplet came out, measured inside the learner's own beat. */
export type TripletShape =
  /** Three even notes: the middle ones near 1/3 and 2/3 of the beat. */
  | "even"
  /** Two sixteenths and an eighth (the middle notes near 1/4 and 1/2). */
  | "short-short-long"
  /** An eighth and two sixteenths (near 1/2 and 3/4). */
  | "long-short-short"
  /** Two taps where the beat has three. */
  | "two"
  | "uneven";
export interface TripletReport {
  /** Target index of the triplet's first note, its bar (0-based) and beat (1-based). */
  index: number;
  bar: number;
  beat: number;
  /** Where the learner's second and third taps sat in their own beat (0 to 1); fewer when taps are missing. */
  positions: number[];
  shape: TripletShape;
}

export interface RhythmTapResult extends TapResult {
  onsets: RhythmOnsetReport[];
  /** One row per kind present in the pattern, in the order beat, offbeat, sub, triplet, push. */
  kinds: RhythmKindSummary[];
  triplets: TripletReport[];
  /** Pushes that landed on the beat they anticipate (target indices). */
  pushesOnBeat: number[];
  /**
   * Compound meters: bars (0-based) tapped in quarter notes (three even taps to a 6/8 bar) where the pattern
   * has the dotted-quarter beat.
   */
  quarterBars: number[];
}

const KIND_ORDER: readonly RhythmOnsetKind[] = ["beat", "offbeat", "sub", "triplet", "push"];
/** "an eighth", "a sixteenth": what a push is early by, in the meter's words. */
export function pushWord(by: number, meter: MeterId = "4/4"): string {
  const compound = METERS[meter].tempoUnit === "dottedQuarter";
  if (compound) return near(by, 1 / 3, 1e-3) ? "an eighth" : "a little";
  if (near(by, 1 / 2, 1e-3)) return "an eighth";
  if (near(by, 1 / 4, 1e-3)) return "a sixteenth";
  if (near(by, 1 / 3, 1e-3)) return "a triplet eighth";
  return "a little";
}
const SHAPE_WORDS: Record<TripletShape, string> = {
  even: "three even notes",
  "short-short-long": "two quick notes and a long one",
  "long-short-short": "a long note and two quick ones",
  two: "two notes",
  uneven: "three uneven notes",
};
/** The plain words for a triplet's shape. */
export function tripletShapeWords(shape: TripletShape): string {
  return SHAPE_WORDS[shape];
}

/**
 * Grades a take tapped against a click on a rhythm (`rhythmTargets`) with `gradeTaps` (§8.4, unchanged) and
 * reports it onset by onset: what each target is (`classifyRhythm`), whether its tap was early or late, and, per
 * kind, the median. Named mistakes, each a diagnostic that never changes `pass`:
 *
 * - `tap.push-on-beat` (warn): pushes with no tap of their own and a tap on the beat they should come before
 *   ("your pushes are landing on the beat"); params `n`, `of`, `by` ("an eighth"), `bars`.
 * - `tap.push-late` / `tap.push-early` (warn): the matched pushes sit, by the median, more than max(20 ms, 0.4 w)
 *   later (earlier) than the on-beat taps of the same take; params `ms`, `n`.
 * - `tap.triplet-uneven` (warn): triplets that did not come out as three even notes; params `n`, `of`, `shape`.
 * - `tap.grouping` (warn, compound meters): bars tapped in quarter notes; params `n`, `meter`, `beats`, `count`.
 * - `tap.kind-timing` (info): one line per kind with at least two matched taps whose median is more than
 *   max(20 ms, 0.4 w) from the beats' median; params `kind`, `ms`, `dir`.
 */
export function gradeRhythmTaps(
  taps: readonly number[],
  pattern: RhythmPattern,
  tol: TapTolerance,
  profile: LearnerProfile,
  opts: { level?: number; levels?: number } = {},
): RhythmTapResult {
  const meter = pattern.meter ?? "4/4";
  const m = METERS[meter];
  const T = rhythmTargets(pattern);
  const A = [...taps].sort((a, b) => a - b);
  const base = gradeTaps(A, T, tol, profile, opts);
  const w = base.windowMs;
  const forgiven = tol.forgiveOffset && (opts.level ?? 1) <= 2;
  const beatSec = rhythmBeatSec(pattern);
  const barSec = rhythmBarSec(pattern);
  const steady = Math.max(15, 0.4 * w);
  const classes = classifyRhythm(pattern);
  const tapOf = new Map(base.pairs.map(([i, j]) => [i, j]));
  // The constant offset taken out of the per-onset readings when the grade forgives one (levels 1–2): measured
  // on the on-beat notes when at least two were matched, so pushes that lean toward the beat do not pull it.
  let shift = 0;
  if (forgiven && tol.tempo !== "free") {
    const onBeats = classes
      .filter((c) => c.kind === "beat" && tapOf.has(c.index))
      .map((c) => (A[tapOf.get(c.index) as number] as number) - (T[c.index] as number));
    shift = onBeats.length >= 2 ? median(onBeats) : base.offsetMs / 1000;
  }
  const extra = new Set(base.extra);

  // Per onset.
  const pushesOnBeat: number[] = [];
  const onsets: RhythmOnsetReport[] = classes.map((c) => {
    const at = T[c.index] as number;
    const j = tapOf.get(c.index);
    if (j === undefined) {
      let verdict: RhythmVerdict = "missed";
      if (c.push) {
        const beatAt = c.push.beatAt;
        const landed = [...extra].find((k) => Math.abs((A[k] as number) - shift - beatAt) * 1000 <= w + EPS);
        if (landed !== undefined) {
          verdict = "on-the-beat";
          pushesOnBeat.push(c.index);
        }
      }
      return { ...c, at, tap: null, errorMs: null, verdict };
    }
    const errorMs = ((A[j] as number) - shift - at) * 1000;
    let verdict: RhythmVerdict = Math.abs(errorMs) <= steady ? "on" : errorMs > 0 ? "late" : "early";
    // A push matched so late that it is nearer its beat than its own place.
    if (c.push && errorMs > 0.6 * c.push.by * beatSec * 1000) {
      verdict = "on-the-beat";
      pushesOnBeat.push(c.index);
    }
    return { ...c, at, tap: j, errorMs, verdict };
  });

  // Per kind.
  const kinds: RhythmKindSummary[] = KIND_ORDER.flatMap((kind) => {
    const of = onsets.filter((o) => o.kind === kind);
    if (of.length === 0) return [];
    const errs = of.map((o) => o.errorMs).filter((e): e is number => e !== null);
    return [
      {
        kind,
        n: of.length,
        matched: errs.length,
        medianMs: errs.length > 0 ? median(errs) : null,
        early: of.filter((o) => o.verdict === "early").length,
        late: of.filter((o) => o.verdict === "late" || o.verdict === "on-the-beat").length,
      },
    ];
  });
  const beatMedian = kinds.find((k) => k.kind === "beat")?.medianMs ?? 0;

  const diagnostics: Diagnostic[] = [...base.diagnostics];

  // Pushes.
  const pushes = onsets.filter((o) => o.kind === "push");
  if (pushesOnBeat.length > 0) {
    const first = onsets[pushesOnBeat[0] as number] as RhythmOnsetReport;
    const bars = [...new Set(pushesOnBeat.map((i) => (onsets[i] as RhythmOnsetReport).bar + 1))];
    diagnostics.push({
      id: "tap.push-on-beat",
      severity: "warn",
      dim: "rhythm",
      where: { slot: first.index, tSec: first.at },
      params: {
        n: pushesOnBeat.length,
        of: pushes.length,
        which: pushesWhich(pushesOnBeat.length, pushes.length),
        by: pushWord(first.push?.by ?? 0.5, meter),
        bars: bars.join(", "),
      },
    });
  }
  const pushRow = kinds.find((k) => k.kind === "push");
  const kept = pushes.filter((o) => o.errorMs !== null && o.verdict !== "on-the-beat");
  if (pushRow && kept.length >= 2) {
    const lean = median(kept.map((o) => o.errorMs as number)) - beatMedian;
    if (Math.abs(lean) > Math.max(20, 0.4 * w)) {
      diagnostics.push({
        id: lean > 0 ? "tap.push-late" : "tap.push-early",
        severity: "warn",
        dim: "timing",
        params: { ms: Math.round(Math.abs(lean)), n: kept.length, dir: lean > 0 ? "late" : "early" },
      });
    }
  }

  // Triplets: every beat whose targets are its three thirds.
  const triplets: TripletReport[] = [];
  if (m.tempoUnit === "quarter") {
    const byBeat = new Map<number, RhythmOnsetReport[]>();
    for (const o of onsets) {
      const k = Math.floor(o.pos * m.unitsPerBar + EPS) + o.bar * m.unitsPerBar;
      byBeat.set(k, [...(byBeat.get(k) ?? []), o]);
    }
    for (const [k, group] of byBeat) {
      const thirds = group.filter((o) => o.kind === "triplet");
      const head = group.find((o) => o.kind === "beat");
      if (thirds.length !== 2 || !head || group.length !== 3) continue;
      const start = pattern.downbeat + (k / m.unitsPerBar) * barSec;
      // The learner's own beat: from their tap nearest this beat to their tap nearest the next (else nominal).
      const nearest = (t: number): number | null => {
        let best: number | null = null;
        for (const a of A) {
          const x = a - shift;
          if (Math.abs(x - t) <= beatSec / 4 && (best === null || Math.abs(x - t) < Math.abs(best - t)))
            best = x;
        }
        return best;
      };
      const on = nearest(start) ?? start;
      const next = nearest(start + beatSec);
      const span = next !== null && next - on > beatSec / 2 ? next - on : beatSec;
      const inside = A.map((a) => a - shift)
        .filter((x) => x > on + 0.08 * span && x < on + 0.92 * span)
        .map((x) => (x - on) / span);
      const wFrac = w / 1000 / span;
      const at = (p: number, q: number) => Math.abs(p - q) <= Math.max(wFrac, 0.06) + EPS;
      let shape: TripletShape;
      if (inside.length === 2) {
        const [p1, p2] = inside as [number, number];
        if (at(p1, 1 / 3) && at(p2, 2 / 3) && Math.abs(p2 - p1 - 1 / 3) <= 0.09) shape = "even";
        else if (Math.abs(p1 - 1 / 4) < 0.07 && Math.abs(p2 - 1 / 2) < 0.07) shape = "short-short-long";
        else if (Math.abs(p1 - 1 / 2) < 0.07 && Math.abs(p2 - 3 / 4) < 0.07) shape = "long-short-short";
        else shape = "uneven";
      } else if (inside.length === 1) shape = "two";
      else shape = "uneven";
      triplets.push({ index: head.index, bar: head.bar, beat: head.beat, positions: inside, shape });
    }
    triplets.sort((a, b) => a.index - b.index);
    const off = triplets.filter((t) => t.shape !== "even");
    if (off.length > 0) {
      const counts = new Map<TripletShape, number>();
      for (const t of off) counts.set(t.shape, (counts.get(t.shape) ?? 0) + 1);
      const shape = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "uneven";
      const first = off[0] as TripletReport;
      diagnostics.push({
        id: "tap.triplet-uneven",
        severity: "warn",
        dim: "rhythm",
        where: { slot: first.index, tSec: T[first.index] as number },
        params: { n: off.length, of: triplets.length, shape: SHAPE_WORDS[shape], bar: first.bar + 1 },
      });
    }
  }

  // Compound meters: a bar tapped in quarter notes. The quarter pulse falls on every second eighth; the ones
  // that are not on a dotted-quarter beat and have no target of their own are the giveaway.
  const quarterBars: number[] = [];
  if (m.tempoUnit === "dottedQuarter") {
    const bars = Math.max(1, Math.ceil(Math.max(...classes.map((c) => c.bar + c.pos), 0) + EPS));
    const eighths = m.num;
    for (let b = 0; b < bars; b++) {
      const pulses: number[] = [];
      for (let e = 2; e < eighths; e += 2) if (e % 3 !== 0) pulses.push(e / eighths);
      const free = pulses.filter((p) => !classes.some((c) => c.bar === b && near(c.pos, p, 1e-4)));
      if (free.length === 0) continue;
      const hit = free.filter((p) =>
        [...extra].some(
          (k) => Math.abs((A[k] as number) - shift - (pattern.downbeat + (b + p) * barSec)) * 1000 <= w + EPS,
        ),
      );
      if (hit.length === free.length) quarterBars.push(b);
    }
    if (quarterBars.length > 0) {
      diagnostics.push({
        id: "tap.grouping",
        severity: "warn",
        dim: "rhythm",
        where: { tSec: pattern.downbeat + (quarterBars[0] as number) * barSec },
        params: {
          n: quarterBars.length,
          meter,
          beats: m.unitsPerBar,
          quarters: eighths / 2,
          count: Array.from({ length: m.unitsPerBar }, (_, i) => `${i + 1} la li`).join(" "),
        },
      });
    }
  }

  // One line per kind that sits apart from the beats.
  for (const k of kinds) {
    if (k.kind === "beat" || k.kind === "push" || k.medianMs === null || k.matched < 2) continue;
    const lean = k.medianMs - beatMedian;
    if (Math.abs(lean) > Math.max(20, 0.4 * w)) {
      diagnostics.push({
        id: "tap.kind-timing",
        severity: "info",
        dim: "timing",
        params: {
          kind: KIND_WORDS[k.kind],
          ms: Math.round(Math.abs(lean)),
          dir: lean > 0 ? "late" : "early",
        },
      });
    }
  }

  return { ...base, diagnostics, onsets, kinds, triplets, pushesOnBeat, quarterBars };
}

const KIND_WORDS: Record<RhythmOnsetKind, string> = {
  beat: "on-beat notes",
  offbeat: "off-beat notes",
  sub: "in-between notes",
  triplet: "triplet notes",
  push: "pushes",
};

/** "All 4 of your pushes", "1 of your 3 pushes", "Your push": the subject of `tap.push-on-beat`. */
export function pushesWhich(n: number, of: number): string {
  if (of <= 1) return "Your push";
  return n >= of ? `All ${of} of your pushes` : `${n} of your ${of} pushes`;
}

/**
 * Catalog texts for the ids this module adds (the grader's feedback catalog owns the wording the app shows; these
 * are the rows it was sent, and what a host without the catalog can print). Slots are the diagnostics' params.
 */
export const RHYTHM_TAP_FEEDBACK: Readonly<Record<string, string>> = {
  "tap.push-on-beat":
    "{which} landed on the beat. A push comes {by} early: tap it just before the beat, then leave the beat itself empty.",
  "tap.push-late": "Your pushes are {ms} ms late, leaning toward the beat. Let them come a little sooner.",
  "tap.push-early": "Your pushes are {ms} ms early: they come a touch sooner than the pattern has them.",
  "tap.triplet-uneven":
    "{n} of {of} triplets came out as {shape}. A triplet is three even notes to the beat: 1-trip-let.",
  "tap.grouping":
    "You tapped {quarters} even beats to the bar. {meter} has {beats} beats of three eighths: {count}.",
  "tap.kind-timing": "Your {kind} are {ms} ms {dir} against your on-beat notes.",
};

/** Renders one of this module's diagnostics with `RHYTHM_TAP_FEEDBACK`; `null` for any other id. */
export function rhythmTapText(d: Pick<Diagnostic, "id" | "params">): string | null {
  const template = RHYTHM_TAP_FEEDBACK[d.id];
  if (!template) return null;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(d.params[k] ?? ""));
}
