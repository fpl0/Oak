// Wave 6 seam (docs/design/wave6.md §3.2): what the lenses, the capstone checklists, the liner notes and the tutor
// read from a piece in U12–U17. Every view is built on the analyzers the rubric uses (`harmonySlots`, `keyOf`,
// `analysisKeyContexts`, `syncopation`, `velocityGhosts`, `isStrong`) and on `@oak/theory`'s Wave 6 calls, so a view
// and a rule can never disagree:
//   chromaticHarmonyView  each chord with its seventh, where it stands in the key (diatonic, applied, borrowed),
//                         what an applied chord points at and whether it resolves, the two guide-tone lines
//   modeView              the mode a piece or a section reads in, with its colour tone on strong beats (C6)
//   keyPlanView           the key bar by bar (a patterned `.scale()` after `arrange()`, §6.8) and each key change
//   rhythmView            pushes, ghost notes, ties and dotted values as the staff writes them, tuplets, the
//                         compound beat, syncopation
import type { Degree, KeySpec, MeterId, NEvent, Rat, SeventhQuality } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import { buildScore, scoreRhythm } from "@oak/notation";
import {
  appliedReading,
  barPosition,
  beatGrid,
  type ChordId,
  type ChromaticChordKind,
  characteristicTonesOf,
  chromaticChordKind,
  cpsToBpm,
  type GuideToneStep,
  guideToneLine,
  guideTones,
  inversionOf,
  type KeyDistance,
  keyDistance,
  METERS,
  modesContaining,
  parseChordWithBass,
  pcOf,
  romanText,
  scalePcs,
  seventhFromPcs,
  seventhQualityOf,
  type TaughtMode,
  toLeadSheet,
} from "@oak/theory";
import type { NormalizeContext, Normalized } from "../types.ts";
import type { ChordSlot } from "./chords.ts";
import { chordPerBar } from "./chords.ts";
import { mod12, onsets, pitched } from "./events.ts";
import { velocityGhosts } from "./groove.ts";
import { keyOf } from "./key.ts";
import { chordKeys, keysByBar } from "./key-plan.ts";
import { isStrong } from "./melody.ts";
import { finestGrid, gridFeel, type Syncopation, syncopation } from "./meter.ts";
import { analysisKeyContexts, harmonySlots } from "./piece.ts";
import { straightenSwungLines } from "./swing.ts";
import { selectTrack } from "./tracks.ts";

const sameKey = (a: KeySpec, b: KeySpec): boolean => a.tonic === b.tonic && a.mode === b.mode;

// --- the key plan (U17; contracts §6.8) ---------------------------------------------------------------------

export interface KeyPlanSpanView {
  /** 1-based, inclusive bars of the whole piece. */
  fromBar: number;
  toBar: number;
  key: KeySpec;
  /** Where the key was read: the code's own `.scale()`, the declared key, or an estimate. */
  source: "declared" | "scale" | "estimate";
}
export interface KeyChangeView {
  /** The 1-based bar the new key starts on. */
  bar: number;
  from: KeySpec;
  to: KeySpec;
  distance: KeyDistance;
  /** Bars the new key lasts before the next change or the end. */
  barsAfter: number;
}
export interface KeyPlanView {
  /** The track the plan was read from (the pitched learner track with the most key spans), `null` without pitch. */
  track: string | null;
  spans: KeyPlanSpanView[];
  changes: KeyChangeView[];
}
/**
 * The piece's key, bar by bar. Read from the code's own `.scale()` first (a patterned scale after `arrange()` gives
 * one span per key, contracts §6.8 item 4), then the declared key, then an estimate; a track with `.transpose()`
 * after `.scale()` is not trusted (item 3). A piece in one key has one span and no change.
 */
