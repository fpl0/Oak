// The facts a review is anchored to (contracts §10.6: "the deterministic AnalysisSummary, the rubric result"):
// chords per bar with their numerals and functions, harmonic rhythm, cadences, schemas, motif reuse and the range
// of each track. All of it is read from Oak's own analysis (`harmonyView` and `AnalysisSummary` of @oak/grader);
// nothing here names a chord itself, it only reshapes what the analysis found and finds where bars repeat.
//
// The tutor imports no package, so the inputs are structural: the server passes `harmonyView(...)` and the
// version's `AnalysisSummary` as they are (both fit these shapes), plus the pitched notes it evaluated.
// `factLines` renders the facts as `<oak_context>` lines. Pure.
import type {
  FactBass,
  FactBlues,
  FactChord,
  FactContrast,
  FactDevice,
  FactForm,
  FactKeySpan,
  FactMode,
  FactMotif,
  FactOutsideChord,
  FactRange,
  FactRhythm,
  FactSection,
  FactStage,
  FactSwing,
  ReviewFacts,
} from "./domain.ts";
import { DEGREE_SYLLABLES, keyMoveText, MODE_COLOUR, modeOf } from "./vocabulary.ts";

/** The part of `@oak/grader`'s `HarmonyView` the facts read. */
export interface HarmonyViewLike {
  key: { tonic: string; mode: string } | null;
  bars: number;
  pickup: boolean;
  slots: readonly { symbol: string; rn: string | null; function: string | null }[];
  beats: readonly { bar: number; beat: number; chord: number | null; change: boolean }[];
  harmonicRhythm: readonly number[];
  chordToneShare?: number | null;
}

/** The part of `@oak/content-kit`'s `AnalysisSummary` the facts read. */
export interface AnalysisLike {
  bars?: number;
  key?: readonly { key: { tonic: string; mode: string }; r?: number }[];
  slots?: readonly { bar: number; beat: number; symbol: string; rn: string }[];
  cadences?: readonly { bar: number; type: string }[];
  schemas?: readonly { schema: string; bars: readonly [number, number] | readonly number[] }[];
}

/** A pitched note as the server evaluated it (bar 1-based, beat 1-based in tempo units). */
export interface NoteLike {
  track: string;
  midi: number;
  bar: number;
  beat: number;
}

export interface ReviewFactsInput {
  view?: HarmonyViewLike | null;
  analysis?: AnalysisLike | null;
  notes?: readonly NoteLike[];
  meter?: string | null;
  /** The declared key, as text (`"C major"`), when the view has none. */
  key?: string | null;
  /** Tracks whose motifs are looked for (default: the tracks named like a melody, else every pitched track). */
  motifTracks?: readonly string[];
  // --- Wave 5 (wave5.md §3.2): the grader's views as they are, so a review says what a grade would ---
  /** `formView(...)` of @oak/grader. */
  form?: FormViewLike | null;
  /** `contrastAxes` of @oak/grader, to compare the sections' features (never re-implemented here). */
  contrast?: ((a: SectionFeaturesLike, b: SectionFeaturesLike) => readonly string[]) | null;
  /** `bassView(...)`. */
  bass?: BassViewLike | null;
  /** `bluesView(...)`. */
  blues?: BluesViewLike | null;
  /** `swingView(...)`. */
  swing?: readonly TrackSwingLike[] | null;
  /** A transcription's checks (`CapstoneCheckState` of @oak/api, or the ladder's stages). */
  checks?: readonly CheckLike[] | null;
  /** A declared pickup: cycle 0 is bar 0 and section bars count from the first full bar (c4). */
  pickupBars?: boolean;
  // --- Wave 6 (wave6.md §3.2): the U12–U17 views as they are ---
  /** `chromaticHarmonyView(...)`: sevenths, applied and borrowed chords, guide tones, numerals in the key in force. */
  chromatic?: ChromaticViewLike | null;
  /**
   * `modeView` of the whole piece (`span` null) or of the cycles `[from, to)` of one section. Called once for the
   * piece and once per section of the form view, so C6's review can say which mode each section is in.
   */
  mode?: ((span: readonly [number, number] | null) => ModeViewLike | null) | null;
  /** `keyPlanView(...)`. */
  keyPlan?: KeyPlanViewLike | null;
  /** `detectDevices(...)` (or `AnalysisSummary.deviceList`). */
  devices?: readonly DeviceLike[] | null;
  /** One pass of the piece in seconds (`AnalysisSummary.durationSec`). */
  durationSec?: number | null;
  /** `rhythmView(...)`. */
  rhythm?: RhythmViewLike | null;
}

export interface KeySpecLike {
  tonic: string;
  mode: string;
}

/** The part of @oak/grader's `ChromaticHarmonyView` the facts read. */
export interface ChromaticViewLike {
  chords: readonly {
    bar: number;
    beat: number;
    symbol: string;
    key: KeySpecLike;
    rn: string;
    seventh: string | null;
    kind: string;
    target: string | null;
    resolves: boolean | null;
    next: string | null;
  }[];
  guideLines?: { fromThird: readonly ({ name: string } | null)[] } | null;
}

/** The part of @oak/grader's `ModeView` the facts read. */
export interface ModeViewLike {
  tonic: string | null;
  stated: KeySpecLike | null;
  fits: readonly string[];
  characteristic: { degree: string; count: number; strong: number } | null;
  outside: readonly string[];
  tonicChordShare: number | null;
}

