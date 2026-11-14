// Dev-only hooks for the browser suites (tree-shaken from production: every reader checks `import.meta.env.DEV`).
// A spec sets them with `page.addInitScript` before the app loads; nothing in the product sets them.
//   __oakDrillForce   { [trialIndex]: { category?, level?, seed?, sung? } }  free practice draws that trial on purpose
//                     (d23: a rare layout case is tested every run instead of one run in five).
//   __oakDrillOpenAll true: free practice treats every family as unlocked at every level, for a family whose
//                     lessons are not authored yet (the server still starts, records and finishes the set).

export interface DrillForce {
  category?: string;
  level?: number;
  /** Added to the trial's seed (another draw of the same category). */
  seed?: number;
  /** An FET trial that asks for its sung resolution (free practice picks two or three at random). */
  sung?: boolean;
}

const isDev = (): boolean => {
  try {
    return (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  } catch {
    return false;
  }
};

/** The forced draw of trial `i` of a free-practice set, or null. */
export function devForceAt(i: number): DrillForce | null {
  if (!isDev()) return null;
  const all = (globalThis as { __oakDrillForce?: Record<number, DrillForce> }).__oakDrillForce;
  const f = all?.[i];
  return f && typeof f === "object" ? f : null;
}

/** Whether a spec opened every family for free practice. */
export function devOpenAll(): boolean {
  return isDev() && (globalThis as { __oakDrillOpenAll?: boolean }).__oakDrillOpenAll === true;
}
