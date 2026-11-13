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
  FactForm,
  FactMotif,
  FactRange,
  FactSection,
  FactStage,
  FactSwing,
  ReviewFacts,
} from "./domain.ts";

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
    const out: FactChord[] = [];
    for (const b of view.beats) {
      if (!b.change || b.chord === null) continue;
      const slot = view.slots[b.chord];
      if (!slot) continue;
      out.push({ bar: b.bar, beat: b.beat, symbol: slot.symbol, rn: slot.rn, fn: slot.function });
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
    phrase: typeof c.phrase === "number" ? `phrase ${c.phrase}` : `phrases ${c.phrase[0]}-${c.phrase[1]}`,
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
  for (const c of f.cadences) lines.push(`cadence: bar ${c.bar} ${c.type}`);
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