export function keyPlanView(n: Normalized, ctx: NormalizeContext & { code: string }): KeyPlanView {
  const tracks = analysisKeyContexts(n, ctx).filter((t) => !t.band && t.spans.length > 0);
  if (tracks.length === 0) return { track: null, spans: [], changes: [] };
  // The track that states the most keys carries the plan; a tie goes to the one that comes first in the code.
  const scaleSpans = (t: (typeof tracks)[number]): number =>
    t.spans.filter((s) => s.source === "scale").length;
  const best = [...tracks].sort(
    (a, b) => scaleSpans(b) - scaleSpans(a) || b.spans.length - a.spans.length,
  )[0];
  if (!best) return { track: null, spans: [], changes: [] };
  const spans: KeyPlanSpanView[] = [];
  for (const s of best.spans) {
    const last = spans[spans.length - 1];
    if (last && sameKey(last.key, s.key)) last.toBar = Math.max(last.toBar, s.toBar);
    else spans.push({ fromBar: s.fromBar, toBar: s.toBar, key: s.key, source: s.source });
  }
  // A span ends where the next begins: an event-based span stops at its last note, the key holds to the change.
  spans.forEach((s, i) => {
    const next = spans[i + 1];
    if (next) s.toBar = next.fromBar - 1;
  });
  const changes = spans.slice(1).map((s, i) => {
    const from = (spans[i] as KeyPlanSpanView).key;
    return {
      bar: s.fromBar,
      from,
      to: s.key,
      distance: keyDistance(from, s.key),
      barsAfter: s.toBar - s.fromBar + 1,
    };
  });
  return { track: best.track, spans, changes };
}
/** The key in force at a 1-based bar of a plan; `null` when the plan is empty. */
export function keyAtBarOf(view: Pick<KeyPlanView, "spans">, bar: number): KeySpec | null {
  const hit = view.spans.find((s) => bar >= s.fromBar && bar <= s.toBar);
  if (hit) return hit.key;
  const before = [...view.spans].reverse().find((s) => s.fromBar <= bar);
  return (before ?? view.spans[0])?.key ?? null;
}

// --- sevenths, applied and borrowed chords, guide tones (U12, U15, U16) -------------------------------------

export interface ChordColourView {
  /** 1-based bar and beat (in tempo units) where the chord starts; with a pickup, cycle 0 is bar 0. */
  bar: number;
  beat: number;
  at: Rat;
  chord: ChordId;
  /** Lead-sheet display in root position: "Dm7", "A♭". */
  symbol: string;
  /** 0 root position, 1 the 3rd in the bass, 2 the 5th, 3 the 7th (read from the lowest sounding note). */
  inversion: 0 | 1 | 2 | 3;
  /**
   * Where the chord's identity came from (contracts §6.7 rule 2): its `chord()` symbol always; its notes only for a
   * hand-voiced chord.
   */
  source: "symbol" | "notes";
  /** The key in force at this bar (the key plan's), and the numeral in it: "V7/V", "bVI", "ii7". */
  key: KeySpec;
  rn: string;
  /** One of the five seventh qualities, or `null` for a triad (or a hand-voiced chord whose notes hold no 7th). */
  seventh: SeventhQuality | null;
  kind: ChromaticChordKind;
  /** Applied chords: the numeral of the chord it points at ("V"), and whether the next chord is that chord. */
  target: string | null;
  resolves: boolean | null;
  /** The numeral of the chord that follows, `null` at the end. */
  next: string | null;
  /** The chord's 3rd and 7th, spelled ("F#", "C"); `null` where it has none. */
  guide: { third: string | null; seventh: string | null };
}
export interface ChromaticHarmonyView {
  chords: ChordColourView[];
  /** How many chords are applied, how many of those resolve, how many are borrowed. */
  applied: number;
  appliedResolved: number;
  borrowed: number;
  /** The two guide-tone lines through the chords (`@oak/theory` `guideToneLine`), aligned with `chords`. */
  guideLines: { fromThird: (GuideToneStep | null)[]; fromSeventh: (GuideToneStep | null)[] };
}
/**
 * Every chord of the piece as U12–U16 read it. The numeral is read in the key in force at the chord's bar, so a
 * piece that changes key keeps its numerals right after the change.
 */
