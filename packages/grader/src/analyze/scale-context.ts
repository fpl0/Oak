// The key/scale context of each track of an analysed piece (Wave 3 seam, docs/design/wave3.md §3.3): which
// key every stretch of every track is read in, so views (roll, staff, keyboard, drills) can label a played
// note with its degree and syllable. Reads `NEvent.scaleCtx` (`hap.context.scale`), which a patterned
// `.scale("<C4:major D4:major>")` sets per event (verified headless: bar 1 "C4 major", bar 2 "D4 major").
// Pure; no realm.
import type { KeySpec, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { keyFromScaleCtx, labelPitch, type PitchLabel, parseStrudelInterval } from "@oak/theory";
import type { AstNode } from "../lint/ast.ts";
import { chainOf, numericValue, parseProgram, programInfo, stringLit } from "../lint/ast.ts";
import type { Normalized } from "../types.ts";
import { pitched, sortEvents } from "./events.ts";
import { keyOf as keyOfEvents } from "./key.ts";

export interface KeySpan {
  /** Onset of the first event of the span, in cycles. */
  from: Rat;
  /** Onset of the first event after the span (or the end of the last event), in cycles. */
  to: Rat;
  key: KeySpec;
  /** The `.scale()` context the span was read from ("D4 major"), `null` for a declared or estimated key. */
  scaleCtx: string | null;
  source: "declared" | "scale" | "estimate";
}

export interface TrackKeyContext {
  track: string;
  band: boolean;
  /** In time order, consecutive events with the same key merged. Empty for a track without pitch. */
  spans: KeySpan[];
}

export interface KeyContextOptions {
  /** The exercise or lesson key. */
  declared?: KeySpec | null;
  /**
   * `"declared"` (default, contracts §6.8 item 1, what grading uses): the declared key wins, then the event's
   * `scaleCtx`, then an estimate. `"code"` (Studio, free play, the lenses): the code's own `.scale()` wins,
   * then the declared key, then an estimate.
   */
  prefer?: "declared" | "code";
  /**
   * Tracks whose `scaleCtx` must not be trusted: a `.transpose()` after `.scale()` (contracts §6.8 item 3,
   * lint `code.transpose-after-scale`). They are read through the declared key or the estimate.
   */
  ignoreScaleCtx?: readonly string[];
}

const sameKey = (a: KeySpec, b: KeySpec): boolean => a.tonic === b.tonic && a.mode === b.mode;

/** Every track's key spans (learner tracks in source order, then Band tracks). */
export function trackKeyContexts(n: Normalized, opts: KeyContextOptions = {}): TrackKeyContext[] {
  const prefer = opts.prefer ?? "declared";
  const declared = opts.declared ?? null;
  const ignore = new Set(opts.ignoreScaleCtx ?? []);
  // One whole-piece estimate for tracks with neither a declared key nor a scale (note names, chords).
  // A track whose scale context is not trusted is estimated from its notes alone.
  const estimate = keyOfEvents(n.all, null);
  const ignoredEstimate = new Map<string, KeySpec | null>();
  const estimateFor = (track: string, events: readonly NEvent[]): KeySpec | null => {
    if (!ignore.has(track)) return estimate;
    if (!ignoredEstimate.has(track)) {
      const plain = events.map(({ scaleCtx: _s, ...e }) => e as NEvent);
      ignoredEstimate.set(track, keyOfEvents(plain, null));
    }
    return ignoredEstimate.get(track) ?? null;
  };
  const groups = new Map<string, { band: boolean; events: NEvent[] }>();
  for (const [track, events] of Object.entries(n.byTrack))
    groups.set(track, { band: track.startsWith("band."), events });
  for (const e of n.band) {
    const g = groups.get(e.track) ?? { band: true, events: [] };
    if (!groups.has(e.track)) groups.set(e.track, g);
    if (!g.events.includes(e)) g.events.push(e);
  }
  const out: TrackKeyContext[] = [];
  for (const [track, g] of groups) {
    const events = sortEvents(pitched(g.events));
    const spans: KeySpan[] = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as NEvent;
      const fromScale = !ignore.has(track) && e.scaleCtx ? keyFromScaleCtx(e.scaleCtx) : null;
      let key: KeySpec | null;
      let source: KeySpan["source"];
      if (prefer === "declared" && declared) [key, source] = [declared, "declared"];
      else if (fromScale) [key, source] = [fromScale, "scale"];
      else if (declared) [key, source] = [declared, "declared"];
      else [key, source] = [estimateFor(track, events), "estimate"];
      if (!key) continue;
      const end = R.add(e.onset, e.dur);
      const last = spans[spans.length - 1];
      if (last && sameKey(last.key, key) && last.source === source) {
        if (R.lt(last.to, end)) last.to = end;
        continue;
      }
      if (last && R.lt(e.onset, last.to)) last.to = e.onset;
      spans.push({
        from: e.onset,
        to: end,
        key,
        scaleCtx: source === "scale" ? (e.scaleCtx ?? null) : null,
        source,
      });
    }
    out.push({ track, band: g.band, spans });
  }
  return out.sort((a, b) => Number(a.band) - Number(b.band));
}

