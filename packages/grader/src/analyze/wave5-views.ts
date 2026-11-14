// Wave 5 seam (docs/design/wave5.md §3.2): the analysed piece for U08–U11 and C3–C5 — the sections of the
// per-track `arrange()` with features for contrast and the energy curve (form view), the bass line against the
// chords and the kick (bass view), the 12-bar form (blues view) and swing per track (swing view). Built on the
// same functions the rubric rules use (`sectionsFromAst`, `energyCurve`, `harmonySlots`, `grooveLock`,
// `bluesForm`, `swingRatio`), so a view never disagrees with a grade. Every view reads minor keys like major ones.
import type { KeySpec, MeterId, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import {
  type ApproachKind,
  approachKind,
  type BassRole,
  barPosition,
  bassRole,
  isDominantSeventhSymbol,
  METERS,
  type TwelveBarForm,
  toLeadSheet,
} from "@oak/theory";
import type { NormalizeContext, Normalized, SectionInfo } from "../types.ts";
import { type BluesForm, bluesForm, type ChordSlot, chordPerBar, harmonicRhythm, slotAt } from "./chords.ts";
import { mean, num, onsets, pitched } from "./events.ts";
import { energyCurve, formLabels } from "./form.ts";
import { type GrooveLock, grooveLock } from "./groove.ts";
import { keyOf } from "./key.ts";
import { harmonySlots } from "./piece.ts";
import { sectionsFromAst } from "./sections.ts";
import { type SwingMeasure, swingRatio } from "./swing.ts";
import { selectTrack, tracksOfRole } from "./tracks.ts";

const learnerTracks = (n: Normalized): string[] =>
  Object.keys(n.byTrack)
    .filter((t) => !t.startsWith("band."))
    .sort();
const inBars = (events: readonly NEvent[], from: number, to: number): NEvent[] =>
  events.filter((e) => {
    const c = R.floor(e.onset);
    return c >= from && c < to;
  });
const lastBar = (n: Normalized): number => n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);

// --- form ---------------------------------------------------------------------------------------------

/** The features a section is compared on (contracts §6.6 C3 "contrast on ≥ 2 axes"; ux form map). */
export interface SectionFeatures {
  /** Onsets per bar over the learner's tracks. */
  density: number;
  /** Mean MIDI of the melody (skyline); `null` without a melody. */
  meanPitch: number | null;
  /** Lowest and highest pitched note; `null` when the section has no pitch. */
  low: number | null;
  high: number | null;
  /** Learner tracks that play in the section (instrumentation), sorted by label. */
  instrumentation: string[];
  /** Mean gain of the section's notes (loudness proxy, 0 when silent). */
  loudness: number;
  /** Chord changes per bar. */
  harmonicRhythm: number;
  /** Mean of the energy curve over the section's bars (0–1). */
  energy: number;
}
export interface FormSectionView extends SectionInfo {
  /** Arranged learner tracks that sound in this section (a `silence` section drops its track). */
  tracks: string[];
  features: SectionFeatures;
}
export type FormView =
  | { kind: "sections"; sections: FormSectionView[]; totalBars: number; energy: number[] }
  /** The arranged tracks disagree (contracts §6.3 item 3): the form rules fail with `form.inconsistent-arrange`. */
  | { kind: "inconsistent"; track: string; detail: string; totalBars: number; energy: number[] }
  /** No `arrange()`: phrase letters from the music (`formLabels`, 4-bar phrases), for the form lens only. */
  | { kind: "through"; letters: string; phraseBars: number; totalBars: number; energy: number[] };

/** Features of bars `[from, to)` of a piece. */
export function sectionFeatures(
  n: Normalized,
  span: readonly [number, number],
  energy?: readonly number[],
): SectionFeatures {
  const [from, to] = span;
  const bars = Math.max(1, to - from);
  const tracks = learnerTracks(n);
  const per = tracks.map((t) => [t, inBars(n.byTrack[t] ?? [], from, to)] as const);
  const all = per.flatMap(([, ev]) => ev);
  const mel = pitched(inBars(selectTrack(n, "@melody"), from, to));
  const ms = pitched(all).map((e) => e.midi);
  const slots = harmonySlots(n).filter((s) => s.chord);
  const hr = harmonicRhythm(slots, to).slice(from, to);
  const curve = energy ?? energyCurve(n.byTrack, to);
  return {
    density: all.length / bars,
    meanPitch: mel.length === 0 ? null : mean(mel.map((e) => e.midi)),
    low: ms.length === 0 ? null : Math.min(...ms),
    high: ms.length === 0 ? null : Math.max(...ms),
    instrumentation: per.filter(([, ev]) => ev.length > 0).map(([t]) => t),
    loudness: all.length === 0 ? 0 : mean(all.map((e) => e.gain)),
    harmonicRhythm: hr.length === 0 ? 0 : mean(hr),
    energy: curve.length === 0 ? 0 : mean(curve.slice(from, to)),
  };
}

