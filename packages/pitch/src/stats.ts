// Per-degree sung statistics (contracts §8.3; wave4.md §5.6): the drills ask a sung resolution on the trials
// whose degrees the learner sings least accurately, so they need, per category, how many resolutions were sung
// and how many passed. This is the one definition of that record: the server folds the `drills.trials` it
// stores into it and serves it as `FamilyState.sungStats`; the drill engine reads it as `SetPlanInput.sungStats`.
// Pure and isomorphic.

/** `{ n, hits }` per category, the shape of `FamilyStateSchema.sungStats` and `SetPlanInput.sungStats`. */
export type SungStats = Record<string, { n: number; hits: number }>;

/** One sung resolution as the server stores it (a `DrillTrialRecord` with its `sungResolution`). */
export interface SungResolutionRecord {
  /** The trial's category ("deg.5"): what the resolution resolved. */
  category: string;
  /** The resolution passed (contracts §8.1 rule 7). */
  passed: boolean;
  /** `Shift+S`: no evidence. */
  skipped?: boolean;
  /** Quiet mode (listened instead of sung): no voice evidence. */
  quiet?: boolean;
  /** A trial answered in Quiet mode or as a fallback carries no voice evidence either. */
  modality?: "normal" | "quiet" | "fallback";
  /** Ordering key (epoch ms or a trial index); records are taken newest last when absent. */
  at?: number;
}

/** Only the newest this many resolutions of a category count (the drills' own `categoryStats` window). */
export const SUNG_STATS_WINDOW = 30;

/** Whether a record is voice evidence: sung, not skipped, not in Quiet mode, not a fallback. */
export function isSungEvidence(r: SungResolutionRecord): boolean {
  return !r.skipped && !r.quiet && (r.modality ?? "normal") === "normal";
}

/**
 * Folds sung resolutions into per-category statistics: for each category, the newest `window` resolutions that
 * are voice evidence; a passed resolution is a hit. Categories never sung are absent (the drill engine then
 * treats them as unknown, which it samples first).
 */
export function sungStatsOf(
  records: readonly SungResolutionRecord[],
  opts: { window?: number } = {},
): SungStats {
  const window = Math.max(1, Math.round(opts.window ?? SUNG_STATS_WINDOW));
  const ordered = records
    .map((r, i) => ({ r, key: r.at ?? i, i }))
    .filter(({ r }) => isSungEvidence(r))
    .sort((a, b) => a.key - b.key || a.i - b.i);
  const by = new Map<string, boolean[]>();
  for (const { r } of ordered) {
    const list = by.get(r.category) ?? [];
    list.push(r.passed);
    by.set(r.category, list);
  }
  const out: SungStats = {};
  for (const [category, list] of [...by.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const recent = list.slice(-window);
    out[category] = { n: recent.length, hits: recent.filter(Boolean).length };
  }
  return out;
}

/** Hit rate of a category, or `null` when it was never sung. */
export function sungAccuracy(stats: SungStats, category: string): number | null {
  const s = stats[category];
  return s && s.n > 0 ? s.hits / s.n : null;
}
