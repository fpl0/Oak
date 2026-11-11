// Haps as the views see them: JSON-safe, tagged with their track, sorted (interfaces.md §3 "Events are
// sorted": `queryArc` is not time-sorted across cycle boundaries).
import type { LiveHap } from "./types.ts";

/** The context key the adapter's `.p` wrapper writes the track name under. */
export const TRACK_KEY = "oakTrack";

interface HapLike {
  whole?: { begin: { valueOf(): number }; end: { valueOf(): number } } | undefined;
  part?: { begin: { valueOf(): number }; end: { valueOf(): number } };
  value: unknown;
  context?: { locations?: { start: number; end: number }[]; [key: string]: unknown };
}

function jsonSafe(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "function" || typeof value === "symbol" || value === undefined) return undefined;
  if (depth > 3) return undefined;
  if (Array.isArray(value)) return value.map((v) => jsonSafe(v, depth + 1) ?? null);
  // A Fraction (BigInt fields): keep its number.
  const maybeFraction = value as { s?: unknown; n?: unknown; d?: unknown; valueOf?: () => unknown };
  if (typeof maybeFraction.n === "bigint" && typeof maybeFraction.d === "bigint")
    return Number(maybeFraction.valueOf?.());
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const safe = jsonSafe(v, depth + 1);
    if (safe !== undefined) out[k] = safe;
  }
  return out;
}

export function toLiveHap(hap: HapLike): LiveHap {
  const span = hap.whole ?? hap.part;
  const raw = hap.value;
  const value =
    raw !== null && typeof raw === "object" && !Array.isArray(raw)
      ? (jsonSafe(raw) as Record<string, unknown>)
      : { value: jsonSafe(raw) ?? null };
  const track = hap.context?.[TRACK_KEY];
  return {
    track: typeof track === "string" ? track : "main",
    begin: span ? Number(span.begin.valueOf()) : 0,
    end: span ? Number(span.end.valueOf()) : 0,
    value,
    locations: (hap.context?.locations ?? []).map((l) => ({ start: l.start, end: l.end })),
  };
}

const midiOrder = (hap: LiveHap): number => {
  const note = hap.value.note;
  return typeof note === "number" ? note : 0;
};

/** By (onset, track in `trackOrder`, pitch). Stable for equal keys. */
export function sortLiveHaps(haps: LiveHap[], trackOrder: readonly string[] = []): LiveHap[] {
  const rank = (track: string): number => {
    const i = trackOrder.indexOf(track);
    return i < 0 ? trackOrder.length : i;
  };
  return haps
    .map((hap, i) => ({ hap, i }))
    .sort(
      (a, b) =>
        a.hap.begin - b.hap.begin ||
        rank(a.hap.track) - rank(b.hap.track) ||
        midiOrder(a.hap) - midiOrder(b.hap) ||
        a.i - b.i,
    )
    .map((x) => x.hap);
}

/** `cycle − (scheduler head start + output latency + base latency + the learner's offset) × cps`. */
export function audibleCycle(
  cycle: number,
  cps: number,
  latency: { schedulerLeadS: number; outputLatencyS: number; baseLatencyS: number; visualOffsetMs: number },
): number {
  const seconds =
    latency.schedulerLeadS + latency.outputLatencyS + latency.baseLatencyS + latency.visualOffsetMs / 1000;
  return cycle - seconds * cps;
}