/**
 * The form of a piece: the section list of the per-track `arrange()` (label, tag, start and length in bars, the
 * tracks that sound in it, its features) and the energy curve per bar (0–1, `energyCurve`). Without `arrange()`
 * the view gives phrase letters for the form lens; the form rules still need sections.
 */
export function formView(n: Normalized, ctx: { code: string; bars?: number }): FormView {
  const ast = sectionsFromAst(ctx.code);
  if (ast && "inconsistent" in ast) {
    const total = ctx.bars ?? lastBar(n);
    return {
      kind: "inconsistent",
      ...ast.inconsistent,
      totalBars: total,
      energy: energyCurve(n.byTrack, total),
    };
  }
  if (!ast) {
    const total = ctx.bars ?? lastBar(n);
    return {
      kind: "through",
      letters: formLabels(n.byTrack, total),
      phraseBars: 4,
      totalBars: total,
      energy: energyCurve(n.byTrack, total),
    };
  }
  const energy = energyCurve(n.byTrack, ast.totalBars);
  const sections = ast.sections.map((s) => {
    const features = sectionFeatures(n, [s.startBar, s.startBar + s.bars], energy);
    return { ...s, tracks: features.instrumentation, features };
  });
  return { kind: "sections", sections, totalBars: ast.totalBars, energy };
}

/** The contrast axes of contracts §6.6 (C3) and the ux form map, with the rubric's default thresholds. */
export const CONTRAST_AXES = [
  "density",
  "register",
  "instrumentation",
  "loudness",
  "harmonic-rhythm",
  "pitch",
  "energy",
] as const;
export type ContrastAxis = (typeof CONTRAST_AXES)[number];
export const CONTRAST_THRESHOLDS = {
  pitchSemis: 3,
  densityRatio: 0.25,
  registerSemis: 5,
  energyDelta: 0.15,
  loudnessDelta: 0.15,
  harmonicRhythmDelta: 0.5,
} as const;
/** The axes on which two sections differ enough to count as contrast (the form lens; the `contrast` rule grades). */
export function contrastAxes(
  a: SectionFeatures,
  b: SectionFeatures,
  th = CONTRAST_THRESHOLDS,
): ContrastAxis[] {
  const out: ContrastAxis[] = [];
  const maxD = Math.max(a.density, b.density);
  if (maxD > 0 && Math.abs(a.density - b.density) / maxD >= th.densityRatio) out.push("density");
  if (
    a.low !== null &&
    b.low !== null &&
    a.high !== null &&
    b.high !== null &&
    (Math.abs(a.low - b.low) >= th.registerSemis || Math.abs(a.high - b.high) >= th.registerSemis)
  )
    out.push("register");
  const ia = new Set(a.instrumentation);
  if (a.instrumentation.length !== b.instrumentation.length || b.instrumentation.some((t) => !ia.has(t)))
    out.push("instrumentation");
  if (Math.abs(a.loudness - b.loudness) >= th.loudnessDelta) out.push("loudness");
  if (Math.abs(a.harmonicRhythm - b.harmonicRhythm) >= th.harmonicRhythmDelta) out.push("harmonic-rhythm");
  if (a.meanPitch !== null && b.meanPitch !== null && Math.abs(a.meanPitch - b.meanPitch) >= th.pitchSemis)
    out.push("pitch");
  if (Math.abs(a.energy - b.energy) >= th.energyDelta) out.push("energy");
  return out;
}

// --- bass --------------------------------------------------------------------------------------------

