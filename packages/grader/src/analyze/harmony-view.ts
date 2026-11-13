// Wave 4 seam (docs/design/wave4.md §3.2): the analysed piece, bar by bar and beat by beat, as the chord
// lenses, the chord band, the capstone checklist, the tutor and the liner notes read it. Built on the same
// chord slots, numerals and non-chord-tone rules the rubric uses, so a view can never disagree with a grade.
import type { ChordQuality, KeySpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { ChordId, HarmonicFunction } from "@oak/theory";
import {
  barPosition,
  chordOfRoman,
  chordPcs,
  formatRN,
  functionOf,
  inversionOf,
  METERS,
  romanOf,
  toCode,
  toLeadSheet,
} from "@oak/theory";
import type { NormalizeContext, Normalized } from "../types.ts";
import { type ChordSlot, harmonicRhythm, slotAt, unclustered } from "./chords.ts";
import { mod12 } from "./events.ts";
import { keyOf } from "./key.ts";
import { classifyNct, isStrong, melodyLine } from "./melody.ts";
import { harmonySlots } from "./piece.ts";
import { selectTrack } from "./tracks.ts";

/** A chord sounding somewhere in the piece, with every name a view shows. */
export interface SoundingChord {
  /** Index into `HarmonyView.slots`. */
  slot: number;
  /** [start, end) in cycles. */
  span: [Rat, Rat];
  /** Pitch classes of the chord (from its symbol when it has one, else from its notes), ascending. */
  pcs: number[];
  /** Lowest sounding pitch class across the learner's pitched tracks at the chord's onset (contracts §6.7 item 5). */
  bassPc: number;
  root: string;
  quality: ChordQuality;
  inversion: 0 | 1 | 2 | 3;
  /** Lead-sheet display ("G/B", "B°"). */
  symbol: string;
  /** Oak code spelling ("G", "Bo"); code has no slash chords. */
  code: string;
  /** Roman numeral in the track's key, Oak's dialect ("V6", "viio", "V7/V"); `null` without a key. */
  rn: string | null;
  function: HarmonicFunction | null;
  /** The symbol as written in `chord("…")`, when the events carried one. */
  written?: string;
}

/** The harmony on one beat (tempo unit) of one bar. */
export interface BeatHarmony {
  /** Display bar: 1-based; with a declared pickup the pickup bar is 0 (contracts §6.11). */
  bar: number;
  /** 1-based beat in tempo units. */
  beat: number;
  /** Absolute position in cycles. */
  at: Rat;
  /** The chord sounding at the start of the beat, or `null`. */
  chord: number | null;
  /** True when a chord starts on this beat (a change, or the first chord). */
  change: boolean;
}

/** What a melody note is against the chord under it (U07.L03–L05; C2's `chord-tones-strong`). */
export type MelodyNoteRole =
  | "chord-tone"
  | "passing"
  | "neighbour"
  | "appoggiatura"
  | "suspension"
  | "anticipation"
  | "escape"
  | "other"
  | "no-chord";

export interface MelodyNoteRelation {
  /** `NEvent.id` of the note. */
  id: string;
  midi: number;
  onset: Rat;
  bar: number;
  beat: number;
  /** On a beat ("beats 1 and 3" in 4/4 are `strongBeat`). */
  onBeat: boolean;
  /** On a strong beat of the meter (1 and 3 in 4/4; 1 in 3/4). */
  strongBeat: boolean;
  /** Index into `slots` of the chord under the note, or `null`. */
  chord: number | null;
  role: MelodyNoteRole;
}

export interface HarmonyView {
  /** The key numerals are read in: the declared key, then the code's `.scale()`, then an estimate. */
  key: KeySpec | null;
  /** Bars analysed (cycles). */
  bars: number;
  /** True when the piece declares a pickup: cycle 0 is the pickup bar, numbered 0. */
  pickup: boolean;
  slots: SoundingChord[];
  /** One entry per beat of every bar, in order. */
  beats: BeatHarmony[];
  /** Chord changes per bar (index 0 = cycle 0), the harmonic rhythm of U06.L08. */
  harmonicRhythm: number[];
  /** The melody line (skyline of the `@melody` role) with each note's relation to its chord. */
  melody: MelodyNoteRelation[];
  /**
   * Wave 4 (the function lens, U06.L03): runs of one harmonic function, merged across chords (C Am = one T
   * band), in cycles. Empty without a key.
   */
  functionBands: FunctionBand[];
  /**
   * Wave 4 (the chord-tone lens, U07.L03): share of melody notes on strong beats (1 and 3 in 4/4) that are
   * chord tones, over the notes that have a chord under them; `null` when there are none. The same reading
   * as `chord-tones-strong` with `strength: "strong"`.
   */
  chordToneShare: number | null;
}

/** A run of chords with one harmonic function. */
export interface FunctionBand {
  function: HarmonicFunction;
  span: [Rat, Rat];
  /** Indices into `HarmonyView.slots`. */
  slots: number[];
}

const ROLE: Record<string, MelodyNoteRole> = { neighbor: "neighbour" };

/**
 * The lead-sheet symbol spelled in the key (Wave 4 gate, from review:surfaces): a chord read from notes is
 * spelled by its pitch classes alone, so iii in A major came out "D♭m" and vii° in D major "D♭°". A chord with
 * a numeral in the key takes the numeral's spelling (C♯m, C♯°, F♭ in C♭ major) when it is the same chord over
 * the same bass; anything else keeps the pitch-class spelling. A symbol the learner wrote is never respelled.
 */
function spelledInKey(
  chord: Parameters<typeof toLeadSheet>[0],
  rn: string,
  key: KeySpec,
  pcs: number[],
  bassPc: number,
): string {
  const fromRn = chordOfRoman(rn, key);
  if (!fromRn || fromRn.bassPc !== bassPc) return toLeadSheet(chord);
  const want = new Set(chordPcs(fromRn) as number[]);
  if (want.size !== pcs.length || pcs.some((pc) => !want.has(pc))) return toLeadSheet(chord);
  return toLeadSheet(fromRn);
}

function sounding(
  slot: ChordSlot,
  i: number,
  next: ChordSlot | undefined,
  key: KeySpec | null,
): SoundingChord | null {
  const chord = slot.chord;
  if (!chord) return null;
  const rn = key ? romanOf(chord, key, next?.chord ?? undefined) : null;
  const pcs = [...(chordPcs(chord) as number[])].sort((a, b) => a - b);
  const bassPc = slot.bassMidi === undefined ? chord.bassPc : mod12(slot.bassMidi);
  return {
    slot: i,
    span: slot.span,
    pcs,
    bassPc,
    root: chord.root,
    quality: chord.quality,
    inversion: inversionOf(chord as ChordId),
    symbol:
      slot.symbol || !key || !rn ? toLeadSheet(chord) : spelledInKey(chord, formatRN(rn), key, pcs, bassPc),
    code: toCode(chord),
    rn: rn ? formatRN(rn) : null,
    function: rn && key ? functionOf(rn, key) : null,
    ...(slot.symbol ? { written: slot.symbol } : {}),
  };
}

/**
 * The harmony view of a normalized piece. `bars` defaults to the last onset's bar. Chords come from
 * `chord()` symbols when present, else from the chord-role tracks; the bass is the lowest learner note.
 */
export function harmonyView(n: Normalized, ctx: NormalizeContext & { bars?: number }): HarmonyView {
  const bars = ctx.bars ?? n.all.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 0);
  const key = keyOf(n.all, ctx.key ?? null);
  // A cluster (C D E) is no chord here either, as in the rubric (`unclustered`).
  const raw = harmonySlots(n)
    .map(unclustered)
    .filter((s) => s.chord);
  const slots: SoundingChord[] = [];
  const indexOf = new Map<ChordSlot, number>();
  raw.forEach((s, i) => {
    const v = sounding(s, slots.length, raw[i + 1], key);
    if (v) {
      indexOf.set(s, slots.length);
      slots.push(v);
    }
  });
  const units = METERS[ctx.meter].unitsPerBar;
  const beats: BeatHarmony[] = [];
  for (let b = 0; b < bars; b++)
    for (let u = 0; u < units; u++) {
      const at = R.add(rat(b), rat(u, units));
      const s = slotAt(raw, at);
      const idx = s ? (indexOf.get(s) ?? null) : null;
      const pos = barPosition(at, ctx.meter, ctx.pickup);
      beats.push({
        bar: pos.bar,
        beat: Math.round(pos.beat),
        at,
        chord: idx,
        change: !!s && R.eq(s.span[0], at),
      });
    }
  const line = melodyLine(selectTrack(n, "@melody"));
  const nct = new Map(classifyNct(line, raw, ctx.meter).map((x) => [x.id, x.type]));
  const melody: MelodyNoteRelation[] = line.map((note) => {
    const s = slotAt(raw, note.onset);
    const idx = s ? (indexOf.get(s) ?? null) : null;
    const pos = barPosition(note.onset, ctx.meter, ctx.pickup);
    const t = nct.get(note.id);
    const role: MelodyNoteRole =
      idx === null ? "no-chord" : t === undefined ? "chord-tone" : ((ROLE[t] ?? t) as MelodyNoteRole);
    return {
      id: note.id,
      midi: note.midi,
      onset: note.onset,
      bar: pos.bar,
      beat: pos.beat,
      onBeat: isStrong(note.onset, ctx.meter, "beat"),
      strongBeat: isStrong(note.onset, ctx.meter, "strong"),
      chord: idx,
      role,
    };
  });
  const functionBands: FunctionBand[] = [];
  for (const sc of slots) {
    if (!sc.function) continue;
    const last = functionBands[functionBands.length - 1];
    if (last && last.function === sc.function && R.eq(last.span[1], sc.span[0])) {
      last.span = [last.span[0], sc.span[1]];
      last.slots.push(sc.slot);
    } else functionBands.push({ function: sc.function, span: [sc.span[0], sc.span[1]], slots: [sc.slot] });
  }
  const strong = melody.filter((m) => m.strongBeat && m.chord !== null);
  const chordToneShare =
    strong.length === 0 ? null : strong.filter((m) => m.role === "chord-tone").length / strong.length;
  return {
    key,
    bars,
    pickup: ctx.pickup !== undefined,
    slots,
    beats,
    harmonicRhythm: harmonicRhythm(raw, bars),
    melody,
    functionBands,
    chordToneShare,
  };
}
