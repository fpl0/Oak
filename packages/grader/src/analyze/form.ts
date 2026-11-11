// Form, energy, contrast and register (exercises §3.7; contracts §5.6 `contrast`).
import type { NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { mean, mod12, num, pitched, sounding } from "./events.ts";

const inBars = (events: readonly NEvent[], from: number, to: number): NEvent[] =>
  events.filter((e) => {
    const c = R.floor(e.onset);
    return c >= from && c < to;
  });

const norm = (xs: readonly number[]): number[] => {
  const max = Math.max(0, ...xs);
  return xs.map((x) => (max === 0 ? 0 : x / max));
};

/**
 * Energy per bar: `0.4·onsets + 0.3·active tracks + 0.2·mean gain + 0.1·register span`, each normalized
 * to the piece's maximum, so values are in [0, 1].
 */
export function energyCurve(byTrack: Record<string, readonly NEvent[]>, bars: number): number[] {
  const learner = Object.entries(byTrack).filter(([t]) => !t.startsWith("band."));
  const onsets: number[] = [];
  const active: number[] = [];
  const gain: number[] = [];
  const span: number[] = [];
  for (let b = 0; b < bars; b++) {
    const perTrack = learner.map(([, ev]) => inBars(ev, b, b + 1));
    const all = perTrack.flat();
    onsets.push(all.length);
    active.push(perTrack.filter((ev) => ev.length > 0).length);
    gain.push(all.length === 0 ? 0 : mean(all.map((e) => e.gain)));
    const ms = pitched(all).map((e) => e.midi);
    span.push(ms.length === 0 ? 0 : Math.max(...ms) - Math.min(...ms));
  }
  const [o, a, g, s] = [norm(onsets), norm(active), norm(gain), norm(span)];
  return Array.from(
    { length: bars },
    (_, b) =>
      0.4 * (o[b] as number) + 0.3 * (a[b] as number) + 0.2 * (g[b] as number) + 0.1 * (s[b] as number),
  );
}

/** |mean energy of A − mean energy of B| for two bar spans `[from, to)`. */
export function sectionContrast(
  curve: readonly number[],
  a: readonly [number, number],
  b: readonly [number, number],
): number {
  const m = (span: readonly [number, number]): number => mean(curve.slice(span[0], span[1]));
  return Math.abs(m(a) - m(b));
}

export interface SpanStats {
  /** Mean MIDI of the melody (skyline) notes; NaN without pitch. */
  meanPitch: number;
  /** Onsets per bar. */
  density: number;
  low: number | null;
  high: number | null;
}
export function spanStats(
  events: readonly NEvent[],
  melody: readonly NEvent[],
  span: readonly [number, number],
): SpanStats {
  const ev = inBars(events, span[0], span[1]);
  const mel = pitched(inBars(melody, span[0], span[1]));
  const ms = pitched(ev).map((e) => e.midi);
  const bars = Math.max(1, span[1] - span[0]);
  return {
    meanPitch: mel.length === 0 ? Number.NaN : mean(mel.map((e) => e.midi)),
    density: ev.length / bars,
    low: ms.length === 0 ? null : Math.min(...ms),
    high: ms.length === 0 ? null : Math.max(...ms),
  };
}

/** Gap in semitones between the highest note of `low` and the lowest of `high`, and how much of the time they overlap. */
export function registerSeparation(
  low: readonly NEvent[],
  high: readonly NEvent[],
): { gap: number; overlapRatio: number } {
  const lo = pitched(low);
  const hi = pitched(high);
  if (lo.length === 0 || hi.length === 0) return { gap: 0, overlapRatio: 0 };
  const gap = Math.min(...hi.map((e) => e.midi)) - Math.max(...lo.map((e) => e.midi));
  let overlap = 0;
  for (const h of hi) if (sounding(lo, h.onset).some((l) => l.midi >= h.midi)) overlap++;
  return { gap, overlapRatio: overlap / hi.length };
}

export const durationSec = (bars: number, cps: number): number => (cps > 0 ? bars / cps : 0);

function cosine(a: readonly number[], b: readonly number[]): number {
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    ab += (a[i] as number) * (b[i] as number);
    aa += (a[i] as number) ** 2;
    bb += (b[i] as number) ** 2;
  }
  if (aa === 0 && bb === 0) return 1;
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb);
}