export interface BassNoteView {
  id: string;
  midi: number;
  onset: Rat;
  /** 1-based; 0 is the pickup bar. */
  bar: number;
  beat: number;
  /** On beat 1 of its bar. */
  downbeat: boolean;
  /** The chord sounding (lead-sheet symbol), `null` with no chord. */
  chord: string | null;
  role: BassRole | null;
  /** How it leads into the next chord's root, when it is the last note before a change. */
  approach: ApproachKind | null;
  /** A kick sounds at the same onset. */
  onKick: boolean;
}
export interface BassView {
  /** The bass track read (`@bass`), `null` when the piece has none. */
  track: string | null;
  notes: BassNoteView[];
  /** Share of chord changes whose first bass note is the chord's root (U08.L01 "roots down low"). */
  rootOnChange: number;
  /** Kick/bass lock (contracts §6.6 C3 `groove-lock`); `null` without a kick. */
  groove: GrooveLock | null;
}

const kicksOf = (n: Normalized): Rat[] => {
  const drums = tracksOfRole(n, "drums").flatMap((t) => n.byTrack[t] ?? []);
  const kicks = drums.filter((e) => e.drum === "kick");
  return onsets(kicks);
};

/**
 * Bass notes against chord slots: role, approach and kick per note (the `bass-line` rule and `bassView` share it).
 * `slots` should leave the bass line out of naming the chords (`pieceSlots(n, harmony, { exclude })`).
 */
export function bassNotes(
  bass: readonly NEvent[],
  slots: readonly ChordSlot[],
  ctx: NormalizeContext & { kicks?: readonly Rat[] },
): { notes: BassNoteView[]; changes: number; rootsOnChange: number } {
  const key: KeySpec | null = ctx.key ?? null;
  const line = pitched(bass);
  // A chord struck again is no change (`.struct("x ~ x ~")`: one chord a bar, two strokes): consecutive slots of
  // one chord are one slot, so a root then a 5th under it is a root on the change (U17.L04).
  const named: ChordSlot[] = [];
  for (const s of slots) {
    if (!s.chord) continue;
    const last = named[named.length - 1];
    if (last?.chord && last.chord.rootPc === s.chord.rootPc && last.chord.quality === s.chord.quality)
      named[named.length - 1] = { ...last, span: [last.span[0], R.max(last.span[1], s.span[1])] };
    else named.push(s);
  }
  const kicks = ctx.kicks ?? [];
  let changes = 0;
  let rootsOnChange = 0;
  let lastSlot: ChordSlot | undefined;
  let rootMidi: number | null = null;
  // A bass note on the beat under comping that enters just after it (`"~ x ~ ~ x ~ ~ ~"`: the chord comes on the
  // & of 1) belongs to the chord that enters while it sounds, within the same beat and bar (U12.L06's held bass).
  const beat: Rat = [1, METERS[ctx.meter].unitsPerBar];
  const slotOf = (e: NEvent): ChordSlot | undefined => {
    const here = slotAt(named, e.onset);
    const next = named.find((s) => R.lt(e.onset, s.span[0]));
    if (
      next &&
      next !== here &&
      R.lt(R.sub(next.span[0], e.onset), beat) &&
      Math.floor(num(next.span[0])) === Math.floor(num(e.onset)) &&
      R.lt(next.span[0], R.add(e.onset, e.dur))
    )
      return next;
    return here;
  };
  const notes = line.map((e, i) => {
    const slot = slotOf(e);
    const chord = slot?.chord ?? null;
    if (slot !== lastSlot) {
      rootMidi = null;
      if (chord) {
        changes++;
        if ((((e.midi - chord.rootPc) % 12) + 12) % 12 === 0) rootsOnChange++;
      }
      lastSlot = slot;
    }
    const next = line[i + 1];
    const nextSlot = next ? slotOf(next) : undefined;
    const beforeChange = !!next && !!nextSlot && nextSlot !== slot;
    const nextChord = nextSlot?.chord ?? null;
    const role = chord ? bassRole(e.midi, chord, { rootMidi, nextChord, beforeChange, key }) : null;
    if (chord && role === "root" && rootMidi === null) rootMidi = e.midi;
    const pos = barPosition(e.onset, ctx.meter, ctx.pickup);
    return {
      id: e.id,
      midi: e.midi,
      onset: e.onset,
      bar: pos.bar,
      beat: pos.beat,
      downbeat: R.isInt(e.onset),
      chord: chord ? (slot?.symbol ?? toLeadSheet(chord)) : null,
      role,
      approach: beforeChange && nextChord ? approachKind(e.midi, nextChord, key) : null,
      onKick: kicks.some((k) => R.eq(k, e.onset)),
    };
  });
  return { notes, changes, rootsOnChange };
}

