// Interval families: in-key (degree pad ×2 after a cadence), isolated (interval names), spell (concept)
// and sing (production). Interval names come from spelled notes (letters give the number, semitones the
// quality), so every answer key is checked against its own spelling.
import type { Degree, KeySpec } from "@oak/content-kit";
import { buildPiece } from "../build.ts";
import {
  degreeOfMidi,
  intervalName,
  LETTERS,
  MODE_STEPS,
  mod,
  parsePc,
  pcName,
  type Spelled,
  spellAs,
  spellMidi,
  stepToMidi,
  tonicMidi,
} from "../kernel.ts";
import { atom, chordOf, line, seq } from "../pat.ts";
import {
  cueOf,
  type GenCtx,
  type Generator,
  pickKey,
  pickSound,
  pickTempo,
  silentTrial,
  str,
  trialOf,
} from "./common.ts";
import { chordTrack, contextBar, pickOctave, register, singTargets, stepTrack } from "./keyed.ts";

/** Semitones of an interval name: "m3" → 3, "TT" → 6, "M9" → 14. */
export function intervalSemis(name: string): number {
  if (name === "TT") return 6;
  const m = /^([PMmAd])(\d+)$/.exec(name);
  if (!m) throw new RangeError(`not an interval name: ${name}`);
  const number = Number(m[2]);
  const simple = mod(number - 1, 7);
  const octaves = Math.floor((number - 1) / 7);
  const major = [0, 2, 4, 5, 7, 9, 11][simple] as number;
  const perfect = [0, 3, 4].includes(simple);
  const q = m[1] as string;
  const delta = perfect
    ? { P: 0, A: 1, d: -1 }[q as "P" | "A" | "d"]
    : { M: 0, m: -1, A: 1, d: -2 }[q as "M" | "m" | "A" | "d"];
  if (delta === undefined) throw new RangeError(`bad quality in ${name}`);
  return major + delta + 12 * octaves;
}
/** The spelled note an interval above (or below) a spelled note: C4 + M3 = E4, E4 − m3 = C#4. */
export function spellInterval(from: Spelled, name: string, down = false): Spelled {
  const iv = name === "TT" ? "A4" : name;
  const number = Number(iv.slice(1));
  const semis = intervalSemis(iv);
  const li = LETTERS.indexOf(from.letter as (typeof LETTERS)[number]);
  const letter = LETTERS[mod(li + (down ? -(number - 1) : number - 1), 7)] as string;
  const midi = from.midi + (down ? -semis : semis);
  const natural = parsePc(letter).pc;
  const alt = mod(midi - natural + 6, 12) - 6;
  return spellAs(midi, pcName(letter, alt));
}

// --- int.in-key ---------------------------------------------------------------------------------

/** Generic interval names for prompts and captions: i3 → "a 3rd". */
export const GENERIC_INTERVALS: Readonly<Record<string, string>> = {
  i2: "a 2nd",
  i3: "a 3rd",
  i4: "a 4th",
  i5: "a 5th",
  i6: "a 6th",
  i7: "a 7th",
  i8: "an octave",
};

/**
 * The lower scale step of an in-key pair. From or to the tonic it is the tonic; anywhere in the key it may
 * start from 6 below the tonic up to the step that keeps the upper note at most a 3rd above the octave
 * (so the pair sits in about an octave and a half around home).
 */
export function inKeyLow(shape: string, size: number, rng: GenCtx["rng"]): number {
  if (shape === "from-tonic" || shape === "to-tonic") return 0;
  return rng.int(-2, Math.min(6, 10 - size));
}

