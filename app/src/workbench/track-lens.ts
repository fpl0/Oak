// What the advanced tracks' lenses draw (docs/design/wave7.md §4.2, §4.4): the tensions of the melody against its
// chords, the voicing type of every hand-voiced chord, a common chord-scale per chord, ii–V brackets and
// substitutions on the chord band, the clave under the roll, the pulse lanes of a polyrhythm or a polymeter, each
// onset's distance from the grid in milliseconds (and swung notes against their straight places), the register
// bands of the spectrum panel and the density of each section. Every fact comes from the grader's Wave 7 views
// (`tensionView`, `voicingView`, `twoFiveView`, `claveView`, `feelView`, `registerClashView`, `densityView`) and
// `@oak/theory` (`chordScales`, `tritoneSub`, `backdoor`, `diminishedPassing`, `polyrhythm`, `polymeterPeriod`,
// `lateMs`, `swingRatio`, `meterGroups`, `REGISTER_ROLES`), at the piece's own tempo. Pure: track-lens.test.ts runs it
// on real Strudel output. A lens draws nothing for a piece with nothing to show (no clave, one pulse, one key).
import type { KeySpec, MeterId, MeterSpec, NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import {
  claveView,
  densityView,
  feelView,
  type HarmonyView,
  type Normalized,
  type RegisterClashView,
  registerClashView,
  type TensionNoteView,
  tensionView,
  twoFiveView,
  voicingView,
} from "@oak/grader";
import { chordSymbolText } from "@oak/notation";
import {
  CHORD_SCALE_NAMES,
  type ChordId,
  type ChordScaleId,
  type ClaveDirection,
  type ClaveType,
  chordScales,
  claveSteps,
  diminishedPassing,
  jazzSymbol,
  lateMs,
  METERS,
  meterGroups,
  parseChordSymbol,
  polymeterPeriod,
  REGISTER_ROLES,
  swingRatio,
  toCode,
  tritoneSub,
  voicingType,
} from "@oak/theory";

const mod12 = (x: number) => ((x % 12) + 12) % 12;

// --- tensions ------------------------------------------------------------------------------------------------

export interface TensionMark {
  /** The tension's name as printed ("9", "♯11", "♭13", "13"). */
  tag: string;
  /** A held or on-beat note a half step over a chord tone: the clash the convention warns about. */
  avoid: boolean;
  structural: boolean;
  /** The chord it is read against, as the chord band writes it. */
  chord: string;
  /** Hover text. */
  words: string;
}

/** "b9" → "♭9", "#11" → "♯11". */
/** Half steps above the root of each extension a chord symbol can name. */
const EXTENSION_SEMIS: Readonly<Record<string, number>> = {
  b9: 1,
  "9": 2,
  "#9": 3,
  "11": 5,
  "#11": 6,
  b13: 8,
  "13": 9,
};

/** The extension a symbol names that this note is (E in Dm9: "9"), or `null` for a 7th-chord tone or a 6. */
export function namedExtension(chord: string, midi: number): string | null {
  try {
    const parsed = parseChordSymbol(chord);
    if (!parsed) return null;
    const semis = (((midi - parsed.rootPc) % 12) + 12) % 12;
    const named = jazzSymbol(chord).extensions.filter((x) => x in EXTENSION_SEMIS);
    return named.find((x) => EXTENSION_SEMIS[x] === semis) ?? null;
  } catch {
    return null;
  }
}

export function tensionTag(label: string): string {
  return label.replace(/^b/, "♭").replace(/^#/, "♯");
}

/**
 * The melody's tensions by event ID (`tensionView`): every note that is a 9, 11, 13 (or altered) over its chord.
 * Chord tones and notes the view calls "outside" are left plain: the lens names tensions only, so a chord tone the
 * voicing leaves out (a 5th, a root left to the bass), which the view may read as "outside", is never mislabelled.
 */
export function tensionMarks(views: readonly TensionNoteView[], chordText: (code: string) => string) {
  const out = new Map<string, TensionMark>();
  for (const v of views) {
    if (v.chord === null || v.role === "outside") continue;
    // A tension the symbol names (the 9 of Dm9, the 13 of G13) is a chord tone to the view: still a colour above
    // the 7th chord, and named as one.
    const role = v.role === "chord-tone" ? namedExtension(v.chord, v.midi) : v.role;
    if (role === null) continue;
    const tag = tensionTag(role);
    const name = chordText(v.chord);
    const avoid = v.avoid && v.structural;
    out.set(v.id, {
      tag,
      avoid,
      structural: v.structural,
      chord: name,
      words: avoid
        ? `${tag} over ${name}: a half step above a chord tone, held — the clash a common choice avoids`
        : `${tag} over ${name}: a tension, a colour above the chord`,
    });
  }
  return out;
}

// --- voicings, chord-scales, substitutions, ii–V brackets (the chord band) ------------------------------------------

/** How the voicing lens names each voicing type. A dictionary voicing is never given a hand-voicing type. */
export const VOICING_WORDS: Readonly<Record<string, string>> = {
  "guide-tones": "guide tones",
  shell: "shell",
  "rootless-a": "rootless A",
  "rootless-b": "rootless B",
  close: "close",
  "drop-2": "drop-2",
  spread: "spread",
  other: "",
};

export interface RegionJazz {
  /** The chord in jazz glyphs ("D–7", "G7", "C∆7"), from the one table. */
  jazz: string;
  /** "shell", "rootless A", "drop-2", "spread", "dictionary voicing"; `null` where no part voices it by hand. */
  voicing: string | null;
  /** A common chord-scale for the chord in its place ("Dorian"); `null` without a chord. */
  scale: string | null;
  scaleId: ChordScaleId | null;
  /** A substitution the chord makes: "tritone sub", "backdoor", "passing °7"; `null` otherwise. */
  sub: string | null;
  /** Hover text for the substitution. */
  subWords: string | null;
}

export interface TwoFiveBracket {
  /** [from, to) in cycles: the ii and the V. */
  from: number;
  to: number;
  text: string;
  resolved: boolean;
}

interface SlotLike {
  span: readonly [readonly [number, number], readonly [number, number]];
  code: string;
}

const chordOf = (code: string): ChordId | null => parseChordSymbol(code);
const DOMINANT = new Set(["7", "9", "13", "7b9", "7#9", "7#11", "7b13", "7alt", "7sus4"]);
const MAJORISH = new Set(["maj", "maj7", "maj9", "6", "69", "maj7#11"]);

/** A substitution a chord makes before the next one, by the devices of the jazz track (theory). */
export function substitutionOf(
  a: ChordId,
  b: ChordId | null,
  prev: ChordId | null,
): { sub: string; words: string } | null {
  if (!b) return null;
  if (DOMINANT.has(a.quality) && mod12(a.rootPc - b.rootPc) === 1) {
    const v = tritoneSub(a);
    return {
      sub: "tritone sub",
      words: `${chordSymbolText(toCode(a), "jazz")} stands in for ${chordSymbolText(toCode({ ...v, quality: "7" }), "jazz")}: the same 3rd and 7th, a tritone away, resolving down a half step`,
    };
  }
  if (DOMINANT.has(a.quality) && mod12(b.rootPc - a.rootPc) === 2 && MAJORISH.has(b.quality)) {
    return {
      sub: "backdoor",
      words: `${chordSymbolText(toCode(a), "jazz")} is ♭VII7 of ${chordSymbolText(toCode(b), "jazz")}: the backdoor, coming home from a whole step below`,
    };
  }
  if ((a.quality === "dim7" || a.quality === "dim") && prev) {
    const passing = diminishedPassing(prev, b);
    if (passing && passing.rootPc === a.rootPc)
      return {
        sub: "passing °7",
        words: `${chordSymbolText(toCode(a), "jazz")} passes by half steps from ${chordSymbolText(toCode(prev), "jazz")} to ${chordSymbolText(toCode(b), "jazz")}`,
      };
  }
  return null;
}

/**
 * One entry per chord-band region (by index): jazz glyphs, the voicing of the learner's hand-voiced chords, a common
 * chord-scale and the substitution the chord makes. `slots` are the harmony's slots, `regionSlots` each region's
 * first slot index.
 */
export function regionJazz(
  slots: readonly SlotLike[],
  regionSlots: readonly number[],
  voicings: readonly VoicedChord[],
  key: KeySpec | null,
): RegionJazz[] {
  const chords = regionSlots.map((s) => {
    const slot = slots[s];
    return slot
      ? { code: slot.code, chord: chordOf(slot.code), from: R.toNum(slot.span[0] as [number, number]) }
      : null;
  });
  return chords.map((c, i) => {
    if (!c?.chord)
      return { jazz: c?.code ?? "", voicing: null, scale: null, scaleId: null, sub: null, subWords: null };
    const next = chords[i + 1]?.chord ?? null;
    const prev = chords[i - 1]?.chord ?? null;
    const to = chords[i + 1]?.from ?? Number.POSITIVE_INFINITY;
    const scaleId =
      chordScales(c.chord, {
        ...(key ? { key } : {}),
        ...(next ? { next } : {}),
      })[0] ?? null;
    const inRegion = voicings.filter((v) => v.at >= c.from - 1e-9 && v.at < to - 1e-9);
    // A hand voicing in the region wins over a dictionary line beside it (the learner's own shape is the point).
    const voiced = inRegion.find((v) => v.label !== "dictionary voicing") ?? inRegion[0];
    const sub = substitutionOf(c.chord, next, prev);
    return {
      jazz: chordSymbolText(c.code, "jazz"),
      voicing: voiced ? voiced.label : null,
      scale: scaleId ? CHORD_SCALE_NAMES[scaleId] : null,
      scaleId,
      sub: sub?.sub ?? null,
      subWords: sub?.words ?? null,
    };
  });
}

/** The ii–V brackets of the chord lens (`twoFiveView`), placed on the time axis of the chord band. */
export function twoFiveBrackets(n: Normalized, meter: MeterId, slots: readonly SlotLike[]): TwoFiveBracket[] {
  let pairs: ReturnType<typeof twoFiveView>;
  try {
    pairs = twoFiveView(n, { meter });
  } catch {
    return [];
  }
  const out: TwoFiveBracket[] = [];
  for (const p of pairs) {
    // The ii's slot: the first slot of its bar that carries the ii; the V's ends the bracket.
    const i = slots.findIndex(
      (s, k) =>
        Math.floor(R.toNum(s.span[0] as [number, number]) + 1e-9) + 1 === p.bar &&
        sameChord(s.code, p.ii) &&
        slots[k + 1] !== undefined &&
        sameChord((slots[k + 1] as SlotLike).code, p.v),
    );
    if (i < 0) continue;
    const ii = slots[i] as SlotLike;
    const v = slots[i + 1] as SlotLike;
    out.push({
      from: R.toNum(ii.span[0] as [number, number]),
      to: R.toNum(v.span[1] as [number, number]),
      text: `ii–V → ${p.target}`,
      resolved: p.resolved,
    });
  }
  return out;
}
const sameChord = (a: string, b: string): boolean => {
  const x = parseChordSymbol(a);
  const y = parseChordSymbol(b);
  return !!x && !!y && x.rootPc === y.rootPc && x.quality === y.quality;
};

// --- clave ---------------------------------------------------------------------------------------------------

export interface ClaveLens {
  /** The part that plays it ("perc", or "perc · rim" when one sound of a part does). */
  part: string;
  type: ClaveType;
  direction: ClaveDirection;
  /** Its strokes on the two-bar grid of eighths (16 steps). */
  steps: number[];
  /** 1-based first bars of the two-bar windows that hold it, in order from bar 1. */
  windows: { bar: number; holds: boolean }[];
  coveredBars: number;
  text: string;
}

/** A sub-piece holding only `events` under one track name: a view can then read one sound of a part. */
function only(n: Normalized, name: string, events: readonly NEvent[]): Normalized {
  return { ...n, all: [...events], byTrack: { [name]: [...events] } };
}

/** The parts of a piece a clave or a pulse could be in: each learner track, and each sound of a drum track. */
function parts(n: Normalized): { name: string; events: NEvent[] }[] {
  const out: { name: string; events: NEvent[] }[] = [];
  for (const [track, es] of Object.entries(n.byTrack)) {
    if (track.startsWith("band.") || es.length === 0) continue;
    out.push({ name: track, events: es });
    const sounds = [...new Set(es.filter((e) => e.midi === null).map((e) => e.s ?? ""))];
    if (sounds.length > 1)
      for (const s of sounds)
        out.push({ name: `${track} · ${s}`, events: es.filter((e) => (e.s ?? "") === s) });
  }
  return out;
}

/** The clave of the piece (`claveView`, window by window from bar 1), or `null` when no part plays one. */
export function claveLens(n: Normalized, meter: MeterId, bars: number): ClaveLens | null {
  if (METERS[meter].id !== "4/4" && METERS[meter].id !== "2/4") return null;
  for (const p of parts(n)) {
    const v = claveView(only(n, p.name, p.events), { meter, track: p.name, bars });
    if (!v.first) continue;
    const { type, direction } = v.first;
    const name = type === "son" ? "Son clave" : "Rumba clave";
    return {
      part: p.name,
      type,
      direction,
      steps: claveSteps(type, direction),
      windows: v.windows.map((w) => ({
        bar: w.bar,
        holds: w.clave?.type === type && w.clave.direction === direction,
      })),
      coveredBars: v.coveredBars,
      text: `${name} ${direction}${v.coveredBars > 0 ? ` · bars 1–${v.coveredBars}` : ""} (${p.name})`,
    };
  }
  return null;
}

// --- pulse lanes ---------------------------------------------------------------------------------------------

export interface PulseLane {
  part: string;
  /** Pulses per span. */
  pulses: number;
  /** Onsets in cycles from the start of the piece (every analysed bar). */
  onsets: number[];
}
export type PolyLanes =
  | { kind: "polyrhythm"; a: PulseLane; b: PulseLane; span: number; together: number[]; text: string }
  | {
      kind: "polymeter";
      part: string;
      length: number;
      perBar: number;
      periodBars: number;
      /** Cycles where the pattern starts again. */
      starts: number[];
      text: string;
    };

/** Even pulses in every span of `span` cycles (a bar or half a bar): the count, or `null`. */
function evenPulses(events: readonly NEvent[], span: number, bars: number): number | null {
  const xs = [...new Set(events.map((e) => R.toNum(e.onset)))].sort((a, b) => a - b);
  if (xs.length === 0) return null;
  let k: number | null = null;
  for (let s = 0; s + span <= bars + 1e-9; s += span) {
    const inSpan = xs.filter((x) => x >= s - 1e-9 && x < s + span - 1e-9).map((x) => (x - s) / span);
    if (inSpan.length < 2) return null;
    const kk = inSpan.length;
    if (!inSpan.every((x, i) => Math.abs(x - i / kk) < 1e-6)) return null;
    if (k !== null && k !== kk) return null;
    k = kk;
  }
  return k;
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** "{rim rim cb}%4": the steps of a polymeter's cycle and how many play in a bar. */
export function polymeterOf(code: string): { part: string; length: number; perBar: number } | null {
  const re = /\{([^{}]+)\}%(\d+)/g;
  for (let m = re.exec(code); m; m = re.exec(code)) {
    const body = (m[1] as string).split(",")[0] ?? "";
    const steps = body
      .replace(/<[^>]*>|\[[^\]]*\]/g, " x ")
      .split(/\s+/)
      .filter(Boolean).length;
    const perBar = Number(m[2]);
    if (steps < 2 || perBar < 1) continue;
    const before = code.slice(0, m.index);
    const label = [...before.matchAll(/^\s*([A-Za-z_]\w*)\s*:/gm)].pop()?.[1] ?? "";
    return { part: label, length: steps, perBar };
  }
  return null;
}

/** Two parts dividing the same span into different even pulses (3 against 2), or a polymeter in the code. */
export function polyLanes(n: Normalized, code: string, bars: number): PolyLanes | null {
  const pm = polymeterOf(code);
  if (pm) {
    const periodBars = polymeterPeriod(pm.length, pm.perBar);
    if (periodBars > 1) {
      const starts: number[] = [];
      for (let k = 0; (k * pm.length) / pm.perBar < Math.max(bars, periodBars) - 1e-9; k++)
        starts.push((k * pm.length) / pm.perBar);
      return {
        kind: "polymeter",
        part: pm.part,
        length: pm.length,
        perBar: pm.perBar,
        periodBars,
        starts,
        text: `${pm.part ? `${pm.part}: ` : ""}a cycle of ${pm.length} steps at ${pm.perBar} a bar — back in line with the bar every ${periodBars} bars`,
      };
    }
  }
  const ps = parts(n);
  for (const span of [1, 0.5]) {
    const found = ps
      .map((p) => ({ p, k: evenPulses(p.events, span, bars) }))
      .filter((x): x is { p: (typeof ps)[number]; k: number } => x.k !== null);
    for (let i = 0; i < found.length; i++)
      for (let j = i + 1; j < found.length; j++) {
        const a = found[i] as (typeof found)[number];
        const b = found[j] as (typeof found)[number];
        // The same part and its own sound, or one pulse a multiple of the other: no cross-rhythm.
        if (a.p.name.startsWith(`${b.p.name} ·`) || b.p.name.startsWith(`${a.p.name} ·`)) continue;
        if (a.k % b.k === 0 || b.k % a.k === 0 || gcd(a.k, b.k) !== 1) continue;
        const [hi, lo] = a.k > b.k ? [a, b] : [b, a];
        const lane = (x: typeof a): PulseLane => ({
          part: x.p.name,
          pulses: x.k,
          onsets: [...new Set(x.p.events.map((e) => R.toNum(e.onset)))].sort((u, v) => u - v),
        });
        const together: number[] = [];
        for (let s = 0; s + span <= bars + 1e-9; s += span) together.push(s);
        return {
          kind: "polyrhythm",
          a: lane(hi),
          b: lane(lo),
          span,
          together,
          text: `${hi.k} against ${lo.k}${span === 1 ? " a bar" : " a half bar"}: ${hi.p.name} and ${lo.p.name} meet only on the ${span === 1 ? "downbeat" : "beat"}`,
        };
      }
  }
  return null;
}

// --- microtiming and swing -------------------------------------------------------------------------------------

export interface TimingMark {
  kind: "micro" | "swing";
  /** Where the note would sit on the straight grid, in cycles. */
  gridAt: number;
  /** + behind the grid (late), − ahead (early), at the piece's tempo. */
  ms: number;
}
export interface TrackFeel {
  track: string;
  /** "keys: 48 ms behind the grid" / "hats: Swing 16ths · 3:2". */
  text: string;
  medianMs: number;
  swing: { subdivision: 8 | 16; ratio: number } | null;
}
export interface MicroLens {
  marks: ReadonlyMap<string, TimingMark>;
  tracks: TrackFeel[];
}

/** 3:2, 2:1, 4:3, else "1.36:1". */
export function ratioText(r: number): string {
  for (const [a, b] of [
    [3, 2],
    [2, 1],
    [4, 3],
    [5, 3],
    [5, 4],
    [3, 1],
  ] as const)
    if (Math.abs(r - a / b) < 0.03) return `${a}:${b}`;
  return `${r.toFixed(2)}:1`;
}

const msText = (ms: number): string =>
  `${Math.round(Math.abs(ms))} ms ${ms >= 0 ? "behind" : "ahead of"} the grid`;

/** Below this a note is on the grid (floating-point noise; a feel starts at 8 ms, `FEEL_MS`). */
export const ON_GRID_MS = 2;

/** Divisions of a bar a note may be written on: straight, triplet, quintuplet and odd-meter grids. */
const WRITTEN_GRIDS = [16, 12, 24, 10, 20, 14, 18, 28, 36];
/** Whether a bar position lies exactly on one of the written divisions (`WRITTEN_GRIDS`). */
export function onWrittenGrid(x: number): boolean {
  return WRITTEN_GRIDS.some((n) => Math.abs(x * n - Math.round(x * n)) < 1e-6);
}

/**
 * Each onset's distance from the 16th grid in milliseconds at the piece's tempo (`lateMs`), and each swung note's
 * distance from its straight place. Swung tracks (`swing`: the grader's `swingView` per track) are drawn as swing,
 * not as microtiming. The per-track line uses `feelView`'s median, the same reading the `microtiming` rule makes.
 */
export function microLens(
  n: Normalized,
  meter: MeterId | MeterSpec,
  swing: readonly { track: string; swung: 8 | 16 | null; ratio: number | null }[],
): MicroLens {
  const m = typeof meter === "string" ? METERS[meter] : meter;
  const bpm = n.bpm || 120;
  const sixteenths = m.den === 8 ? m.num * 2 : m.unitsPerBar * 4;
  const marks = new Map<string, TimingMark>();
  const tracks: TrackFeel[] = [];
  let feel: ReturnType<typeof feelView> = [];
  try {
    feel = feelView(n, { meter: m.id });
  } catch {
    feel = [];
  }
  for (const [track, es] of Object.entries(n.byTrack)) {
    if (track.startsWith("band.") || es.length === 0) continue;
    const sw = swing.find((s) => s.track === track && s.swung !== null);
    const grid = sw ? (sw.swung === 8 ? sixteenths / 2 : sixteenths) : sixteenths;
    for (const e of es) {
      const x = R.toNum(e.onset);
      // A note on a written division (a triplet, a quintuplet, the beat of an odd meter) is on its grid: only a
      // nudge off every division is microtiming. A swung track is measured against its straight places.
      if (!sw && onWrittenGrid(x)) continue;
      const at = Math.round(x * grid) / grid;
      const ms = lateMs(x - at, bpm, m);
      if (Math.abs(ms) < ON_GRID_MS) continue;
      marks.set(e.id, { kind: sw ? "swing" : "micro", gridAt: at, ms });
    }
    const f = feel.find((t) => t.track === track);
    if (sw && sw.ratio !== null) {
      tracks.push({
        track,
        text: `${track}: Swing ${sw.swung === 8 ? "8ths" : "16ths"} · ${ratioText(sw.ratio)}`,
        medianMs: f?.medianOffsetMs ?? 0,
        swing: { subdivision: sw.swung as 8 | 16, ratio: sw.ratio },
      });
    } else if (f && Math.abs(f.medianOffsetMs) >= ON_GRID_MS) {
      tracks.push({
        track,
        text: `${track}: ${msText(f.medianOffsetMs)}`,
        medianMs: f.medianOffsetMs,
        swing: null,
      });
    }
  }
  return { marks, tracks };
}

/** The swing ratio a track's measured swing position gives (`p`: the off-beat's place in its pair, 1/2 … 1). */
export function ratioOfPosition(p: number): number | null {
  const amount = 2 * p - 1;
  if (!(amount > 0 && amount < 1)) return null;
  return swingRatio(amount);
}

// --- registers ---------------------------------------------------------------------------------------------

export interface RegisterPart {
  track: string;
  low: number;
  high: number;
}
export interface RegisterLens {
  roles: typeof REGISTER_ROLES;
  parts: RegisterPart[];
  clashes: RegisterClashView[];
}

/** Each pitched part's range and the clashes under the low-interval limits (`registerClashView`). */
export function registerLens(n: Normalized, meter: MeterId): RegisterLens | null {
  const partsOut: RegisterPart[] = [];
  for (const [track, es] of Object.entries(n.byTrack)) {
    if (track.startsWith("band.")) continue;
    const midis = es.flatMap((e) => (e.midi === null ? [] : [Math.round(e.midi)]));
    if (midis.length === 0) continue;
    partsOut.push({ track, low: Math.min(...midis), high: Math.max(...midis) });
  }
  if (partsOut.length === 0) return null;
  let clashes: RegisterClashView[] = [];
  try {
    // One mark per pair of notes: a held chord is re-read at every onset above it.
    const seen = new Set<string>();
    clashes = registerClashView(n, { meter }).filter((c) => {
      const k = `${c.low}:${c.high}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    clashes = [];
  }
  partsOut.sort((a, b) => a.low - b.low || a.high - b.high);
  return { roles: REGISTER_ROLES, parts: partsOut, clashes };
}

/** The frequency of a MIDI note. */
export const hzOf = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

// --- density -----------------------------------------------------------------------------------------------

export interface DensitySpan {
  /** [from, to) in cycles. */
  from: number;
  to: number;
  label: string;
  onsetsPerBar: number;
  polyphony: number;
  parts: number;
  /** 0 … 1 against the densest span of the piece. */
  level: number;
  text: string;
}

/**
 * Density per section (`densityView` bar by bar, averaged over each section of `arrange()`), or per four bars when
 * the piece has no sections. `null` for a piece of one span (nothing to compare).
 */
export function densityLens(
  n: Normalized,
  meter: MeterId,
  bars: number,
  sections: readonly { startBar: number; bars: number; text: string }[],
): DensitySpan[] | null {
  let rows: ReturnType<typeof densityView>;
  try {
    rows = densityView(n, { meter, bars });
  } catch {
    return null;
  }
  const spans =
    sections.length > 1
      ? sections.map((s) => ({ from: s.startBar, bars: s.bars, label: s.text }))
      : Array.from({ length: Math.ceil(bars / 4) }, (_, i) => ({
          from: i * 4,
          bars: Math.min(4, bars - i * 4),
          label: `Bars ${i * 4 + 1}–${Math.min(bars, i * 4 + 4)}`,
        }));
  if (spans.length < 2) return null;
  const out = spans.map((s) => {
    const r = rows.filter((x) => x.bar - 1 >= s.from && x.bar - 1 < s.from + s.bars);
    const avg = (f: (x: (typeof rows)[number]) => number) =>
      r.length ? r.reduce((a, x) => a + f(x), 0) / r.length : 0;
    const onsets = avg((x) => x.onsetsPerBar);
    const poly = avg((x) => x.polyphony);
    const partsN = r.reduce((a, x) => Math.max(a, x.parts), 0);
    return {
      from: s.from,
      to: s.from + s.bars,
      label: s.label,
      onsetsPerBar: onsets,
      polyphony: poly,
      parts: partsN,
      level: 0,
      text: `${s.label}: ${round1(onsets)} onsets a bar, ${round1(poly)} notes each, ${partsN} part${partsN === 1 ? "" : "s"}`,
    };
  });
  const top = Math.max(1e-9, ...out.map((s) => s.onsetsPerBar * Math.max(1, s.polyphony)));
  for (const s of out) s.level = (s.onsetsPerBar * Math.max(1, s.polyphony)) / top;
  return out;
}
const round1 = (x: number) => (Math.round(x * 10) / 10).toString();

// --- odd meters --------------------------------------------------------------------------------------------

export interface OddMeterGrid {
  /** "7/8 in 2+2+3 (count 1 2 | 1 2 | 1 2 3)". */
  text: string;
  count: string;
  /** Lines of one bar, as fractions of the bar: each group's start firm, every other count light. */
  lines: { at: number; level: "group" | "count"; label: string }[];
}

/** The roll's grid in an odd meter (5/4, 5/8, 7/8, 9/8i): the groups firm, each counted from 1. `null` otherwise. */
export function oddMeterGrid(meter: MeterSpec): OddMeterGrid | null {
  if (!["5/4", "5/8", "7/8", "9/8i"].includes(meter.id)) return null;
  const g = meterGroups(meter);
  const unit = meter.den === 8 ? meter.num : meter.unitsPerBar;
  const lines: OddMeterGrid["lines"] = [];
  let at = 0;
  for (const size of g.groups) {
    for (let i = 0; i < size; i++)
      lines.push({ at: (at + i) / unit, level: i === 0 ? "group" : "count", label: String(i + 1) });
    at += size;
  }
  return {
    text: `${meter.id === "9/8i" ? "9/8" : meter.id} in ${g.groups.join("+")} (count ${g.count})`,
    count: g.count,
    lines,
  };
}

// --- the piece's Wave 7 lenses, built with the model ---------------------------------------------------------

export interface WorkbenchTrack {
  tensions: ReadonlyMap<string, TensionMark>;
  /** Every voiced chord of a chord part, in time order (the voicing lens's labels on the roll). */
  voicings: readonly VoicedChord[];
  /** By chord-band region index (`WorkbenchHarmony.regions`). */
  regions: readonly RegionJazz[];
  twoFives: readonly TwoFiveBracket[];
  clave: ClaveLens | null;
  poly: PolyLanes | null;
  micro: MicroLens;
  registers: RegisterLens | null;
  density: DensitySpan[] | null;
  odd: OddMeterGrid | null;
}

export interface TrackContext {
  code: string;
  meter: MeterSpec;
  key: KeySpec | null;
  bars: number;
  harmony: { view: Pick<HarmonyView, "slots">; regions: readonly { slot: number }[] } | null;
  sections: readonly { startBar: number; bars: number; text: string }[];
  swing: readonly { track: string; swung: 8 | 16 | null; ratio: number | null }[];
}

/** Every Wave 7 lens fact of a piece (never throws: a view is an aid). */
export function workbenchTrack(n: Normalized, ctx: TrackContext): WorkbenchTrack {
  const meter = ctx.meter.id;
  const safe = <T>(f: () => T, fallback: T): T => {
    try {
      return f();
    } catch {
      return fallback;
    }
  };
  const slots = (ctx.harmony?.view.slots ?? []) as unknown as SlotLike[];
  const jazzOf = (code: string) => safe(() => chordSymbolText(code, "jazz"), code);
  const voicings = safe(() => handVoicings(n, meter, slots), [] as VoicedChord[]);
  return {
    tensions: safe(() => tensionMarks(tensionView(n, { meter }), jazzOf), new Map()),
    voicings,
    regions: safe(
      () =>
        regionJazz(
          slots,
          (ctx.harmony?.regions ?? []).map((r) => r.slot),
          voicings,
          ctx.key,
        ),
      [],
    ),
    twoFives: safe(() => twoFiveBrackets(n, meter, slots), []),
    clave: safe(() => claveLens(n, meter, ctx.bars), null),
    poly: safe(() => polyLanes(n, ctx.code, ctx.bars), null),
    micro: safe(() => microLens(n, ctx.meter, ctx.swing), { marks: new Map(), tracks: [] }),
    registers: safe(() => registerLens(n, meter), null),
    density: safe(() => densityLens(n, meter, ctx.bars, ctx.sections), null),
    odd: oddMeterGrid(ctx.meter),
  };
}

/** A voiced chord of a chord part, as the voicing lens labels it on the roll. */
export interface VoicedChord {
  track: string;
  at: number;
  /** Event IDs of its notes. */
  ids: string[];
  /** Its top note (where the label sits). */
  top: number;
  chord: string;
  label: string;
  /** The voice roles, lowest first ("3 7 9 5"). */
  roles: string;
}

/**
 * The voicings of the chord parts (not the melody or the bass line), each onset with two notes or more. A `voicing()`
 * line keeps the dictionary's shape (`voicingView`'s `dictionary`); a hand voicing is read with `voicingType` (the
 * function `voicingView` and the `voicing-shape` rule use) against the chord sounding at its own onset: the harmony's
 * chord there, else the symbol a changes line carries (a rootless voicing over `chord(changes).rootNotes(2)`).
 */
export function handVoicings(n: Normalized, meter: MeterId, slots: readonly SlotLike[]): VoicedChord[] {
  const skip = new Set([n.roles.melody, n.roles.bass].filter((x): x is string => !!x));
  const symbols = n.all.filter((e) => e.chordSymbol !== undefined);
  const out: VoicedChord[] = [];
  const at = (x: number) => (s: { span: SlotLike["span"] }) =>
    R.toNum(s.span[0] as [number, number]) <= x + 1e-9 && R.toNum(s.span[1] as [number, number]) > x + 1e-9;
  for (const t of Object.keys(n.byTrack)) {
    if (t.startsWith("band.") || skip.has(t)) continue;
    const byOnset = new Map<number, NEvent[]>();
    for (const e of n.byTrack[t] ?? []) {
      if (e.midi === null) continue;
      const x = R.toNum(e.onset);
      byOnset.set(x, [...(byOnset.get(x) ?? []), e]);
    }
    const dictionary = new Map(
      voicingView(n, { meter, track: t })
        .filter((v) => v.dictionary)
        .map((v) => [R.toNum(v.at), v] as const),
    );
    for (const [x, group] of [...byOnset].sort((a, b) => a[0] - b[0])) {
      if (group.length < 2) continue;
      const midis = group.map((e) => Math.round(e.midi as number)).sort((a, b) => a - b);
      const ids = group.map((e) => e.id);
      const top = midis[midis.length - 1] as number;
      const dict = dictionary.get(x);
      if (dict) {
        out.push({ track: t, at: x, ids, top, chord: dict.chord, label: "dictionary voicing", roles: "" });
        continue;
      }
      const code =
        slots.find(at(x))?.code ??
        symbols.find((e) => R.toNum(e.onset) <= x + 1e-9 && R.toNum(R.add(e.onset, e.dur)) > x + 1e-9)
          ?.chordSymbol;
      const chord = code ? parseChordSymbol(code) : null;
      if (!chord || !code) continue;
      const reading = voicingType(midis, chord);
      const label = VOICING_WORDS[reading.type] || "";
      if (!label) continue;
      out.push({ track: t, at: x, ids, top, chord: code, label, roles: reading.roles.join(" ") });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
