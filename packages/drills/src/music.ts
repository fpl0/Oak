// Shared musical material for the generators: the voicer (randomization code V), cadence contexts
// (code C), the progressions of the schema, cadence and ii–V families, FET resolution paths and register
// placement. Pure integer arithmetic on MIDI numbers over the kernel.
import type { ChordQuality, Degree, KeySpec } from "@oak/content-kit";
import {
  CHORD_TONES,
  chordPcs,
  degreeSemis,
  MODE_STEPS,
  mod,
  parseDegree,
  parsePc,
  type RnChord,
  rnRootPc,
  spellAs,
  spellChord,
  spellMidi,
  stepForDegree,
} from "./kernel.ts";
import type { Rng } from "./types.ts";

// --- voicing ------------------------------------------------------------------------------------

export type VoicingKind = "close" | "open" | "drop2" | "spread";
export interface Voiced {
  /** Ascending MIDI numbers; `[0]` is the bass. */
  midis: number[];
  rootPc: number;
  quality: ChordQuality;
  /** 0 root position, 1 first inversion … (which chord member is in the bass). */
  inversion: number;
}
/** Pitch classes of a chord as chord members, root first. */
const memberPcs = (rootPc: number, quality: ChordQuality): number[] =>
  CHORD_TONES[quality].semis.map((s) => mod(rootPc + s, 12));

/** The lowest MIDI ≥ `floor` with pitch class `pc`. */
export const above = (pc: number, floor: number): number => floor + mod(pc - floor, 12);

/**
 * Voices a chord: the bass is member `inversion` placed in [bassLo, bassHi]; the other members stack in
 * close position from just above the bass (or above `upperFloor`), then `open`/`drop2`/`spread` move voices
 * apart. Ninths and other tensions stay above the third, as a pianist would play them.
 */
export function voiceChord(
  rootPc: number,
  quality: ChordQuality,
  opts: {
    inversion?: number;
    kind?: VoicingKind;
    bass: [number, number];
    upperFloor?: number;
    /** Leave the bass out of the upper structure (it is played by a separate bass line). */
    rootless?: boolean;
  },
): Voiced {
  const pcs = memberPcs(rootPc, quality);
  const inversion = opts.inversion ?? 0;
  const bassPc = pcs[inversion] as number;
  const bass = above(bassPc, opts.bass[0]);
  if (bass > opts.bass[1]) throw new RangeError(`no bass ${bassPc} in [${opts.bass}]`);
  const upper: number[] = [];
  // Members in order starting after the bass member, wrapped: the classic close-position stack.
  const order = [...pcs.slice(inversion + 1), ...pcs.slice(0, inversion)];
  let floor = Math.max(bass + 1, opts.upperFloor ?? bass + 1);
  for (const pc of order) {
    const m = above(pc, floor);
    upper.push(m);
    floor = m + 1;
  }
  if (!opts.rootless && quality !== "7alt") {
    // The bass member doubled on top for triads keeps a four-voice texture.
    if (pcs.length === 3) upper.push(above(bassPc, floor));
  }
  const kind = opts.kind ?? "close";
  if (kind === "open" && upper.length >= 3) {
    // Open: the middle voice of the upper three goes up an octave.
    upper[1] = (upper[1] as number) + 12;
  } else if (kind === "drop2" && upper.length >= 3) {
    // Drop 2: the second voice from the top goes down an octave (stays above the bass).
    const i = upper.length - 2;
    const dropped = (upper[i] as number) - 12;
    upper[i] = dropped > bass ? dropped : (upper[i] as number);
  } else if (kind === "spread") {
    for (let i = 1; i < upper.length; i += 2) upper[i] = (upper[i] as number) + 12;
  }
  const midis = [bass, ...upper].sort((a, b) => a - b);
  return { midis, rootPc, quality, inversion };
}

/** Low-interval limits: no third below E2+…; here simply no two notes closer than a 3rd below C3 (48). */
export function lowIntervalOk(midis: readonly number[]): boolean {
  const sorted = [...midis].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    const lo = sorted[i - 1] as number;
    const hi = sorted[i] as number;
    if (hi < 48 && hi - lo < 7 && hi - lo !== 0) return false;
  }
  return true;
}