export const inKey: Generator = {
  name: "interval-in-key",
  generate(ctx) {
    const key = pickKey(ctx, "major");
    const [lo, hi] = register(ctx, [55, 76]);
    const size = Number(ctx.category.replace(/^i/, ""));
    const shape = str(ctx.level, "shape", "from-tonic");
    // Lower and upper scale steps of the pair.
    const low = inKeyLow(shape, size, ctx.rng);
    const high = low + size - 1;
    // The octave that puts both notes inside the register (the nearest one when none does).
    const octave = pairOctave(ctx, key, low, high, lo, hi);
    const descending =
      shape === "to-tonic" || shape === "any-down" || (shape === "any" && ctx.rng.next() < 0.5);
    const harmonic = shape === "harmonic";
    // to-tonic: from degree `size` down to the tonic.
    const [a, b] = descending ? [high, low] : [low, high];
    const steps = MODE_STEPS[key.mode];
    const degOf = (s: number): Degree =>
      degreeOfMidi(tonicMidi(key.tonic, 4) + (steps[mod(s, 7)] as number), key);
    const sound = pickSound(ctx);
    const context = contextBar(ctx, key, ctx.level.context ?? "cadence");
    const tracks = [];
    const target = harmonic ? chordOf([a, b]) : line([a, b]);
    if (context) {
      tracks.push(chordTrack(ctx, key, [context, null]));
      tracks.push(stepTrack(key, octave, [null, target], sound));
    } else tracks.push(stepTrack(key, octave, [target], sound));
    const piece = buildPiece({ bpm: pickTempo(ctx), bars: context ? 2 : 1, tracks });
    const degrees = harmonic ? [degOf(low), degOf(high)] : [degOf(a), degOf(b)];
    return trialOf(piece, { degrees }, cueOf(ctx, { context: ctx.level.context ?? "cadence" }), {
      mode: "choice",
      key,
      octave,
      steps: [a, b],
      shape,
      generic: GENERIC_INTERVALS[ctx.category] ?? null,
      cueBars: context ? 1 : 0,
      midis: [stepToMidi(a, key, octave), stepToMidi(b, key, octave)],
    });
  },
};
function pairOctave(ctx: GenCtx, key: KeySpec, low: number, high: number, lo: number, hi: number): number {
  let best = pickOctave(ctx.rng, key, lo, lo + 11);
  let bestBad = Number.POSITIVE_INFINITY;
  for (const o of ctx.rng.shuffle([2, 3, 4, 5])) {
    const a = stepToMidi(low, key, o);
    const b = stepToMidi(high, key, o);
    const bad = Math.max(0, lo - a) + Math.max(0, b - hi);
    if (bad < bestBad) {
      bestBad = bad;
      best = o;
    }
  }
  return best;
}

// --- int.isolated -------------------------------------------------------------------------------

export const isolated: Generator = {
  name: "interval-isolated",
  generate(ctx) {
    const [lo, hi] = register(ctx, [48, 84]);
    const name = ctx.category;
    const semis = intervalSemis(name === "TT" ? "A4" : name);
    const dir = str(ctx.level, "direction", "up");
    const down = dir === "down" || (dir === "any" && ctx.rng.next() < 0.5);
    const harmonic = dir === "harmonic";
    const rootMidi = down ? ctx.rng.int(lo + semis, hi) : ctx.rng.int(lo, hi - semis);
    const root = spellMidi(rootMidi, null);
    const other = spellInterval(root, name === "TT" ? ctx.rng.pick(["A4", "d5"]) : name, down);
    const sound = pickSound(ctx);
    const pat = harmonic ? chordOf([root.code, other.code]) : line([root.code, other.code]);
    const piece = buildPiece({
      bpm: pickTempo(ctx),
      meter: "2/4",
      bars: 1,
      tracks: [{ label: "mel", src: "note", pat: harmonic ? seq([pat]) : pat, s: sound }],
    });
    return trialOf(piece, { choice: [name] }, cueOf(ctx), {
      mode: "choice",
      notes: [root.name, other.name],
      direction: harmonic ? "harmonic" : down ? "down" : "up",
    });
  },
};

// --- int.spell ----------------------------------------------------------------------------------

