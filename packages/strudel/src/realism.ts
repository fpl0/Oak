// Wave 4 seam (docs/design/wave4.md §3.5): realism levels of a ladder stimulus (contracts §6.12). Pure: the level
// becomes a `RealismSpec` the pattern player applies to the hidden code's pattern (never to its text, which no
// one sees). The arrangement itself (which parts play, kit, density) is the generator's (`@oak/drills`
// `generateLadderPiece(level, realism, seed)`); this is the performance on top. Grading tolerances never change
// with realism: answers stay on the grid.
//
//   R0 clean and quantized
//   R1 timing humanized ±15 ms, velocity ±0.1
//   R2 R1 + swing or shuffle feel where idiomatic, plus room
//   R3 R2 + a dense mix with the target part 6 dB down
//   R4 R3 + a vocal-like lead (`tenor`, `choir`) and detune up to ±30¢

export type RealismLevelId = 0 | 1 | 2 | 3 | 4;

export interface RealismSpec {
  level: RealismLevelId;
  /** Seeds the humanisation, so a replay of the same item sounds the same. */
  seed: number;
  /** Onset jitter, ± ms (uniform, per hap, deterministic from the seed and the hap's position). */
  timingMs: number;
  /** Velocity jitter, ± (multiplies `velocity`, clamped to [0, 1]). */
  velocity: number;
  /** `.swingBy(amount, unitsPerBar)` on drum and comping tracks when the generator marked the item swung. */
  swing: { amount: number } | null;
  /** `.room()` on every track. */
  room: number;
  /** The target part, `gain` lowered by `db` (negative), among the other parts. */
  buried: { track: string; db: number } | null;
  /** A vocal-like lead sound on the target melody (`tenor`, `choir`). */
  leadSound: string | null;
  /** Detune of the lead, ± cents (slow drift, deterministic). */
  detuneCents: number;
  /**
   * The part the learner transcribes, at every level (`buried.track` names it only from R3). It never swings
   * (swing is for drums and comping), and is the one buried at R3 and given the lead sound at R4. Optional, so
   * a spec written before Wave 4 Build still type-checks; `realismSpec` always sets it.
   */
  target?: string | null;
}

/** The spec of a realism level for one item. `target` is the track the learner transcribes (buried at R3+). */
export function realismSpec(
  level: RealismLevelId,
  opts: { seed?: number; target?: string | null; swung?: boolean; vocalLead?: "tenor" | "choir" } = {},
): RealismSpec {
  const seed = opts.seed ?? 0;
  return {
    level,
    seed,
    timingMs: level >= 1 ? 15 : 0,
    velocity: level >= 1 ? 0.1 : 0,
    swing: level >= 2 && opts.swung ? { amount: 1 / 3 } : null,
    room: level >= 2 ? 0.3 : 0,
    buried: level >= 3 && opts.target ? { track: opts.target, db: -6 } : null,
    leadSound: level >= 4 ? (opts.vocalLead ?? "choir") : null,
    detuneCents: level >= 4 ? 30 : 0,
    target: opts.target ?? null,
  };
}

/** True for the clean spec (what the pattern player accepts before realism is built). */
export function isCleanRealism(spec: RealismSpec): boolean {
  return (
    spec.timingMs === 0 &&
    spec.velocity === 0 &&
    spec.swing === null &&
    spec.room === 0 &&
    spec.buried === null &&
    spec.leadSound === null &&
    spec.detuneCents === 0
  );
}

/** Thrown by an adapter feature that is a Wave 4 seam not yet built. Callers catch it and fall back. */
export class StrudelNotBuiltError extends Error {
  readonly code = "strudel_not_built";
  constructor(what: string) {
    super(`@oak/strudel: ${what} is not built yet (docs/design/wave4.md §3.5, wave5.md §3.4)`);
    this.name = "StrudelNotBuiltError";
  }
}