export function chromaticHarmonyView(
  n: Normalized,
  ctx: NormalizeContext & { code?: string; bars?: number },
): ChromaticHarmonyView {
  const slots = harmonySlots(n).filter((s): s is ChordSlot & { chord: ChordId } => s.chord !== null);
  const pieceKey = keyOf(n.all, ctx.key ?? null);
  // The key in force at each chord, exactly as the rubric reads it (`keysByBar`, `chordKeys`): the declared key
  // until the code's own scale moves, and the dominant that leads into a new key read in that key. A rule
  // ("a secondary dominant that resolves") and this view therefore name every chord alike.
  const reach = n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const keys = pieceKey
    ? chordKeys(
        slots,
        keysByBar(n, Math.max(1, ctx.bars ?? 0, reach), {
          key: ctx.key ?? null,
          ...(ctx.code !== undefined ? { code: ctx.code } : {}),
          pickup: !!ctx.pickup,
        }),
        pieceKey,
      )
    : [];
  const chords: ChordColourView[] = [];
  slots.forEach((s, i) => {
    const p = barPosition(s.span[0], ctx.meter, ctx.pickup);
    const key = keys[i] ?? pieceKey;
    if (!key) return;
    const next = slots[i + 1]?.chord;
    const fromSymbol = s.symbol !== undefined && parseChordWithBass(s.symbol) !== null;
    const seventh = fromSymbol
      ? seventhQualityOf(s.chord)
      : (seventhFromPcs(s.midis.map(mod12), mod12(s.bassMidi ?? s.midis[0] ?? s.chord.rootPc))?.quality ??
        null);
    // Identity is the chord in root position; a default `voicing()` often has the 3rd or 5th lowest (§6.7 item 5),
    // so the figure is reported apart and never changes the numeral.
    const root: ChordId = { ...s.chord, bassPc: s.chord.rootPc };
    const nextRoot: ChordId | undefined = next ? { ...next, bassPc: next.rootPc } : undefined;
    const after = slots[i + 2]?.chord;
    const applied = appliedReading(root, key, nextRoot);
    const g = guideTones(root);
    chords.push({
      bar: p.bar,
      beat: p.beat,
      at: s.span[0],
      chord: s.chord,
      symbol: toLeadSheet(root),
      inversion: inversionOf(s.chord),
      source: fromSymbol ? "symbol" : "notes",
      key,
      rn: romanText(root, key, nextRoot),
      seventh,
      kind: chromaticChordKind(root, key, nextRoot),
      target: applied ? applied.target.rn : null,
      resolves: applied ? applied.resolves : null,
      next: nextRoot
        ? romanText(nextRoot, key, after ? { ...after, bassPc: after.rootPc } : undefined)
        : null,
      guide: { third: g.third?.name ?? null, seventh: g.seventh?.name ?? null },
    });
  });
  const list = chords.map((c) => c.chord);
  return {
    chords,
    applied: chords.filter((c) => c.kind === "applied").length,
    appliedResolved: chords.filter((c) => c.kind === "applied" && c.resolves).length,
    borrowed: chords.filter((c) => c.kind === "borrowed").length,
    guideLines: {
      fromThird: guideToneLine(list, { start: "third" }),
      fromSeventh: guideToneLine(list, { start: "seventh" }),
    },
  };
}

// --- modes (U14, C6) -------------------------------------------------------------------------------------------

