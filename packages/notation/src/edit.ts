// Reverse helpers for the staff-input layer (ux §4.5): pointer y → diatonic step → pitch, pointer x → a
// snapped position on the NotationModel's beat grid, and edit operations on the answer's events that
// regenerate the Score and its ABC. Pure: the app owns the DOM and measures the rendered staff.
import type { KeySpec, MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { toAbc } from "./abc.ts";
import { buildScore } from "./build.ts";
import { withIds } from "./notelist.ts";
import { keySig, makePitch, parseNoteName, spell } from "./theory-port.ts";
import type { AbcOptions, AbcResult, NotationInput, Score } from "./types.ts";

const LETTERS = "CDEFGAB";
/** Diatonic index (C0 = 0) of the top staff line: treble F5, bass A3. */
const TOP_LINE: Record<"treble" | "bass", number> = { treble: 5 * 7 + 3, bass: 3 * 7 + 5 };

/** Half-spaces below the top staff line at pointer `y` (0 = top line, 1 = top space, 8 = bottom line). */
export function staffStepAtY(y: number, geom: { topLineY: number; lineSpacing: number }): number {
  return Math.round(((y - geom.topLineY) * 2) / geom.lineSpacing);
}
/** The pitch at a staff step, with the key signature's accidental applied. */
export function stepToPitch(step: number, clef: "treble" | "bass", key: KeySpec | null): SpelledPitch {
  const d = TOP_LINE[clef] - step;
  const letter = ((d % 7) + 7) % 7;
  const oct = Math.floor(d / 7);
  const name = LETTERS[letter] as string;
  const alt = keySig(key).sig[name] ?? 0;
  const natural = [0, 2, 4, 5, 7, 9, 11][letter] as number;
  return makePitch(letter, alt, (oct + 1) * 12 + natural + alt);
}
/** The staff step of a spelled pitch (the inverse of `stepToPitch`, accidentals ignored). */
export function pitchToStep(p: { letter: string; oct: number }, clef: "treble" | "bass"): number {
  return TOP_LINE[clef] - (p.oct * 7 + LETTERS.indexOf(p.letter));
}
/** ↑/↓: one diatonic step in the key; `Shift`: one semitone (sharp up, flat down); `Cmd`: one octave. */
export function nudgePitch(
  p: SpelledPitch,
  by: "step" | "semitone" | "octave",
  dir: 1 | -1,
  key: KeySpec | null,
): SpelledPitch {
  if (by === "octave") return makePitch(LETTERS.indexOf(p.letter), p.alt, p.midi + 12 * dir);
  if (by === "semitone") {
    const alt = p.alt + dir;
    if (Math.abs(alt) <= 1) return makePitch(LETTERS.indexOf(p.letter), alt, p.midi + dir);
    return spell(p.midi + dir, { key: null, direction: dir });
  }
  return stepToPitch(pitchToStep(p, "treble") - dir, "treble", key);
}

/**
 * Pointer x → a position on the beat grid. `bars` are the measured x ranges of the engraved bars
 * (cycle = 0-based bar); `grid` is the snap unit in whole notes (1/16 = a sixteenth).
 */
export function xToOnset(
  x: number,
  bars: readonly { x0: number; x1: number; cycle: number }[],
  meter: MeterSpec,
  grid: Rat = [1, 16],
): Rat | null {
  const bar =
    bars.find((b) => x >= b.x0 && x < b.x1) ??
    (x >= (bars[bars.length - 1]?.x1 ?? 0) ? bars[bars.length - 1] : undefined);
  if (!bar) return null;
  const W = rat(meter.num, meter.den);
  const steps = R.toNum(R.div(W, grid));
  const frac = Math.min(Math.max((x - bar.x0) / (bar.x1 - bar.x0), 0), 1);
  const k = Math.min(Math.round(frac * steps), steps - 1);
  return R.add([bar.cycle, 1], R.div(R.mul(rat(k), grid), W));
}
/** A written value (1 = whole … 32, dots) as a length in cycles. */
export function writtenToCycles(base: 1 | 2 | 4 | 8 | 16 | 32, dots: 0 | 1 | 2, meter: MeterSpec): Rat {
  return R.div(R.mul(rat(1, base), rat(2 ** (dots + 1) - 1, 2 ** dots)), rat(meter.num, meter.den));
}

export type StaffEdit =
  /** Write a note (or a drum hit); by default it replaces whatever overlaps it on the same track. */
  | { op: "insert"; onset: Rat; dur: Rat; pitch: string; track?: string; keep?: boolean }
  /** Silence a span (a rest). */
  | { op: "rest"; onset: Rat; dur: Rat; track?: string }
  | { op: "delete"; eventId: string }
  | { op: "repitch"; eventId: string; pitch: string }
  | { op: "resize"; eventId: string; dur: Rat };

function cutSpan(events: NEvent[], from: Rat, to: Rat, track: string): NEvent[] {
  const out: Omit<NEvent, "id">[] = [];
  for (const e of events) {
    const e1 = R.add(e.onset, e.dur);
    if (e.track !== track || R.lte(e1, from) || R.lte(to, e.onset)) {
      out.push(e);
      continue;
    }
    if (R.lt(e.onset, from)) out.push({ ...e, dur: R.sub(from, e.onset) });
    if (R.lt(to, e1)) out.push({ ...e, onset: to, dur: R.sub(e1, to) });
  }
  return withIds(out.map(({ ...e }) => e));
}
function pitchEvent(pitch: string): Pick<NEvent, "midi" | "pitchSource" | "written" | "s"> {
  const p = parseNoteName(pitch);
  if (!p) return { midi: null, pitchSource: "none", s: pitch };
  const acc = p.alt > 0 ? "#".repeat(p.alt) : "b".repeat(-p.alt);
  return { midi: p.midi, pitchSource: "note-str", written: `${p.letter}${acc}${p.oct}` };
}
const sortEv = (evs: Omit<NEvent, "id">[]) =>
  withIds([...evs].sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0)));