/**
 * Form letters from the music when the code has no sections: per bar a 12-pc duration histogram,
 * 16-step onset occupancy, active-track mask and mean register; phrases (default 4 bars) get an
 * existing letter when cosine ≥ `thresh` (0.85), else the next letter.
 */
export function formLabels(
  byTrack: Record<string, readonly NEvent[]>,
  bars: number,
  phraseBars = 4,
  thresh = 0.85,
): string {
  const tracks = Object.keys(byTrack).filter((t) => !t.startsWith("band."));
  const barVec = (b: number): number[] => {
    const all = tracks.flatMap((t) => inBars(byTrack[t] ?? [], b, b + 1));
    const pcs = Array.from({ length: 12 }, () => 0);
    for (const e of pitched(all)) pcs[mod12(e.midi)] = (pcs[mod12(e.midi)] as number) + num(e.dur);
    const occ = Array.from({ length: 16 }, () => 0);
    for (const e of all) occ[Math.min(15, Math.floor(R.toNum(R.frac(e.onset)) * 16))] = 1;
    const mask = tracks.map((t) => (inBars(byTrack[t] ?? [], b, b + 1).length > 0 ? 1 : 0));
    const ms = pitched(all).map((e) => e.midi);
    return [...pcs, ...occ, ...mask, ms.length ? mean(ms) / 127 : 0];
  };
  const phrases: number[][] = [];
  for (let b = 0; b < bars; b += phraseBars) {
    const vs = Array.from({ length: Math.min(phraseBars, bars - b) }, (_, i) => barVec(b + i));
    phrases.push((vs[0] as number[]).map((_, j) => mean(vs.map((v) => v[j] as number))));
  }
  const labels: string[] = [];
  const protos: number[][] = [];
  for (const p of phrases) {
    let found = -1;
    let best = thresh;
    protos.forEach((q, i) => {
      const c = cosine(p, q);
      if (c >= best) {
        best = c;
        found = i;
      }
    });
    if (found < 0) {
      protos.push(p);
      found = protos.length - 1;
    }
    labels.push(String.fromCharCode(65 + found));
  }
  return labels.join("");
}

/** Letters by first appearance: ["verse","chorus","verse"] → "ABA". */
export function lettersOf(names: readonly string[]): string {
  const seen: string[] = [];
  return names
    .map((n) => {
      if (!seen.includes(n)) seen.push(n);
      return String.fromCharCode(65 + seen.indexOf(n));
    })
    .join("");
}

/**
 * Whether section names match a form pattern: section names separated by spaces
 * ("verse chorus verse chorus"), or letters by first appearance ("ABAB"); `?` matches any section and
 * a tagged section ("chorus2") matches its type.
 */
export function formMatches(pattern: string, sections: readonly { label: string; tag: string }[]): boolean {
  const p = pattern.trim();
  const names = sections.map((s) => s.label);
  if (/\s/.test(p) || /^[a-z]/.test(p)) {
    const want = p.split(/\s+/);
    if (want.length !== names.length) return false;
    return want.every(
      (w, i) =>
        w === "?" || w.toLowerCase() === names[i] || w.toLowerCase() === (sections[i] as { tag: string }).tag,
    );
  }
  if (p.length !== names.length) return false;
  const letters = lettersOf(names);
  // `?` positions are free; the remaining letters must name the same sections consistently.
  const map = new Map<string, string>();
  const used = new Map<string, string>();
  for (let i = 0; i < p.length; i++) {
    const w = p[i] as string;
    if (w === "?") continue;
    const got = names[i] as string;
    if (map.has(w) && map.get(w) !== got) return false;
    if (used.has(got) && used.get(got) !== w) return false;
    map.set(w, got);
    used.set(got, w);
  }
  return letters.length === p.length;
}

export const spanOf = (from: number, to: number): [Rat, Rat] => [
  [from, 1],
  [to, 1],
];
