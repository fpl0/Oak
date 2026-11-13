// A ladder stimulus as code for the hidden pattern player (contracts §6.12 "pattern source"). The browser never
// receives the hidden reference code (Wave 1 decision, wave4.md §3.5): `TranscriptionDetail.stimulus` carries the
// reference's normalized events. Transcribe rebuilds a playable pattern from them, exact on the grid: one
// mini-notation line per (track, sound) with `~` rests and `_` holds over the item's bars, slowed to span them.
// The code exists only inside the hidden player; it never enters an editor or the DOM.
import type { NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";

/** Label prefix of the reference's tracks inside a combined pattern (A/B mutes them by this prefix). */
export const REF_PREFIX = "ref_";

/** Slots per line above which the line falls back to weighted steps (`@`), still exact to a float. */
const MAX_GRID_SLOTS = 768;

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/** A track name as a Strudel label: letters, digits and single underscores, never ending in `_` (muted). */
export function refLabel(track: string, n: number): string {
  const safe = track.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "t";
  return `${REF_PREFIX}${safe}${n > 0 ? `_${n}` : ""}`;
}

interface Group {
  track: string;
  s: string | null;
  bank: string | null;
  sampleN: number | null;
  gain: number;
  pitched: boolean;
  events: NEvent[];
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

function groupsOf(events: readonly NEvent[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of events) {
    const pitched = e.midi !== null;
    const gain = round3(e.gain);
    const key = [e.track, e.s ?? "", e.bank ?? "", e.sampleN ?? "", gain, pitched ? "p" : "d"].join("|");
    let g = map.get(key);
    if (!g) {
      g = {
        track: e.track,
        s: e.s ?? null,
        bank: e.bank ?? null,
        sampleN: e.sampleN ?? null,
        gain,
        pitched,
        events: [],
      };
      map.set(key, g);
    }
    g.events.push(e);
  }
  return [...map.values()];
}

/** One time point of a line: the atoms that start there and how long they sound (cycles from the start). */
interface Step {
  at: Rat;
  end: Rat;
  atoms: string[];
}

function stepsOf(g: Group, bars: number): Step[] {
  const total: Rat = [bars, 1];
  const sorted = [...g.events]
    .filter((e) => R.lt(e.onset, total) && R.cmp(e.onset, [0, 1]) >= 0)
    .sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0));
  const steps: Step[] = [];
  for (const e of sorted) {
    const atom = g.pitched ? String(e.midi) : (e.s ?? "bd");
    const end = R.min(R.add(e.onset, e.clipDur ?? e.dur), total);
    const last = steps.at(-1);
    if (last && R.eq(last.at, e.onset)) {
      if (!last.atoms.includes(atom)) last.atoms.push(atom);
      last.end = R.max(last.end, end);
    } else steps.push({ at: e.onset, end, atoms: [atom] });
  }
  // A note never runs into the next onset of its own line (it would be cut there anyway).
  for (let i = 0; i < steps.length - 1; i++) {
    const s = steps[i] as Step;
    const next = steps[i + 1] as Step;
    if (R.lt(next.at, s.end)) s.end = next.at;
  }
  return steps;
}

const atomText = (atoms: readonly string[]) =>
  atoms.length === 1 ? (atoms[0] as string) : `[${atoms.join(",")}]`;

/** The mini-notation of one line over `bars` cycles (the caller slows it by `bars`). */
export function lineMini(steps: readonly Step[], bars: number): string {
  if (steps.length === 0) return "~";
  // Exact grid: slots of 1/L cycle, L the lcm of every denominator.
  let L = 1;
  for (const s of steps) L = lcm(lcm(L, s.at[1]), s.end[1]);
  const slots = bars * L;
  if (slots <= MAX_GRID_SLOTS) {
    const out: string[] = [];
    let pos = 0;
    for (const s of steps) {
      const start = Math.round(R.toNum(s.at) * L);
      const end = Math.max(start + 1, Math.round(R.toNum(s.end) * L));
      for (; pos < start; pos++) out.push("~");
      out.push(atomText(s.atoms));
      for (pos = start + 1; pos < end; pos++) out.push("_");
    }
    for (; pos < slots; pos++) out.push("~");
    return out.join(" ");
  }
  // Weighted steps: `x@w` with w in cycles (sum = bars).
  const out: string[] = [];
  let pos: Rat = [0, 1];
  const w = (a: Rat, b: Rat) => String(Math.round(R.toNum(R.sub(b, a)) * 1e6) / 1e6);
  for (const s of steps) {
    if (R.lt(pos, s.at)) out.push(`~@${w(pos, s.at)}`);
    out.push(`${atomText(s.atoms)}@${w(s.at, s.end)}`);
    pos = s.end;
  }
  if (R.lt(pos, [bars, 1])) out.push(`~@${w(pos, [bars, 1])}`);
  return out.join(" ");
}

export interface StimulusCode {
  /** Hidden code: one labelled line per (track, sound). No tempo line: the pattern player sets the cps. */
  code: string;
  /** The labels it defines (all start with `REF_PREFIX`). */
  tracks: string[];
}

/** The reference's events as a pattern spanning `bars` cycles, looping. */
export function stimulusCode(events: readonly NEvent[], bars: number): StimulusCode {
  const n = Math.max(1, Math.round(bars));
  const lines: string[] = [];
  const tracks: string[] = [];
  const perTrack = new Map<string, number>();
  for (const g of groupsOf(events)) {
    const steps = stepsOf(g, n);
    if (steps.length === 0) continue;
    const k = perTrack.get(g.track) ?? 0;
    perTrack.set(g.track, k + 1);
    const label = refLabel(g.track, k);
    tracks.push(label);
    const mini = lineMini(steps, n);
    let line = g.pitched ? `${label}: note("${mini}").s("${g.s ?? "piano"}")` : `${label}: s("${mini}")`;
    if (g.bank) line += `.bank("${g.bank}")`;
    if (g.sampleN !== null) line += `.n(${g.sampleN})`;
    line += `.gain(${g.gain})`;
    if (n > 1) line += `.slow(${n})`;
    lines.push(line);
  }
  return { code: lines.join("\n"), tracks };
}

/**
 * The reference and the learner's code in one pattern, so both run on one scheduler: A/B is then a mute switch
 * on the playing pattern (no re-evaluation, no restart, the position kept), and "both" plays them together.
 */
export function combinedCode(ref: StimulusCode, learner: string): string {
  return `${ref.code}\n\n${learner}`;
}