export interface ModeView {
  /** The tonic the piece is read on: the declared or `.scale()` key's, else the estimate's. `null` without pitch. */
  tonic: string | null;
  /** The mode the code states (`.scale("D4:dorian")`) or the brief declares; `null` when neither names a mode. */
  stated: KeySpec | null;
  /** The taught modes on the tonic whose scale holds every note, brightest first (one, when the colour tone sounds). */
  fits: TaughtMode[];
  /** The colour tone of `stated` (or of the only mode that fits): how often it sounds, and on strong beats. */
  characteristic: {
    degree: Degree;
    display: string;
    name: string;
    count: number;
    strong: number;
    noteIds: string[];
  } | null;
  /** Notes outside `stated`'s scale (a leading tone in Mixolydian, a ♭6 in Dorian), by event id. */
  outside: string[];
  /** Share of bars whose chord sits on the tonic (C6: at least 0.4); `null` without chords. */
  tonicChordShare: number | null;
}
/**
 * The mode of a piece, or of the bars `[from, to)` (0-based cycles) of it: a section of an arranged piece. The
 * `mode` rule (C6: the colour tone on a strong beat at least twice, no leading tone in Mixolydian, the tonic chord
 * in 40 % of bars) asks the same questions with the same analyzers.
 */
export function modeView(
  n: Normalized,
  ctx: NormalizeContext & { bars?: number; span?: readonly [number, number] },
): ModeView {
  const within = (e: NEvent): boolean =>
    !ctx.span || (R.floor(e.onset) >= ctx.span[0] && R.floor(e.onset) < ctx.span[1]);
  const notes = pitched(n.all).filter(within);
  const stated = keyOf(notes, ctx.key ?? null);
  if (notes.length === 0 || !stated)
    return { tonic: null, stated: null, fits: [], characteristic: null, outside: [], tonicChordShare: null };
  const tonicPc = pcOf(stated.tonic);
  const fits = modesContaining(
    notes.map((e) => e.midi),
    tonicPc,
  );
  const colourKey: KeySpec | null =
    characteristicTonesOf(stated).length > 0
      ? stated
      : fits.length === 1
        ? { tonic: stated.tonic, mode: fits[0] as TaughtMode }
        : null;
  const tone = colourKey ? characteristicTonesOf(colourKey)[0] : undefined;
  const hits = tone ? notes.filter((e) => mod12(e.midi) === tone.pc) : [];
  const scale = new Set<number>(scalePcs(stated));
  const from = ctx.span?.[0] ?? 0;
  const to = ctx.span?.[1] ?? ctx.bars ?? notes.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const perBar = chordPerBar(harmonySlots(n), to).slice(from);
  const withChord = perBar.some((c) => c !== null);
  return {
    tonic: stated.tonic,
    stated,
    fits,
    characteristic: tone
      ? {
          degree: tone.degree,
          display: tone.display,
          name: tone.name,
          count: hits.length,
          strong: hits.filter((e) => isStrong(e.onset, ctx.meter, "strong")).length,
          noteIds: hits.map((e) => e.id),
        }
      : null,
    outside: notes.filter((e) => !scale.has(mod12(e.midi))).map((e) => e.id),
    tonicChordShare: withChord
      ? perBar.filter((c) => c !== null && c.rootPc === tonicPc).length / Math.max(1, perBar.length)
      : null,
  };
}
// --- rhythm II (U13) --------------------------------------------------------------------------------------------

