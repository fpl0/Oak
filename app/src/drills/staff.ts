// Staff-input drill trials (melodic dictation levels 7–9, rhythm dictation levels 5–7): the trial is a code
// trial for the engine (`params.mode: "code"`, graded on the answer track's onsets and pitches by
// `gradeCodeTrial`), answered on the real staff widget of the answers registry. This module is the bridge, and is
// pure: the trial → the staff-input spec (clef, bars, key signature, palette), the staff value (the note-list DSL,
// `"F#4:4 r:4 A4:2"`) → the code string the engine reads (`note("<[f#4@2 ~@2] […]>")`), and the trial's own
// answer track → a staff value for the reveal ("Show me", or a miss).
import type { Answer, KeySpec, MeterSpec, NEvent, Trial } from "@oak/api";
import { parseNoteList } from "@oak/notation";
import { labelPitch, METERS } from "@oak/theory";
import { normalizeStaffValue } from "../answers/staff/model.ts";
import type { AnswerSpecOf } from "../answers/types.ts";

export type StaffInputSpec = AnswerSpecOf<"staff-input">;

/** The values a dictated line is written with (generators write no ties; dots only in dotted rhythm levels). */
const PALETTE = ["1", "2", "2.", "4", "4.", "8", "8.", "16"] as const;
/** The pitch a rhythm-only answer is written on: the treble staff's middle line. */
const RHYTHM_PITCH = "B4";

export const isStaffTrial = (trial: Trial<unknown>): boolean => trial.params.ui === "staff-input";

/** The trial's meter (the generators write 4/4 unless they name another). */
export function meterOf(trial: Trial<unknown>): MeterSpec {
  const id = trial.params.meter;
  const all = METERS as Readonly<Record<string, MeterSpec>>;
  return typeof id === "string" && all[id] ? (all[id] as MeterSpec) : METERS["4/4"];
}

function keyOf(trial: Trial<unknown>): KeySpec | null {
  const ak = trial.params.answerKey as { key?: KeySpec } | undefined;
  const k = ak?.key ?? (trial.params.key as KeySpec | undefined);
  return k && typeof k.tonic === "string" ? k : null;
}

const answerTrack = (trial: Trial<unknown>): string | null =>
  typeof trial.params.answerTrack === "string" ? trial.params.answerTrack : null;
const fromBar = (trial: Trial<unknown>): number =>
  typeof trial.params.answerFromBar === "number" ? trial.params.answerFromBar : 0;
export const barsOf = (trial: Trial<unknown>): number =>
  Math.max(1, typeof trial.params.answerBars === "number" ? trial.params.answerBars : 1);

/** The events the answer is compared with: the answer track from its first answer bar, re-timed to bar 0. */
export function answerEvents(trial: Trial<unknown>): NEvent[] {
  const track = answerTrack(trial);
  const from = fromBar(trial);
  return trial.events
    .filter((e) => (track === null || e.track === track) && e.onset[0] / e.onset[1] >= from - 1e-9)
    .map((e) => ({ ...e, onset: [e.onset[0] - from * e.onset[1], e.onset[1]] as [number, number] }));
}

/** Whether the answer asks for pitches (melody) or onsets only (a drum rhythm). */
export const pitchedTrial = (trial: Trial<unknown>): boolean =>
  answerEvents(trial).some((e) => e.midi !== null);

/** The staff a trial is answered on. */
export function staffSpecOf(trial: Trial<unknown>): StaffInputSpec {
  const pitched = pitchedTrial(trial);
  const key = pitched ? keyOf(trial) : null;
  const midis = answerEvents(trial)
    .map((e) => e.midi)
    .filter((m): m is number => m !== null);
  const median = midis.length > 0 ? [...midis].sort((a, b) => a - b)[Math.floor(midis.length / 2)] : 67;
  return {
    ui: "staff-input",
    clef: pitched && (median as number) < 57 ? "bass" : "treble",
    bars: barsOf(trial),
    palette: { durations: [...PALETTE], accidentals: pitched, ties: false, rests: true },
    ...(key ? { key } : {}),
  };
}

// --- value → code --------------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/** A rational in lowest terms. */
function reduce([n, d]: readonly [number, number]): [number, number] {
  const g = gcd(Math.abs(n), Math.abs(d)) || 1;
  return [n / g, d / g];
}

/**
 * The staff value as code the engine's mini reader grades (`parseMiniCode`): one `note("…")` with a bar per
 * cycle (`<[bar 1] [bar 2]>`), each bar on its own grid with `@` weights and `~` for silence. `null` while the
 * value cannot be read (the widget then shows why).
 */
