// "Hum it, Oak drafts it" (contracts §6.12): a sung line (SungNote[]) plus key and tempo becomes a draft
// `n("…").scale("…")` line quantized to the bar grid. The draft is machine-made: it gives no evidence
// until the learner's corrected version is checked.
//
// Scale steps follow Strudel 1.2.6 exactly (verified headlessly in hum.test.ts): `n(k)` is scale step k
// from the tonic of `.scale("G4:major")`, wrapping by octaves; a step string "3#" / "4b" is that step
// raised / lowered by a semitone; negative steps go below the tonic.
import type { KeySpec, LearnerProfile, MeterId, Rat, ScaleMode } from "@oak/content-kit";
import { barSeconds, labelPitch, METERS, tempoLine } from "@oak/theory";
import { median } from "./math.ts";
import { pitchFramesToNotes, trackerOptionsFor } from "./tracker.ts";
import type {
  HumDraft,
  HumDraftNote,
  HumDraftOptions,
  HumDraftWarning,
  PitchFrame,
  SungNote,
} from "./types.ts";

/** Semitones of each scale from its tonic, as Strudel's `.scale()` (tonal) resolves them. */
export const SCALE_INTERVALS: Readonly<Record<ScaleMode, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
  "melodic minor": [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  "major pentatonic": [0, 2, 4, 7, 9],
  "minor pentatonic": [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10],
};

const LETTER_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Pitch class of a spelled tonic ("Eb", "F#", "C"). Throws a `RangeError` on anything else. */
export function tonicPc(tonic: string): number {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2})?$/.exec(tonic.trim());
  if (!m) throw new RangeError(`@oak/pitch: bad tonic "${tonic}"`);
  const base = LETTER_PC[(m[1] as string).toUpperCase()] as number;
  const acc = m[2] ?? "";
  const shift = acc.startsWith("#") ? acc.length : -acc.length;
  return (((base + shift) % 12) + 12) % 12;
}
/** MIDI of the tonic in a scientific octave: C4 = 60. B#3 and Cb4 keep their written octave, as in Strudel. */
export function tonicMidi(tonic: string, octave: number): number {
  const m = /^([A-Ga-g])(#{1,2}|b{1,2})?$/.exec(tonic.trim());
  if (!m) throw new RangeError(`@oak/pitch: bad tonic "${tonic}"`);
  const base = LETTER_PC[(m[1] as string).toUpperCase()] as number;
  const acc = m[2] ?? "";
  const shift = acc.startsWith("#") ? acc.length : -acc.length;
  return 12 * (octave + 1) + base + shift;
}
/** `"G4:major"`, `"A3:harmonic:minor"`: uppercase tonic, octave, every space a colon (STYLE §1.3). */
export function scaleName(key: KeySpec, octave: number): string {
  const t = key.tonic.trim();
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${octave}:${key.mode.replace(/ /g, ":")}`;
}
/** MIDI an `n` step plays in a scale whose tonic is `tonic` (MIDI): "3#", "-1", 7. */
export function stepMidi(step: number | string, tonic: number, mode: ScaleMode): number {
  const iv = SCALE_INTERVALS[mode];
  const m = /^(-?\d+)(#|b)?$/.exec(String(step).trim());
  if (!m) throw new RangeError(`@oak/pitch: bad step "${step}"`);
  const k = Number(m[1]);
  const len = iv.length;
  const oct = Math.floor(k / len);
  const idx = k - oct * len;
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return tonic + 12 * oct + (iv[idx] as number) + acc;
}

interface Choice {
  step: string;
  midi: number;
  snapped: boolean;
}
/** Nearest scale step to a (fractional, tuning-corrected) MIDI value. */
function chooseStep(m: number, tonic: number, mode: ScaleMode, chromatic: "snap" | "keep"): Choice {
  const iv = SCALE_INTERVALS[mode];
  const len = iv.length;
  const r = Math.round(m);
  const rel = r - tonic;
  const oct = Math.floor(rel / 12);
  const pc = rel - 12 * oct;
  const idx = iv.indexOf(pc);
  if (idx >= 0) return { step: String(idx + oct * len), midi: r, snapped: false };
  if (chromatic === "keep") {
    // Raise the scale tone below (Strudel's "3#"), else lower the one above ("1b"); the tonic an octave up
    // counts as the tone above pc 11.
    const below = iv.indexOf(pc - 1);
    if (below >= 0) return { step: `${below + oct * len}#`, midi: r, snapped: false };
    const above = iv.indexOf(pc + 1);
    if (above >= 0) return { step: `${above + oct * len}b`, midi: r, snapped: false };
    if (pc + 1 === 12) return { step: `${len + oct * len}b`, midi: r, snapped: false };
  }
  // Snap to the nearer scale tone, measured from the sung pitch itself.
  let best: { k: number; midi: number } | null = null;
  for (let k = (oct - 1) * len; k <= (oct + 2) * len; k++) {
    const midi = stepMidi(k, tonic, mode);
    if (best === null || Math.abs(midi - m) < Math.abs(best.midi - m) - 1e-9) best = { k, midi };
  }
  const b = best as { k: number; midi: number };
  return { step: String(b.k), midi: b.midi, snapped: true };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
}
function rat(n: number, d: number): Rat {
  const g = gcd(n, d) || 1;
  return [n / g, d / g] as Rat;
}

