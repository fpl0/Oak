// OakEvent → NEvent (contracts §5.7): exact rationals, pitch precedence and source, cents, drum roles,
// gain, written spelling, deterministic IDs; then grouping by track and role inference (§6.2, the
// matcher library's `normalizedFromEvents`).
import {
  barOf,
  type DrumRole,
  type Layer,
  type NEvent,
  type PitchSource,
  parseRat,
  R,
  type Rat,
} from "@oak/content-kit";
import { normalizedFromEvents } from "../analyze/tracks.ts";
import { core } from "../runtime/strudel.ts";
import type { EvalSuccess, NormalizeContext, Normalized, OakEvent } from "../types.ts";

/** Drum sound → role (exercises §3.1): the bank prefix (`RolandTR909_bd`) is stripped first. */
const DRUM_MAP: Readonly<Record<string, DrumRole>> = {
  bd: "kick",
  kick: "kick",
  sd: "snare",
  snare: "snare",
  cp: "clap",
  clap: "clap",
  rim: "rim",
  rm: "rim",
  hh: "hatClosed",
  ch: "hatClosed",
  oh: "hatOpen",
  lt: "tom",
  mt: "tom",
  ht: "tom",
  cr: "crash",
  crash: "crash",
  rd: "ride",
  ride: "ride",
  sh: "shaker",
  cb: "perc",
  tb: "perc",
  perc: "perc",
  misc: "perc",
  fx: "perc",
  brk: "perc",
};

export function drumRole(s: string, bank?: string): DrumRole | null {
  let name = s.trim();
  if (bank && name.startsWith(`${bank}_`)) name = name.slice(bank.length + 1);
  else if (/^[A-Za-z0-9]+_[a-z]+$/.test(name) && !name.startsWith("gm_"))
    name = name.slice(name.indexOf("_") + 1);
  name = name.split(":")[0] as string;
  return DRUM_MAP[name] ?? null;
}

function noteMidi(text: string): number | null {
  if (!core.isNote(text)) return null;
  try {
    return core.noteToMidi(text);
  } catch {
    return null;
  }
}

function pitchSourceOf(e: OakEvent): PitchSource {
  switch (e.pitchSource) {
    case "freq":
      return "freq";
    case "n-index":
      return "n-index";
    case "none":
      return "none";
    default: {
      if (e.midi === null) return e.pitchSource === "note-str" ? "note-str" : "none";
      if (e.chord !== null && e.scale === null) return "voicing";
      if (e.scale !== null) return "n-scale";
      if (e.pitchSource === "value") return typeof e.note === "number" ? "note-num" : "note-str";
      return e.pitchSource;
    }
  }
}

/** The note as the learner typed it: only when a `note("…")` atom produced exactly this pitch. */
function writtenOf(e: OakEvent, source: PitchSource): string | undefined {
  if (source !== "note-str" || e.midi === null) return undefined;
  const octaveShift = 12 * (e.octave ?? 0);
  for (const l of e.locations) {
    if (l.fn !== "note" || !l.text) continue;
    if (noteMidi(l.text) === e.midi - octaveShift) return l.text;
  }
  return undefined;
}

/** One raw event as an `NEvent`; the ID is assigned by `assignIds` once the whole set is known. */
export function toNEvent(e: OakEvent): NEvent {
  const onset: Rat = parseRat(e.begin);
  const end: Rat = parseRat(e.end);
  const dur = R.sub(end, onset);
  const source = pitchSourceOf(e);
  let midi: number | null = e.midi;
  let cents: number | undefined;
  if (midi !== null && !Number.isInteger(midi)) {
    const rounded = Math.round(midi);
    const c = Math.round((midi - rounded) * 100);
    midi = rounded;
    if (c !== 0) cents = c;
  }
  const drum = e.s !== null && e.midi === null ? drumRole(e.s, e.bank ?? undefined) : null;
  const written = writtenOf(e, source);
  const out: NEvent = {
    id: "",
    track: e.track,
    onset,
    dur,
    midi,
    pitchSource: source,
    gain: (e.gain ?? 0.8) * (e.velocity ?? 1) * (e.postgain ?? 1),
    locs: e.locations.map((l) => ({ from: l.start, to: l.end })),
  };
  if (e.clip !== null && e.clip > 0) out.clipDur = clipDur(dur, e.clip);
  if (cents !== undefined) out.cents = cents;
  if (written !== undefined) out.written = written;
  if (e.chord !== null) out.chordSymbol = e.chord;
  if (drum) out.drum = drum;
  if (e.s !== null) out.s = e.s;
  if (e.bank !== null) out.bank = e.bank;
  if (typeof e.n === "number" && e.scale === null && source !== "voicing" && Number.isInteger(e.n))
    out.sampleN = e.n;
  if (e.scale !== null) out.scaleCtx = e.scale;
  return out;
}

function clipDur(dur: Rat, clip: number): Rat {
  // clip is usually a short decimal (.5, .25, 1.5): exact with a 1000 denominator.
  const c: Rat = Number.isInteger(clip * 1000) ? [clip * 1000, 1000] : [Math.round(clip * 1000), 1000];
  const r = R.mul(dur, [c[0], c[1]]);
  return r;
}

/** `${track}|${bar}|${n}/${d}|${midi ?? s ?? chordSymbol}|${k}`: deterministic for the same code. */
export function assignIds(events: NEvent[], pickup: boolean): NEvent[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const what = e.midi ?? e.s ?? e.chordSymbol ?? "-";
    const base = `${e.track}|${barOf(e.onset, pickup)}|${e.onset[0]}/${e.onset[1]}|${what}`;
    const k = counts.get(base) ?? 0;
    counts.set(base, k + 1);
    e.id = `${base}|${k}`;
  }
  return events;
}

/** Raw events to `NEvent`s grouped by track, with the roles of contracts §6.2. */
export function normalize(result: EvalSuccess, ctx: NormalizeContext): Normalized {
  const events = assignIds(result.events.map(toNEvent), ctx.pickup !== undefined);
  const n = normalizedFromEvents(events, { cps: result.cps, bpm: result.bpm });
  // Every evaluated track is present, even a silent one, so a selector can tell "silent" from "absent".
  for (const t of result.tracks) n.byTrack[t] ??= [];
  return n;
}

/** Role resolution alone: fixed labels first, then the inference rules. */
export function inferRoles(
  byTrack: Record<string, NEvent[]>,
): Partial<Record<Exclude<Layer, "all">, string>> {
  return normalizedFromEvents(Object.values(byTrack).flat()).roles;
}
