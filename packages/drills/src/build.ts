// From track descriptions to a piece: the Strudel code a trial shows (STYLE dialect: tempo line, one
// labelled line per part) and the normalized events it plays. The events are computed from the same
// pattern model the code is printed from.
import {
  type CodeRange,
  type DrumRole,
  type KeySpec,
  type MeterId,
  type NEvent,
  R,
  type Rat,
  rat,
} from "@oak/content-kit";
import { bpmToCps, tempoLine } from "@oak/theory";
import { noteMidi, scaleArg, scaleContext, stepToMidi } from "./kernel.ts";
import { type Node, print, query, valueAt } from "./pat.ts";

export interface TrackSpec {
  /** A label of STYLE §2: drums kick snare hats perc bass chords pad keys mel vox. */
  label: string;
  /** `note("…")`, `n("…").scale(…)` or `s("…")`. */
  src: "note" | "n" | "s";
  pat: Node;
  /** For `n`: the scale. */
  key?: KeySpec;
  octave?: number;
  /** Instrument of a pitched track. */
  s?: string;
  /** Drum bank, full name. */
  bank?: string;
  /** `.gain(.55)`, or a per-step pattern `.gain("1 .5 1 .5")`. */
  gain?: number | Node;
  /** `.swingBy(amount, per)`. */
  swing?: { amount: Rat; per: number };
}
export interface Piece {
  code: string;
  events: NEvent[];
  cps: number;
  bpm: number;
  meter: MeterId;
  bars: number;
  preload: string[];
}

const DRUM_ROLES: Readonly<Record<string, DrumRole>> = {
  bd: "kick",
  sd: "snare",
  cp: "clap",
  rim: "rim",
  hh: "hatClosed",
  oh: "hatOpen",
  lt: "tom",
  mt: "tom",
  ht: "tom",
  cr: "crash",
  rd: "ride",
  sh: "shaker",
  cb: "perc",
  tb: "perc",
};
export const drumRoleOf = (s: string): DrumRole | null => DRUM_ROLES[s] ?? null;

/** `.55`, `1`, `.5`: numbers as STYLE writes them. */
export function fmtNum(x: number): string {
  const text = String(Math.round(x * 1000) / 1000);
  return text.startsWith("0.") ? text.slice(1) : text.startsWith("-0.") ? `-${text.slice(2)}` : text;
}
const fmtRat = (x: Rat): string => (x[1] === 1 ? `${x[0]}` : `${x[0]}/${x[1]}`);

/** Strudel's `swingBy(amount, per)` on onset events: `inside(per, late(seq(0, amount / 2)))`. */
function swing<T extends { onset: Rat; dur: Rat }>(events: readonly T[], amount: Rat, per: number): T[] {
  const out: T[] = [];
  const half = rat(1, 2);
  const shift = R.div(amount, rat(2));
  for (const e of events) {
    const scaled = R.mul(e.onset, rat(per));
    const p = R.sub(scaled, rat(R.floor(scaled)));
    // The first half of each slice plays unshifted; the second half plays the pattern shifted late.
    if (R.lt(p, half)) out.push(e);
    const shifted = R.add(p, shift);
    if (R.lte(half, shifted) && R.lt(shifted, rat(1)))
      out.push({ ...e, onset: R.add(e.onset, R.div(shift, rat(per))) });
  }
  return out;
}

function trackLine(track: TrackSpec): { line: string; patOffset: number; locs: Map<Node, [number, number]> } {
  const printed = print(track.pat);
  let line = `${track.label}: ${track.src}("`;
  const patOffset = line.length;
  line += `${printed.text}")`;
  if (track.src === "n") {
    if (!track.key || track.octave === undefined) throw new Error(`track ${track.label}: n() needs a scale`);
    line += `.scale("${scaleArg(track.key, track.octave)}")`;
  }
  if (track.swing) line += `.swingBy(${fmtRat(track.swing.amount)}, ${track.swing.per})`;
  if (track.src !== "s") {
    if (!track.s) throw new Error(`track ${track.label}: a pitched track needs a sound`);
    line += `.s("${track.s}")`;
  }
  if (track.bank) line += `.bank("${track.bank}")`;
  if (typeof track.gain === "number") line += `.gain(${fmtNum(track.gain)})`;
  else if (track.gain) line += `.gain("${print(track.gain).text}")`;
  return { line, patOffset, locs: printed.locs };
}

/** Builds the code and the events of `bars` bars. BPM counts the meter's tempo unit (contracts §6.9). */
export function buildPiece(spec: {
  bpm: number;
  meter?: MeterId;
  bars: number;
  tracks: readonly TrackSpec[];
}): Piece {
  const meter = spec.meter ?? "4/4";
  const lines = [tempoLine(spec.bpm, meter), ""];
  let offset = (lines[0] as string).length + 2;
  const events: (NEvent & { order: number })[] = [];
  const preload = new Set<string>();
  spec.tracks.forEach((track, order) => {
    const { line, patOffset, locs } = trackLine(track);
    lines.push(line);
    const raw = query(track.pat, spec.bars);
    const timed = track.swing ? swing(raw, track.swing.amount, track.swing.per) : raw;
    const seen = new Map<string, number>();
    for (const e of timed) {
      const loc = locs.get(e.node);
      const codeLocs: CodeRange[] = loc
        ? [{ from: offset + patOffset + loc[0], to: offset + patOffset + loc[1] }]
        : [];
      let midi: number | null = null;
      let s: string;
      const extra: Partial<NEvent> = {};
      if (track.src === "note") {
        midi = noteMidi(e.v);
        if (midi === null)
          throw new Error(`track ${track.label}: "${e.v}" is not a note name with an octave`);
        s = track.s as string;
        extra.written = e.v;
        preload.add(s);
      } else if (track.src === "n") {
        midi = stepToMidi(e.v, track.key as KeySpec, track.octave as number);
        s = track.s as string;
        extra.scaleCtx = scaleContext(track.key as KeySpec, track.octave as number);
        preload.add(s);
      } else {
        s = e.v;
        const role = drumRoleOf(s);
        if (role) extra.drum = role;
        if (track.bank) extra.bank = track.bank;
        preload.add(track.bank ? `${track.bank}_${s}` : s);
      }
      let gain = 0.8;
      if (typeof track.gain === "number") gain = track.gain;
      else if (track.gain) {
        const v = valueAt(track.gain, e.onset);
        if (v !== null) gain = Number(v);
      }
      const bar = R.floor(e.onset) + 1;
      const base = `${track.label}|${bar}|${e.onset[0]}/${e.onset[1]}|${midi ?? s}`;
      const k = seen.get(base) ?? 0;
      seen.set(base, k + 1);
      events.push({
        id: `${base}|${k}`,
        track: track.label,
        onset: e.onset,
        dur: e.dur,
        midi,
        pitchSource: track.src === "note" ? "note-str" : track.src === "n" ? "n-scale" : "none",
        s,
        gain,
        locs: codeLocs,
        ...extra,
        order,
      });
    }
    offset += line.length + 1;
  });
  events.sort((a, b) => R.cmp(a.onset, b.onset) || a.order - b.order || (a.midi ?? -1) - (b.midi ?? -1));
  return {
    code: lines.join("\n"),
    events: events.map(({ order: _order, ...e }) => e),
    cps: bpmToCps(spec.bpm, meter),
    bpm: spec.bpm,
    meter,
    bars: spec.bars,
    preload: [...preload].sort(),
  };
}