/** The key a track is in at `onset`: the span containing it, else the last span before it, else the first. */
export function keyAt(contexts: readonly TrackKeyContext[], track: string, onset: Rat): KeySpec | null {
  const ctx = contexts.find((c) => c.track === track);
  if (!ctx || ctx.spans.length === 0) return null;
  let found: KeySpan | null = null;
  for (const s of ctx.spans) {
    if (R.lte(s.from, onset)) found = s;
    if (R.lte(s.from, onset) && R.lt(onset, s.to)) return s.key;
  }
  return (found ?? (ctx.spans[0] as KeySpan)).key;
}

/**
 * The labelled tracks whose `.scale()` context cannot be trusted: a `.transpose()` after `.scale()` in the
 * same chain (directly, or on a const that carries the `.scale()`), except by whole octaves (`12`, `"8P"`).
 * Contracts §6.8 item 3; the lint reports the same chains as `code.transpose-after-scale`. Feed it to
 * `trackKeyContexts({ ignoreScaleCtx })`.
 */
export function transposeAfterScaleTracks(code: string): string[] {
  const parsed = parseProgram(code);
  if (!parsed.ok) return [];
  const info = programInfo(parsed.ast);
  const consts = new Map(info.consts.map((c) => [c.name, c.init]));
  const octaveOnly = (arg: AstNode | undefined): boolean => {
    if (!arg) return false;
    const v = numericValue(arg);
    if (v !== null) return v % 12 === 0;
    const s = stringLit(arg);
    const ivl = s ? parseStrudelInterval(s.value) : null;
    return ivl !== null && ivl.semitones % 12 === 0;
  };
  const names = (expr: AstNode | null, depth = 0): { name: string; arg?: AstNode }[] => {
    if (!expr || depth > 4) return [];
    const ch = chainOf(expr);
    const base =
      ch.base?.type === "Identifier" ? names(consts.get(ch.base.name as string) ?? null, depth + 1) : [];
    return [...base, ...ch.links.map((l) => ({ name: l.name, ...(l.args[0] ? { arg: l.args[0] } : {}) }))];
  };
  const out: string[] = [];
  for (const l of info.labels) {
    const chain = names(l.expr);
    const scaleAt = chain.findIndex((x) => x.name === "scale");
    if (scaleAt < 0) continue;
    if (chain.some((x, i) => i > scaleAt && x.name === "transpose" && !octaveOnly(x.arg))) out.push(l.label);
  }
  return out;
}

/** One pitched event with the label a view shows for it: its degree, syllable and spelling in its key. */
export interface EventLabel {
  id: string;
  track: string;
  /** 1-based bar. */
  bar: number;
  key: KeySpec;
  label: PitchLabel;
}

/**
 * Labels every pitched event of a piece in the key its track is in at that moment (Wave 3 lenses, the
 * staff's degree lyrics, the roll's degree labels): a patterned `.scale("<C4:major G4:major>")` labels bar
 * 2 in G, so G4 there is "1", not "5". `prefer: "code"` by default (views read the code's own key).
 */
export function eventLabels(n: Normalized, opts: KeyContextOptions & { code?: string } = {}): EventLabel[] {
  const ignore = [...(opts.ignoreScaleCtx ?? []), ...(opts.code ? transposeAfterScaleTracks(opts.code) : [])];
  const contexts = trackKeyContexts(n, { prefer: "code", ...opts, ignoreScaleCtx: ignore });
  const out: EventLabel[] = [];
  for (const e of sortEvents(pitched([...n.all, ...n.band.filter((b) => !n.all.includes(b))]))) {
    const key = keyAt(contexts, e.track, e.onset);
    if (!key || e.midi === null) continue;
    out.push({
      id: e.id,
      track: e.track,
      bar: R.floor(e.onset) + 1,
      key,
      label: labelPitch(Math.round(e.midi), key),
    });
  }
  return out;
}