/** Note names for code: chord-tone spelling when it needs no double accidental, the key's otherwise. */
export function spellVoiced(v: Voiced, key: KeySpec | null): string[] {
  const rootName = key ? spellMidi(60 + v.rootPc, key).pc : spellMidi(60 + v.rootPc, null).pc;
  let names: string[] | null = null;
  try {
    const spelled = spellChord(rootName, v.quality);
    if (spelled.every((n) => !/bb|##/.test(n))) names = spelled;
  } catch {
    names = null;
  }
  return v.midis.map((m) => {
    if (names) {
      const pc = names.find((n) => parsePc(n).pc === mod(m, 12));
      if (pc) return spellAs(m, pc).code;
    }
    return spellMidi(m, key).code;
  });
}

// --- key contexts (code C) ----------------------------------------------------------------------

/** Diatonic and borrowed chords used by contexts and progressions: a degree and a quality. */
export const rn = (degree: Degree, quality: ChordQuality, inversion?: 0 | 1 | 2 | 3): RnChord =>
  inversion ? { degree, quality, inversion } : { degree, quality };

const MAJOR_CADENCES: RnChord[][] = [
  [rn("1", "maj"), rn("4", "maj"), rn("5", "maj"), rn("1", "maj")],
  [rn("1", "maj"), rn("5", "maj"), rn("1", "maj")],
  [rn("2", "min"), rn("5", "maj"), rn("1", "maj")],
  [rn("1", "maj"), rn("6", "min"), rn("4", "maj"), rn("5", "maj")],
];
const MINOR_CADENCES: RnChord[][] = [
  [rn("1", "min"), rn("4", "min"), rn("5", "maj"), rn("1", "min")],
  [rn("1", "min"), rn("5", "maj"), rn("1", "min")],
  [rn("2", "dim"), rn("5", "maj"), rn("1", "min")],
  [rn("1", "min"), rn("b6", "maj"), rn("4", "min"), rn("5", "maj")],
];
/** Minor cadences before the major V (U10.L01–L05): the Aeolian VII–i and the minor v–i. */
const NATURAL_MINOR_CADENCES: RnChord[][] = [
  [rn("1", "min"), rn("b6", "maj"), rn("b7", "maj"), rn("1", "min")],
  [rn("1", "min"), rn("4", "min"), rn("b7", "maj"), rn("1", "min")],
  [rn("1", "min"), rn("4", "min"), rn("5", "min"), rn("1", "min")],
];
const isMinorish = (key: KeySpec): boolean =>
  key.mode !== "major" &&
  key.mode !== "lydian" &&
  key.mode !== "mixolydian" &&
  key.mode !== "major pentatonic" &&
  (MODE_STEPS[key.mode][2] === 3 || key.mode.includes("minor"));

/**
 * One of the cadence variants of code C, or the shorter contexts of the fading ladder. A minor key closes
 * with the major V only once the learner has met it (`majorV`, U10.L06); before that VII–i or v–i.
 */
export function contextChords(
  rng: Rng,
  key: KeySpec,
  context: "cadence" | "short-cadence" | "tonic-chord" | "drone",
  opts: { majorV?: boolean } = {},
): RnChord[] {
  const minor = isMinorish(key);
  const majorV = !minor || opts.majorV !== false;
  const tonic = rn("1", minor ? "min" : "maj");
  if (context === "tonic-chord" || context === "drone") return [tonic];
  if (context === "short-cadence") return [tonic, majorV ? rn("5", "maj") : rn("b7", "maj"), tonic];
  if (minor && !majorV) return rng.pick(NATURAL_MINOR_CADENCES);
  return rng.pick(minor ? MINOR_CADENCES : MAJOR_CADENCES);
}

/**
 * Voices a progression with smooth upper voices: each chord takes the close-position inversion of its
 * upper structure whose average is nearest the previous one. Bass in E2–E3 (root unless an inversion is
 * asked), upper voices from G3.
 */
export function voiceProgression(
  chords: readonly RnChord[],
  key: KeySpec,
  opts: { kind?: VoicingKind; bass?: [number, number]; center?: number } = {},
): Voiced[] {
  const bassRange = opts.bass ?? [40, 51];
  let center = opts.center ?? 64;
  return chords.map((c) => {
    const rootPc = rnRootPc(c, key);
    let best: Voiced | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const floor of [53, 55, 57, 59, 60, 62]) {
      const v = voiceChord(rootPc, c.quality, {
        inversion: c.inversion ?? 0,
        bass: bassRange,
        upperFloor: floor,
        ...(opts.kind ? { kind: opts.kind } : {}),
      });
      const upper = v.midis.slice(1);
      const mean = upper.reduce((s, m) => s + m, 0) / upper.length;
      const dist = Math.abs(mean - center);
      if (dist < bestDist) {
        best = v;
        bestDist = dist;
      }
    }
    const chosen = best as Voiced;
    const upper = chosen.midis.slice(1);
    center = upper.reduce((s, m) => s + m, 0) / upper.length;
    return chosen;
  });
}

/**
 * Close triads (three notes, no doubling, no bass) led smoothly: each chord takes the inversion and octave
 * that moves its voices least from the last chord while staying near `center` (MIDI), so a loop sounds like
 * a pianist's left hand, not a block of root positions jumping around.
 */
export function closeVoices(chords: readonly RnChord[], key: KeySpec, center: number): Voiced[] {
  let prev: number[] | null = null;
  return chords.map((c) => {
    const rootPc = rnRootPc(c, key);
    const pcs = chordPcs(rootPc, c.quality).slice(0, 3);
    let best: Voiced | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let inversion = 0; inversion < 3; inversion++)
      for (let low = center - 9; low <= center + 2; low++) {
        if (mod(low, 12) !== pcs[inversion]) continue;
        const midis = [low];
        for (let k = 1; k < 3; k++)
          midis.push(above(pcs[(inversion + k) % 3] as number, (midis[k - 1] as number) + 1));
        const mean = midis.reduce((a, b) => a + b, 0) / 3;
        const move = prev
          ? midis.reduce((sum, m, i) => sum + Math.abs(m - ((prev as number[])[i] ?? m)), 0)
          : 0;
        const cost = move + 0.75 * Math.abs(mean - center);
        if (cost < bestCost) {
          bestCost = cost;
          best = { midis, rootPc, quality: c.quality, inversion };
        }
      }
    const chosen = best as Voiced;
    prev = chosen.midis;
    return chosen;
  });
}

