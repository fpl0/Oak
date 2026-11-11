// The generator contract inside @oak/drills and the helpers every generator shares: category, key,
// instrument, kit, tempo and velocity randomization (exercises §4.1 codes K R I V T G D C) and the
// trial assembly. A generator returns the trial body; `bindFamily` adds seed, family, level and category.
import type {
  Answer,
  Cue,
  FamilyDef,
  KeySpec,
  LearnerProfile,
  LevelParams,
  Md,
  MeterId,
  ScaleMode,
  SkillRef,
  SoundId,
  Trial,
  TrialResult,
} from "@oak/content-kit";
import type { Piece } from "../build.ts";
import { keysFor, sameKey } from "../kernel.ts";
import { CLICKS, EARLY_KITS, KITS, soundName } from "../pools.ts";
import type { Rng, TrialResponse } from "../types.ts";

export type TrialBody = Omit<Trial<Answer>, "seed" | "family" | "level" | "category">;

export interface GenCtx<L extends LevelParams = LevelParams> {
  rng: Rng;
  level: L;
  levelNo: number;
  /** Number of levels of the family (for windows and fading). */
  levels: number;
  profile: LearnerProfile;
  category: string;
  openCategories: readonly string[];
  previous: Trial<Answer> | undefined;
  def: FamilyDef<L>;
}

export interface Generator<L extends LevelParams = LevelParams> {
  name: string;
  generate(ctx: GenCtx<L>): TrialBody;
  /** Default: `gradeAnswer` on the answer fields of `expected`. */
  grade?(
    trial: Trial<Answer>,
    response: TrialResponse,
    profile: LearnerProfile,
    def: FamilyDef<L>,
  ): TrialResult;
  exposure?(rng: Rng, level: L, def: FamilyDef<L>): { code: string; caption: Md; bars: number }[];
  categorySkill?(category: string, def: FamilyDef<L>): SkillRef;
}

// --- reading level params ------------------------------------------------------------------------

export function num(level: LevelParams, key: string, fallback: number): number {
  const v = level[key];
  return typeof v === "number" ? v : fallback;
}
export function str<T extends string = string>(level: LevelParams, key: string, fallback: NoInfer<T>): T {
  const v = level[key];
  return typeof v === "string" ? (v as T) : fallback;
}
export function bool(level: LevelParams, key: string, fallback = false): boolean {
  const v = level[key];
  return typeof v === "boolean" ? v : fallback;
}
export function range(level: LevelParams, key: string, fallback: [number, number]): [number, number] {
  const v = level[key];
  return Array.isArray(v) && v.length === 2 && v.every((x) => typeof x === "number")
    ? [v[0] as number, v[1] as number]
    : fallback;
}
export function list<T>(level: LevelParams, key: string, fallback: T[]): T[] {
  const v = level[key];
  return Array.isArray(v) ? (v as T[]) : fallback;
}

// --- randomization ------------------------------------------------------------------------------

/** Code K: a key of the level's pool, never the previous trial's key (when the pool has more than one). */
export function pickKey(ctx: GenCtx, mode: ScaleMode, pool = ctx.level.keys): KeySpec {
  const keys = keysFor(pool, mode);
  const prev = ctx.previous?.params.key as KeySpec | undefined;
  const fresh = keys.filter((k) => !sameKey(k, prev));
  return ctx.rng.pick(fresh.length > 0 ? fresh : keys);
}
/** Code I: one instrument of the level's list, as a Strudel sound name. */
export function pickSound(ctx: GenCtx, fallback = "piano"): string {
  const inst = ctx.level.instruments;
  if (inst === "drums" || inst.length === 0) return fallback;
  return soundName(ctx.rng.pick(inst as SoundId[]));
}
/** Code D: a drum kit (`null` = default kit). */
export function pickKit(ctx: GenCtx): string | null {
  return ctx.rng.pick(str(ctx.level, "kits", "all") === "early" ? EARLY_KITS : KITS);
}
export function pickClick(ctx: GenCtx): string {
  return ctx.rng.pick(CLICKS);
}
/** Code T: a whole BPM, uniform in the level's range widened by ±8%. */
export function pickTempo(ctx: GenCtx): number {
  const [lo, hi] = ctx.level.tempo;
  return ctx.rng.int(Math.round(lo * 0.92), Math.round(hi * 1.08));
}
/** Code G: velocity jitter ±0.1 on a base gain, two decimals. */
export function jitter(ctx: GenCtx, base: number): number {
  return Math.round((base + (ctx.rng.next() * 0.2 - 0.1)) * 100) / 100;
}

export function cueOf(ctx: GenCtx, over: Partial<Cue> = {}): Cue {
  return {
    context: ctx.level.context ?? "none",
    countInBars: 0,
    click: false,
    replays: ctx.level.replays,
    ...over,
  };
}

/** Assembles a trial body from a built piece. */
export function trialOf(
  piece: Piece,
  expected: Answer,
  cue: Cue,
  params: Record<string, unknown>,
  resolution?: Piece,
): TrialBody {
  return {
    params: { bpm: piece.bpm, meter: piece.meter, bars: piece.bars, ...params },
    code: piece.code,
    events: piece.events,
    cps: piece.cps,
    preload: piece.preload,
    cue,
    expected,
    ...(resolution ? { resolution: { code: resolution.code, events: resolution.events } } : {}),
  };
}
/** A trial with no sound (fact-like concept families): the code is a comment line, no events. */
export function silentTrial(
  expected: Answer,
  cue: Cue,
  params: Record<string, unknown>,
  code = "",
): TrialBody {
  return { params, code, events: [], cps: 0.5, preload: [], cue, expected };
}

export const meterOf = (ctx: GenCtx, fallback: MeterId = "4/4"): MeterId => str(ctx.level, "meter", fallback);
