// The Wave 6 views of the Workbench (docs/design/wave6.md §3.2, §4.3, §4.4): what U12–U17 add to the roll, the
// chord band and the key panel. Sevenths, applied and borrowed chords and the two guide-tone lines come from the
// grader's `chromaticHarmonyView`; the key in force bar by bar from `keyPlanView`; pushes, ghost notes and
// triplets from `rhythmView`; mode colours, borrowed chords and the beat grid from `@oak/theory`. Nothing is named
// from a table here, and how deep a label writes is decided by `harmonyDepth` (app/src/lib/harmony-lens.ts): a
// seventh, an applied numeral, a borrowed chord's numeral and a chromatic syllable appear only once taught.
// Pure and synchronous: built with the model (model.ts), applied per depth by `applyDepth`, tested in wave6.test.ts.
import type { KeySpec, MeterId, NEvent, PickupSpec } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  type ChordColourView,
  type ChromaticHarmonyView,
  chromaticHarmonyView,
  type KeyPlanView,
  keyPlanView,
  type Normalized,
  type RhythmView,
  rhythmView,
  swingView,
} from "@oak/grader";
import type { ChordLabel } from "@oak/notation";
import {
  beatGrid,
  type ChordId,
  type ChromaticChordKind,
  characteristicTonesOf,
  chordOfRoman,
  chordPcs,
  type GuideToneStep,
  keyDisplay,
  METERS,
  modeColour,
  parallelKey,
  parseKeyPlan,
  pcOf,
  romanText,
  toLeadSheet,
  triadCore,
} from "@oak/theory";
import { chordLensText, degreeLensText, type HarmonyDepth } from "../lib/harmony-lens.ts";
import { type ChordRegion, rnDisplay, type WorkbenchHarmony } from "./harmony.ts";
import { LATE_SYLLABLES, type PitchLabel } from "./music.ts";

// --- the key ribbon ------------------------------------------------------------------------------------------

/** One stretch of the piece in one key, in cycles, as the key ribbon draws it. */
export interface KeyRibbonSpan {
  /** [from, to) in cycles (bars). */
  from: number;
  to: number;
  key: KeySpec;
  /** "D major", "G Mixolydian". */
  text: string;
  /** How this key was reached from the one before it; `null` on the first span. */
  change: { text: string; words: string; semitones: number } | null;
}

const RELATION_WORDS: Readonly<Record<string, string>> = {
  same: "the same key",
  relative: "to the relative key",
  parallel: "to the parallel key",
  dominant: "to the key a fifth up",
  subdominant: "to the key a fifth down",
  "up-half": "up a half step",
  "up-step": "up a step",
  "down-step": "down a step",
  other: "",
};

/**
 * The shorter way from one tonic to the other, signed: `keyDistance` counts 0–11 half steps up, so a step down
 * (+10) reads −2 and B♭ after D (+8) reads −4, as Transcribe writes them; a tritone stays +6.
 */
export function signedSemitones(semitones: number): number {
  const s = ((Math.round(semitones) % 12) + 12) % 12;
  return s > 6 ? s - 12 : s;
}

/** "+2: up a step", "−2: down a step", "−5: to the key a fifth up", "+3" (wave6.md §4.3). */
export function keyChangeText(d: { semitones: number; relation: string }): string {
  const s = signedSemitones(d.semitones);
  const n = s > 0 ? `+${s}` : s < 0 ? `−${-s}` : "0";
  const words = RELATION_WORDS[d.relation] ?? "";
  return words ? `${n}: ${words}` : n;
}