// --- degrees and register -----------------------------------------------------------------------

/**
 * The `n` values (in the key's own scale at its octave) that play `degree` within [lo, hi]. Diatonic
 * and chromatic steps may move by ±7 ("3#" → "10#" or "-4#").
 */
export function stepsInRange(
  degree: Degree,
  key: KeySpec,
  tonicMidi: number,
  lo: number,
  hi: number,
): (number | string)[] {
  const step = stepForDegree(degree, key);
  const semis = degreeSemis(degree);
  const out: (number | string)[] = [];
  for (const k of [-1, 0, 1, 2]) {
    const midi = tonicMidi + semis + 12 * k;
    if (midi < lo || midi > hi) continue;
    if (typeof step === "number") out.push(step + 7 * k);
    else {
      // Negative chromatic steps ("-2#") resolve like positive ones in Strudel 1.2.6 (checked headlessly).
      const m = /^(\d+)([#b]+)$/.exec(step) as RegExpExecArray;
      out.push(`${Number(m[1]) + 7 * k}${m[2]}`);
    }
  }
  return out;
}

/** Diatonic `n` step index (0-based, may exceed 6) of a step value: "3#" → 3. */
export const stepIndex = (step: number | string): number =>
  typeof step === "number" ? step : Number(/^-?\d+/.exec(step)?.[0]);

/**
 * The FET resolution of a step: degrees 2–4 resolve down, 5–7 up, by step to the tonic; a chromatic
 * note first leans a half step to its neighbour (♯4 → 5 and on up; ♭7 → 6, then 7, 1; ♭6 → 5, then up;
 * ♭3 → 2 → 1).
 */
export function resolutionSteps(step: number | string, key: KeySpec): (number | string)[] {
  const steps = MODE_STEPS[key.mode];
  const len = steps.length;
  const idx = stepIndex(step);
  const base = Math.floor(idx / len) * len;
  const within = idx - base;
  const acc = typeof step === "string" ? (/#/.test(step) ? 1 : -1) : 0;
  const semis = (steps[within] as number) + acc;
  const out: (number | string)[] = [step];
  if (within === 0 && acc === 0) return out;
  const minorScale = len === 7 && steps[2] === 3;
  // Melodic minor's raised 6 climbs home through the raised 7 (la ti do), never through te.
  if (minorScale && acc > 0 && semis === 9 && steps[(within + 1) % len] === 10) {
    out.push(`${idx + 1}#`);
    for (let i = idx + 2; i <= base + len; i++) out.push(i);
    return out;
  }
  // A chromatic note of a seven-note scale leans by a half step first, the way U15.L01 teaches it: a raised
  // note up to the next degree (fi–sol, si–la, di–re), a lowered one down to the degree below (te–la, le–sol,
  // me–re, ra–do). From there it goes home as that degree does (te la ti do; le sol la ti do; me re do), so
  // every path still ends on the tonic. Before Wave 6 a lowered 6 or 7 climbed through the natural note
  // (te ti do), which is not how the course says they move.
  if (len === 7 && acc > 0) return [step, ...resolutionSteps(idx + 1, key)];
  if (len === 7 && acc < 0) return [step, ...resolutionSteps(idx - 1, key)];
  // 5 and everything above resolve upwards; 2, 3 and 4 resolve down.
  if (semis >= 6) {
    for (let i = acc < 0 ? idx : idx + 1; i <= base + len; i++) out.push(i);
  } else {
    for (let i = acc > 0 ? idx : idx - 1; i >= base; i--) out.push(i);
  }
  return out;
}

/** Shift (multiple of 12) that brings MIDI notes inside [comfLow+1, comfHigh−1]; nearest fit when they cannot all fit. */
export function comfortShift(midis: readonly number[], low: number, high: number): number {
  if (midis.length === 0) return 0;
  const min = Math.min(...midis);
  const max = Math.max(...midis);
  let best = 0;
  let bestBad = Number.POSITIVE_INFINITY;
  for (let k = -4; k <= 4; k++) {
    const lo = min + 12 * k;
    const hi = max + 12 * k;
    const bad = Math.max(0, low + 1 - lo) + Math.max(0, hi - (high - 1));
    const centre = Math.abs((lo + hi) / 2 - (low + high) / 2);
    const score = bad * 100 + centre;
    if (score < bestBad) {
      bestBad = score;
      best = 12 * k;
    }
  }
  return best;
}

/** True when the degree is chromatic in the key's mode. */
export function isChromatic(degree: Degree, key: KeySpec): boolean {
  return typeof stepForDegree(degree, key) === "string";
}
export const degreeNum = (d: Degree): number => parseDegree(d).num;