export function staffToCode(value: string, bars: number, meter: MeterSpec = METERS["4/4"]): string | null {
  let events: NEvent[];
  try {
    events = parseNoteList(normalizeStaffValue(value), { meter });
  } catch {
    return null;
  }
  const out: string[] = [];
  for (let b = 0; b < bars; b++) {
    // Onsets and ends inside this bar, in bars (cycles), each note cut at the bar line (the widget never ties).
    const inBar = events
      .filter((e) => e.midi !== null && Math.floor(e.onset[0] / e.onset[1] + 1e-9) === b)
      .map((e) => {
        const on = reduce([e.onset[0] - b * e.onset[1], e.onset[1]]);
        const end = Math.min(1, on[0] / on[1] + e.dur[0] / e.dur[1]);
        return { on, end, name: (e.written ?? "").toLowerCase(), midi: e.midi as number };
      });
    // Chords: notes sharing an onset play together.
    const groups = new Map<string, typeof inBar>();
    for (const n of inBar) {
      const k = `${n.on[0]}/${n.on[1]}`;
      groups.set(k, [...(groups.get(k) ?? []), n]);
    }
    const slots = [...groups.values()]
      .map((g) => ({
        on: g[0]?.on as [number, number],
        end: Math.max(...g.map((n) => n.end)),
        names: g.map((n) => n.name || String(n.midi)),
      }))
      .sort((a, c) => a.on[0] / a.on[1] - c.on[0] / c.on[1]);
    if (slots.length === 0) {
      out.push("~");
      continue;
    }
    // The grid: the common denominator of every onset and end in the bar.
    let den = 1;
    const rats: [number, number][] = [];
    for (const s of slots) {
      rats.push(s.on);
      rats.push(reduce(toRat(s.end)));
    }
    for (const r of rats) den = lcm(den, r[1]);
    const at = (r: readonly [number, number]): number => Math.round((r[0] * den) / r[1]);
    const parts: string[] = [];
    let cursor = 0;
    slots.forEach((s, i) => {
      const start = at(s.on);
      const next = slots[i + 1];
      const stop = Math.min(at(reduce(toRat(s.end))), next ? at(next.on) : den);
      if (start > cursor) parts.push(weighted("~", start - cursor));
      const atom = s.names.length > 1 ? `[${s.names.join(",")}]` : (s.names[0] as string);
      parts.push(weighted(atom, Math.max(1, stop - start)));
      cursor = Math.max(start + 1, stop);
    });
    if (cursor < den) parts.push(weighted("~", den - cursor));
    out.push(`[${parts.join(" ")}]`);
  }
  return bars === 1 ? `note("${out[0]}")` : `note("<${out.join(" ")}>")`;
}

function toRat(x: number): [number, number] {
  // Note lengths are binary or dotted values of a bar: 1/64 is always exact.
  return [Math.round(x * 3 * 64), 3 * 64];
}
const weighted = (atom: string, w: number): string => (w === 1 ? atom : `${atom}@${w}`);

/** The grader answer of a staff value: the code string, or null while it is unreadable. */
export function staffAnswer(trial: Trial<unknown>, value: string): Answer | null {
  if (value.trim() === "") return null;
  const code = staffToCode(value, barsOf(trial), meterOf(trial));
  return code === null ? null : { text: [code] };
}

// --- trial → staff value (the reveal) --------------------------------------------------------------

/** Whole-note values (as the note list writes them) for a length in bars of a meter. */
const VALUE_OF: readonly [number, string][] = [
  [1, "1"],
  [3 / 4, "2."],
  [1 / 2, "2"],
  [3 / 8, "4."],
  [1 / 4, "4"],
  [3 / 16, "8."],
  [1 / 8, "8"],
  [1 / 16, "16"],
];

/** The tokens for a length (in whole notes), greedily: one value, or rests that add up. */
function valuesFor(whole: number): string[] {
  const out: string[] = [];
  let left = whole;
  for (const [v, t] of VALUE_OF) {
    while (left >= v - 1e-9) {
      out.push(t);
      left -= v;
    }
  }
  return out;
}

/** The trial's answer written as a staff value, spelled in its key ("D4:4 F#4:4 A4:2"), for the reveal. */
export function expectedStaffValue(trial: Trial<unknown>): string | null {
  const events = answerEvents(trial);
  if (events.length === 0) return null;
  const meter = meterOf(trial);
  const barWhole = meter.num / meter.den;
  const key = keyOf(trial);
  const bars = barsOf(trial);
  const onsets = [...new Set(events.map((e) => e.onset[0] / e.onset[1]))].sort((a, b) => a - b);
  const tokens: string[] = [];
  let t = 0;
  onsets.forEach((on, i) => {
    if (on >= bars - 1e-9) return;
    const barEnd = Math.floor(on + 1e-9) + 1;
    if (on > t + 1e-9) for (const v of valuesFor((on - t) * barWhole)) tokens.push(`r:${v}`);
    const here = events.filter((e) => Math.abs(e.onset[0] / e.onset[1] - on) < 1e-9);
    const own = Math.max(...here.map((e) => e.dur[0] / e.dur[1]));
    const next = onsets[i + 1] ?? bars;
    const end = Math.min(on + own, next, barEnd);
    const names = here.map((e) =>
      e.midi === null ? RHYTHM_PITCH : key ? labelPitch(e.midi, key).name : midiName(e.midi),
    );
    const what = names.length > 1 ? `[${[...new Set(names)].join(",")}]` : (names[0] as string);
    const values = valuesFor((end - on) * barWhole);
    // A length one value cannot write sounds as its first value, the rest is silence.
    tokens.push(`${what}:${values[0] ?? "16"}`);
    for (const v of values.slice(1)) tokens.push(`r:${v}`);
    t = end;
  });
  return tokens.join(" ");
}

function midiName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