/** The bass line against the chords (root, fifth, octave, approach) and against the kick. */
export function bassView(n: Normalized, ctx: NormalizeContext & { bars?: number }): BassView {
  const track = tracksOfRole(n, "bass")[0] ?? null;
  const bass = track ? (n.byTrack[track] ?? []) : [];
  const key = keyOf(n.all, ctx.key ?? null);
  const kicks = kicksOf(n);
  const { notes, changes, rootsOnChange } = bassNotes(bass, harmonySlots(n), {
    ...ctx,
    ...(key ? { key } : {}),
    kicks,
  });
  return {
    track,
    notes,
    rootOnChange: changes === 0 ? 0 : rootsOnChange / changes,
    groove: kicks.length === 0 ? null : grooveLock(kicks, onsets(pitched(bass)), rat(0), rat(1, 16)),
  };
}

// --- the 12-bar form -----------------------------------------------------------------------------------

export interface BluesView {
  /** The variant the bars follow, `null` when no full chorus fits (contracts §6.6 C5 `blues-form`). */
  form: (TwelveBarForm & { jazz: boolean }) | null;
  choruses: number;
  /** 1-based bars that break the closest variant. */
  wrongBars: number[];
  /** Per bar: the chord symbol (lead sheet), `null` for a bar with no chord. */
  bars: (string | null)[];
  /** Every chord is a dominant seventh (read from its symbol; from its notes for a hand-voiced chord). */
  allDominant: boolean;
}
/** The 12-bar form of a piece in a key (the tonic is read as a blues key: I7 IV7 V7 are home chords). */
export function bluesView(n: Normalized, ctx: NormalizeContext & { bars?: number }): BluesView {
  const key = keyOf(n.all, ctx.key ?? null);
  const total = ctx.bars ?? lastBar(n);
  const slots = harmonySlots(n).filter((s) => s.chord);
  const perBar = chordPerBar(slots, total);
  const bars = perBar.map((c, i) => {
    if (!c) return null;
    const slot = slotAt(slots, rat(i));
    return slot?.symbol ?? toLeadSheet(c);
  });
  const allDominant =
    slots.length > 0 &&
    slots.every((s) => (s.symbol ? isDominantSeventhSymbol(s.symbol) : s.chord?.quality === "7"));
  if (!key) return { form: null, choruses: 0, wrongBars: [], bars, allDominant };
  const b: BluesForm = bluesForm(slots, { tonic: key.tonic, mode: "major" }, total);
  if (!b.variant) return { form: null, choruses: 0, wrongBars: b.wrongBars, bars, allDominant };
  const last = perBar[11];
  const turnaround = !!last && (last.rootPc - (perBar[0]?.rootPc ?? last.rootPc) + 12) % 12 === 7;
  return {
    form: {
      variant: b.variant === "jazz" ? "quick-change" : b.variant,
      turnaround,
      jazz: b.variant === "jazz",
    },
    choruses: b.choruses,
    wrongBars: b.wrongBars,
    bars,
    allDominant,
  };
}

// --- swing ---------------------------------------------------------------------------------------------

export interface TrackSwing {
  track: string;
  /** 8th and 16th measures (`swingRatio`); `ratio` is NaN when the line is not measurable on that subdivision. */
  eighths: SwingMeasure;
  sixteenths: SwingMeasure;
  /** The subdivision this line swings on, `null` when it is straight or not measurable on either. */
  swung: 8 | 16 | null;
}
/** Swing per learner track (contracts §6.10): ratio, class and subdivision. Not measured in compound meters. */
export function swingView(n: Normalized, meter: MeterId): TrackSwing[] {
  if (METERS[meter].tempoUnit !== "quarter") return [];
  return learnerTracks(n).map((track) => {
    const ev = n.byTrack[track] ?? [];
    const eighths = swingRatio(ev, meter, 8);
    const sixteenths = swingRatio(ev, meter, 16);
    const swung =
      eighths.n >= 4 && eighths.cls !== "straight"
        ? 8
        : sixteenths.n >= 4 && sixteenths.cls !== "straight"
          ? 16
          : null;
    return { track, eighths, sixteenths, swung };
  });
}
