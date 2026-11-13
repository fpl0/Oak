// Band-layer code preparation (contracts §5.10). The Band is evaluated separately from the learner's code
// and its tracks are collected as `band.<label>`. This file holds the pure text part.
import type { KeySpec } from "@oak/content-kit";
import { followLearnerForm } from "./band-form.ts";
import { stringArgsOf, stripComments } from "./sounds-in.ts";
import type { BandSetup } from "./types.ts";

/** "harmonic minor" → "harmonic:minor": the form Strudel's `.scale()` takes (STYLE §3). */
export const strudelMode = (mode: string): string => mode.trim().replace(/\s+/g, ":");

/** `"C4:major"`, `"F#3:harmonic:minor"`. */
export function scaleName(key: KeySpec, octave: number): string {
  return `${key.tonic}${octave}:${strudelMode(key.mode)}`;
}

const SCALE_NAME = /^([A-G][#b]?)(-?\d)?:([a-z:]+)$/;

/** Tonic and mode of the first literal `.scale("…")` in the code (the first alternative of a patterned one). */
export function firstScaleOf(code: string): { tonic: string; octave: number | null; mode: string } | null {
  for (const arg of stringArgsOf(stripComments(code), ["scale"])) {
    for (const token of arg.split(/[\s<>[\],!*@/|]+/)) {
      const m = SCALE_NAME.exec(token);
      if (m)
        return {
          tonic: m[1] as string,
          octave: m[2] === undefined ? null : Number(m[2]),
          mode: m[3] as string,
        };
    }
  }
  return null;
}

/** The BPM of the code's own `setcpm(bpm/units)` line, or null. */
export function tempoOf(code: string): { bpm: number; unitsPerBar: number } | null {
  const m = /(?:^|[^A-Za-z0-9_$.])setcpm\(\s*([0-9.]+)\s*(?:\/\s*([0-9.]+)\s*)?\)/i.exec(stripComments(code));
  if (!m) return null;
  const bpm = Number(m[1]);
  const units = m[2] === undefined ? 1 : Number(m[2]);
  return Number.isFinite(bpm) && Number.isFinite(units) && units > 0 ? { bpm, unitsPerBar: units } : null;
}

export interface BandContext {
  /** The step's key (`LessonCtx.key`). */
  key: KeySpec | null;
  defaultBpm: number;
  /** The learner's code of this evaluation. */
  learnerCode: string;
}

const LETTER_SEMIS: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Half steps from C up to a tonic in the same octave number: `F#` 6, `Cb` −1, `B#` 12. */
export function tonicOffset(tonic: string): number {
  const letter = LETTER_SEMIS[tonic.charAt(0).toUpperCase()] ?? 0;
  let acc = 0;
  for (const ch of tonic.slice(1)) acc += ch === "#" ? 1 : ch === "b" ? -1 : 0;
  return letter + acc;
}

/**
 * The octave number that puts `tonic` in the register a Band was written for at `octave` (contracts §5.10).
 * Band code is written in C: its `{{key}}` is filled as `<tonic>4:<mode>` and its parts are degrees below
 * that tonic. Read literally, F♯4 to B4 would lift the whole Band up to a fifth above C4, so the octave is
 * folded: the tonic lands within a tritone below to a fourth above the C of that octave (F♯ to B go down
 * one, C to F stay). `bandOctave("G", 4)` is 3; `bandOctave("F", 4)` is 4; `bandOctave("Cb", 4)` is 4.
 */
export function bandOctave(tonic: string, octave: number): number {
  return octave - Math.floor((tonicOffset(tonic) + 6) / 12);
}

/** A scale name with an octave (`G4:major`, `F#3:harmonic:minor`), wherever it sits in a mini-notation string. */
const SCALE_TOKEN = /(^|[^A-Za-z0-9#])([A-G](?:#|b)*)(-?\d+)(:[a-z]+(?::[a-z]+)*)/g;
/** A `.scale("…")` call's string argument. */
const SCALE_CALL = /(\.scale\(\s*)(["'`])([^"'`]*)\2/g;

/** Every scale name in the Band's `.scale()` strings, moved to the octave of its register (`bandOctave`). */
export function foldBandRegister(code: string): string {
  return code.replace(
    SCALE_CALL,
    (_all, open: string, quote: string, arg: string) =>
      `${open}${quote}${arg.replace(
        SCALE_TOKEN,
        (_t, lead: string, tonic: string, oct: string, rest: string) =>
          `${lead}${tonic}${bandOctave(tonic, Number(oct))}${rest}`,
      )}${quote}`,
  );
}

/** The learner's first `.scale()` argument when it names more than one key (`"<C4:major!2 G4:major!2>"`). */
function patternedScaleArg(code: string): string | null {
  for (const arg of stringArgsOf(stripComments(code), ["scale"])) {
    const names = new Set<string>();
    for (const token of arg.split(/[\s<>[\],!*@/|]+/)) {
      const m = SCALE_NAME.exec(token);
      if (m) names.add(`${m[1]}:${m[3]}`);
    }
    if (names.size === 0) continue;
    return names.size > 1 ? arg : null;
  }
  return null;
}

/** The learner's key pattern, every name at `octave` (the Band's own octave for that line). */
function patternAt(arg: string, octave: number): string {
  return arg.replace(
    /(^|[^A-Za-z0-9#])([A-G](?:#|b)*)(-?\d+)?(:[a-z]+(?::[a-z]+)*)/g,
    (_t, lead, tonic, _o, rest) => {
      return `${lead}${tonic}${octave}${rest}`;
    },
  );
}

/**
 * The Band code to evaluate next to the learner's code.
 *
 * - Leftover `{{key}}` and `{{bpm}}` placeholders are filled (the step's key at octave 4, the learner's
 *   tempo or the lesson default).
 * - With `followsLearnerKey`, every scale name in the Band that carries the step's tonic and mode is
 *   re-written to the tonic and mode of the learner's first `.scale()`, keeping the Band's octaves. When
 *   that `.scale()` is patterned (`"<C4:major!2 G4:major!2>"`), a Band line in one key takes the whole
 *   pattern, so the Band changes key with the tune.
 * - A Band written in sections (one `arrange()` per labelled track) follows the learner's sections: their order
 *   and bar counts, each played by the Band's section of the same type (`followLearnerForm`, band-form.ts).
 * - Last, the register is folded (`foldBandRegister`): in G, A or B the Band sits below C, not a fifth above.
 */
export function bandCodeFor(band: BandSetup, ctx: BandContext): string {
  const learner = band.followsLearnerKey ? firstScaleOf(ctx.learnerCode) : null;
  const pattern = band.followsLearnerKey ? patternedScaleArg(ctx.learnerCode) : null;
  const stepKey = ctx.key ? { tonic: ctx.key.tonic, mode: strudelMode(ctx.key.mode) } : null;
  const target = learner ? { tonic: learner.tonic, mode: learner.mode } : stepKey;
  let code = band.code;
  if (code.includes("{{key}}")) {
    const key = target ?? { tonic: "C", mode: "major" };
    code = code.replaceAll("{{key}}", `${key.tonic}4:${key.mode}`);
  }
  if (code.includes("{{bpm}}")) {
    const tempo = tempoOf(ctx.learnerCode);
    code = code.replaceAll("{{bpm}}", String(tempo?.bpm ?? ctx.defaultBpm));
  }
  if (pattern) {
    // A Band line in one key (`.scale("C4:major")`) takes the learner's whole key plan at its own octave.
    code = code.replace(SCALE_CALL, (all, open: string, quote: string, arg: string) => {
      const m = SCALE_NAME.exec(arg.trim());
      if (!m || m[2] === undefined) return all;
      return `${open}${quote}${patternAt(pattern, Number(m[2]))}${quote}`;
    });
  } else if (learner && stepKey && (learner.tonic !== stepKey.tonic || learner.mode !== stepKey.mode)) {
    const from = new RegExp(
      `(^|[^A-Za-z#])${escapeRe(stepKey.tonic)}(-?\\d):${escapeRe(stepKey.mode)}(?![a-z:])`,
      "g",
    );
    code = code.replace(
      from,
      (_all, lead: string, octave: string) => `${lead}${learner.tonic}${octave}:${learner.mode}`,
    );
  }
  return foldBandRegister(followLearnerForm(code, ctx.learnerCode));
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The Band tracks an evaluation keeps: only the roles the step asked for. */
export function bandTrackName(label: string): string {
  return `band.${label}`;
}
