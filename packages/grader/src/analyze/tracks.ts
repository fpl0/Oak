// Track selection and target resolution (contracts §5.4, §6.2). These are the matcher library's own
// implementations of `selectTrack`, `resolveTarget` and `periodOf`: they need nothing but a `Normalized`.
import type { KeySpec, Layer, NEvent, TargetSelector, TrackRef } from "@oak/content-kit";
import { LABEL_ROLES, R } from "@oak/content-kit";
import { degreeOf, keyFromScaleCtx, METERS } from "@oak/theory";
import type { NormalizeContext, Normalized } from "../types.ts";
import { median, pitched, simultaneities, sortEvents, toRat } from "./events.ts";

type RoleName = Exclude<Layer, "all">;
const ROLE_NAMES: readonly RoleName[] = ["drums", "bass", "chords", "melody"];

/** Tracks that play a role: every fixed label of that role (STYLE §2) plus the track `inferRoles` chose. */
export function tracksOfRole(n: Normalized, role: RoleName): string[] {
  const out: string[] = [];
  for (const track of Object.keys(n.byTrack)) {
    if (track.startsWith("band.")) continue;
    if ((LABEL_ROLES as Record<string, string | undefined>)[track] === role) out.push(track);
  }
  const inferred = n.roles[role];
  if (inferred && !inferred.startsWith("band.") && !out.includes(inferred) && n.byTrack[inferred])
    out.push(inferred);
  return out;
}

/** The role of a learner track: its fixed label's role, else the role `inferRoles` gave it. */
export function roleOfTrack(n: Normalized, track: string): RoleName | null {
  const fixed = (LABEL_ROLES as Record<string, RoleName | undefined>)[track];
  if (fixed) return fixed;
  for (const role of ROLE_NAMES) if (n.roles[role] === track) return role;
  return null;
}

/**
 * What a finding calls the line a note belongs to ("the bass has 5 (sol)", "the melody has …"): "bass" for a
 * track whose role is bass (or a `@bass` / `band.bass` ref), else "melody".
 */
export function lineWord(n: Normalized, track: string | undefined): "bass" | "melody" {
  if (!track) return "melody";
  if (track === "@bass" || track === "band.bass") return "bass";
  if (track.startsWith("@") || track.startsWith("band.")) return "melody";
  return roleOfTrack(n, track) === "bass" ? "bass" : "melody";
}

/** Events a `TrackRef` selects: a label, '*', '@role' or 'band.<label>'. Sorted by (onset, midi). */
export function selectTrack(n: Normalized, ref: TrackRef): NEvent[] {
  if (ref === "*") return sortEvents(n.all);
  if (ref.startsWith("@")) {
    const role = ref.slice(1) as RoleName;
    if (!ROLE_NAMES.includes(role)) return [];
    return sortEvents(tracksOfRole(n, role).flatMap((t) => n.byTrack[t] ?? []));
  }
  if (ref.startsWith("band.")) return sortEvents(n.byTrack[ref] ?? n.band.filter((e) => e.track === ref));
  return sortEvents(n.byTrack[ref] ?? []);
}
/** Union of several refs (default '*'), without duplicates. */
export function selectTracks(n: Normalized, refs: readonly TrackRef[] | undefined): NEvent[] {
  if (!refs || refs.length === 0) return selectTrack(n, "*");
  const seen = new Set<string>();
  const out: NEvent[] = [];
  for (const ref of refs)
    for (const e of selectTrack(n, ref))
      if (!seen.has(e.id)) {
        seen.add(e.id);
        out.push(e);
      }
  return sortEvents(out);
}

/**
 * The key a pitch is read in (contracts §6.8 item 1): the exercise or lesson key, then the event's own
 * `scaleCtx`. `null` when neither is known: the caller falls back to `keyEstimate`.
 */
export function keyOfEvent(e: Pick<NEvent, "scaleCtx">, ctx: Pick<NormalizeContext, "key">): KeySpec | null {
  if (ctx.key) return ctx.key;
  return e.scaleCtx ? keyFromScaleCtx(e.scaleCtx) : null;
}

/**
 * Resolves a predicate target: the events it selects. Their IDs and `locs` are the accepted click targets.
 * `bar` and `beat` are 1-based (with a pickup, bar 1 is cycle 1); `nth` picks one of the matches.
 */
export function resolveTarget(n: Normalized, selector: TargetSelector, ctx: NormalizeContext): NEvent[] {
  let events = selectTrack(n, selector.track ?? "*");
  if (selector.drum) events = events.filter((e) => e.drum === selector.drum);
  if (selector.bar !== undefined) {
    const cycle = ctx.pickup ? selector.bar : selector.bar - 1;
    events = events.filter((e) => R.floor(e.onset) === cycle);
  }
  if (selector.beat !== undefined) {
    const at = R.div(toRat(selector.beat - 1, 96), [METERS[ctx.meter].unitsPerBar, 1]);
    events = events.filter((e) => R.eq(R.frac(e.onset), at));
  }
  if (selector.degree !== undefined) {
    const want = selector.degree;
    events = events.filter((e) => {
      if (e.midi === null) return false;
      const key = keyOfEvent(e, ctx);
      return key !== null && degreeOf(e.midi, key).degree === want;
    });
  }
  if (selector.nth !== undefined) {
    const one = events[selector.nth - 1];
    return one ? [one] : [];
  }
  return events;
}