/** Interval names in prose (U04 convention: words in prose, Strudel's strings in code). */
export const INTERVAL_WORDS: Readonly<Record<string, string>> = {
  m2: "minor 2nd",
  M2: "major 2nd",
  m3: "minor 3rd",
  M3: "major 3rd",
  P4: "perfect 4th",
  A4: "tritone (augmented 4th)",
  d5: "tritone (diminished 5th)",
  P5: "perfect 5th",
  m6: "minor 6th",
  M6: "major 6th",
  m7: "minor 7th",
  M7: "major 7th",
  P8: "octave",
  A2: "augmented 2nd",
  d7: "diminished 7th",
  A5: "augmented 5th",
  d4: "diminished 4th",
};
const QUALITIES_PM = ["M2", "M3", "P4", "P5", "M6", "M7", "P8"];
const QUALITIES_MMP = [...QUALITIES_PM, "m2", "m3", "m6", "m7"];
const TRITONES = ["A4", "d5"];
const QUALITIES_ODD = [...QUALITIES_MMP, ...TRITONES, "A2", "d7", "A5", "d4"];
/** The intervals a category may ask (L1 major and perfect above; L2 every M/m/P quality, the tritone from U04.L03). */
export function spellPool(category: string): readonly string[] {
  switch (category) {
    case "above-pm":
      return QUALITIES_PM;
    case "tritone":
      return TRITONES;
    case "accidental-roots":
      return QUALITIES_ODD;
    default:
      return QUALITIES_MMP;
  }
}
export const spellIv: Generator = {
  name: "interval-spell",
  generate(ctx) {
    const cue = cueOf(ctx, { replays: -1 });
    const cat = ctx.category;
    const accidentalRoots = cat === "accidental-roots";
    const letter = ctx.rng.pick(LETTERS as unknown as string[]);
    const alt = accidentalRoots ? ctx.rng.pick([-1, 1]) : 0;
    const rootPc = pcName(letter, alt);
    const iv = ctx.rng.pick(spellPool(cat));
    const down = cat === "below" || (cat === "tritone" && ctx.rng.next() < 0.5);
    const root = spellAs(tonicMidi(rootPc, 4), rootPc);
    const answer = spellInterval(root, iv, down);
    const words = INTERVAL_WORDS[iv] ?? iv;
    return silentTrial(
      { text: [answer.pc] },
      cue,
      {
        ui: "text",
        textKind: "note",
        root: root.pc,
        interval: iv,
        direction: down ? "below" : "above",
        prompt: `Which note is ${/^[aeiou]/.test(words) ? "an" : "a"} ${words} ${down ? "below" : "above"} ${display(root.pc)}? Write the letter, then # or b if it has a sharp or a flat.`,
      },
      `note("${root.code} ${answer.code}")`,
    );
  },
};
const display = (pc: string): string =>
  pc
    .replace(/#/g, "♯")
    .replace(/(?<=^[A-G])b/g, "♭")
    .replace(/♭b/, "𝄫");

// --- int.sing -----------------------------------------------------------------------------------

export const singIv: Generator = {
  name: "interval-sing",
  generate(ctx) {
    const name = ctx.category.replace(/-(up|down)$/, "");
    const down = ctx.category.endsWith("-down");
    const semis = intervalSemis(name);
    const { comfLow, comfHigh } = ctx.profile;
    const lo = down ? comfLow + 1 + semis : comfLow + 1;
    const hi = down ? comfHigh - 1 : comfHigh - 1 - semis;
    const root = ctx.rng.int(Math.min(lo, hi), Math.max(lo, hi));
    const target = down ? root - semis : root + semis;
    const piece = buildPiece({
      bpm: 100,
      bars: 1,
      tracks: [
        { label: "mel", src: "note", pat: seq([atom(spellMidi(root, null).code)]), s: pickSound(ctx) },
      ],
    });
    return trialOf(piece, { midi: [target] }, cueOf(ctx), {
      mode: "sing",
      singMode: "pitch",
      interval: name,
      direction: down ? "down" : "up",
      // Root and target are both inside the comfort range already; no shift.
      singTargets: [{ midi: target, on: 0, off: 2 }],
      responseAt: 1 / piece.cps,
      prompt: `Sing ${/^[aeiou]/.test(INTERVAL_WORDS[name] ?? name) ? "an" : "a"} ${INTERVAL_WORDS[name] ?? name} ${down ? "below" : "above"} the note.`,
    });
  },
};
export { intervalName, singTargets };