/** Applies one edit to the answer's events; ids are regenerated so they stay canonical. */
export function applyEdit(input: NotationInput, edit: StaffEdit): NotationInput {
  let events = input.events;
  const strip = (es: NEvent[]): Omit<NEvent, "id">[] => es.map(({ id: _id, ...rest }) => rest);
  switch (edit.op) {
    case "insert": {
      const track = edit.track ?? events[0]?.track ?? "main";
      const end = R.add(edit.onset, edit.dur);
      if (!edit.keep) events = cutSpan(events, edit.onset, end, track);
      const ev: Omit<NEvent, "id"> = {
        track,
        onset: edit.onset,
        dur: edit.dur,
        gain: 0.8,
        locs: [],
        ...pitchEvent(edit.pitch),
      };
      return { ...input, events: sortEv([...strip(events), ev]) };
    }
    case "rest": {
      const track = edit.track ?? events[0]?.track ?? "main";
      return {
        ...input,
        events: sortEv(strip(cutSpan(events, edit.onset, R.add(edit.onset, edit.dur), track))),
      };
    }
    case "delete":
      return { ...input, events: sortEv(strip(events.filter((e) => e.id !== edit.eventId))) };
    case "repitch":
      return {
        ...input,
        events: sortEv(
          strip(events).map((e, i) =>
            events[i]?.id === edit.eventId ? { ...e, ...pitchEvent(edit.pitch) } : e,
          ),
        ),
      };
    case "resize": {
      const target = events.find((e) => e.id === edit.eventId);
      if (!target) return input;
      const others = cutSpan(
        events.filter((e) => e.id !== edit.eventId),
        target.onset,
        R.add(target.onset, edit.dur),
        target.track,
      );
      const { id: _id, ...rest } = target;
      return { ...input, events: sortEv([...strip(others), { ...rest, dur: edit.dur }]) };
    }
  }
}

/** `applyEdit` then rebuild: the new input, Score and ABC in one step. */
export function editStaff(
  input: NotationInput,
  edit: StaffEdit,
  opts?: AbcOptions,
): { input: NotationInput; score: Score; abc: AbcResult } {
  const next = applyEdit(input, edit);
  const score = buildScore(next);
  return { input: next, score, abc: toAbc(score, opts) };
}