/** The part of @oak/grader's `KeyPlanView` the facts read (bars 1-based on cycles). */
export interface KeyPlanViewLike {
  spans: readonly { fromBar: number; toBar: number; key: KeySpecLike; source: string }[];
  changes: readonly { bar: number; distance: { pivots: number } }[];
}

export interface DeviceLike {
  device: string;
  bar: number;
  bars?: number;
  text: string;
}

/** The part of @oak/grader's `RhythmView` the facts read. */
export interface RhythmViewLike {
  compound: boolean;
  beats: number;
  bpm: number;
  tracks: readonly {
    track: string;
    pushes: readonly { acrossBar: boolean }[];
    ghosts: readonly string[];
    written: { ties: number; dotted: number };
    tuplets: readonly { bar: number; division?: number }[];
    feel: string;
    syncopation: { count: number };
  }[];
}

/** The part of `SectionFeatures` the facts read; the rest is passed through to `contrast`. */
export interface SectionFeaturesLike {
  energy: number;
  [k: string]: unknown;
}

/** The part of @oak/grader's `FormView` the facts read. */
export interface FormViewLike {
  kind: "sections" | "inconsistent" | "through";
  sections?: readonly {
    label: string;
    tag: string;
    bars: number;
    startBar: number;
    tracks: readonly string[];
    features: SectionFeaturesLike;
  }[];
  detail?: string;
  letters?: string;
  totalBars: number;
  energy: readonly number[];
}

export interface BassViewLike {
  track: string | null;
  notes: readonly { role: string | null; approach: string | null }[];
  rootOnChange: number;
  groove: { lock: number; coverage: number } | null;
}

export interface BluesViewLike {
  form: { variant: string; turnaround: boolean; jazz: boolean } | null;
  choruses: number;
  wrongBars: readonly number[];
  bars: readonly (string | null)[];
  allDominant: boolean;
}

export interface TrackSwingLike {
  track: string;
  eighths: { ratio: number };
  swung: 8 | 16 | null;
}

export interface CheckLike {
  checkId: string;
  phrase: number | readonly [number, number];
  layer: string;
  stage: string | null;
  open: boolean;
  score: number | null;
  passed: boolean;
  revealed: boolean;
  passAt?: number;
}