/** What makes two bars "the same" for `periodOf`: every event's track, place in the bar, length and sound. */
function barSignature(events: readonly NEvent[]): string {
  return events
    .map((e) => {
      const f = R.frac(e.onset);
      return `${e.track}|${f[0]}/${f[1]}|${e.dur[0]}/${e.dur[1]}|${e.midi ?? ""}|${e.s ?? ""}|${e.chordSymbol ?? ""}`;
    })
    .sort()
    .join(";");
}
/**
 * Smallest number of bars after which the events repeat, up to `maxBars`. `bars` is the length of the
 * queried window (default: through the last event). A window too short to show a repeat is its own period.
 */
export function periodOf(events: readonly NEvent[], maxBars: number, bars?: number): number {
  const window = Math.max(1, bars ?? events.reduce((m, e) => Math.max(m, R.floor(e.onset) + 1), 1));
  const sigs: string[] = [];
  for (let c = 0; c < window; c++) sigs.push("");
  const perBar: NEvent[][] = sigs.map(() => []);
  for (const e of events) {
    const c = R.floor(e.onset);
    if (c >= 0 && c < window) (perBar[c] as NEvent[]).push(e);
  }
  for (let c = 0; c < window; c++) sigs[c] = barSignature(perBar[c] as NEvent[]);
  const cap = Math.min(maxBars, window);
  for (let p = 1; p <= cap; p++) {
    if (p * 2 > window) break;
    let same = true;
    for (let c = 0; c + p < window && same; c++) same = sigs[c] === sigs[c + p];
    if (same) return p;
  }
  return cap;
}

/** Share of a track's onsets that carry two or more pitches. */
export function polyphonyRatio(events: readonly NEvent[]): number {
  const sims = simultaneities(events);
  return sims.length === 0 ? 0 : sims.filter((s) => s.midis.length > 1).length / sims.length;
}
export function medianPitch(events: readonly NEvent[]): number {
  return median(pitched(events).map((e) => e.midi));
}

/**
 * Builds a `Normalized` from events the caller already has (a staff answer, a drill trial, a test
 * fixture). Roles come from fixed labels, then from the rules of contracts §6.2: all-drum tracks are
 * drums; a track is chords when ≥ 25% of its onsets are polyphonic; the lowest monophonic track is bass
 * when its median is below C3; the highest is melody.
 */
export function normalizedFromEvents(
  events: readonly NEvent[],
  tempo: { cps?: number; bpm?: number } = {},
): Normalized {
  const byTrack: Record<string, NEvent[]> = {};
  for (const e of sortEvents(events)) {
    const list = byTrack[e.track] ?? [];
    list.push(e);
    byTrack[e.track] = list;
  }
  const learner = Object.keys(byTrack).filter((t) => !t.startsWith("band."));
  const roles: Normalized["roles"] = {};
  const free: string[] = [];
  for (const t of learner) {
    const fixed = (LABEL_ROLES as Record<string, RoleName | undefined>)[t];
    if (fixed) roles[fixed] ??= t;
    else free.push(t);
  }
  const mono: string[] = [];
  for (const t of free) {
    const ev = byTrack[t] as NEvent[];
    if (ev.length > 0 && ev.every((e) => e.drum !== undefined)) roles.drums ??= t;
    else if (pitched(ev).length === 0) continue;
    else if (polyphonyRatio(ev) >= 0.25) roles.chords ??= t;
    else mono.push(t);
  }
  if (mono.length > 0) {
    const byPitch = mono.map((t) => ({ t, m: medianPitch(byTrack[t] as NEvent[]) }));
    const lowest = byPitch.reduce((lo, x) => (x.m < lo.m ? x : lo));
    if (lowest.m < 48 && !roles.bass) roles.bass = lowest.t;
    const rest = byPitch.filter((x) => x.t !== roles.bass);
    if (rest.length > 0 && !roles.melody) roles.melody = rest.reduce((hi, x) => (x.m > hi.m ? x : hi)).t;
  }
  const cps = tempo.cps ?? 0.5;
  return {
    byTrack,
    all: sortEvents(learner.flatMap((t) => byTrack[t] as NEvent[])),
    band: sortEvents(
      Object.keys(byTrack)
        .filter((t) => t.startsWith("band."))
        .flatMap((t) => byTrack[t] as NEvent[]),
    ),
    cps,
    bpm: tempo.bpm ?? cps * 240,
    roles,
  };
}

/** A copy of `n` restricted to the events of cycles [from, to). Roles are kept. */
export function sliceNormalized(n: Normalized, from: number, to: number): Normalized {
  const keep = (events: readonly NEvent[]): NEvent[] =>
    events.filter((e) => {
      const c = R.floor(e.onset);
      return c >= from && c < to;
    });
  const byTrack: Record<string, NEvent[]> = {};
  for (const [t, ev] of Object.entries(n.byTrack)) byTrack[t] = keep(ev);
  return { ...n, byTrack, all: keep(n.all), band: keep(n.band) };
}