export interface PushView {
  id: string;
  /** Where the note starts and the beat it anticipates (both in cycles). */
  onset: Rat;
  beat: Rat;
  /** How early it comes: an eighth or a sixteenth of the meter. */
  by: 8 | 16;
  /** True when the anticipated beat is beat 1 of the next bar: the push crosses the bar line. */
  acrossBar: boolean;
}
export interface TupletView {
  /** 1-based bar and beat (tempo unit) the group starts on. */
  bar: number;
  beat: number;
  /** Equal parts the beat (or `span` beats) is cut into: 3 for a triplet. */
  division: number;
  /** Beats the group spans: 1 for an eighth-note triplet, 2 for a quarter-note triplet. */
  span: number;
}
export interface TrackRhythmView {
  track: string;
  /** Anticipations: a note that starts an eighth or a sixteenth before a beat and holds through it (`.early()`). */
  pushes: PushView[];
  /** Ghost notes: effective gain at most 0.4 (`.velocity()`), by event id; `ghostsOffbeat` only on the 16th off-beats. */
  ghosts: string[];
  ghostsOffbeat: string[];
  /** As the staff writes the line: notes tied over a beat or a bar line, dotted values, and whether it is exact. */
  written: { ties: number; tiesAcrossBar: number; dotted: number; exact: boolean };
  tuplets: TupletView[];
  /** How the beat divides in this line: in twos, in threes (compound meter, or triplets throughout), or both. */
  feel: "binary" | "ternary" | "mixed" | "beat";
  syncopation: Pick<Syncopation, "total" | "count" | "perBar">;
}
export interface RhythmView {
  meter: MeterId;
  /** The tempo unit: a dotted quarter in 6/8, 9/8 and 12/8 (contracts §6.9), else a quarter (or an eighth). */
  tempoUnit: "quarter" | "dottedQuarter" | "eighth";
  compound: boolean;
  /** Beats per bar and the BPM that counts them. */
  beats: number;
  bpm: number;
  tracks: TrackRhythmView[];
}

/** The anticipations of one line (shared by `rhythmView` and by rules that count pushes). */
export function pushesOf(events: readonly NEvent[], meter: MeterId): PushView[] {
  const m = METERS[meter];
  if (m.tempoUnit === "eighth") return [];
  const grid = beatGrid(meter);
  const eighth: Rat = m.den === 8 ? rat(1, m.num) : rat(1, m.num * 2);
  const sixteenth = R.div(eighth, rat(2));
  const starts = new Set(onsets(events).map((o) => `${o[0]}/${o[1]}`));
  const isBeat = (at: Rat): boolean => (R.frac(at)[0] * grid.beats) % R.frac(at)[1] === 0;
  const out: PushView[] = [];
  for (const e of events) {
    if (isBeat(e.onset)) continue;
    for (const [by, len] of [
      [8, eighth],
      [16, sixteenth],
    ] as const) {
      if (by === 16 && grid.compound) continue;
      const beat = R.add(e.onset, len);
      if (!isBeat(beat)) continue;
      const end = R.add(e.onset, e.clipDur ?? e.dur);
      // It anticipates the beat only if it holds through it and nothing of the line starts on the beat.
      if (R.lte(end, beat) || starts.has(`${beat[0]}/${beat[1]}`)) continue;
      out.push({ id: e.id, onset: e.onset, beat, by, acrossBar: R.floor(beat) > R.floor(e.onset) });
      break;
    }
  }
  return out;
}

/**
 * The tuplet groups of one line: a beat cut into equal parts the meter does not give it. In a simple meter that is
 * 3, 5, 6 or 7 (a triplet where the beat divides in two), over one beat or over two (a quarter-note triplet); in a
 * compound meter 2 or 4 (a duplet where the beat divides in three).
 */
