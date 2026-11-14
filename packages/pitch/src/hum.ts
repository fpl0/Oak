// "Hum it, Oak drafts it" (contracts §6.12): a sung line (SungNote[]) plus key and tempo becomes a draft
// `n("…").scale("…")` line quantized to the bar grid. The draft is machine-made: it gives no evidence
// until the learner's corrected version is checked.
//
// Scale steps follow Strudel 1.2.6 exactly (verified headlessly in hum.test.ts): `n(k)` is scale step k
// from the tonic of `.scale("G4:major")`, wrapping by octaves; a step string "3#" / "4b" is that step
// raised / lowered by a semitone; negative steps go below the tonic.
//
// Wave 5: a note held across a bar line is tied over it (c7: the line becomes one sequence over the bars with
// `.slow(bars)`), a swinging project is straightened before quantising and drafted with `.swingBy`, and in
// minor the raised 6 and 7 are kept and spelled as the dialect writes them ("5#", "6#"; ♭ degrees "2b", "6b").
import type { Degree, KeySpec, LearnerProfile, MeterId, Rat, ScaleMode, SwingSpec } from "@oak/content-kit";
import { barSeconds, labelPitch, METERS, strudelStep, swingByArgs, tempoLine } from "@oak/theory";
import { median } from "./math.ts";
import { pitchFramesToNotes, trackerOptionsFor } from "./tracker.ts";
import type {
  HumDraft,
  HumDraftNote,
  HumDraftOptions,
  HumDraftWarning,
  HumKeySpan,
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
  /** The degree the step was spelled from, when it is not the key's own label (a kept ♭5 rather than ♯4). */
  degree?: Degree;
}

