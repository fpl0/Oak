// The analysis path (architecture §2.2): an `EvalResult` from the grader host → `NEvent`s (`normalize`)
// → view events with location roles, degrees and bar/beat positions → the NotationModel and ABC
// (`@oak/notation`). Pure and synchronous, so it runs the same in the browser and in bun tests.
import type { CodeRange, KeySpec, MeterId, MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { type EvalResult, type EvalSuccess, type GraderErrorInfo, normalize } from "@oak/grader";
import { type AbcResult, notate, type Score, type StaffKind } from "@oak/notation";
import { barPosition, keyFromScaleCtx, METERS, parseChordSymbol } from "@oak/theory";
import { primaryRanges } from "./code-roles.ts";
import { type ChordRole, chordRoleOf, type PitchLabel, pitchLabel } from "./music.ts";

export interface ViewEvent {
  /** `NEvent.id`: stable for the same code; the link bus, the roll and the staff share it. */
  id: string;
  track: string;
  /** Index of the track in source order (Band tracks last): the part colour. */
  trackIndex: number;
  band: boolean;
  onset: number;
  end: number;
  onsetRat: Rat;
  durRat: Rat;
  midi: number | null;
  s?: string;
  drum?: NonNullable<NEvent["drum"]>;
  chordSymbol?: string;
  gain: number;
  /** Every contributing atom (as Strudel reports them). */
  locs: CodeRange[];
  /** The atoms that made the event (the note, the step, the drum sound): what the views link to. */
  primary: CodeRange[];
  /** 1-based display bar. */
  bar: number;
  beat: number;
  beatLabel: string;
  label: PitchLabel | null;
  /** Role in its chord ("R", "3", "5", "7"; tensions "9", "13") when the event carries a chord symbol. */
  chordTone: ChordRole | null;
}

export interface WorkbenchModel {
  code: string;
  cps: number;
  bpm: number;
  cpsSet: boolean;
  /** Track names in source order; Band tracks last. */
  tracks: string[];
  /** Bars analysed (cycles 0 … bars). */
  bars: number;
  totalBars: number | null;
  truncated: boolean;
  meter: MeterSpec;
  key: KeySpec | null;
  events: ViewEvent[];
  byId: ReadonlyMap<string, ViewEvent>;
  score: Score | null;
  abc: AbcResult | null;
  notationError: string | null;
  diagnostics: EvalSuccess["diagnostics"];
  /** What the staff pages are engraved from (`staffPage`); null when there is no staff. `score`/`abc` are page 0. */
  staffSource: StaffSource | null;
}

/** The staff engraves at most this many bars at a time; longer loops turn pages with the playhead. */
export const STAFF_PAGE_BARS = 8;

export interface StaffSource {
  events: readonly NEvent[];
  meter: MeterSpec;
  key: KeySpec | null;
  staff: StaffKind;
  labels: "none" | "degree" | "solfege" | "counts";
  tempoBpm: number;
  /** Bars analysed. */
  bars: number;
  /** Bars per page. */
  pageBars: number;
}

export interface StaffPage {
  page: number;
  /** 0-based first bar of the page. */
  startBar: number;
  bars: number;
  score: Score | null;
  abc: AbcResult | null;
  error: string | null;
}

/** Pages of a staff source (1 for loops up to `pageBars`). */
export function staffPageCount(src: Pick<StaffSource, "bars" | "pageBars">): number {
  return Math.max(1, Math.ceil(src.bars / Math.max(1, src.pageBars)));
}

/**
 * Engraves one page: the events whose onset falls in it, shifted to start at bar 0. Event IDs are kept, so
 * the HighlightBus links the page's notes to the roll and the code exactly as on page 0.
 */
export function staffPage(src: StaffSource, page: number): StaffPage {
  const p = Math.max(0, Math.min(staffPageCount(src) - 1, Math.floor(page)));
  const startBar = p * src.pageBars;
  const bars = Math.max(1, Math.min(src.pageBars, src.bars - startBar));
  const shift: Rat = [startBar, 1];
  const events = src.events
    .filter((e) => {
      const on = R.toNum(e.onset);
      return on >= startBar && on < startBar + bars;
    })
    .map((e) => ({ ...e, onset: R.sub(e.onset, shift) }));
  try {
    const out = notate(
      {
        events,
        meter: src.meter,
        key: src.key,
        bars,
        staff: src.staff,
        labels: src.labels,
        tempoBpm: src.tempoBpm,
      },
      { barsPerLine: 4 },
    );
    return { page: p, startBar, bars, score: out.score, abc: out.abc, error: null };
  } catch (err) {
    return {
      page: p,
      startBar,
      bars,
      score: null,
      abc: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export type ModelOutcome =
  | { ok: true; model: WorkbenchModel; result: EvalSuccess }
  | { ok: false; error: GraderErrorInfo; result: EvalResult };

export interface ModelOptions {
  meter: MeterId | MeterSpec;
  /** The lesson's key; when absent, the events' `.scale()` context is used. */
  key: KeySpec | null;
  /** Staff to engrave; `false` skips notation. */
  staff: StaffKind | false;
  /** Lyric line under the staff. */
  staffLabels?: "none" | "degree" | "solfege" | "counts";
  /** Most bars engraved at a time (the staff is the slow view; longer loops page). Default 8. */
  maxStaffBars?: number;
}

function meterSpec(m: MeterId | MeterSpec): MeterSpec {
  return typeof m === "string" ? METERS[m] : m;
}

/** The key context: the declared key, else the first `.scale()` context of the learner's events. */
export function keyContext(declared: KeySpec | null, events: readonly NEvent[]): KeySpec | null {
  if (declared) return declared;
  for (const e of events) {
    if (e.scaleCtx) {
      const k = keyFromScaleCtx(e.scaleCtx);
      if (k) return k;
    }
  }
  return null;
}

export function buildModel(code: string, result: EvalResult, opts: ModelOptions): ModelOutcome {
  if (!result.ok) return { ok: false, error: result.error, result };
  const meter = meterSpec(opts.meter);
  const n = normalize(result, { meter: meter.id });
  const learner = n.all;
  const all: NEvent[] = [...learner, ...n.band];
  const key = keyContext(opts.key, learner);
  const trackIndex = new Map(result.tracks.map((t, i) => [t, i] as const));

  const events: ViewEvent[] = all.map((e) => {
    const onset = R.toNum(e.onset);
    const end = R.toNum(R.add(e.onset, e.dur));
    const pos = barPosition(e.onset, meter);
    const chord = e.chordSymbol ? (parseChordSymbol(e.chordSymbol) ?? undefined) : undefined;
    const v: ViewEvent = {
      id: e.id,
      track: e.track,
      trackIndex: trackIndex.get(e.track) ?? result.tracks.length,
      band: e.track.startsWith("band."),
      onset,
      end,
      onsetRat: e.onset,
      durRat: e.dur,
      midi: e.midi,
      gain: e.gain,
      locs: e.locs,
      primary: primaryRanges(code, e.locs, e.midi !== null),
      bar: pos.bar,
      beat: pos.beat,
      beatLabel: pos.label,
      label: e.midi === null ? null : pitchLabel(e.midi, key, chord),
      chordTone: e.midi !== null && e.chordSymbol ? chordRoleOf(e.midi, e.chordSymbol) : null,
    };
    if (e.s !== undefined) v.s = e.s;
    if (e.drum !== undefined) v.drum = e.drum;
    if (e.chordSymbol !== undefined) v.chordSymbol = e.chordSymbol;
    return v;
  });
  events.sort((a, b) => a.onset - b.onset || a.trackIndex - b.trackIndex || (a.midi ?? -1) - (b.midi ?? -1));

  let score: Score | null = null;
  let abc: AbcResult | null = null;
  let notationError: string | null = null;
  let staffSource: StaffSource | null = null;
  if (opts.staff !== false && learner.length > 0) {
    staffSource = {
      events: learner,
      meter,
      key,
      staff: opts.staff,
      labels: opts.staffLabels ?? "none",
      tempoBpm: Math.round(result.bpm),
      bars: Math.max(1, result.bars),
      pageBars: Math.max(1, opts.maxStaffBars ?? STAFF_PAGE_BARS),
    };
    const first = staffPage(staffSource, 0);
    score = first.score;
    abc = first.abc;
    notationError = first.error;
  }

  return {
    ok: true,
    result,
    model: {
      code,
      cps: result.cps,
      bpm: result.bpm,
      cpsSet: result.cpsSet,
      tracks: result.tracks,
      bars: result.bars,
      totalBars: result.totalBars,
      truncated: result.truncated,
      meter,
      key,
      events,
      byId: new Map(events.map((e) => [e.id, e] as const)),
      score,
      abc,
      notationError,
      diagnostics: result.diagnostics,
      staffSource,
    },
  };
}

/** Events sounding at `cycle` (wrapped into the analysed bars): the clock → roll/staff highlight. */
export function activeAt(model: Pick<WorkbenchModel, "events" | "bars">, cycle: number): string[] {
  if (model.bars <= 0 || !Number.isFinite(cycle) || cycle < 0) return [];
  const c = cycle % model.bars;
  const out: string[] = [];
  for (const e of model.events) {
    if (e.onset > c) break;
    if (c < e.end) out.push(e.id);
  }
  return out;
}