export function tupletsOf(events: readonly NEvent[], meter: MeterId): TupletView[] {
  const m = METERS[meter];
  if (m.tempoUnit === "eighth") return [];
  const compound = m.tempoUnit === "dottedQuarter";
  const out: TupletView[] = [];
  const on = onsets(events, { dedupe: true });
  const bars = on.reduce((mx, o) => Math.max(mx, R.floor(o) + 1), 0);
  const divisionOf = (from: Rat, to: Rat): number | null => {
    const inside = on.filter((o) => R.lte(from, o) && R.lt(o, to));
    if (inside.length < 2) return null;
    // The smallest equal division of the window that holds every onset in it.
    let den = 1;
    for (const o of inside) den = lcm(den, R.div(R.sub(o, from), R.sub(to, from))[1]);
    if (compound) return den % 3 !== 0 && den > 1 && den <= 8 ? den : null;
    const odd = oddPart(den);
    return odd > 1 ? (den <= 7 ? den : odd) : null;
  };
  const at = (bar: number, beat: number): Rat => R.add(rat(bar), rat(beat, m.unitsPerBar));
  for (let bar = 0; bar < bars; bar++) {
    const taken = new Set<number>();
    // A quarter-note triplet first: two beats cut in three (an eighth-note triplet cuts those two beats in six).
    if (!compound)
      for (let beat = 0; beat + 2 <= m.unitsPerBar; beat += 2) {
        if (divisionOf(at(bar, beat), at(bar, beat + 2)) !== 3) continue;
        taken.add(beat).add(beat + 1);
        out.push({ bar: bar + 1, beat: beat + 1, division: 3, span: 2 });
      }
    for (let beat = 0; beat < m.unitsPerBar; beat++) {
      if (taken.has(beat)) continue;
      const d = divisionOf(at(bar, beat), at(bar, beat + 1));
      if (d !== null) out.push({ bar: bar + 1, beat: beat + 1, division: d, span: 1 });
    }
  }
  return out.sort((a, b) => a.bar - b.bar || a.beat - b.beat);
}
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;
const oddPart = (x: number): number => {
  let v = x;
  while (v % 2 === 0 && v > 1) v /= 2;
  return v;
};

/**
 * The rhythm of each learner track as U13 reads it. `tracks` limits the lines (labels or roles, as `selectTrack`
 * takes them); default: every learner track with events.
 */
export function rhythmView(
  n: Normalized,
  ctx: NormalizeContext & { bars?: number; tracks?: readonly string[]; code?: string },
): RhythmView {
  const m = METERS[ctx.meter];
  const names = ctx.tracks ?? Object.keys(n.byTrack).filter((t) => !t.startsWith("band."));
  const bars = ctx.bars ?? n.all.reduce((mx, e) => Math.max(mx, R.floor(e.onset) + 1), 0);
  const tracks: TrackRhythmView[] = [];
  for (const name of names) {
    const events = ctx.tracks ? selectTrack(n, name) : (n.byTrack[name] ?? []);
    if (events.length === 0) continue;
    // A swung line is long–short eighths, not triplets: its tuplets and feel are read straightened.
    const straight = straightenSwungLines(events, ctx.code);
    const s = syncopation(events, ctx.meter);
    tracks.push({
      track: name,
      pushes: pushesOf(events, ctx.meter),
      ghosts: velocityGhosts(events, { meter: ctx.meter }).map((e) => e.id),
      ghostsOffbeat: velocityGhosts(events, { meter: ctx.meter, on: "16th-offbeat" }).map((e) => e.id),
      written: writtenRhythm(events, ctx, bars),
      tuplets: tupletsOf(straight, ctx.meter),
      feel: gridFeel(finestGrid(onsets(straight), ctx.meter), ctx.meter),
      syncopation: { total: s.total, count: s.count, perBar: s.perBar },
    });
  }
  return {
    meter: ctx.meter,
    tempoUnit: m.tempoUnit,
    compound: m.tempoUnit === "dottedQuarter",
    beats: m.unitsPerBar,
    bpm: Math.round(cpsToBpm(n.cps, ctx.meter) * 100) / 100,
    tracks,
  };
}

/** Ties and dotted values of one line, counted on the score `@oak/notation` engraves for it (`scoreRhythm`). */
function writtenRhythm(
  events: readonly NEvent[],
  ctx: NormalizeContext,
  bars: number,
): TrackRhythmView["written"] {
  const pitchedLine = events.some((e) => e.midi !== null);
  const score = buildScore({
    events: [...events],
    meter: METERS[ctx.meter],
    key: ctx.key ?? null,
    bars: Math.max(1, bars),
    staff: pitchedLine ? "auto" : "percussion",
    ...(ctx.swing ? { swing: ctx.swing } : {}),
    ...(ctx.pickup ? { pickup: ctx.pickup } : {}),
  });
  const r = scoreRhythm(score);
  return { ties: r.ties, tiesAcrossBar: r.tiesAcrossBar, dotted: r.dotted, exact: r.exact };
}