/** Constant tuning offset of a line in cents, (−50, 50]: the circular mean of each note's distance to the nearest semitone. */
export function tuningOffsetCents(midis: readonly number[]): number {
  if (midis.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const m of midis) {
    const a = 2 * Math.PI * (m - Math.round(m));
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  if (Math.hypot(sx, sy) < 1e-9) return 0;
  const cents = (Math.atan2(sy, sx) / (2 * Math.PI)) * 100;
  return cents <= -50 ? 50 : cents;
}

/** Slots per bar of the default grid: eighth notes. */
export function defaultSlotsPerBar(meter: MeterId): number {
  const m = METERS[meter];
  return m.den === 4 ? m.num * 2 : m.num;
}

/**
 * Turns sung notes into a draft Strudel line in `key` at `bpm`, quantized to the bar grid (eighth notes
 * by default). Pitch: a constant tuning offset is removed first, then each note goes to the nearest scale
 * step ("snap", the default) or keeps a chromatic step ("keep": "3#"). Time: onsets and ends round to the
 * grid from `downbeat` (default: the first note's start); two notes on one slot keep the longer one; a
 * note that crosses a bar line is cut at the bar line; bars past `maxBars` are dropped. Each bar becomes
 * one step of a `<…>` sequence, reduced to the coarsest grid that keeps every onset and length.
 */
export function draftFromHum(notes: readonly SungNote[], opts: HumDraftOptions): HumDraft {
  const meter: MeterId = opts.meter ?? "4/4";
  const slots = Math.max(1, Math.round(opts.slotsPerBar ?? defaultSlotsPerBar(meter)));
  const maxBars = Math.max(1, Math.round(opts.maxBars ?? 8));
  const latency = (opts.latencyMs ?? 0) / 1000;
  const label = opts.label ?? "mel";
  const chromatic = opts.chromatic ?? "snap";
  const barSec = barSeconds(opts.bpm, meter);
  const slotSec = barSec / slots;
  const warnings: HumDraftWarning[] = [];

  const sung = notes
    .map((n, source) => ({ source, start: n.start - latency, end: n.end - latency, midi: n.midi }))
    .filter((n) => Number.isFinite(n.midi) && n.end > n.start)
    .sort((a, b) => a.start - b.start);

  const tuningCents = tuningOffsetCents(sung.map((n) => n.midi));
  const corrected = sung.map((n) => n.midi - tuningCents / 100);

  // Octave of the scale: the tonic octave given, the line moved by whole octaves onto it; otherwise the
  // octave whose tonic-to-tonic span holds most of the line (ties: the lower one).
  const pc = tonicPc(opts.key.tonic);
  let octaveShift = 0;
  let octave: number;
  const centre = corrected.length > 0 ? median(corrected) : 60;
  if (opts.tonicOctave !== undefined) {
    octave = opts.tonicOctave;
    const t = tonicMidi(opts.key.tonic, octave);
    // Put the line's centre inside the octave above the tonic (a melody around 5 sits at t + 7).
    octaveShift = Math.round((t + 6 - centre) / 12);
  } else {
    let bestCount = -1;
    octave = 4;
    for (let o = 0; o <= 8; o++) {
      const t = 12 * (o + 1) + pc;
      const count = corrected.filter((m) => m >= t - 0.5 && m < t + 11.5).length;
      if (count > bestCount) {
        bestCount = count;
        octave = o;
      }
    }
  }
  const tonic = tonicMidi(opts.key.tonic, octave);
  const scale = scaleName(opts.key, octave);

  // Pitch and grid position of every note.
  // The downbeat is musical time (a click, a Strudel cycle): only the sung notes carry the latency.
  const downbeat = opts.downbeat === undefined ? (sung[0]?.start ?? 0) : opts.downbeat;
  interface Placed {
    source: number;
    on: number;
    off: number;
    secs: number;
    choice: Choice;
    m: number;
  }
  const placed: Placed[] = [];
  sung.forEach((n, k) => {
    const m = (corrected[k] as number) + 12 * octaveShift;
    const on = Math.round((n.start - downbeat) / slotSec);
    const off = Math.max(on + 1, Math.round((n.end - downbeat) / slotSec));
    if (on < 0) {
      warnings.push({ code: "before-downbeat", source: n.source });
      return;
    }
    const choice = chooseStep(m, tonic, opts.key.mode, chromatic);
    if (choice.snapped) {
      warnings.push({
        code: "chromatic-snapped",
        source: n.source,
        sungMidi: Math.round(m * 100) / 100,
        midi: choice.midi,
      });
    }
    placed.push({ source: n.source, on, off, secs: n.end - n.start, choice, m });
  });

  // One note per onset slot: the longer one wins.
  const bySlot = new Map<number, Placed>();
  for (const p of placed) {
    const prev = bySlot.get(p.on);
    if (!prev) bySlot.set(p.on, p);
    else if (p.secs > prev.secs) {
      warnings.push({ code: "collision-dropped", source: prev.source });
      bySlot.set(p.on, p);
    } else warnings.push({ code: "collision-dropped", source: p.source });
  }
  let kept = [...bySlot.values()].sort((a, b) => a.on - b.on);
  const limit = maxBars * slots;
  if (kept.some((p) => p.on >= limit)) {
    kept = kept.filter((p) => p.on < limit);
    warnings.push({ code: "truncated", bars: maxBars });
  }
  // A note ends at the next onset, at the bar line, and inside the draft.
  const draftNotes: HumDraftNote[] = [];
  const events: { bar: number; on: number; off: number; step: string }[] = [];
  kept.forEach((p, k) => {
    const next = kept[k + 1];
    const bar = Math.floor(p.on / slots);
    const barEnd = (bar + 1) * slots;
    let off = Math.min(p.off, next ? next.on : p.off, limit);
    if (off > barEnd) {
      warnings.push({ code: "tie-truncated", source: p.source, bar });
      off = barEnd;
    }
    const onIn = p.on - bar * slots;
    const offIn = off - bar * slots;
    events.push({ bar, on: onIn, off: offIn, step: p.choice.step });
    draftNotes.push({
      source: p.source,
      bar,
      onset: rat(onIn, slots),
      dur: rat(offIn - onIn, slots),
      step: p.choice.step,
      midi: p.choice.midi,
      cents: Math.round((p.m - p.choice.midi) * 1000) / 10,
      degree: labelPitch(p.choice.midi, opts.key).degree,
      octave: Math.floor((p.choice.midi - tonic) / 12),
    });
  });

  const bars =
    events.length > 0 ? Math.min(maxBars, (events[events.length - 1] as { bar: number }).bar + 1) : 0;
  if (events.length === 0) warnings.push({ code: "empty" });
  const barTexts: string[] = [];
  for (let b = 0; b < bars; b++)
    barTexts.push(
      barText(
        events.filter((e) => e.bar === b),
        slots,
      ),
    );
  let pattern: string;
  if (bars === 0) pattern = "~";
  else if (bars === 1) pattern = unwrap(barTexts[0] as string);
  else pattern = `<${barTexts.join(" ")}>`;
  const tempo = tempoLine(opts.bpm, meter);
  const sound = opts.sound ? `.s("${opts.sound}")` : "";
  const line = `${label}: n("${pattern}").scale("${scale}")${sound}`;
  return {
    machineMade: true,
    tempoLine: tempo,
    line,
    code: `${tempo}\n\n${line}`,
    pattern,
    scale,
    bars,
    notes: draftNotes,
    tuningCents: Math.round(tuningCents * 10) / 10,
    octaveShift,
    warnings,
  };
}

/** One bar as mini-notation on the coarsest grid that keeps every onset and end: `[0 _ 2 4]`, or `~`. */
function barText(events: readonly { on: number; off: number; step: string }[], slots: number): string {
  if (events.length === 0) return "~";
  let g = slots;
  for (const e of events) g = gcd(gcd(g, e.on), e.off);
  const n = slots / g;
  const cells: string[] = new Array<string>(n).fill("~");
  for (const e of events) {
    const a = e.on / g;
    const b = e.off / g;
    cells[a] = e.step;
    for (let i = a + 1; i < b; i++) cells[i] = "_";
  }
  return n === 1 ? (cells[0] as string) : `[${cells.join(" ")}]`;
}
function unwrap(text: string): string {
  return text.startsWith("[") && text.endsWith("]") ? text.slice(1, -1) : text;
}

/** Notes shorter than this are a slide or a consonant, not a note of the tune. */
export const HUM_MIN_NOTE_SEC = 0.09;

export interface HumToDraftOptions extends HumDraftOptions {
  /**
   * The learner's calibration: the tracker's voicing gates (a low voice, the room's noise floor) and, unless
   * `latencyMs` is given, the sing latency removed from every note.
   */
  profile?: Pick<LearnerProfile, "rangeLow" | "noiseFloorDb" | "singLatencyMs">;
  /** Drop notes shorter than this, seconds. Default `HUM_MIN_NOTE_SEC`. */
  minNoteSec?: number;
}

/** What `humToDraft` returns: the draft, and the notes the tracker heard (for the "what Oak heard" strip). */
export interface HumToDraftResult extends HumDraft {
  sung: SungNote[];
  /** The draft's degrees in order, 1-based ("1", "b3"), with each one's octave from the tonic. */
  degrees: { degree: HumDraftNote["degree"]; octave: number }[];
}

/**
 * "Hum it, Oak drafts it" from the microphone (contracts §6.12): sung or hummed pitch frames become notes
 * (the tracker the graders use: clarity gate, median of 5, octave repair, held-pitch splits), then a draft
 * quantised to the bar grid in `key` and `meter` (`draftFromHum`): onsets and lengths snapped to the grid, the
 * constant tuning offset removed, the octave chosen from where the line sits (or moved onto `tonicOctave`).
 * Every note carries its scale degree, 1-based, so the app can show the line in Oak's pitch language and write
 * `n()` code (`degree − 1`). The draft is machine-made: no evidence until the learner's corrected version is
 * checked.
 */
export function humToDraft(frames: readonly PitchFrame[], opts: HumToDraftOptions): HumToDraftResult {
  const profile = opts.profile ?? { rangeLow: 48, noiseFloorDb: -70, singLatencyMs: 0 };
  const minSec = opts.minNoteSec ?? HUM_MIN_NOTE_SEC;
  const sung = pitchFramesToNotes(frames, trackerOptionsFor(profile)).filter(
    (n) => n.end - n.start >= minSec && Number.isFinite(n.midi),
  );
  const latencyMs = opts.latencyMs ?? (Number.isFinite(profile.singLatencyMs) ? profile.singLatencyMs : 0);
  const draft = draftFromHum(sung, { ...opts, latencyMs });
  return {
    ...draft,
    sung,
    degrees: draft.notes.map((n) => ({ degree: n.degree, octave: n.octave })),
  };
}