const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11] as const;
/** Semitones above the tonic of a degree relative to major ("b3" → 3, "#4" → 6), 0–11. */
function degreeSemis(d: Degree): number | null {
  const m = /^(bb|b|##|#)?([1-7])$/.exec(d);
  if (!m) return null;
  const acc = m[1] ?? "";
  const alt = acc.startsWith("#") ? acc.length : -acc.length;
  return ((((MAJOR_SEMIS[Number(m[2]) - 1] as number) + alt) % 12) + 12) % 12;
}

/**
 * The step string that plays the chromatic MIDI note `r` in a seven-note scale, spelled as the dialect writes
 * `degree` (default: the degree Oak labels `r` with): STYLE §6, ♭3 is "2b", ♯4 "3#", ♭5 "4b", ♭7 "6b"; in minor
 * the raised 6 and 7, la and ti, are "5#" and "6#". `null` when the scale is not a seven-note one or the spelling
 * would not play `r`.
 */
function dialectStep(r: number, tonic: number, key: KeySpec, degree?: Degree): string | null {
  if (SCALE_INTERVALS[key.mode].length !== 7) return null;
  const m = /^(\d+)(#|b)$/.exec(String(strudelStep(degree ?? labelPitch(r, key).degree, key)));
  if (!m) return null;
  const idx = Number(m[1]);
  const acc = m[2] as string;
  const oct = Math.round((r - stepMidi(`${idx}${acc}`, tonic, key.mode)) / 12);
  const step = `${idx + 7 * oct}${acc}`;
  return stepMidi(step, tonic, key.mode) === r ? step : null;
}

/** Degrees kept as chromatic steps by default (`HumDraftOptions.keepDegrees`): la and ti in minor. */
export function defaultKeepDegrees(mode: ScaleMode): readonly Degree[] {
  if (mode === "minor") return ["6", "7"];
  if (mode === "harmonic minor") return ["6"];
  return [];
}

/** Nearest scale step to a (fractional, tuning-corrected) MIDI value. */
function chooseStep(
  m: number,
  tonic: number,
  key: KeySpec,
  chromatic: "snap" | "keep",
  keep: readonly Degree[],
): Choice {
  const mode = key.mode;
  const iv = SCALE_INTERVALS[mode];
  const len = iv.length;
  const r = Math.round(m);
  const rel = r - tonic;
  const oct = Math.floor(rel / 12);
  const pc = rel - 12 * oct;
  const idx = iv.indexOf(pc);
  if (idx >= 0) return { step: String(idx + oct * len), midi: r, snapped: false };
  // A kept degree is matched by its pitch (♭5 and ♯4 are one pitch) and spelled as it was named.
  const keptAs = keep.find((d) => degreeSemis(d) === (((r - tonicPc(key.tonic)) % 12) + 12) % 12);
  if (chromatic === "keep" || keptAs) {
    const spelled = dialectStep(r, tonic, key, keptAs);
    if (spelled !== null)
      return { step: spelled, midi: r, snapped: false, ...(keptAs ? { degree: keptAs } : {}) };
    // Pentatonic and blues scales: raise the scale tone below ("3#"), else lower the one above ("1b"); the
    // tonic an octave up counts as the tone above pc 11.
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

/**
 * Straightens a time (seconds from the downbeat) on the swung subdivision (contracts §6.10): within each swing
 * slot of `slotSec` (a beat for 8ths, half a beat for 16ths) the swung off-beat at `(1 + amount) / 2` maps to the
 * straight off-beat at 1/2, piecewise linearly, so an onset is quantised to the straight grid it was swung from.
 */
export function straightenTime(t: number, slotSec: number, amount: number): number {
  if (!(amount > 0) || !(slotSec > 0)) return t;
  const k = Math.floor(t / slotSec);
  const p = t / slotSec - k;
  const off = (1 + amount) / 2;
  const q = p <= off ? (p * 0.5) / off : 0.5 + ((p - off) * 0.5) / (1 - off);
  return (k + q) * slotSec;
}

/** A swing amount as STYLE §1 rule 6 writes a musical ratio: `1/3`, `1/4`; otherwise a decimal (`.2`). */
export function amountText(x: number): string {
  for (let d = 2; d <= 12; d++) {
    const n = Math.round(x * d);
    if (n > 0 && Math.abs(n / d - x) < 1e-6) return `${n}/${d}`;
  }
  return String(Math.round(x * 100) / 100).replace(/^0\./, ".");
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

/** Slots per bar of the default grid: eighth notes (sixteenths when the line swings 16ths). */
export function defaultSlotsPerBar(meter: MeterId, swing?: SwingSpec | null): number {
  const m = METERS[meter];
  if (swing?.subdivision === 16 && swing.amount > 0 && swingByArgs(meter, 16) !== null)
    return m.unitsPerBar * 4;
  return m.den === 4 ? m.num * 2 : m.num;
}

/**
 * Turns sung notes into a draft Strudel line in `key` at `bpm`, quantized to the bar grid (eighth notes
 * by default). Pitch: a constant tuning offset is removed first, then each note goes to the nearest scale
 * step ("snap", the default) or keeps a chromatic step ("keep", and always for `keepDegrees`: the raised 6 and 7
 * in minor), spelled as the dialect writes the degree ("2b" for ♭3, "6#" for the raised 7 in minor). Time: with
 * a declared swing, onsets and ends are straightened first; then they round to the grid from `downbeat`
 * (default: the first note's start); two notes on one slot keep the longer one; bars past `maxBars` are
 * dropped. Each bar becomes one step of a `<…>` sequence, reduced to the coarsest grid that keeps every onset
 * and length. When a note is held across a bar line (c7) the whole line is one sequence over the bars with
 * `.slow(bars)`, so a `_` carries the note over the bar line: never a rest on the next beat 1.
 *
 * Wave 6. With `rhythm` the bars are written beat by beat, long values with `@` when `weights` is set, a beat on
 * thirds as a triplet when `triplets` is set, and a tie as a bracket over its bars (`[…]@2`). With `keyPlan` the
 * draft follows the piece's key changes: each note is read in the key of its bar and the line takes the
 * patterned `.scale()` over the draft's bars.
 */
export function draftFromHum(notes: readonly SungNote[], opts: HumDraftOptions): HumDraft {
  const meter: MeterId = opts.meter ?? "4/4";
  const m = METERS[meter];
  const warnings: HumDraftWarning[] = [];
  const asked = opts.swing && opts.swing.amount > 0 ? opts.swing : null;
  const swingUnits = asked ? swingByArgs(meter, asked.subdivision) : null;
  if (asked && swingUnits === null) warnings.push({ code: "swing-ignored" });
  const swing: SwingSpec | null = asked && swingUnits !== null ? asked : null;
  const slots = Math.max(1, Math.round(opts.slotsPerBar ?? defaultSlotsPerBar(meter, swing)));
  const maxBars = Math.max(1, Math.round(opts.maxBars ?? 8));
  const latency = (opts.latencyMs ?? 0) / 1000;
  const label = opts.label ?? "mel";
  const chromatic = opts.chromatic ?? "snap";
  const barSec = barSeconds(opts.bpm, meter);
  const swingSlotSec = swing && swingUnits ? barSec / swingUnits : 0;
  const straight = (t: number) => (swing ? straightenTime(t, swingSlotSec, swing.amount) : t);

  const sung = notes
    .map((n, source) => ({ source, start: n.start - latency, end: n.end - latency, midi: n.midi }))
    .filter((n) => Number.isFinite(n.midi) && n.end > n.start)
    .sort((a, b) => a.start - b.start);

  const tuningCents = tuningOffsetCents(sung.map((n) => n.midi));
  const corrected = sung.map((n) => n.midi - tuningCents / 100);

  // The key in force at each bar of the draft (Wave 6: a key plan counted in bars of the whole piece).
  const firstBar = Math.max(0, Math.round(opts.firstBar ?? 0));
  const plan = [...(opts.keyPlan ?? [])].sort((a, b) => a.fromBar - b.fromBar);
  const spanAt = (bar: number): HumKeySpan | null => {
    let found: HumKeySpan | null = null;
    for (const span of plan) if (span.fromBar <= firstBar + bar) found = span;
    return found;
  };
  const span0 = spanAt(0);
  const key0 = span0?.key ?? opts.key;
  const planOctave = typeof span0?.octave === "number" ? span0.octave : undefined;
  const askedOctave = opts.tonicOctave ?? planOctave;

  // Octave of the scale: the tonic octave given, the line moved by whole octaves onto it; otherwise the
  // octave whose tonic-to-tonic span holds most of the line (ties: the lower one).
  const pc = tonicPc(key0.tonic);
  let octaveShift = 0;
  let octave: number;
  const centre = corrected.length > 0 ? median(corrected) : 60;
  if (askedOctave !== undefined) {
    octave = askedOctave;
    const t = tonicMidi(key0.tonic, octave);
    // Put the line's centre inside the octave above the tonic (a melody around 5 sits at t + 7).
    octaveShift = Math.round((t + 6 - centre) / 12);
  } else {
    let bestCount = -1;
    octave = 4;
    for (let o = 0; o <= 8; o++) {
      const t = 12 * (o + 1) + pc;
      const count = corrected.filter((x) => x >= t - 0.5 && x < t + 11.5).length;
      if (count > bestCount) {
        bestCount = count;
        octave = o;
      }
    }
  }
  const tonic0 = tonicMidi(key0.tonic, octave);

  interface KeyCtx {
    key: KeySpec;
    tonic: number;
    scale: string;
    keep: readonly Degree[];
  }
  const ctxs = new Map<string, KeyCtx>();
  /** The sung pitches of each key's bars (filled before the first note is placed): they choose its octave. */
  const pitchesOf = new Map<string, number[]>();
  const keyIdAt = (bar: number): string => {
    const span = spanAt(bar);
    const key = span?.key ?? opts.key;
    const own = opts.tonicOctave === undefined && typeof span?.octave === "number" ? span.octave : null;
    return `${key.tonic}|${key.mode}|${own ?? ""}`;
  };
  const ctxAt = (bar: number): KeyCtx => {
    const span = spanAt(bar);
    const key = span?.key ?? opts.key;
    const own = opts.tonicOctave === undefined && typeof span?.octave === "number" ? span.octave : null;
    const id = keyIdAt(bar);
    let c = ctxs.get(id);
    if (!c) {
      let tonic: number;
      if (own !== null) tonic = tonicMidi(key.tonic, own);
      else if (tonicPc(key.tonic) === pc) tonic = tonic0;
      else {
        // A later key: the tonic nearest the first key's (C4 → D4, C4 → B♭3), or the one an octave from it
        // when that octave holds more of the notes sung in this key (C4 → G4 for a tune that sits above G4).
        const d = (((tonicPc(key.tonic) - pc) % 12) + 12) % 12;
        const near = tonic0 + (d > 6 ? d - 12 : d);
        const sungHere = pitchesOf.get(id) ?? [];
        const holds = (t: number) => sungHere.filter((x) => x >= t - 0.5 && x < t + 11.5).length;
        tonic = near;
        for (const t of [near - 12, near + 12]) if (holds(t) > holds(tonic)) tonic = t;
      }
      const written = Math.round((tonic - tonicMidi(key.tonic, 0)) / 12);
      c = {
        key,
        tonic,
        scale: scaleName(key, written),
        keep: opts.keepDegrees ?? defaultKeepDegrees(key.mode),
      };
      ctxs.set(id, c);
    }
    return c;
  };

  // The grid. Plain: `slots` equal slots a bar. With `rhythm` (Wave 6): beats, each on the duple grid or — when
  // triplets are allowed and its onsets sit on thirds — on a triple grid; positions are counted in fine units
  // that both grids share.
  const rhythm = opts.rhythm ?? null;
  const dps = slots / m.unitsPerBar;
  const beatwise = rhythm !== null && Number.isInteger(dps) && dps >= 1 && m.tempoUnit !== "eighth";
  const tripletsOk = beatwise && rhythm?.triplets === true && m.tempoUnit === "quarter" && dps % 3 !== 0;
  /** Fine units per beat, beats per bar, units per bar. Without `rhythm`: one unit is one slot. */
  const F = beatwise ? (tripletsOk ? dps * 3 : dps) : 1;
  const beatsPerBar = beatwise ? m.unitsPerBar : slots;
  const U = F * beatsPerBar;
  const beatSec = barSec / beatsPerBar;
  const duple = beatwise ? dps : 1;

  // The downbeat is musical time (a click, a Strudel cycle): only the sung notes carry the latency.
  const downbeat = opts.downbeat === undefined ? (sung[0]?.start ?? 0) : opts.downbeat;
  // Position of a time in beats, the beat it belongs to (a note just ahead of a beat belongs to that beat).
  const inBeats = (t: number) => straight(t - downbeat) / beatSec;
  const lead = 0.5 / Math.max(duple, tripletsOk ? 3 : 1);
  const beatOf = (p: number) => Math.floor(p + lead);
  const tripleBeats = new Set<number>();
  if (tripletsOk) {
    const byBeat = new Map<number, number[]>();
    for (const n of sung) {
      const p = inBeats(n.start);
      const k = beatOf(p);
      byBeat.set(k, [...(byBeat.get(k) ?? []), p - k]);
    }
    const err = (fs: readonly number[], g: number) =>
      fs.reduce((sum, f) => sum + (f - Math.round(f * g) / g) ** 2, 0);
    for (const [k, fs] of byBeat) {
      const onThird = fs.some((f) => {
        const r = Math.round(f * 3);
        return r === 1 || r === 2;
      });
      if (fs.length >= 2 && onThird && err(fs, 3) < 0.5 * err(fs, duple)) tripleBeats.add(k);
    }
  }
  const gridOf = (k: number) => (tripleBeats.has(k) ? 3 : duple);
  const place = (t: number): number => {
    const p = inBeats(t);
    const k = beatOf(p);
    const g = gridOf(k);
    return k * F + Math.round((p - k) * g) * (F / g);
  };

  interface Placed {
    source: number;
    on: number;
    off: number;
    secs: number;
    choice: Choice;
    m: number;
    ctx: KeyCtx;
  }
  const placed: Placed[] = [];
  sung.forEach((n, k) => {
    const on = place(n.start);
    if (on < 0) return;
    const id = keyIdAt(Math.floor(on / U));
    pitchesOf.set(id, [...(pitchesOf.get(id) ?? []), (corrected[k] as number) + 12 * octaveShift]);
  });
  sung.forEach((n, k) => {
    const x = (corrected[k] as number) + 12 * octaveShift;
    const on = place(n.start);
    const step = F / gridOf(Math.floor(on / F));
    const off = Math.max(on + step, place(n.end));
    if (on < 0) {
      warnings.push({ code: "before-downbeat", source: n.source });
      return;
    }
    const ctx = ctxAt(Math.floor(on / U));
    const choice = chooseStep(x, ctx.tonic, ctx.key, chromatic, ctx.keep);
    if (choice.snapped) {
      warnings.push({
        code: "chromatic-snapped",
        source: n.source,
        sungMidi: Math.round(x * 100) / 100,
        midi: choice.midi,
      });
    }
    placed.push({ source: n.source, on, off, secs: n.end - n.start, choice, m: x, ctx });
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
  const limit = maxBars * U;
  if (kept.some((p) => p.on >= limit)) {
    kept = kept.filter((p) => p.on < limit);
    warnings.push({ code: "truncated", bars: maxBars });
  }

  // A note ends at the next onset and inside the draft; one held across a bar line is tied over it (c7).
  const draftNotes: HumDraftNote[] = [];
  const events: SpanEvent[] = [];
  let tied = false;
  kept.forEach((p, k) => {
    const next = kept[k + 1];
    const bar = Math.floor(p.on / U);
    const off = Math.min(p.off, next ? next.on : p.off, limit);
    const crosses = off > (bar + 1) * U;
    if (crosses) tied = true;
    const onIn = p.on - bar * U;
    events.push({ on: p.on, off, step: p.choice.step });
    const note: HumDraftNote = {
      source: p.source,
      bar,
      onset: rat(onIn, U),
      dur: rat(off - p.on, U),
      step: p.choice.step,
      midi: p.choice.midi,
      cents: Math.round((p.m - p.choice.midi) * 1000) / 10,
      degree: p.choice.degree ?? labelPitch(p.choice.midi, p.ctx.key).degree,
      octave: Math.floor((p.choice.midi - p.ctx.tonic) / 12),
    };
    if (crosses) note.tied = true;
    if (plan.length > 0) note.key = p.ctx.key;
    if (tripleBeats.has(Math.floor(p.on / F))) note.triplet = true;
    draftNotes.push(note);
  });

  const lastOff = events.length > 0 ? (events[events.length - 1] as { off: number }).off : 0;
  const bars = events.length > 0 ? Math.min(maxBars, Math.ceil(lastOff / U)) : 0;
  if (events.length === 0) warnings.push({ code: "empty" });
  let pattern: string;
  let timing = "";
  if (bars === 0) pattern = "~";
  else if (rhythm !== null) {
    // Wave 6: beat by beat; bars joined by a tie are one bracket over those bars.
    const groups: { from: number; bars: number }[] = [];
    for (let b = 0; b < bars; ) {
      let end = b + 1;
      for (const e of events) if (e.on < end * U && e.off > end * U) end = Math.ceil(e.off / U);
      // A later tie may start inside the bars just added.
      for (let grew = true; grew; ) {
        grew = false;
        for (const e of events)
          if (e.on < end * U && e.off > end * U) {
            end = Math.ceil(e.off / U);
            grew = true;
          }
      }
      groups.push({ from: b, bars: Math.min(end, bars) - b });
      b = Math.min(end, bars);
    }
    const texts = groups.map((g) => {
      const from = g.from * U;
      const text = spanText(
        events
          .filter((e) => e.on >= from && e.on < from + g.bars * U)
          .map((e) => ({ on: e.on - from, off: e.off - from, step: e.step })),
        g.bars * U,
        {
          unitsPerBeat: beatwise ? F : 0,
          triple: new Set([...tripleBeats].map((k) => k - g.from * beatsPerBar)),
          weights: rhythm.weights === true,
        },
      );
      return g.bars > 1 ? `${text}@${g.bars}` : text;
    });
    pattern =
      texts.length === 1 && groups[0]?.bars === 1 ? unwrap(texts[0] as string) : `<${texts.join(" ")}>`;
  } else if (tied) {
    // One sequence over every bar: `_` continues a note across a bar line.
    pattern = unwrap(cellsText(events, bars * slots));
    timing = `.slow(${bars})`;
  } else {
    const barTexts: string[] = [];
    for (let b = 0; b < bars; b++)
      barTexts.push(
        cellsText(
          events
            .filter((e) => Math.floor(e.on / slots) === b)
            .map((e) => ({ on: e.on - b * slots, off: e.off - b * slots, step: e.step })),
          slots,
        ),
      );
    pattern = bars === 1 ? unwrap(barTexts[0] as string) : `<${barTexts.join(" ")}>`;
  }

  // The scale: one key, or the plan over the draft's bars as a patterned `.scale()` (contracts §6.8).
  const runs: { key: KeySpec; scale: string; fromBar: number; bars: number }[] = [];
  for (let b = 0; b < Math.max(1, bars); b++) {
    const c = ctxAt(b);
    const last = runs[runs.length - 1];
    if (last && last.scale === c.scale) last.bars++;
    else runs.push({ key: c.key, scale: c.scale, fromBar: b, bars: 1 });
  }
  const scale =
    runs.length === 1
      ? (runs[0] as { scale: string }).scale
      : `<${runs.map((r) => (r.bars > 1 ? `${r.scale}!${r.bars}` : r.scale)).join(" ")}>`;
  // A patterned scale is read bar by bar, so a `.slow(bars)` line is slowed before the scale is applied.
  const scaled = runs.length > 1 && timing ? `${timing}.scale("${scale}")` : `.scale("${scale}")${timing}`;
  let after = "";
  if (swing && swingUnits !== null) after = `.swingBy(${amountText(swing.amount)}, ${swingUnits})`;
  const tempo = tempoLine(opts.bpm, meter);
  const sound = opts.sound ? `.s("${opts.sound}")` : "";
  const line = `${label}: n("${pattern}")${scaled}${after}${sound}`;
  return {
    machineMade: true,
    tempoLine: tempo,
    line,
    code: `${tempo}\n\n${line}`,
    pattern,
    scale,
    bars,
    layout: tied ? "tied" : "bars",
    keyPlan: plan.length > 0 ? runs : null,
    swing,
    notes: draftNotes,
    tuningCents: Math.round(tuningCents * 10) / 10,
    octaveShift,
    warnings,
  };
}

interface SpanEvent {
  on: number;
  off: number;
  step: string;
}
interface SpanItem {
  text: string;
  len: number;
  rest?: true;
}

/** Items as tokens: `0@3 1` with weights, `0 _ _ 1` as cells; rests `~@2` or `~ ~`. */
function itemsText(items: readonly SpanItem[], weights: boolean): string {
  const out: string[] = [];
  for (const it of items) {
    if (weights) out.push(it.len > 1 ? `${it.text}@${it.len}` : it.text);
    else {
      out.push(it.text);
      for (let i = 1; i < it.len; i++) out.push(it.rest ? "~" : "_");
    }
  }
  return out.length === 1 && !/[@ ]/.test(out[0] as string) ? (out[0] as string) : `[${out.join(" ")}]`;
}

/** Notes and the rests between them over `[from, to)`, lengths divided by their common unit. */
function flatItems(events: readonly SpanEvent[], from: number, to: number): SpanItem[] {
  let g = to - from;
  for (const e of events) g = gcd(gcd(g, e.on - from), e.off - from);
  const items: SpanItem[] = [];
  let at = from;
  for (const e of events) {
    if (e.on > at) items.push({ text: "~", len: (e.on - at) / g, rest: true });
    items.push({ text: e.step, len: (e.off - e.on) / g });
    at = e.off;
  }
  if (at < to) items.push({ text: "~", len: (to - at) / g, rest: true });
  return items;
}

/**
 * Wave 6: a span of `units` fine units as mini-notation, beat by beat when every note lies inside one beat or
 * fills whole beats (`[0 [1 2] 3 4]`, a triplet beat `[1 2 3]`), otherwise as one flat sequence of weighted
 * values with the triplet beats that stand alone kept as brackets (`[1@3 0 0@4]`, `[0@3 [1 2 3]@2 4@3]`).
 * `unitsPerBeat` 0: no beat structure (a flat sequence on the span's coarsest grid).
 */
function spanText(
  events: readonly SpanEvent[],
  units: number,
  o: { unitsPerBeat: number; triple: ReadonlySet<number>; weights: boolean },
): string {
  if (events.length === 0) return "~";
  const F = o.unitsPerBeat;
  if (F <= 0) return itemsText(flatItems(events, 0, units), o.weights);
  const beatOf = (u: number) => Math.floor(u / F);
  const whole = (e: SpanEvent) => e.on % F === 0 && e.off % F === 0;
  const inside = (e: SpanEvent) => beatOf(e.on) === beatOf(e.off - 1);
  const beatText = (b: number): string =>
    itemsText(
      flatItems(
        events.filter((e) => beatOf(e.on) === b),
        b * F,
        (b + 1) * F,
      ),
      o.weights,
    );
  if (events.every((e) => whole(e) || inside(e))) {
    const items: SpanItem[] = [];
    const beats = units / F;
    for (let b = 0; b < beats; ) {
      const here = events.filter((e) => beatOf(e.on) === b);
      const first = here[0];
      if (first && here.length === 1 && whole(first)) {
        const len = (first.off - first.on) / F;
        items.push({ text: first.step, len });
        b += len;
      } else if (here.length === 0) {
        const last = items[items.length - 1];
        if (last?.rest) last.len++;
        else items.push({ text: "~", len: 1, rest: true });
        b++;
      } else {
        items.push({ text: beatText(b), len: 1 });
        b++;
      }
    }
    // Whole notes and halves read as such: lengths are counted in their common unit, not in beats.
    let g = 0;
    for (const it of items) g = gcd(g, it.len);
    if (g > 1) for (const it of items) it.len /= g;
    return itemsText(items, o.weights);
  }
  // Flat: weighted values on the fine grid; a triplet beat that nothing crosses stays a bracket.
  const grouped = new Set<number>();
  for (const b of o.triple) {
    const start = b * F;
    const end = start + F;
    const own = events.filter((e) => beatOf(e.on) === b);
    const crossed = events.some((e) => (e.on < start && e.off > start) || (e.on < end && e.off > end));
    if (own.length >= 2 && !crossed) grouped.add(b);
  }
  const tops: SpanEvent[] = [];
  for (const b of [...grouped].sort((x, y) => x - y))
    tops.push({ on: b * F, off: (b + 1) * F, step: beatText(b) });
  for (const e of events) if (!grouped.has(beatOf(e.on))) tops.push(e);
  tops.sort((x, y) => x.on - y.on);
  return itemsText(flatItems(tops, 0, units), o.weights);
}

/**
 * A span of `slots` slots as mini-notation on the coarsest grid that keeps every onset and end: `[0 _ 2 4]`, or
 * `~`. Events are in slots from the span's start and may run to its end.
 */
function cellsText(events: readonly { on: number; off: number; step: string }[], slots: number): string {
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
