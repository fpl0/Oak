// Band-layer code preparation (contracts §5.10). The Band is evaluated separately from the learner's code
// and its tracks are collected as `band.<label>`. This file holds the pure text part.
import type { KeySpec } from "@oak/content-kit";
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

/**
 * The Band code to evaluate next to the learner's code.
 *
 * - Leftover `{{key}}` and `{{bpm}}` placeholders are filled (the step's key at octave 4, the learner's
 *   tempo or the lesson default).
 * - With `followsLearnerKey`, every scale name in the Band that carries the step's tonic and mode is
 *   re-written to the tonic and mode of the learner's first `.scale()`, keeping the Band's octaves.
 */
export function bandCodeFor(band: BandSetup, ctx: BandContext): string {
  const learner = band.followsLearnerKey ? firstScaleOf(ctx.learnerCode) : null;
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
  if (learner && stepKey && (learner.tonic !== stepKey.tonic || learner.mode !== stepKey.mode)) {
    const from = new RegExp(
      `(^|[^A-Za-z#])${escapeRe(stepKey.tonic)}(-?\\d):${escapeRe(stepKey.mode)}(?![a-z:])`,
      "g",
    );
    code = code.replace(
      from,
      (_all, lead: string, octave: string) => `${lead}${learner.tonic}${octave}:${learner.mode}`,
    );
  }
  return code;
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The Band tracks an evaluation keeps: only the roles the step asked for. */
export function bandTrackName(label: string): string {
  return `band.${label}`;
}
