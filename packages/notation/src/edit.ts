// Reverse helpers for the staff-input layer (ux §4.5): pointer y → diatonic step → pitch, pointer x → a
// snapped position on the NotationModel's beat grid, and edit operations on the answer's events that
// regenerate the Score and its ABC. Pure: the app owns the DOM and measures the rendered staff.
import type { KeySpec, MeterSpec, NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import type { SpelledPitch } from "@oak/theory";
import { toAbc } from "./abc.ts";
import { buildScore } from "./build.ts";
import { type BarGeometry, barFraction } from "./geometry.ts";
import { parseNoteList, toNoteList, withIds } from "./notelist.ts";
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
  bars: readonly BarGeometry[],
  meter: MeterSpec,
  grid: Rat = [1, 16],
): Rat | null {
  const bar =
    bars.find((b) => x >= b.x0 && x < b.x1) ??
    (x >= (bars[bars.length - 1]?.x1 ?? 0) ? bars[bars.length - 1] : undefined);
  if (!bar) return null;
  const W = rat(meter.num, meter.den);
  const steps = R.toNum(R.div(W, grid));
  const frac = barFraction(bar, x);
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
  | { op: "resize"; eventId: string; dur: Rat }
  /** Move a note to another onset (and optionally another pitch), keeping its length; replaces what it lands on. */
  | { op: "move"; eventId: string; onset: Rat; pitch?: string }
  /** Set the written accidental of a note's letter: −1 flat, 0 natural, 1 sharp (the letter and octave stay). */
  | { op: "accidental"; eventId: string; alt: -2 | -1 | 0 | 1 | 2 }
  /**
   * Stack a note on a note or chord (staff-expect `chords`): the new pitch sounds with the target, same onset, length
   * and track. A pitch already in the chord changes nothing; a pitch on a staff step the chord already uses (F♯ on
   * an F) replaces that member, so a chord never holds two notes on one step. Remove a member with `delete`.
   */
  | { op: "stack"; eventId: string; pitch: string };

/**
 * Cuts `[from, to)` out of the notes of `track` that `within` accepts (default: all of them). On a grand
 * staff an edit only cuts notes on its own staff, so a right-hand note never shortens a left-hand one.
 */
function cutSpan(
  events: NEvent[],
  from: Rat,
  to: Rat,
  track: string,
  within: (e: NEvent) => boolean = () => true,
): NEvent[] {
  const out: Omit<NEvent, "id">[] = [];
  for (const e of events) {
    const e1 = R.add(e.onset, e.dur);
    if (e.track !== track || !within(e) || R.lte(e1, from) || R.lte(to, e.onset)) {
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
  // A one-track grand staff is split by register (`splitMidi`): an edit only displaces notes on its own staff.
  const split = input.splitMidi ?? 60;
  const grand = input.staff === "grand";
  const sideOf = (midi: number | null): boolean | null => (midi === null ? null : midi >= split);
  const onSide = (midi: number | null) => (e: NEvent) => {
    if (!grand) return true;
    const a = sideOf(midi);
    const b = sideOf(e.midi);
    return a === null || b === null || a === b;
  };
  switch (edit.op) {
    case "insert": {
      const track = edit.track ?? events[0]?.track ?? "main";
      const end = R.add(edit.onset, edit.dur);
      const made = pitchEvent(edit.pitch);
      if (!edit.keep) events = cutSpan(events, edit.onset, end, track, onSide(made.midi));
      const ev: Omit<NEvent, "id"> = {
        track,
        onset: edit.onset,
        dur: edit.dur,
        gain: 0.8,
        locs: [],
        ...made,
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
    case "move": {
      const target = events.find((e) => e.id === edit.eventId);
      if (!target) return input;
      const pitch: Partial<ReturnType<typeof pitchEvent>> = edit.pitch ? pitchEvent(edit.pitch) : {};
      const others = cutSpan(
        events.filter((e) => e.id !== edit.eventId),
        edit.onset,
        R.add(edit.onset, target.dur),
        target.track,
        onSide(pitch.midi !== undefined ? pitch.midi : target.midi),
      );
      const { id: _id, ...rest } = target;
      const moved = { ...rest, onset: edit.onset, ...pitch };
      return { ...input, events: sortEv([...strip(others), moved]) };
    }
    case "accidental": {
      const target = events.find((e) => e.id === edit.eventId);
      const p = target?.written ? parseNoteName(target.written) : null;
      if (!target || !p) return input;
      const acc = edit.alt > 0 ? "#".repeat(edit.alt) : "b".repeat(-edit.alt);
      return applyEdit(input, { op: "repitch", eventId: edit.eventId, pitch: `${p.letter}${acc}${p.oct}` });
    }
    case "stack": {
      const target = events.find((e) => e.id === edit.eventId);
      const p = parseNoteName(edit.pitch);
      if (!target || !p || target.midi === null) return input;
      const chord = events.filter(
        (e) =>
          e.track === target.track &&
          R.eq(e.onset, target.onset) &&
          R.eq(e.dur, target.dur) &&
          e.midi !== null,
      );
      if (chord.some((e) => e.midi === p.midi)) return input;
      const step = (e: NEvent) => {
        const q = e.written ? parseNoteName(e.written) : null;
        return q ? `${q.letter}${q.oct}` : null;
      };
      const same = chord.find((e) => step(e) === `${p.letter}${p.oct}`);
      if (same) return applyEdit(input, { op: "repitch", eventId: same.id, pitch: edit.pitch });
      const { id: _id, ...rest } = target;
      const ev: Omit<NEvent, "id"> = { ...rest, ...pitchEvent(edit.pitch) };
      return { ...input, events: sortEv([...strip(events), ev]) };
    }
    case "resize": {
      const target = events.find((e) => e.id === edit.eventId);
      if (!target) return input;
      // A grand-staff note only displaces notes on its own staff (a shorter right-hand note never cuts the
      // left hand's note under it).
      const others = cutSpan(
        events.filter((e) => e.id !== edit.eventId),
        target.onset,
        R.add(target.onset, edit.dur),
        target.track,
        onSide(target.midi),
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

/** What `editNoteList` needs to engrave a staff-input answer. */
export interface NoteListContext {
  meter: MeterSpec;
  key: KeySpec | null;
  /** Bars the answer has (`staff-input` `bars`). */
  bars: number;
  /** Default "treble". A grand-staff answer is one voice split by register. */
  staff?: "treble" | "bass" | "grand";
  track?: string;
  /**
   * May a note be tied: over a bar line, or as two tied values (a 5/16 note)? Default false: a note that
   * would cross the bar line is shortened to it, and a length no single value writes is refused.
   */
  ties?: boolean;
  /** May a length be written as a dotted value (a dotted quarter)? Default false: such a length is refused. */
  dots?: boolean;
}

/** The engraving input of a staff-input answer (the note-list DSL, `AnswerValueMap["staff-input"]`). */
export function noteListInput(list: string, ctx: NoteListContext): NotationInput {
  const events =
    list.trim() === "" ? [] : parseNoteList(list, { meter: ctx.meter, track: ctx.track ?? "main" });
  return { events, meter: ctx.meter, key: ctx.key, bars: ctx.bars, staff: ctx.staff ?? "treble" };
}

/** Why an edit left the answer as it was. */
export type EditRefusal =
  /** No note with that event id. */
  | "not-found"
  /** The onset is outside the answer's bars, or the length is not positive. */
  | "outside"
  /** The length needs a dotted value and `dots` is off. */
  | "needs-dot"
  /** The length needs tied values and `ties` is off. */
  | "needs-tie";

export interface NoteListEditResult {
  /** The new answer value (unchanged when the edit was refused). */
  list: string;
  input: NotationInput;
  score: Score;
  abc: AbcResult;
  /** False when the edit was refused (or changed nothing). */
  changed: boolean;
  refused?: EditRefusal;
  /** The note was shortened to end at its bar line (`ties` off). */
  clipped?: boolean;
}

const VALUES = [1, 2, 4, 8, 16, 32] as const;
/** Whole-note lengths of the plain (and, with `dots`, dotted) values, longest first. */
function valueTable(dots: boolean): { len: Rat; text: string }[] {
  const out: { len: Rat; text: string }[] = [];
  for (const v of VALUES) {
    if (dots && v < 32) out.push({ len: R.mul(rat(1, v), [3, 2]), text: `${v}.` });
    out.push({ len: rat(1, v), text: `${v}` });
  }
  return out.sort((a, b) => R.cmp(b.len, a.len));
}
/** One value that writes `len` whole notes exactly, or null. */
function singleValue(len: Rat, dots: boolean): string | null {
  return valueTable(dots).find((v) => R.eq(v.len, len))?.text ?? null;
}
/** `len` whole notes as values, longest first (`aligned`: each starts on a multiple of its plain length). */
function decompose(pos: Rat, len: Rat, dots: boolean, aligned: boolean): string[] | null {
  const out: string[] = [];
  let p = pos;
  let rest = len;
  // Rests (aligned) are written in plain values only.
  const table = valueTable(dots && !aligned);
  while (R.lt([0, 1], rest)) {
    const v = table.find((t) => {
      if (R.lt(rest, t.len)) return false;
      if (!aligned) return true;
      const unit = t.text.endsWith(".") ? R.mul(t.len, [2, 3]) : t.len;
      return R.div(p, unit)[1] === 1;
    });
    if (!v || out.length > 16) return null;
    out.push(v.text);
    p = R.add(p, v.len);
    rest = R.sub(rest, v.len);
  }
  return out;
}

function nameOf(e: NEvent): string {
  if (e.midi === null) return e.s ?? "r";
  if (e.written) return e.written;
  return spell(e.midi, { key: null }).name;
}

/**
 * The events of a one-voice answer as the note-list DSL, every bar full: rests fill the gaps (each rest on a
 * multiple of its own length), a note is one value where one exists (dotted only with `dots`), else tied
 * values. `null` when the events are not one voice of notes and chords, or a length is not a binary value
 * (a tuplet): the caller then prints the engraving (`toNoteList`).
 */
export function plainNoteList(
  events: readonly NEvent[],
  ctx: Pick<NoteListContext, "meter" | "bars" | "dots">,
): string | null {
  const W = rat(ctx.meter.num, ctx.meter.den);
  const dots = ctx.dots ?? false;
  const slots: { onset: Rat; end: Rat; names: string[] }[] = [];
  const sorted = [...events].sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0));
  for (const e of sorted) {
    const end = R.add(e.onset, e.dur);
    const last = slots[slots.length - 1];
    if (last && R.eq(last.onset, e.onset) && R.eq(last.end, end)) {
      last.names.push(nameOf(e));
      continue;
    }
    if (last && R.lt(e.onset, last.end)) return null;
    slots.push({ onset: e.onset, end, names: [nameOf(e)] });
  }
  const bars: string[] = [];
  let si = 0;
  let carry: { end: Rat; what: string } | null = null;
  for (let b = 0; b < ctx.bars; b++) {
    const toks: string[] = [];
    let cur: Rat = [b, 1];
    const barEnd: Rat = [b + 1, 1];
    const write = (what: string, from: Rat, to: Rat, tieOut: boolean, aligned: boolean): boolean => {
      const vals = decompose(R.mul(R.sub(from, [b, 1]), W), R.mul(R.sub(to, from), W), dots, aligned);
      if (!vals) return false;
      vals.forEach((v, i) => {
        const tie = what !== "r" && (i < vals.length - 1 || tieOut) ? "~" : "";
        toks.push(`${what}:${v}${tie}`);
      });
      return true;
    };
    if (carry) {
      const stop = R.min(carry.end, barEnd);
      if (!write(carry.what, cur, stop, R.lt(barEnd, carry.end), false)) return null;
      cur = stop;
      carry = R.lt(barEnd, carry.end) ? carry : null;
    }
    while (!carry && si < slots.length && R.lt((slots[si] as (typeof slots)[number]).onset, barEnd)) {
      const s = slots[si] as (typeof slots)[number];
      si++;
      if (R.lt(s.onset, cur)) return null;
      if (R.lt(cur, s.onset) && !write("r", cur, s.onset, false, true)) return null;
      const what = s.names.length > 1 ? `[${s.names.join(",")}]` : (s.names[0] as string);
      const stop = R.min(s.end, barEnd);
      if (!write(what, s.onset, stop, R.lt(barEnd, s.end), false)) return null;
      cur = stop;
      if (R.lt(barEnd, s.end)) carry = { end: s.end, what };
    }
    if (R.lt(cur, barEnd) && !write("r", cur, barEnd, false, true)) return null;
    bars.push(toks.join(" "));
  }
  return bars.join(" | ");
}

/**
 * Any binary-valued events as the one-voice note-list DSL, by slicing: every onset and end cuts a slice, a
 * slice writes the notes sounding through it as one chord, and a note that goes on into the next slice is
 * tied (`~`) there (`parseNoteList` joins tied notes per pitch). This writes what `plainNoteList` cannot:
 * overlapping notes of different lengths, such as a left-hand half note under right-hand quarters on a grand
 * staff. `null` when a note would be joined to a new note of the same pitch starting where it stops (the DSL
 * cannot tell them apart), or a length is not a binary value.
 */
export function slicedNoteList(
  events: readonly NEvent[],
  ctx: Pick<NoteListContext, "meter" | "bars">,
): string | null {
  const W = rat(ctx.meter.num, ctx.meter.den);
  const end: Rat = [ctx.bars, 1];
  const evs = events.filter((e) => R.lt(e.onset, end) && R.lt([0, 1], R.add(e.onset, e.dur)));
  const cuts = new Map<string, Rat>();
  const cut = (t: Rat): void => {
    if (R.lt(t, [0, 1]) || R.lt(end, t)) return;
    cuts.set(`${t[0]}/${t[1]}`, t);
  };
  for (let b = 0; b <= ctx.bars; b++) cut([b, 1]);
  for (const e of evs) {
    cut(e.onset);
    cut(R.add(e.onset, e.dur));
  }
  const times = [...cuts.values()].sort(R.cmp);
  const bars: string[][] = Array.from({ length: ctx.bars }, () => []);
  for (let i = 0; i + 1 < times.length; i++) {
    const from = times[i] as Rat;
    const to = times[i + 1] as Rat;
    const bar = R.floor(from);
    const toks = bars[bar] as string[];
    const sounding = evs
      .filter((e) => !R.lt(from, e.onset) && R.lt(from, R.add(e.onset, e.dur)))
      .sort((x, y) => (x.midi ?? 0) - (y.midi ?? 0));
    const pos = R.mul(R.sub(from, [bar, 1]), W);
    const len = R.mul(R.sub(to, from), W);
    if (sounding.length === 0) {
      const vals = decompose(pos, len, false, true);
      if (!vals) return null;
      for (const v of vals) toks.push(`r:${v}`);
      continue;
    }
    const goesOn = sounding.some((e) => R.lt(to, R.add(e.onset, e.dur)));
    if (goesOn) {
      // A note that stops here would be tied too: refuse when the same pitch starts again right here.
      const stopping = sounding.filter((e) => R.eq(R.add(e.onset, e.dur), to));
      const starting = evs.filter((e) => R.eq(e.onset, to));
      if (stopping.some((s) => starting.some((n) => nameOf(n) === nameOf(s) || n.midi === s.midi)))
        return null;
    }
    const names = [...new Set(sounding.map(nameOf))];
    const what = names.length > 1 ? `[${names.join(",")}]` : (names[0] as string);
    const vals = decompose(pos, len, false, false);
    if (!vals) return null;
    vals.forEach((v, k) => {
      toks.push(`${what}:${v}${k < vals.length - 1 || goesOn ? "~" : ""}`);
    });
  }
  return bars.map((t) => t.join(" ")).join(" | ");
}

/** The span an edit writes (onset, length in cycles), or null for edits that keep every length. */
function spanOf(edit: StaffEdit, events: readonly NEvent[]): { onset: Rat; dur: Rat } | "not-found" | null {
  switch (edit.op) {
    case "insert":
    case "rest":
      return { onset: edit.onset, dur: edit.dur };
    case "move": {
      const t = events.find((e) => e.id === edit.eventId);
      return t ? { onset: edit.onset, dur: t.dur } : "not-found";
    }
    case "resize": {
      const t = events.find((e) => e.id === edit.eventId);
      return t ? { onset: t.onset, dur: edit.dur } : "not-found";
    }
    default:
      return events.some((e) => e.id === edit.eventId) ? null : "not-found";
  }
}
function withSpan(edit: StaffEdit, dur: Rat): StaffEdit {
  if (edit.op === "insert" || edit.op === "rest" || edit.op === "resize") return { ...edit, dur };
  return edit;
}

/**
 * The staff-input edit model on the answer value itself: note list in, one edit, note list out (with the
 * rebuilt Score and ABC for the render). Event IDs are the canonical ones of `parseNoteList` (contracts
 * §5.7): resolve a clicked `oak-e{n}` through `abc.idMap[n].eventIds`. Every bar stays full (rests fill
 * it); with `ties` off a note never crosses a bar line (it is shortened to it: `clipped`) and a length no
 * single value writes is refused, as is a dotted length with `dots` off (`refused`, list unchanged). A
 * `move` keeps the note's length (and may shorten it at the bar line). Pure.
 */
export function editNoteList(
  list: string,
  edit: StaffEdit,
  ctx: NoteListContext,
  opts?: AbcOptions,
): NoteListEditResult {
  const before = noteListInput(list, ctx);
  const build = (value: string, changed: boolean, extra: Partial<NoteListEditResult> = {}) => {
    const input = noteListInput(value, ctx);
    const score = buildScore(input);
    return { list: value, input, score, abc: toAbc(score, opts), changed, ...extra };
  };
  const refuse = (why: EditRefusal) => {
    const score = buildScore(before);
    return { list, input: before, score, abc: toAbc(score, opts), changed: false, refused: why };
  };
  const ties = ctx.ties ?? false;
  const dots = ctx.dots ?? false;
  const W = rat(ctx.meter.num, ctx.meter.den);
  let e = edit;
  let clipped = false;
  const span = spanOf(edit, before.events);
  if (span === "not-found") return refuse("not-found");
  if (span) {
    const end0 = R.add(span.onset, span.dur);
    if (R.lt(span.onset, [0, 1]) || !R.lt(span.onset, [ctx.bars, 1]) || !R.lt([0, 1], span.dur))
      return refuse("outside");
    const barEnd: Rat = ties ? [ctx.bars, 1] : [R.floor(span.onset) + 1, 1];
    let dur = span.dur;
    if (R.lt(barEnd, end0)) {
      dur = R.sub(barEnd, span.onset);
      clipped = true;
    }
    // With ties off the length must be one value (a rest may be several).
    if (edit.op !== "rest" && !ties && !singleValue(R.mul(dur, W), dots))
      return refuse(singleValue(R.mul(dur, W), true) ? "needs-dot" : "needs-tie");
    if (clipped && edit.op === "move") {
      // A moved note keeps its length up to the bar line: shorten it in place (its id does not depend on
      // its length), then move it.
      const shortened = applyEdit(before, { op: "resize", eventId: edit.eventId, dur });
      const next = applyEdit(shortened, edit);
      const value = noteListOf(next, { ...ctx, dots });
      return build(value, value !== list, { clipped });
    }
    e = withSpan(edit, dur);
  }
  const next = applyEdit(before, e);
  const value = noteListOf(next, { ...ctx, dots });
  return build(value, value !== list, clipped ? { clipped } : {});
}

/**
 * The answer value of an edited input: plain values where they fit, else slices with ties (so a grand-staff
 * answer keeps both hands), else the engraving of its first staff.
 */
function noteListOf(input: NotationInput, ctx: NoteListContext & { dots: boolean }): string {
  return (
    plainNoteList(input.events, ctx) ?? slicedNoteList(input.events, ctx) ?? toNoteList(buildScore(input))
  );
}