/** Bars of chord detail sent at most; the rest is summarised by the harmonic rhythm. */
export const MAX_FACT_BARS = 32;
export const MAX_MOTIFS = 6;

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** MIDI number to a note name with octave (`60` → `C4`). Spelling is plain (sharps and Eb Ab Bb). */
export function midiName(midi: number): string {
  const m = Math.round(midi);
  return `${NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}

const keyText = (k: { tonic: string; mode: string } | null | undefined) =>
  k ? `${k.tonic} ${k.mode}` : null;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function chordsOf(input: ReviewFactsInput): FactChord[] {
  const view = input.view;
  if (view) {
    // Wave 6: a piece that changes key keeps its numerals right after the change: where the chromatic view read
    // the same chord at the same place, its numeral (in the key in force at that bar) wins.
    const inForce = new Map<string, string>();
    if (input.keyPlan && input.keyPlan.spans.length > 1)
      for (const c of input.chromatic?.chords ?? []) inForce.set(`${c.bar}:${round3(c.beat)}`, c.rn);
    const out: FactChord[] = [];
    for (const b of view.beats) {
      if (!b.change || b.chord === null) continue;
      const slot = view.slots[b.chord];
      if (!slot) continue;
      const rn = inForce.get(`${b.bar}:${round3(b.beat)}`) ?? slot.rn;
      // A numeral read in another key than the piece's first has no function from the first key's reading.
      out.push({
        bar: b.bar,
        beat: b.beat,
        symbol: slot.symbol,
        rn,
        fn: rn === slot.rn ? slot.function : null,
      });
    }
    return out;
  }
  return (input.analysis?.slots ?? []).map((s) => ({
    bar: s.bar,
    beat: s.beat,
    symbol: s.symbol,
    rn: s.rn === "" ? null : s.rn,
    fn: null,
  }));
}

/** Pitched notes of one track, bar by bar, each bar as (beat, midi) sorted. */
function barsOf(notes: readonly NoteLike[]): Map<number, { beat: number; midi: number }[]> {
  const out = new Map<number, { beat: number; midi: number }[]>();
  for (const n of notes) {
    const row = out.get(n.bar) ?? [];
    row.push({ beat: round3(n.beat), midi: n.midi });
    out.set(n.bar, row);
  }
  for (const row of out.values()) row.sort((a, b) => a.beat - b.beat || a.midi - b.midi);
  return out;
}

type Same = "exact" | "transposed" | "rhythm" | null;

/** How bar `b` repeats bar `a`: the same notes, the same shape a fixed distance away, or the same rhythm. */
export function compareBars(a: readonly { beat: number; midi: number }[], b: typeof a): Same {
  if (a.length < 2 || a.length !== b.length) return null;
  for (let i = 0; i < a.length; i++) if (a[i]?.beat !== b[i]?.beat) return null;
  const shift = (b[0]?.midi ?? 0) - (a[0]?.midi ?? 0);
  const sameShape = a.every((n, i) => (b[i]?.midi ?? 0) - n.midi === shift);
  if (sameShape) return shift === 0 ? "exact" : "transposed";
  return a.length >= 3 ? "rhythm" : null;
}

/**
 * Where a bar's idea comes back later in the same track. Consecutive bars that repeat together are merged into
 * one motif (bars 1–2 return at 5–6). A bar already found as a return of an earlier one is not a new motif.
 */
export function motifsOf(track: string, notes: readonly NoteLike[]): FactMotif[] {
  const bars = barsOf(notes);
  const nums = [...bars.keys()].sort((x, y) => x - y);
  const isReturn = new Set<number>();
  const found: { from: number; to: number; at: number; how: Exclude<Same, null> }[] = [];
  for (const i of nums) {
    if (isReturn.has(i)) continue;
    for (const j of nums) {
      if (j <= i) continue;
      const how = compareBars(bars.get(i) ?? [], bars.get(j) ?? []);
      if (how === null) continue;
      isReturn.add(j);
      // Extend a run: bar i-1 → j-1 with the same kind already found, and i, j follow on.
      const prev = found.find((f) => f.to === i - 1 && f.at + (f.to - f.from) === j - 1 && f.how === how);
      if (prev) prev.to = i;
      else found.push({ from: i, to: i, at: j, how });
    }
  }
  // Group returns of the same span.
  const motifs: FactMotif[] = [];
  for (const f of found) {
    const len = f.to - f.from;
    const at: [number, number] = [f.at, f.at + len];
    const same = motifs.find((m) => m.bars[0] === f.from && m.bars[1] === f.to && m.how === f.how);
    if (same) same.at.push(at);
    else motifs.push({ track, bars: [f.from, f.to], at: [at], how: f.how });
  }
  return motifs;
}

export function rangesOf(notes: readonly NoteLike[]): FactRange[] {
  const byTrack = new Map<string, NoteLike[]>();
  for (const n of notes) byTrack.set(n.track, [...(byTrack.get(n.track) ?? []), n]);
  const out: FactRange[] = [];
  for (const [track, list] of byTrack) {
    let low = list[0] as NoteLike;
    let high = list[0] as NoteLike;
    for (const n of list) {
      if (n.midi < low.midi) low = n;
      if (n.midi > high.midi || (n.midi === high.midi && n.bar < high.bar)) high = n;
    }
    out.push({
      track,
      low: midiName(low.midi),
      high: midiName(high.midi),
      semitones: high.midi - low.midi,
      highBar: high.bar,
    });
  }
  return out.sort((a, b) => (a.track < b.track ? -1 : a.track > b.track ? 1 : 0));
}

const MELODY_TRACK = /^(mel|melody|lead|tune|vox|voice|top)/i;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "chorus2" → "Chorus 2" (the ribbon's text, app/src/lib/form-view.ts). */
export function sectionName(tag: string): string {
  const m = /^([a-z]+)(\d+)?$/.exec(tag);
  if (!m) return tag;
  const w = (m[1] as string).charAt(0).toUpperCase() + (m[1] as string).slice(1);
  return m[2] ? `${w} ${m[2]}` : w;
}

/** The chords of display bars `[from, to]` in order of change, each once in a row (`Am (i)`). */
function progressionIn(chords: readonly FactChord[], from: number, to: number): string[] {
  const out: string[] = [];
  // The chord already sounding when the section starts (a change in an earlier bar that carries over) comes first.
  const sounding = chords.filter((c) => c.bar < from || (c.bar === from && c.beat === 1)).at(-1);
  const startsOnChange = chords.some((c) => c.bar === from && c.beat === 1);
  if (sounding && !startsOnChange)
    out.push(sounding.rn ? `${sounding.symbol} (${sounding.rn})` : sounding.symbol);
  for (const c of chords) {
    if (c.bar < from || c.bar > to) continue;
    const label = c.rn ? `${c.symbol} (${c.rn})` : c.symbol;
    if (out.at(-1) !== label) out.push(label);
  }
  return out;
}

/** The form facts: sections in display bars, letters, the energy curve and the contrast of each pair of types. */
export function formFacts(input: ReviewFactsInput, chords: readonly FactChord[]): FactForm | null {
  const view = input.form;
  if (!view) return null;
  const energy = view.energy.map(round2);
  if (view.kind !== "sections") {
    return {
      kind: view.kind,
      sections: [],
      letters: view.kind === "through" ? (view.letters ?? "") : "",
      problem: view.kind === "inconsistent" ? (view.detail ?? "the arranged tracks disagree") : null,
      energy,
      contrast: [],
    };
  }
  const offset = input.pickupBars ? 0 : 1;
  const types: string[] = [];
  const raw = view.sections ?? [];
  const sections: FactSection[] = raw.map((s) => {
    if (!types.includes(s.label)) types.push(s.label);
    const from = s.startBar + offset;
    const to = from + Math.max(1, s.bars) - 1;
    return {
      name: sectionName(s.tag),
      tag: s.tag,
      label: s.label,
      letter: String.fromCharCode(65 + types.indexOf(s.label)),
      bars: [from, to],
      tracks: [...s.tracks],
      energy: round2(s.features.energy),
      progression: progressionIn(chords, from, to),
    };
  });
  const contrast: FactContrast[] = [];
  if (input.contrast) {
    const firsts = types.map((t) => raw.find((s) => s.label === t) as (typeof raw)[number]);
    for (let i = 0; i < firsts.length; i++)
      for (let j = i + 1; j < firsts.length; j++) {
        const a = firsts[i] as (typeof raw)[number];
        const b = firsts[j] as (typeof raw)[number];
        contrast.push({
          a: sectionName(a.tag),
          b: sectionName(b.tag),
          axes: [...input.contrast(a.features, b.features)],
        });
      }
  }
  return {
    kind: "sections",
    sections,
    letters: sections.map((s) => s.letter).join(""),
    problem: null,
    energy,
    contrast,
  };
}

export function bassFacts(view: BassViewLike | null | undefined): FactBass | null {
  if (!view || view.track === null || view.notes.length === 0) return null;
  const roles: Record<string, number> = {};
  const approaches: Record<string, number> = {};
  for (const n of view.notes) {
    const r = n.role ?? "no chord";
    roles[r] = (roles[r] ?? 0) + 1;
    if (n.approach) approaches[n.approach] = (approaches[n.approach] ?? 0) + 1;
  }
  return {
    track: view.track,
    notes: view.notes.length,
    roles,
    rootOnChange: round2(view.rootOnChange),
    approaches,
    grooveLock: view.groove
      ? { lock: round2(view.groove.lock), coverage: round2(view.groove.coverage) }
      : null,
  };
}

export function bluesFacts(view: BluesViewLike | null | undefined): FactBlues | null {
  if (!view) return null;
  // A piece that is no blues at all says nothing here: only a chorus that fits, or a piece of dominant sevenths
  // that does not fit yet (a C5 draft one bar off).
  if (view.form === null && !view.allDominant) return null;
  return {
    variant: view.form?.variant ?? null,
    turnaround: view.form?.turnaround ?? false,
    jazz: view.form?.jazz ?? false,
    choruses: view.choruses,
    wrongBars: [...view.wrongBars],
    bars: view.bars.slice(0, 12),
    allDominant: view.allDominant,
  };
}

export function swingFacts(view: readonly TrackSwingLike[] | null | undefined): FactSwing[] {
  // Only lines whose eighths can be measured: a held chord or a bass on the beat says nothing about swing.
  return (view ?? [])
    .filter((t) => Number.isFinite(t.eighths.ratio))
    .map((t) => ({ track: t.track, ratio: round2(t.eighths.ratio), swung: t.swung }));
}

/** A transcription's checks as facts: score, mark and state; the expected notes are never part of a check. */
export function stageFacts(checks: readonly CheckLike[] | null | undefined): FactStage[] {
  return (checks ?? []).map((c) => ({
    check: c.checkId,
    layer: c.layer,
    stage: c.stage,
    phrase:
      c.layer === "form"
        ? "the whole tune"
        : typeof c.phrase === "number"
          ? `phrase ${c.phrase}`
          : `phrases ${c.phrase[0]}-${c.phrase[1]}`,
    score: c.score === null ? null : round2(c.score),
    passed: c.passed,
    revealed: c.revealed,
    passAt: c.passAt ?? null,
    open: c.open,
  }));
}

/** The facts of a piece from Oak's analysis. Every field is optional on input; missing parts stay empty. */
export function reviewFactsFrom(input: ReviewFactsInput): ReviewFacts {
  const { view, analysis } = input;
  const notes = input.notes ?? [];
  const tracks = [...new Set(notes.map((n) => n.track))];
  const motifTracks =
    input.motifTracks ??
    (tracks.some((t) => MELODY_TRACK.test(t)) ? tracks.filter((t) => MELODY_TRACK.test(t)) : tracks);
  const motifs = motifTracks
    .flatMap((t) =>
      motifsOf(
        t,
        notes.filter((n) => n.track === t),
      ),
    )
    .slice(0, MAX_MOTIFS);
  const bars = view?.bars ?? analysis?.bars ?? notes.reduce((m, n) => Math.max(m, n.bar), 0);
  const chords = chordsOf(input);
  const pickup = view?.pickup ?? input.pickupBars ?? false;
  const w5: Partial<ReviewFacts> = {};
  const form = formFacts({ ...input, pickupBars: pickup }, chords);
  if (form) w5.form = form;
  const bass = bassFacts(input.bass);
  if (bass) w5.bass = bass;
  const blues = bluesFacts(input.blues);
  if (blues) w5.blues = blues;
  const swing = swingFacts(input.swing);
  if (swing.length > 0) w5.swing = swing;
  const stages = stageFacts(input.checks);
  if (stages.length > 0) w5.stages = stages;
  Object.assign(w5, w6Facts({ ...input, pickupBars: pickup }, form));
  return {
    // The key the brief gives wins over an estimate (contracts §6.8 item 1); a minor piece is never read in its
    // relative major.
    key: input.key ?? keyText(view?.key) ?? keyText(analysis?.key?.[0]?.key) ?? null,
    meter: input.meter ?? null,
    bars,
    pickup,
    chords,
    harmonicRhythm: [...(view?.harmonicRhythm ?? [])],
    cadences: (analysis?.cadences ?? []).map((c) => ({ bar: c.bar, type: c.type })),
    schemas: (analysis?.schemas ?? []).map((s) => ({
      schema: s.schema,
      bars: [Number(s.bars[0]), Number(s.bars[1] ?? s.bars[0])] as [number, number],
    })),
    motifs,
    ranges: rangesOf(notes),
    chordToneShare: view?.chordToneShare ?? null,
    ...w5,
  };
}

const span = ([a, b]: readonly [number, number]) => (a === b ? `bar ${a}` : `bars ${a}-${b}`);

/**
 * A cadence as the glossary names it (Wave 6, d2). The analysis's own codes (`PAC`, `HC`) are not course words: a
 * review that read "PAC" wrote "perfect authentic cadence", a name the glossary does not have. The glossary's terms
 * are authentic, half, plagal and deceptive cadence; where the melody lands is said in plain words.
 */
export function cadenceName(type: string): string {
  switch (type) {
    case "PAC":
      return "authentic cadence (V to I, melody on 1)";
    case "IAC":
      return "authentic cadence (V to I, melody not on 1)";
    case "HC":
      return "half cadence (stops on V)";
    case "PC":
      return "plagal cadence (IV to I)";
    case "DC":
      return "deceptive cadence (V to vi)";
    case "bVII-I":
      return "bVII to I";
    default:
      return type;
  }
}

/** The facts as `<oak_context>` lines, one fact per line, in a fixed order. */
export function factLines(f: ReviewFacts): string[] {
  const lines = [
    `facts: key ${f.key ?? "unknown"} · meter ${f.meter ?? "unknown"} · ${f.bars} bars · pickup ${f.pickup ? "yes (bar 0)" : "no"}`,
  ];
  const byBar = new Map<number, FactChord[]>();
  for (const c of f.chords) byBar.set(c.bar, [...(byBar.get(c.bar) ?? []), c]);
  const shown = [...byBar.keys()].sort((a, b) => a - b).slice(0, MAX_FACT_BARS);
  for (const bar of shown) {
    const chords = (byBar.get(bar) ?? []).map((c) => {
      const tags = [c.rn, c.fn].filter((x) => x !== null).join(", ");
      return `${c.symbol}${tags ? ` (${tags})` : ""}${c.beat === 1 ? "" : ` on beat ${c.beat}`}`;
    });
    lines.push(`chords bar ${bar}: ${chords.join(" then ")}`);
  }
  if (byBar.size > shown.length) lines.push(`chords: ${byBar.size - shown.length} more bars not listed`);
  if (byBar.size === 0) lines.push("chords: none found");
  if (f.harmonicRhythm.length > 0)
    lines.push(`harmonic_rhythm (changes per bar): ${f.harmonicRhythm.join(" ")}`);
  for (const c of f.cadences) lines.push(`cadence: bar ${c.bar} ${cadenceName(c.type)}`);
  for (const s of f.schemas) lines.push(`schema: ${s.schema} ${span(s.bars)}`);
  for (const m of f.motifs)
    lines.push(`motif: ${m.track} ${span(m.bars)} returns ${m.how} at ${m.at.map(span).join(", ")}`);
  if (f.motifs.length === 0) lines.push("motif: no bar of the melody returns");
  for (const r of f.ranges)
    lines.push(
      `range: ${r.track} ${r.low}-${r.high} (${r.semitones} semitones), highest note in bar ${r.highBar}`,
    );
  if (f.chordToneShare !== null)
    lines.push(`chord_tones_on_strong_beats: ${Math.round(f.chordToneShare * 100)}%`);
  lines.push(...w5FactLines(f));
  lines.push(...w6FactLines(f));
  return lines;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const counts = (r: Record<string, number>) =>
  Object.entries(r)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");

/** Wave 5 facts as `<oak_context>` lines: form, contrast, energy, progression per section, bass, blues, swing, checks. */
export function w5FactLines(f: ReviewFacts): string[] {
  const lines: string[] = [];
  const form = f.form;
  if (form) {
    if (form.kind === "inconsistent") lines.push(`form: the arranged tracks disagree: ${form.problem ?? ""}`);
    else if (form.kind === "through")
      lines.push(`form: no arrange(); phrase letters ${form.letters || "none"} (4-bar phrases)`);
    else {
      lines.push(
        `form: ${form.sections.map((s) => s.name).join(" ")} (${form.letters}); section bars count from the first full bar`,
      );
      for (const s of form.sections)
        lines.push(
          `section ${s.name}: ${span(s.bars)} · letter ${s.letter} · tracks ${s.tracks.join(", ") || "none"} · energy ${pct(s.energy)}${s.progression.length > 0 ? ` · chords ${s.progression.join(" ")}` : ""}`,
        );
      for (const c of form.contrast)
        lines.push(
          `contrast ${c.a} vs ${c.b}: ${c.axes.length > 0 ? c.axes.join(", ") : "no axis differs enough"} (${c.axes.length} of 7 axes)`,
        );
    }
    if (form.energy.length > 0) lines.push(`energy_curve (per bar, 0-1): ${form.energy.join(" ")}`);
  }
  const b = f.bass;
  if (b) {
    lines.push(
      `bass: ${b.track} · ${b.notes} notes · roles ${counts(b.roles)} · root on ${pct(b.rootOnChange)} of chord changes`,
    );
    if (Object.keys(b.approaches).length > 0) lines.push(`bass_approaches: ${counts(b.approaches)}`);
    lines.push(
      b.grooveLock
        ? `groove_lock: ${pct(b.grooveLock.lock)} of bass notes on a kick · ${pct(b.grooveLock.coverage)} of kicks carry a bass note`
        : "groove_lock: no kick",
    );
  }
  const bl = f.blues;
  if (bl) {
    lines.push(
      bl.variant
        ? `blues: ${bl.variant}${bl.jazz ? " (jazz)" : ""}${bl.turnaround ? " with a turnaround (bar 12 on V)" : ""} · ${bl.choruses} chorus${bl.choruses === 1 ? "" : "es"} of 12 bars · ${bl.allDominant ? "every chord a dominant seventh" : "not every chord a dominant seventh"}`
        : `blues: no full 12-bar chorus fits · ${bl.allDominant ? "every chord a dominant seventh" : "not every chord a dominant seventh"}`,
    );
    if (bl.bars.length > 0) lines.push(`blues_bars (1-12): ${bl.bars.map((x) => x ?? "-").join(" | ")}`);
    if (bl.wrongBars.length > 0) lines.push(`blues_off_form_bars: ${bl.wrongBars.join(", ")}`);
  }
  for (const s of f.swing ?? [])
    lines.push(
      `swing: ${s.track} ${s.ratio === null ? "not measurable" : `ratio ${s.ratio}`}${s.swung ? ` · swung ${s.swung}ths` : " · straight"}`,
    );
  for (const s of f.stages ?? [])
    lines.push(
      `check ${s.check}: ${s.layer}${s.stage ? ` stage ${s.stage}` : ""} · ${s.phrase} · ${s.score === null ? "not checked yet" : `best ${pct(s.score)}`}${s.passAt === null ? "" : ` · mark ${pct(s.passAt)}`} · ${s.revealed ? "revealed" : s.passed ? "passed" : s.open ? "open" : "locked until the checks before it pass"}`,
    );
  return lines;
}

// --- Wave 6: modes, applied and borrowed chords, the key plan, devices, length, rhythm -------------------------------

const keyName = (k: KeySpecLike) => `${k.tonic} ${k.mode}`;
/** A numeral without its seventh or inversion figure: `V7` and `V43` are the chord `V`. */
const rnCore = (rn: string) => rn.replace(/(?:maj7|ø7|o7|7|65|64|43|42|6|2)(?=\/|$)/, "");

function modeFact(
  view: ModeViewLike | null | undefined,
  section: string | null,
  bars: [number, number] | null,
): FactMode | null {
  if (!view || view.tonic === null) return null;
  return {
    section,
    bars,
    stated: view.stated ? keyName(view.stated) : null,
    fits: [...view.fits],
    tone: view.characteristic
      ? {
          degree: view.characteristic.degree,
          count: view.characteristic.count,
          strong: view.characteristic.strong,
        }
      : null,
    outsideNotes: view.outside.length,
    homeChordShare: view.tonicChordShare === null ? null : round2(view.tonicChordShare),
  };
}

/** A mode worth a line: the piece or section states a colour mode, or only one colour mode fits its notes. */
const isModal = (m: FactMode): boolean =>
  (modeOf(m.stated) ?? "") in MODE_COLOUR || (m.fits.length === 1 && (m.fits[0] as string) in MODE_COLOUR);

/** The Wave 6 facts; every part is left out when its view is absent or says nothing. */
export function w6Facts(input: ReviewFactsInput, form: FactForm | null): Partial<ReviewFacts> {
  const out: Partial<ReviewFacts> = {};
  const safe = <T>(f: () => T): T | null => {
    try {
      return f();
    } catch {
      return null;
    }
  };

  if (input.mode) {
    const ask = input.mode;
    const modes: FactMode[] = [];
    const whole = modeFact(
      safe(() => ask(null)),
      null,
      null,
    );
    const raw = input.form?.kind === "sections" ? (input.form.sections ?? []) : [];
    raw.forEach((s, i) => {
      const fact = modeFact(
        safe(() => ask([s.startBar, s.startBar + Math.max(1, s.bars)])),
        form?.sections[i]?.name ?? sectionName(s.tag),
        form?.sections[i]?.bars ?? null,
      );
      if (fact) modes.push(fact);
    });
    // The whole piece first; sections only when they are worth telling apart (one of them is modal).
    const sections = modes.some(isModal) ? modes : [];
    const all = [...(whole && (isModal(whole) || sections.length > 0) ? [whole] : []), ...sections];
    if (all.length > 0) out.modes = all;
  }

  const chroma = input.chromatic;
  if (chroma) {
    const outside: FactOutsideChord[] = [];
    const sevenths: Record<string, number> = {};
    for (const c of chroma.chords) {
      if (c.seventh) sevenths[c.seventh] = (sevenths[c.seventh] ?? 0) + 1;
      if (c.kind !== "applied" && c.kind !== "borrowed" && c.kind !== "other") continue;
      outside.push({
        bar: c.bar,
        beat: c.beat,
        symbol: c.symbol,
        rn: c.rn,
        kind: c.kind,
        target: c.target,
        resolves: c.resolves,
        next: c.next,
        key: keyName(c.key),
      });
    }
    if (outside.length > 0) out.outside = outside;
    if (Object.keys(sevenths).length > 0) out.sevenths = sevenths;
    const line = chroma.guideLines?.fromThird ?? [];
    if (Object.keys(sevenths).length > 0 && line.some((x) => x !== null))
      out.guideLine = line.slice(0, MAX_FACT_BARS).map((x) => x?.name ?? null);
  }

  const plan = input.keyPlan;
  if (plan && plan.spans.length > 0) {
    const off = input.pickupBars ? 1 : 0;
    const spans: FactKeySpan[] = plan.spans.map((sp, i) => {
      const prev = plan.spans[i - 1];
      const change = plan.changes.find((c) => c.bar === sp.fromBar);
      return {
        bars: [sp.fromBar - off, sp.toBar - off],
        key: keyName(sp.key),
        source: sp.source,
        move: prev ? keyMoveText(keyName(prev.key), keyName(sp.key)) : null,
        pivots: prev ? (change?.distance.pivots ?? null) : null,
      };
    });
    if (spans.length > 1) out.keyPlan = spans;
  }

  if (input.devices && input.devices.length > 0) {
    const devices: FactDevice[] = input.devices.map((d) => ({
      device: d.device,
      bar: d.bar,
      bars: d.bars ?? 1,
      text: d.text,
    }));
    out.devices = devices.sort((a, b) => a.bar - b.bar || (a.device < b.device ? -1 : 1));
  }
  if (typeof input.durationSec === "number" && Number.isFinite(input.durationSec))
    out.durationSec = Math.round(input.durationSec * 10) / 10;

  const rhythm = input.rhythm;
  if (rhythm) {
    const pitched = new Set((input.notes ?? []).map((x) => x.track));
    const tracks: FactRhythm[] = rhythm.tracks
      .map((t) => ({
        track: t.track,
        pushes: t.pushes.length,
        pushesOverBar: t.pushes.filter((p) => p.acrossBar).length,
        ghosts: t.ghosts.length,
        ties: t.written.ties,
        dotted: t.written.dotted,
        // A triplet is a beat in three (or six); other tuplets are not a course word and are left out.
        tupletBars: [...new Set(t.tuplets.filter((x) => (x.division ?? 3) % 3 === 0).map((x) => x.bar))].sort(
          (a, b) => a - b,
        ),
        feel: t.feel,
        syncopated: t.syncopation.count,
      }))
      // Only lines with something to say. A backbeat counts as syncopated and a quiet hi-hat as all ghost notes:
      // a drum line is told only for its pushes, its triplets, or ghost notes among accents; a pitched line also
      // for landing between the beats.
      .filter(
        (t) =>
          t.pushes > 0 ||
          t.tupletBars.length > 0 ||
          (pitched.has(t.track)
            ? t.syncopated > 0 || t.feel === "ternary"
            : t.ghosts > 0 && t.syncopated > 0),
      );
    if (tracks.length > 0) out.rhythm = tracks;
    if (rhythm.compound || tracks.length > 0)
      out.beat = { compound: rhythm.compound, beats: rhythm.beats, bpm: Math.round(rhythm.bpm) };
  }
  return out;
}

/** "2:14" for 134 seconds. */
export function clock(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The six devices CF-A's rubric counts (content-kit `CORE_DEVICES`; wave6.music.test.ts keeps them equal). */
export const CORE_DEVICE_NAMES = [
  "secondary dominant",
  "borrowed chord",
  "modulation",
  "suspension",
  "syncopated bass",
  "modal colour",
] as const;

/**
 * Wave 6 facts as `<oak_context>` lines: the mode and its characteristic tone per section, applied and borrowed
 * chords with their bars and resolutions, the key plan, the device list, the length, the rhythm of each line.
 */
export function w6FactLines(f: ReviewFacts): string[] {
  const lines: string[] = [];
  for (const m of f.modes ?? []) {
    const where = m.section === null ? "piece" : `${m.section}${m.bars ? ` (${span(m.bars)})` : ""}`;
    const stated =
      m.stated ?? (m.fits.length === 1 ? `${m.fits[0]} (the only mode that fits)` : "none stated");
    const parts = [`mode ${where}: ${stated}`];
    if (m.tone) {
      const syl = DEGREE_SYLLABLES[m.tone.degree];
      parts.push(
        `characteristic tone ${m.tone.degree}${syl ? ` (${syl})` : ""} sounds ${m.tone.count} time${m.tone.count === 1 ? "" : "s"}, ${m.tone.strong} on a strong beat`,
      );
    }
    if (m.fits.length > 0 && m.stated !== null) parts.push(`notes fit ${m.fits.join(", ")}`);
    parts.push(`${m.outsideNotes} note${m.outsideNotes === 1 ? "" : "s"} outside the mode`);
    if (m.homeChordShare !== null) parts.push(`home chord in ${pct(m.homeChordShare)} of bars`);
    lines.push(parts.join(" · "));
  }

  const outside = f.outside ?? [];
  // The same chord doing the same thing in several bars is one line with its bars (a chorus that returns).
  const groups = new Map<string, { c: FactOutsideChord; at: string[] }>();
  for (const c of outside) {
    const key = [c.kind, c.symbol, c.rn, c.target, c.resolves, c.next, c.key].join("|");
    const g = groups.get(key) ?? { c, at: [] };
    g.at.push(`${c.bar}${c.beat === 1 ? "" : ` (beat ${c.beat})`}`);
    groups.set(key, g);
  }
  for (const { c, at } of [...groups.values()].slice(0, MAX_FACT_BARS)) {
    const where = `bar${at.length === 1 ? "" : "s"} ${at.join(", ")}`;
    if (c.kind === "applied")
      lines.push(
        `applied: ${c.symbol} (${c.rn}) ${where} · leans into ${c.target ?? "?"} · ${
          !c.resolves
            ? `does not resolve: goes to ${c.next ?? "the end"}`
            : c.next === null || rnCore(c.next) === rnCore(c.target ?? "")
              ? "resolves there"
              : `goes to ${c.next}, a chord on that root (a chain)`
        } · read in ${c.key}`,
      );
    else if (c.kind === "borrowed")
      lines.push(
        `borrowed: ${c.symbol} (${c.rn}) ${where}${c.next ? ` · goes to ${c.next}` : ""} · read in ${c.key}`,
      );
    else lines.push(`outside_chord: ${c.symbol} ${where} · no numeral the course teaches · read in ${c.key}`);
  }
  if (outside.length > 0) {
    const applied = outside.filter((c) => c.kind === "applied");
    lines.push(
      `outside_chords: ${applied.length} applied (${applied.filter((c) => c.resolves).length} resolve) · ${outside.filter((c) => c.kind === "borrowed").length} borrowed`,
    );
  }
  if (f.sevenths) lines.push(`sevenths: ${counts(f.sevenths)}`);
  if (f.guideLine && f.guideLine.length > 1)
    lines.push(
      `guide_tone_line (from the 3rd, chord by chord): ${f.guideLine.map((x) => x ?? "-").join(" ")}`,
    );

  const plan = f.keyPlan ?? [];
  if (plan.length > 1) {
    lines.push(
      `key_plan: ${plan.map((k) => `${k.key} ${span(k.bars)}`).join(" · ")} · numerals above are read in the key in force at each bar`,
    );
    plan.slice(1).forEach((k, i) => {
      const from = plan[i] as FactKeySpan;
      lines.push(
        `key_change: bar ${k.bars[0]} · ${from.key} to ${k.key}${k.move ? ` · ${k.move}` : ""}${
          k.pivots === null ? "" : ` · ${k.pivots} shared triad${k.pivots === 1 ? "" : "s"}`
        } · the new key lasts ${k.bars[1] - k.bars[0] + 1} bar${k.bars[1] === k.bars[0] ? "" : "s"}`,
      );
    });
  }

  // The six devices of the core (CF-A's rubric). The jazz track's four are not core vocabulary and are left out.
  const core: readonly string[] = CORE_DEVICE_NAMES;
  const devices = (f.devices ?? []).filter((d) => core.includes(d.device));
  if ((f.devices ?? []).length > 0) {
    const byWhat = new Map<string, { d: FactDevice; bars: number[] }>();
    for (const d of devices) {
      // "V7/vi→vi bar 11" and "V7/vi→vi bar 27" are one device heard twice.
      const what = d.text.replace(/\s+bar\s+\d+$/, "");
      const g = byWhat.get(`${d.device}|${what}|${d.bars}`) ?? { d: { ...d, text: what }, bars: [] };
      g.bars.push(d.bar);
      byWhat.set(`${d.device}|${what}|${d.bars}`, g);
    }
    for (const { d, bars } of byWhat.values())
      lines.push(
        `device: ${d.device} · bar${bars.length === 1 ? "" : "s"} ${bars.join(", ")}${d.bars > 1 ? ` for ${d.bars} bars` : ""}${d.text === d.device ? "" : ` · ${d.text}`}`,
      );
    const have = new Set(devices.map((d) => d.device));
    const found = CORE_DEVICE_NAMES.filter((d) => have.has(d));
    const missing = CORE_DEVICE_NAMES.filter((d) => !have.has(d));
    lines.push(
      `devices: ${found.length} of the six core devices (${found.join(", ") || "none"})${missing.length > 0 ? ` · not found: ${missing.join(", ")}` : ""}`,
    );
  }
  if (f.durationSec !== undefined && f.durationSec !== null)
    lines.push(`length: ${clock(f.durationSec)} (${Math.round(f.durationSec)} s) · ${f.bars} bars`);

  if (f.beat?.compound)
    lines.push(
      `beat: compound meter · ${f.beat.beats} beats a bar, each a dotted quarter in three · ${f.beat.bpm} BPM to the dotted quarter`,
    );
  for (const r of f.rhythm ?? []) {
    const parts = [`rhythm: ${r.track}`];
    if (r.pushes > 0)
      parts.push(
        `${r.pushes} push${r.pushes === 1 ? "" : "es"}${r.pushesOverBar > 0 ? ` (${r.pushesOverBar} over a bar line)` : ""}`,
      );
    if (r.syncopated > 0) parts.push(`${r.syncopated} syncopated note${r.syncopated === 1 ? "" : "s"}`);
    if (r.ghosts > 0) parts.push(`${r.ghosts} ghost note${r.ghosts === 1 ? "" : "s"}`);
    if (r.ties > 0 || r.dotted > 0) parts.push(`written with ${r.ties} tied and ${r.dotted} dotted`);
    if (r.tupletBars.length > 0)
      parts.push(`triplets in bar${r.tupletBars.length === 1 ? "" : "s"} ${r.tupletBars.join(", ")}`);
    parts.push(
      `the beat divides ${r.feel === "ternary" ? "in three" : r.feel === "mixed" ? "in two and in three" : r.feel === "beat" ? "not at all" : "in two"}`,
    );
    lines.push(parts.join(" · "));
  }
  return lines;
}