/** The ribbon's spans from a key plan (1-based inclusive bars → cycles), the last one running to `bars`. */
export function keyRibbonOf(plan: Pick<KeyPlanView, "spans" | "changes">, bars: number): KeyRibbonSpan[] {
  return plan.spans.map((s, i) => {
    const change = plan.changes.find((c) => c.bar === s.fromBar) ?? null;
    const next = plan.spans[i + 1];
    return {
      from: s.fromBar - 1,
      to: next ? next.fromBar - 1 : Math.max(s.toBar, bars),
      key: s.key,
      text: keyDisplay(s.key),
      change:
        i > 0 && change
          ? {
              text: keyChangeText(change.distance),
              words: `${keyDisplay(change.from)} to ${keyDisplay(change.to)}, ${
                RELATION_WORDS[change.distance.relation] ||
                `${Math.abs(signedSemitones(change.distance.semitones))} half steps ${
                  signedSemitones(change.distance.semitones) < 0 ? "down" : "up"
                }`
              }; ${change.distance.commonTones} notes in common`,
              semitones: signedSemitones(change.distance.semitones),
            }
          : null,
    };
  });
}

const PATTERNED_SCALE = /\.scale\(\s*(["'`])(<[^"'`]*>)\1\s*\)/g;

/**
 * The bars a key plan runs for: the longest `.scale("<C4:major!4 D4:major!4>")` of the code that changes key
 * (`parseKeyPlan`), 0 when no line has one. The Workbench analyses and loops that many bars, so a lift written
 * into a four-bar loop is seen and heard instead of never being reached. The code is read, never run.
 */
export function keyPlanBars(code: string): number {
  if (!code.includes(".scale(")) return 0;
  let most = 0;
  PATTERNED_SCALE.lastIndex = 0;
  for (let m = PATTERNED_SCALE.exec(code); m; m = PATTERNED_SCALE.exec(code)) {
    try {
      const plan = parseKeyPlan(m[2] as string);
      if (plan && plan.changes.length > 0) most = Math.max(most, Math.ceil(plan.totalBars));
    } catch {
      // not a key plan this reader knows: the loop keeps its own length
    }
  }
  return most;
}

/** The key in force at a cycle of the ribbon. */
export function keyOfRibbon(spans: readonly KeyRibbonSpan[], cycle: number): KeySpec | null {
  let found: KeyRibbonSpan | null = null;
  for (const s of spans) if (s.from <= cycle + 1e-9) found = s;
  return (found ?? spans[0] ?? null)?.key ?? null;
}

// --- guide tones ---------------------------------------------------------------------------------------------

export interface GuideMark {
  role: "third" | "seventh";
  /** "3" or "7". */
  tag: string;
  /** "the 3rd of Dm7 (F)". */
  words: string;
}

/** One chord's stretch of a guide-tone line: the note that carries it, when the code plays one. */
export interface GuidePoint {
  from: number;
  to: number;
  midi: number;
  role: "third" | "seventh";
  name: string;
  chord: string;
  /** The sounding event on that pitch class; `null` when the voicing leaves the guide tone out. */
  eventId: string | null;
  /** Half steps from the point before it (0: held as a common tone). */
  move: number;
}

export interface GuideTones {
  marks: ReadonlyMap<string, GuideMark>;
  /** One line from the 3rd of the first chord and one from its 7th (a single line when every chord is a triad). */
  lines: GuidePoint[][];
}

const mod12 = (m: number) => ((Math.round(m) % 12) + 12) % 12;

function glyph(name: string): string {
  return name.replace(/#/g, "♯").replace(/(?<=[A-G]b*)b/g, "♭");
}

/**
 * The guide tones of the piece: every learner note that is the 3rd or the 7th of the chord under it, and the two
 * lines those notes make across the changes (`guideToneLine`: the nearest guide tone at each change), placed on the
 * notes the code really plays.
 */
export function guideTonesOf(
  view: Pick<ChromaticHarmonyView, "chords" | "guideLines">,
  events: readonly NEvent[],
  bars: number,
): GuideTones {
  const marks = new Map<string, GuideMark>();
  const chords = view.chords;
  if (chords.length === 0) return { marks, lines: [] };
  const spans = chords.map((c, i) => ({
    from: R.toNum(c.at),
    to: chords[i + 1] ? R.toNum((chords[i + 1] as ChordColourView).at) : Math.max(bars, R.toNum(c.at) + 1),
  }));
  const learner = events.filter((e) => e.midi !== null && !e.track.startsWith("band."));
  const spanOf = (e: NEvent): number => {
    const on = R.toNum(e.onset);
    return spans.findIndex((s) => on >= s.from - 1e-9 && on < s.to - 1e-9);
  };
  const roleOf = (e: NEvent, i: number): "third" | "seventh" | null => {
    const c = chords[i];
    if (!c) return null;
    const pc = mod12(e.midi as number);
    if (c.guide.third && pc === pcOf(c.guide.third)) return "third";
    if (c.guide.seventh && pc === pcOf(c.guide.seventh)) return "seventh";
    return null;
  };
  // Whose notes can be guide tones: the notes of a chord (a `chord()` voicing, or notes stacked on one onset),
  // and a single line that is a guide-tone line (four notes in five are a 3rd or a 7th of their chord). A tune
  // that touches a 3rd in passing is not marked: the lens shows the chords' inner line, not every chord tone.
  const stacked = new Map<string, number>();
  const slot = (e: NEvent) => `${e.track}|${e.onset[0]}/${e.onset[1]}`;
  for (const e of learner) stacked.set(slot(e), (stacked.get(slot(e)) ?? 0) + 1);
  const inChord = (e: NEvent) => e.chordSymbol !== undefined || (stacked.get(slot(e)) ?? 0) > 1;
  const lineTracks = new Set<string>();
  const byTrack = new Map<string, NEvent[]>();
  for (const e of learner) if (!inChord(e)) byTrack.set(e.track, [...(byTrack.get(e.track) ?? []), e]);
  for (const [track, list] of byTrack) {
    const under = list.filter((e) => spanOf(e) >= 0);
    const hits = under.filter((e) => roleOf(e, spanOf(e)) !== null).length;
    if (under.length >= 2 && hits / under.length >= 0.8) lineTracks.add(track);
  }
  const pitched = learner.filter((e) => inChord(e) || lineTracks.has(e.track));
  const inSpan = spans.map((_s, i) => pitched.filter((e) => spanOf(e) === i));
  chords.forEach((c, i) => {
    for (const e of inSpan[i] ?? []) {
      const role = roleOf(e, i);
      if (role === "third")
        marks.set(e.id, {
          role,
          tag: "3",
          words: `the 3rd of ${c.symbol} (${glyph(c.guide.third as string)})`,
        });
      else if (role === "seventh")
        marks.set(e.id, {
          role,
          tag: "7",
          words: `the 7th of ${c.symbol} (${glyph(c.guide.seventh as string)})`,
        });
    }
  });
  // One line: at each chord the sounding note of the step's pitch class nearest the note before it. Where the
  // first chord sounds that pitch class in several octaves, the start that makes the smoothest line is taken.
  const walk = (steps: readonly (GuideToneStep | null)[], startMidi: number | null): GuidePoint[] => {
    const out: GuidePoint[] = [];
    let prev: number | null = startMidi;
    let first = true;
    steps.forEach((st, i) => {
      const span = spans[i];
      if (!st || !span) return;
      const pc = mod12(st.midi);
      const sounding = (inSpan[i] ?? []).filter((e) => mod12(e.midi as number) === pc);
      const want: number = prev ?? st.midi;
      const near = [...sounding].sort(
        (a, b) =>
          Math.abs((a.midi as number) - want) - Math.abs((b.midi as number) - want) ||
          R.cmp(a.onset, b.onset),
      )[0];
      const midi = near ? Math.round(near.midi as number) : nearestOctave(st.midi, want);
      out.push({
        from: span.from,
        to: span.to,
        midi,
        role: st.role,
        name: glyph(st.name),
        chord: (chords[i] as ChordColourView).symbol,
        eventId: near?.id ?? null,
        move: first || prev === null ? 0 : midi - prev,
      });
      first = false;
      prev = midi;
    });
    return out;
  };
  const lineOf = (steps: readonly (GuideToneStep | null)[]): GuidePoint[] => {
    const at = steps.findIndex((st) => st !== null);
    const st = steps[at];
    if (at < 0 || !st) return [];
    const starts = [
      ...new Set(
        (inSpan[at] ?? [])
          .filter((e) => mod12(e.midi as number) === mod12(st.midi))
          .map((e) => Math.round(e.midi as number)),
      ),
    ];
    let best = walk(steps, null);
    const cost = (l: GuidePoint[]) => l.reduce((sum, p) => sum + Math.abs(p.move), 0);
    for (const m of starts) {
      const l = walk(steps, m);
      if (cost(l) < cost(best)) best = l;
    }
    return best;
  };
  const a = lineOf(view.guideLines.fromThird);
  const b = lineOf(view.guideLines.fromSeventh);
  const same = a.length === b.length && a.every((p, i) => p.midi === b[i]?.midi && p.role === b[i]?.role);
  return { marks, lines: same ? [a] : [a, b].filter((l) => l.length > 0) };
}

function nearestOctave(midi: number, near: number): number {
  let m = midi;
  while (m - near > 6) m -= 12;
  while (near - m > 6) m += 12;
  return m;
}

/** "F → F → E": a guide line in words (the roll's accessible summary and the fact over it). */
export function guideLineText(line: readonly GuidePoint[]): string {
  // Written as everywhere else on screen: F♯, B♭ (the points keep the code's "F#", "Bb").
  return line.map((p) => glyph(p.name)).join(" → ");
}

/** The same, short enough for the line over the roll: the first four notes and the last of a long line. */
export function guideLineShort(line: readonly GuidePoint[], most = 6): string {
  if (line.length <= most) return guideLineText(line);
  const names = line.map((p) => glyph(p.name));
  return `${names.slice(0, 4).join(" → ")} → … → ${names[names.length - 1]}`;
}

// --- the mode's colour tone ----------------------------------------------------------------------------------

export interface ModeMark {
  /** "♭7". */
  display: string;
  syllable: string;
  /** "F". */
  name: string;
  /** "Mixolydian". */
  mode: string;
}

/** The four colour modes of U14 (major and minor have no single colour tone to ring). */
export function isColourMode(key: KeySpec | null): boolean {
  if (!key || key.mode === "major" || key.mode === "minor") return false;
  return modeColour(key.mode) !== null;
}

/** The mode's characteristic tone of a key as a mark, when `midi` is it. */
export function modeMarkOf(midi: number, key: KeySpec | null): ModeMark | null {
  if (!key || !isColourMode(key)) return null;
  const tone = characteristicTonesOf(key).find((t) => t.pc === mod12(midi));
  if (!tone) return null;
  return {
    display: tone.display,
    syllable: tone.syllable,
    name: glyph(tone.name),
    mode: modeColour(key.mode)?.name ?? key.mode,
  };
}

// --- rhythm II on the roll -----------------------------------------------------------------------------------

export interface PushMark {
  /** How early the note comes: an eighth or a sixteenth. */
  by: 8 | 16;
  /** The beat it anticipates, in cycles. */
  beat: number;
  acrossBar: boolean;
}

/** One line of the beat grid inside a bar. */
export interface RollBeatLine {
  /** Position in the bar, 0 … 1. */
  at: number;
  level: "beat" | "sub";
  /** "1", "la", "li", "&", "trip", "let" (empty for a line with no count). */
  label: string;
  /** A third of a beat in a simple meter (a triplet). */
  triplet: boolean;
}

export interface RollBeatGrid {
  /** The beat is the dotted quarter (6/8, 9/8, 12/8). */
  compound: boolean;
  beats: number;
  /** "2 beats of three eighths (count 1 la li 2 la li)". */
  text: string;
  /** The lines of one bar (0-based); `[]` where the lens has nothing to add to the plain grid. */
  linesOf(bar: number): readonly RollBeatLine[];
}

export interface RhythmMarks {
  view: RhythmView;
  pushes: ReadonlyMap<string, PushMark>;
  /** Ghost notes (effective gain at most 0.4), by event ID. */
  ghosts: ReadonlySet<string>;
  /** Beats cut in three in a simple meter (a triplet, or a third of a quarter-note triplet): "bar:beat", 0-based. */
  triplets: ReadonlySet<string>;
  /** What the beat-grid lens draws; `null` in a simple meter with no triplets (the plain grid says it all). */
  grid: RollBeatGrid | null;
}

/**
 * The beat grid the lens draws (wave6.md §4.3): in a compound meter the dotted-quarter beats, each in three
 * ("1 la li"); in a simple meter the plain counts with a triplet's beat cut in three ("1 trip let") where the
 * code plays one. `null` when neither applies.
 */
export function rollBeatGrid(meter: MeterId, triplets: ReadonlySet<string>): RollBeatGrid | null {
  const m = METERS[meter];
  if (m.tempoUnit === "eighth") return null;
  const base = beatGrid(meter);
  const line = (l: (typeof base.lines)[number], triplet: boolean): RollBeatLine => ({
    at: R.toNum(l.at),
    level: l.level,
    label: l.label,
    triplet,
  });
  if (base.compound) {
    const lines = base.lines.map((l) => line(l, false));
    return {
      compound: true,
      beats: base.beats,
      text: `${base.beats} beats of three eighths (count ${base.lines.map((l) => l.label).join(" ")})`,
      linesOf: () => lines,
    };
  }
  if (triplets.size === 0) return null;
  const tri = beatGrid(meter, { triplets: true });
  const cache = new Map<number, RollBeatLine[]>();
  return {
    compound: false,
    beats: base.beats,
    text: "Triplets: a beat cut in three (count 1 trip let)",
    linesOf: (bar) => {
      const hit = cache.get(bar);
      if (hit) return hit;
      const out: RollBeatLine[] = [];
      let any = false;
      for (let beat = 0; beat < base.beats; beat++) {
        const cut = triplets.has(`${bar}:${beat}`);
        if (cut) any = true;
        const src = cut ? tri.lines : base.lines;
        const lo = beat / base.beats;
        const hi = (beat + 1) / base.beats;
        for (const l of src) {
          const at = R.toNum(l.at);
          if (at >= lo - 1e-9 && at < hi - 1e-9) out.push(line(l, cut && l.level === "sub"));
        }
      }
      const lines = any ? out.sort((a, b) => a.at - b.at) : [];
      cache.set(bar, lines);
      return lines;
    },
  };
}

/**
 * The beats of a simple meter that some learner line cuts in three: an onset a third (or a sixth, a ninth) of the
 * way through the beat. An eighth-note triplet marks its beat; a quarter-note triplet marks both of its beats (its
 * notes fall on thirds of each). Where the grader's `tupletsOf` reports a group, this says which beats to draw.
 */
export function tripletBeats(events: readonly NEvent[], meter: MeterId): Set<string> {
  const m = METERS[meter];
  const out = new Set<string>();
  if (m.tempoUnit !== "quarter") return out;
  for (const e of events) {
    if (e.track.startsWith("band.")) continue;
    // Position in beats: a denominator divisible by 3 is a third of a beat.
    const inBeats = R.mul(e.onset, [m.unitsPerBar, 1]);
    if (inBeats[1] % 3 !== 0) continue;
    const bar = R.floor(e.onset);
    const beat = Math.floor(R.toNum(inBeats) - bar * m.unitsPerBar + 1e-9);
    out.add(`${bar}:${beat}`);
  }
  return out;
}

/**
 * The learner tracks that swing and do nothing else off the straight grid (`swingView`): every onset sits on a
 * beat or on its swung off-beat. A line of real triplets (`.ply(3)`) also measures as swung, but it has notes on
 * the first third of the beat, which no swung eighth has: it is not in this set.
 */
export function swungOnly(n: Normalized, meter: MeterId): Set<string> {
  const m = METERS[meter];
  const out = new Set<string>();
  for (const t of swingView(n, meter)) {
    if (t.swung === null) continue;
    const p = t.swung === 8 ? t.eighths.p : t.sixteenths.p;
    if (!p) continue;
    const off = R.toNum(p);
    const allowed = t.swung === 8 ? [0, off] : [0, off / 2, 0.5, 0.5 + off / 2];
    const fits = (n.byTrack[t.track] ?? []).every((e) => {
      const inBeats = R.toNum(e.onset) * m.unitsPerBar;
      const frac = inBeats - Math.floor(inBeats + 1e-9);
      return allowed.some((a) => Math.abs(frac - a) < 1e-6);
    });
    if (fits) out.add(t.track);
  }
  return out;
}

/**
 * Pushes and ghost notes from the grader's `rhythmView`; the beats cut in three from the events themselves.
 * `swung` names the tracks that swing (`swingView`): a swung eighth sits on a triplet's place, but it is written
 * and counted as swing (contracts §6.10), so those lines never ask for the triplet grid.
 */
export function rhythmMarksOf(
  view: RhythmView,
  events: readonly NEvent[] = [],
  swung: ReadonlySet<string> = new Set(),
): RhythmMarks {
  const pushes = new Map<string, PushMark>();
  const ghosts = new Set<string>();
  for (const t of view.tracks) {
    for (const p of t.pushes) pushes.set(p.id, { by: p.by, beat: R.toNum(p.beat), acrossBar: p.acrossBar });
    for (const id of t.ghosts) ghosts.add(id);
  }
  // Only where the grader hears tuplets at all, in a line that does not swing.
  const tuplets = view.tracks.some(
    (t) => !swung.has(t.track) && t.tuplets.some((tu) => tu.division % 3 === 0),
  );
  const triplets =
    tuplets && !view.compound
      ? tripletBeats(
          events.filter((e) => !swung.has(e.track)),
          view.meter,
        )
      : new Set<string>();
  return { view, pushes, ghosts, triplets, grid: rollBeatGrid(view.meter, triplets) };
}

/** "pushed an eighth: it lands before beat 3 and holds through it". */
export function pushWords(p: PushMark, beatsPerBar: number): string {
  const beat = Math.round((p.beat - Math.floor(p.beat + 1e-9)) * beatsPerBar) + 1;
  return `pushed ${p.by === 8 ? "an eighth" : "a sixteenth"}: it comes in ahead of beat ${beat}${p.acrossBar ? " of the next bar" : ""}`;
}

// --- the piece's Wave 6 views, built with the model ----------------------------------------------------------

export interface WorkbenchColour {
  /** Every chord with its seventh, kind, target and guide tones; `null` when the piece plays no chords. */
  harmony: ChromaticHarmonyView | null;
  /** One colour per region of `WorkbenchHarmony.regions`, by index; `null` where no chord was read there. */
  regions: readonly (ChordColourView | null)[];
  keyPlan: KeyPlanView;
  /** The key ribbon; one span for a piece in one key (the ribbon then draws nothing). */
  keys: KeyRibbonSpan[];
  guide: GuideTones;
  rhythm: RhythmMarks | null;
  /** The colour tone of the mode in force, per event ID (set by the model, which knows each note's key). */
  mode: ReadonlyMap<string, ModeMark>;
}

export interface ColourContext {
  code: string;
  meter: MeterId;
  key: KeySpec | null;
  bars: number;
  pickup?: PickupSpec | null;
}

/** The key plan of the piece (never throws: a view is an aid). */
export function keyPlanOf(n: Normalized, ctx: ColourContext): KeyPlanView {
  try {
    return keyPlanView(n, {
      meter: ctx.meter,
      code: ctx.code,
      ...(ctx.key ? { key: ctx.key } : {}),
      ...(ctx.pickup ? { pickup: ctx.pickup } : {}),
    });
  } catch {
    return { track: null, spans: [], changes: [] };
  }
}

/**
 * The Wave 6 views of a normalized piece. `chordPiece` is the piece the chord band was read from (the learner's
 * chords, or the Band's read as the learner's under a melody: harmony.ts), so the colours line up with its regions.
 */
export function workbenchColour(
  n: Normalized,
  chordPiece: Normalized,
  harmony: Pick<WorkbenchHarmony, "regions"> | null,
  plan: KeyPlanView,
  ctx: ColourContext,
): WorkbenchColour {
  const base = {
    meter: ctx.meter,
    ...(ctx.key ? { key: ctx.key } : {}),
    ...(ctx.pickup ? { pickup: ctx.pickup } : {}),
  };
  let view: ChromaticHarmonyView | null = null;
  if (harmony && harmony.regions.length > 0) {
    try {
      view = chromaticHarmonyView(chordPiece, { ...base, code: ctx.code, bars: ctx.bars });
    } catch {
      view = null;
    }
  }
  const byOnset = new Map<string, ChordColourView>();
  for (const c of view?.chords ?? []) byOnset.set(R.toNum(c.at).toFixed(6), c);
  const regions = (harmony?.regions ?? []).map((r) => byOnset.get(r.from.toFixed(6)) ?? null);
  let rhythm: RhythmMarks | null = null;
  try {
    let swung = new Set<string>();
    try {
      swung = swungOnly(n, ctx.meter);
    } catch {
      swung = new Set<string>();
    }
    rhythm = rhythmMarksOf(rhythmView(n, { ...base, bars: ctx.bars }), n.all, swung);
  } catch {
    rhythm = null;
  }
  return {
    harmony: view,
    regions,
    keyPlan: plan,
    keys: keyRibbonOf(plan, ctx.bars),
    guide: view
      ? guideTonesOf(view, chordPiece.all, ctx.bars)
      : { marks: new Map<string, GuideMark>(), lines: [] },
    rhythm,
    mode: new Map<string, ModeMark>(),
  };
}

// --- what the chord band writes at a depth -------------------------------------------------------------------

/** One region of the chord band as it is written for this learner. */
export interface BandChord {
  symbol: string;
  rn: string | null;
  /** Something was held back (a seventh, or the numeral of a chord not taught yet): drawn quieter, never a lock. */
  reduced: boolean;
  kind: ChromaticChordKind | null;
  /** An applied chord: the numeral it points at, and whether the next chord is that chord. */
  arrow: { target: string; resolves: boolean } | null;
  /** A borrowed chord, in words: "borrowed from C minor". */
  borrowed: string | null;
  /** The key the numeral is read in (the key in force at its bar). */
  key: KeySpec | null;
}

const BORROWED_KINDS: readonly ChromaticChordKind[] = ["borrowed", "picardy", "dorian-iv"];

function borrowedWords(c: ChordColourView): string {
  if (c.kind === "picardy") return "Picardy third: the major home chord ending a minor piece";
  if (c.kind === "dorian-iv") return "the major IV in a minor key, borrowed from Dorian";
  return `borrowed from ${keyDisplay(parallelKey(c.key))}`;
}

/** The triad of a seventh chord, spelled as the key spells it and kept over its bass (unless the 7th is the bass). */
function heldTriad(c: ChordColourView): ChordId {
  const core = triadCore(c.chord);
  const keepBass = chordPcs({ ...c.chord, quality: core.quality, ext: [], bassPc: c.chord.rootPc }).includes(
    c.chord.bassPc,
  );
  const triad: ChordId = {
    ...c.chord,
    quality: core.quality,
    ext: [],
    bassPc: keepBass ? c.chord.bassPc : c.chord.rootPc,
  };
  // The key's own spelling (C♯m in A major, never D♭m), when the numeral names the same chord.
  const spelled = chordOfRoman(romanText({ ...triad, bassPc: triad.rootPc }, c.key), c.key);
  return spelled && spelled.rootPc === triad.rootPc && spelled.quality === triad.quality
    ? { ...spelled, bassPc: triad.bassPc }
    : triad;
}

/**
 * The chord band at a depth: one entry per region of the harmony. A region keeps what the grader's `harmonyView`
 * wrote (its inversion figure, its spelling in the key) wherever the depth changes nothing; a seventh closed to
 * this learner is written as its triad, an applied or borrowed chord not taught yet keeps its symbol and has no
 * numeral (`chordLensText`).
 */
export function bandChords(
  regions: readonly ChordRegion[],
  colours: readonly (ChordColourView | null)[],
  depth: HarmonyDepth,
): BandChord[] {
  return regions.map((r, i) => {
    const c = colours[i] ?? null;
    if (!c)
      return {
        symbol: r.symbol,
        rn: r.rn,
        reduced: false,
        kind: null,
        arrow: null,
        borrowed: null,
        key: null,
      };
    const t = chordLensText(c, depth);
    const held = !depth.sevenths && c.chord.quality !== triadCore(c.chord).quality;
    let symbol = r.symbol;
    let rn: string | null = t.rn === null ? null : r.rn;
    if (held) {
      const triad = heldTriad(c);
      symbol = toLeadSheet(triad);
      if (t.rn !== null) {
        const next = colours[i + 1]?.chord;
        rn = rnDisplay(romanText(triad, c.key, next ? { ...next, bassPc: next.rootPc } : undefined), c.key);
      }
    }
    const applied = c.kind === "applied" && depth.applied && c.target !== null;
    const lent = BORROWED_KINDS.includes(c.kind) && depth.borrowed;
    return {
      symbol,
      rn,
      reduced: t.reduced,
      kind: c.kind,
      arrow: applied
        ? { target: rnDisplay(c.target, c.key) ?? (c.target as string), resolves: c.resolves === true }
        : null,
      borrowed: lent ? borrowedWords(c) : null,
      key: c.key,
    };
  });
}

/** The chord labels of the staff and the lead sheet for the band as written (bar = 0-based cycle). */
export function bandLabels(
  regions: readonly ChordRegion[],
  band: readonly BandChord[],
  unitsPerBar: number,
): ChordLabel[] {
  return regions.map((r, i) => {
    const bar = Math.floor(r.from + 1e-9);
    const beat = Math.round(((r.from - bar) * unitsPerBar + 1) * 1000) / 1000;
    return { bar, beat, symbol: band[i]?.symbol ?? r.symbol, rn: band[i] ? band[i].rn : r.rn };
  });
}

// --- a chromatic note's label at a depth ---------------------------------------------------------------------

/**
 * A note's label before chromatic solfège is taught: the label the earlier units gave it, without a syllable the
 * learner has not met (♯4 shows as "♯4", not "♯4 fi"). Notes of the key and the raised 6 and 7 of a minor key
 * (la, ti: U10.L06) are untouched.
 */
export function closedLabel(label: PitchLabel | null): PitchLabel | null {
  const d = label?.degree;
  if (!label || !d || d.inKey || !LATE_SYLLABLES.has(d.syllable)) return label;
  return { ...label, degree: { ...d, syllable: "" } };
}

/**
 * Whether a chromatic note under a chord reads raised or lowered once chromatic degrees are taught
 * (`degreeLensText`: G♯ under E7 is ♯5 "si", under A♭ it is ♭6 "le"); `null` when the chord does not decide.
 */
export function chordReading(midi: number, key: KeySpec, chord: ChordId, current: string): 1 | -1 | null {
  const t = degreeLensText(midi, key, { chromatic: true }, { chord });
  if (!t.chromatic || t.degree === current) return null;
  return t.degree.startsWith("♯") ? 1 : t.degree.startsWith("♭") ? -1 : null;
}
