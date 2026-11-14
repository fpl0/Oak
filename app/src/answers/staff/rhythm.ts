// Ties, dotted values and triplets in the staff input (docs/design/wave6.md §3.4; U13.L03, L05, `fam.rhy.dictation`
// levels 5–7). The answer value stays the note-list DSL: `C4:4. D4:8` (a dot), `G4:4~ | G4:4` (a tie, also over the
// bar line: the tied notes are ONE event, as the grader reads them) and `C4:8t D4:8t E4:8t` (a triplet: three
// values in the time of two, rests fill a group). Dots and ties are written by `@oak/notation`'s edit model; a
// triplet length is not a binary value there, so this module edits the events itself and writes the list back
// with each group as three triplet values (`8t`). Pure: tested with `bun test`.
import type { NEvent, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import {
  type NoteListContext,
  notate,
  parseNoteList,
  plainNoteList,
  type Score,
  toNoteList,
  withIds,
  writtenToCycles,
} from "@oak/notation";
import {
  describePlace,
  durationName,
  nearestLetter,
  normalizeStaffValue,
  noteAtOnset,
  paletteDurations,
  parseDuration,
  pitchAt,
  type StaffCursor,
  type StaffEditOutcome,
  type StaffKeyContext,
  type StaffKeyInput,
  type StaffKeyResult,
  type StaffSpec,
  staffEditOutcome,
  totalCycles,
} from "./model.ts";

/** A triplet value as the note list writes it: `"8t"` is one of three eighths in the time of two. */
export interface TripletToken {
  token: string;
  base: 4 | 8 | 16;
}
/** `"8t"` → an eighth-note triplet value; `null` for a plain or dotted token. */
export function parseTriplet(token: string): TripletToken | null {
  const m = /^(4|8|16)t$/.exec(token.trim());
  return m ? { token: token.trim(), base: Number(m[1]) as TripletToken["base"] } : null;
}

/** What the rhythm tools of one staff-input answer offer, read from its palette (content-kit `staff-input`). */
export interface RhythmPalette {
  /** `palette.ties`: a note may be tied to the next note of the same pitch, also across the bar line. */
  ties: boolean;
  /** A dotted duration token is offered (`4.`): the `.` key and the dot button work. */
  dots: boolean;
  /** The triplet values offered (`8t`, `4t`), longest first; empty: no triplets in this answer. */
  triplets: TripletToken[];
}
export function rhythmPalette(spec: StaffSpec): RhythmPalette {
  const triplets = spec.palette.durations
    .map(parseTriplet)
    .filter((t): t is TripletToken => t !== null)
    .sort((a, b) => a.base - b.base);
  return {
    ties: spec.palette.ties === true,
    dots: spec.palette.durations.some((d) => /^\d+\.+$/.test(d.trim())),
    triplets,
  };
}
/** The notation edit context of an answer with its rhythm tools on (`NoteListContext.ties` / `dots`). */
export function rhythmContext(ctx: NoteListContext, palette: RhythmPalette): NoteListContext {
  return { ...ctx, ties: palette.ties, dots: palette.dots };
}

/**
 * The keys (the kit owner lists them in the shortcut sheet; all three are free in `staffKey`): `t` ties the note
 * just placed (else the one under the cursor) to the next note of the same pitch, or holds it on by the cursor's
 * length when nothing follows (again: unties); `.` dots the next note (built since Wave 3); `;` switches the
 * cursor's length between a plain value and its triplet value (three notes then fill one bracket). Pointer: each
 * tool is also a toggle button in the palette row, in this order.
 */
export const RHYTHM_KEYS = { tie: "t", dot: ".", triplet: ";" } as const;
export type RhythmToolId = keyof typeof RHYTHM_KEYS;
export const RHYTHM_TOOL_LABELS: Readonly<Record<RhythmToolId, string>> = {
  tie: "Tie",
  dot: "Dot",
  triplet: "Triplet",
};

/** The rhythm edits beyond `@oak/notation` `StaffEdit` (which already inserts, resizes and rests). */
export type RhythmEdit =
  /**
   * Tie the note to the next note of the same pitch (`C4:4~ C4:8`). When the next position is a rest or the bar
   * line, `fill` (a written value such as `"8"`) first writes that note there. `on: false` removes the tie and keeps
   * both notes.
   */
  | { op: "tie"; eventId: string; on: boolean; fill?: string }
  /** Dot or undot the note (a dotted quarter takes its extra eighth from what follows it). */
  | { op: "dot"; eventId: string; dots: 0 | 1 }
  /**
   * Write a triplet group starting at `onset`: three values of `base` in the time of two, each a pitch or a rest
   * (`null`). A group is always complete: the bracket never holds fewer than three values.
   */
  | { op: "triplet"; onset: Rat; base: 4 | 8 | 16; pitches: [string | null, string | null, string | null] }
  /** Turn the triplet group at `onset` back into two plain values (its first two pitches). */
  | { op: "untriplet"; onset: Rat }
  /**
   * Write one value of a triplet at `onset` (a pitch, or `null` for a rest). Inside a group of the same `base` only
   * that value changes; elsewhere a new group starts on the beat that holds `onset` with all three values on that
   * pitch (a bracket is complete from its first key; a rest there changes nothing).
   */
  | { op: "triplet-note"; onset: Rat; base: 4 | 8 | 16; pitch: string | null };

/** What a rhythm edit did, or why it left the answer as it was. */
export type RhythmEditOutcome =
  | StaffEditOutcome
  | {
      list: string;
      refused: "not-built" | "not-offered" | "no-next-note" | "crosses-bar" | "no-tie";
      clipped: false;
    };

// --- triplet groups ---------------------------------------------------------------------------------

/** One engraved triplet bracket: where it starts, how long it is (cycles), and its value. */
export interface TripletGroup {
  onset: Rat;
  span: Rat;
  /** The value three of which fill the group: 8 = eighth-note triplets (one quarter long). */
  base: 4 | 8 | 16;
}

const ZERO: Rat = [0, 1];
const whole = (meter: NoteListContext["meter"]): Rat => rat(meter.num, meter.den);

/** The length in cycles of a triplet group of `base` (two plain values). */
export function tripletSpan(base: 4 | 8 | 16, meter: NoteListContext["meter"]): Rat {
  return R.div(rat(2, base), whole(meter));
}
/** The length in cycles of one triplet value. */
export function tripletLen(base: 4 | 8 | 16, meter: NoteListContext["meter"]): Rat {
  return R.div(tripletSpan(base, meter), rat(3));
}

const isMultiple = (x: Rat, unit: Rat): boolean => R.isInt(R.div(x, unit));

/**
 * The triplet groups of an answer, read from its notes (never from the engraving, which may bracket a lone triplet
 * value with the rests around it): wherever a note starts or ends off the plain grid, the coarsest group (quarter,
 * eighth, then sixteenth triplets) that starts on a multiple of its own length and holds every note boundary inside
 * it on its three values. Notes that fit no such group belong to none.
 */
export function tripletGroupsOf(
  events: readonly Pick<NEvent, "onset" | "dur">[],
  meter: NoteListContext["meter"],
): TripletGroup[] {
  const W = whole(meter);
  const out: TripletGroup[] = [];
  const ternary = (t: Rat) => R.mul(R.frac(t), W)[1] % 3 === 0;
  const find = (t: Rat): TripletGroup | null => {
    for (const base of [4, 8, 16] as const) {
      const span = tripletSpan(base, meter);
      const len = tripletLen(base, meter);
      const start = groupStart(t, base, meter);
      const stop = R.add(start, span);
      if (R.lt(rat(R.floor(start) + 1), stop)) continue;
      const fits = events.every((e) => {
        const end = R.add(e.onset, e.dur);
        if (R.lte(end, start) || R.lte(stop, e.onset)) return true;
        const a = R.max(e.onset, start);
        const z = R.min(end, stop);
        return isMultiple(R.sub(a, start), len) && isMultiple(R.sub(z, start), len);
      });
      if (fits) return { onset: start, span, base };
    }
    return null;
  };
  for (const e of events) {
    const end = R.add(e.onset, e.dur);
    // An end on a bar line or a beat is plain; a ternary end lies inside the group that closes after it.
    for (const t of [e.onset, R.sub(end, [1, 1024])]) {
      const at = R.eq(t, e.onset) ? e.onset : end;
      if (!ternary(at)) continue;
      if (groupAt(out, t)) continue;
      const g = find(t);
      if (g && !out.some((x) => R.eq(x.onset, g.onset))) out.push(g);
    }
  }
  return out.sort((x, y) => R.cmp(x.onset, y.onset));
}

/** The group a position is in (`onset ≤ t < onset + span`), or null. */
export function groupAt(groups: readonly TripletGroup[], t: Rat): TripletGroup | null {
  return groups.find((g) => !R.lt(t, g.onset) && R.lt(t, R.add(g.onset, g.span))) ?? null;
}

/** The start of the beat-aligned group of `base` that holds `t` (groups start on multiples of their length). */
export function groupStart(t: Rat, base: 4 | 8 | 16, meter: NoteListContext["meter"]): Rat {
  const span = tripletSpan(base, meter);
  const bar = R.floor(t);
  const k = R.floor(R.div(R.sub(t, rat(bar)), span));
  return R.add(rat(bar), R.mul(span, rat(k)));
}

/** The triplet value `t` falls on inside its group: 0, 1 or 2 (the one that sounds there). */
function slotOf(t: Rat, start: Rat, len: Rat): number {
  return Math.max(0, Math.min(2, R.floor(R.div(R.sub(t, start), len))));
}

/**
 * The note list with triplet groups spelled as triplet values: `(3:2 C4:8 r:8 E4:8)` → `C4:8t r:8t E4:8t`
 * (a held note inside a bracket keeps its own value: `(3:2 C4:4 E4:8)` → `C4:4t E4:8t`). Other tuplets stay.
 */
export function tripletTokens(list: string): string {
  const out: string[] = [];
  let inside = false;
  for (const tok of list.split(/\s+/).filter((x) => x !== "")) {
    if (tok === "(3:2") {
      inside = true;
      continue;
    }
    if (!inside) {
      out.push(tok);
      continue;
    }
    let t = tok;
    const closes = t.endsWith(")");
    if (closes) t = t.slice(0, -1);
    const tie = t.endsWith("~");
    if (tie) t = t.slice(0, -1);
    out.push(`${t}t${tie ? "~" : ""}`);
    if (closes) inside = false;
  }
  return out.join(" ");
}

// --- events ⇄ list ----------------------------------------------------------------------------------

type Ev = Omit<NEvent, "id">;

function eventsOf(value: string, ctx: NoteListContext): NEvent[] | null {
  try {
    const list = normalizeStaffValue(value);
    return list === "" ? [] : parseNoteList(list, { meter: ctx.meter, track: ctx.track ?? "main" });
  } catch {
    return null;
  }
}

const strip = (es: readonly NEvent[]): Ev[] => es.map(({ id: _id, ...rest }) => rest);
const sorted = (es: readonly Ev[]): NEvent[] =>
  withIds([...es].sort((a, b) => R.cmp(a.onset, b.onset) || (a.midi ?? 0) - (b.midi ?? 0)));

/** Removes `[from, to)` from every note: a note that overlaps it is shortened or split around it. */
function cut(events: readonly Ev[], from: Rat, to: Rat): Ev[] {
  const out: Ev[] = [];
  for (const e of events) {
    const end = R.add(e.onset, e.dur);
    if (R.lte(end, from) || R.lte(to, e.onset)) {
      out.push(e);
      continue;
    }
    if (R.lt(e.onset, from)) out.push({ ...e, dur: R.sub(from, e.onset) });
    if (R.lt(to, end)) out.push({ ...e, onset: to, dur: R.sub(end, to) });
  }
  return out;
}

function noteEvent(pitch: string, onset: Rat, dur: Rat, track: string): Ev | null {
  const ev = parseNoteList(`${pitch}:4`, { track })[0];
  if (!ev || ev.midi === null) return null;
  const { id: _id, ...rest } = ev;
  return { ...rest, onset, dur };
}

const VALUES = [1, 2, 4, 8, 16, 32] as const;
/** Whole-note lengths of the plain (and, with `dots`, dotted) values, longest first. */
function valueTable(dots: boolean): { len: Rat; text: string }[] {
  const out: { len: Rat; text: string }[] = [];
  for (const v of VALUES) {
    if (dots && v < 32) out.push({ len: R.mul(rat(1, v), [3, 2]), text: `${v}.` });
    out.push({ len: rat(1, v), text: `${v}` });
  }
  return out.sort((x, y) => R.cmp(y.len, x.len));
}
/** `len` whole notes from `pos` as values, longest first (`aligned`: each on a multiple of its plain length). */
function decompose(pos: Rat, len: Rat, dots: boolean, aligned: boolean): string[] | null {
  const out: string[] = [];
  const table = valueTable(dots && !aligned);
  let p = pos;
  let rest = len;
  while (R.lt(ZERO, rest)) {
    const v = table.find((t) => {
      if (R.lt(rest, t.len)) return false;
      return !aligned || isMultiple(p, t.len);
    });
    if (!v || out.length > 16) return null;
    out.push(v.text);
    p = R.add(p, v.len);
    rest = R.sub(rest, v.len);
  }
  return out;
}

/**
 * A one-voice answer with triplet groups as the note list: every group is three triplet values (rests fill it, a
 * note held across values is tied), everything between the groups is plain values with rests on their own grid.
 * `null` when the notes are not one voice (chords of one length aside) or a length is no written value.
 */
function listWithGroups(
  events: readonly NEvent[],
  groups: readonly TripletGroup[],
  ctx: Pick<NoteListContext, "meter" | "bars">,
  dots: boolean,
): string | null {
  const W = whole(ctx.meter);
  const slots: { onset: Rat; end: Rat; names: string[] }[] = [];
  for (const e of events) {
    const end = R.add(e.onset, e.dur);
    const name = e.midi === null ? (e.s ?? "r") : (e.written ?? "");
    if (name === "") return null;
    const last = slots[slots.length - 1];
    if (last && R.eq(last.onset, e.onset) && R.eq(last.end, end)) {
      last.names.push(name);
      continue;
    }
    if (last && R.lt(e.onset, last.end)) return null;
    slots.push({ onset: e.onset, end, names: [name] });
  }
  const what = (s: { names: string[] }) =>
    s.names.length > 1 ? `[${s.names.join(",")}]` : (s.names[0] as string);
  const sounding = (t: Rat) => slots.find((s) => !R.lt(t, s.onset) && R.lt(t, s.end)) ?? null;
  const bars: string[] = [];
  for (let b = 0; b < ctx.bars; b++) {
    const toks: string[] = [];
    const barEnd = rat(b + 1);
    let t: Rat = rat(b);
    let guard = 0;
    while (R.lt(t, barEnd)) {
      if (guard++ > 256) return null;
      const here = t;
      const g = groups.find((x) => R.eq(x.onset, here));
      if (g) {
        const len = R.div(g.span, rat(3));
        for (let i = 0; i < 3; i++) {
          const a = R.add(here, R.mul(len, rat(i)));
          const s = sounding(a);
          toks.push(s ? `${what(s)}:${g.base}t${R.lt(R.add(a, len), s.end) ? "~" : ""}` : `r:${g.base}t`);
        }
        t = R.add(here, g.span);
        continue;
      }
      const nextGroup = groups
        .filter((x) => R.lt(here, x.onset) && R.lt(x.onset, barEnd))
        .sort((x, y) => R.cmp(x.onset, y.onset))[0];
      const stop = nextGroup ? nextGroup.onset : barEnd;
      const pos = R.mul(R.sub(here, rat(b)), W);
      const s = sounding(here);
      if (s) {
        const to = R.min(s.end, stop);
        const vals = decompose(pos, R.mul(R.sub(to, here), W), dots, false);
        if (!vals) return null;
        vals.forEach((v, i) => {
          toks.push(`${what(s)}:${v}${i < vals.length - 1 || R.lt(to, s.end) ? "~" : ""}`);
        });
        t = to;
      } else {
        const nextOn = slots
          .filter((x) => R.lt(here, x.onset))
          .map((x) => x.onset)
          .sort(R.cmp)[0];
        const to = nextOn ? R.min(nextOn, stop) : stop;
        const vals = decompose(pos, R.mul(R.sub(to, here), W), false, true);
        if (!vals) return null;
        for (const v of vals) toks.push(`r:${v}`);
        t = to;
      }
    }
    bars.push(toks.join(" "));
  }
  return bars.join(" | ");
}

/**
 * The events as an answer value: plain values where every length is one (`plainNoteList`, the same text the
 * notation edit model writes); with triplets, each group as three triplet values; else the engraving with its
 * triplets spelled as triplet values. `null` when the events do not engrave.
 */
export function rhythmList(
  events: readonly Ev[],
  ctx: NoteListContext,
  palette: RhythmPalette,
): string | null {
  const evs = sorted(events);
  const groups = tripletGroupsOf(evs, ctx.meter);
  if (groups.length === 0) {
    const plain = plainNoteList(evs, { meter: ctx.meter, bars: ctx.bars, dots: palette.dots });
    if (plain !== null) return plain;
  } else {
    const grouped = listWithGroups(evs, groups, ctx, palette.dots);
    if (grouped !== null) return grouped;
  }
  try {
    const { score } = notate({
      events: evs,
      meter: ctx.meter,
      key: ctx.key,
      bars: ctx.bars,
      staff: ctx.staff ?? "treble",
    });
    return tripletTokens(toNoteList(score));
  } catch {
    return null;
  }
}

/** The triplet groups of a value (an unreadable value has none). */
export function tripletGroupsOfValue(value: string, ctx: NoteListContext): TripletGroup[] {
  const events = eventsOf(value, ctx);
  return events ? tripletGroupsOf(events, ctx.meter) : [];
}

/**
 * A value rewritten in its canonical spelling, after an edit of `@oak/notation` on a list with triplets (which
 * writes the engraving, `(3:2 C4:8 r:8 E4:8)`): each group again three triplet values. A value without triplets is
 * returned as it is.
 */
export function canonicalRhythmList(list: string, ctx?: NoteListContext, palette?: RhythmPalette): string {
  if (!list.includes("(3:2") && !/\dt\b/.test(list)) return list;
  if (ctx && palette) {
    const events = eventsOf(list, ctx);
    const out = events ? rhythmList(strip(events), ctx, palette) : null;
    if (out !== null) return out;
  }
  return list.includes("(3:2") ? tripletTokens(list) : list;
}

/** A written value (`"8"`, `"4."`, `"8t"`) as a length in cycles, or null. */
export function tokenCycles(token: string, meter: NoteListContext["meter"]): Rat | null {
  const t = parseTriplet(token);
  if (t) return tripletLen(t.base, meter);
  const d = parseDuration(token);
  return d ? writtenToCycles(d.base, d.dots, meter) : null;
}

/**
 * Applies one rhythm edit to a staff-input value. A tool the palette does not offer is refused (`not-offered`);
 * a tie needs a next note of the same pitch or a `fill` length with room for it (`no-next-note`); a triplet group
 * starts on a multiple of its own length and stays inside its bar (`crosses-bar`). The value is returned
 * unchanged whenever the edit is refused.
 */
export function applyRhythmEdit(
  value: string,
  edit: RhythmEdit,
  ctx: NoteListContext,
  palette: RhythmPalette,
): RhythmEditOutcome {
  const refuse = (refused: NonNullable<RhythmEditOutcome["refused"]>): RhythmEditOutcome =>
    ({ list: value, refused, clipped: false }) as RhythmEditOutcome;
  const offered =
    edit.op === "tie" ? palette.ties : edit.op === "dot" ? palette.dots : palette.triplets.length > 0;
  if (!offered) return refuse("not-offered");
  const events = eventsOf(value, ctx);
  if (events === null) return refuse("not-found");
  const meter = ctx.meter;
  // Triplets belong to simple meters: in 6/8 the beat is already in three.
  if (edit.op !== "tie" && edit.op !== "dot" && meter.tempoUnit !== "quarter") return refuse("not-offered");
  const end = totalCycles(ctx);
  const write = (evs: readonly Ev[]): RhythmEditOutcome => {
    const list = rhythmList(evs, ctx, palette);
    return list === null ? refuse("not-found") : { list, refused: null, clipped: false };
  };

  switch (edit.op) {
    case "dot": {
      const target = events.find((e) => e.id === edit.eventId);
      if (!target) return refuse("not-found");
      // The value the note is written with now: its length as one plain or dotted value.
      const W = whole(meter);
      const len = R.mul(target.dur, W);
      const base = ([1, 2, 4, 8, 16] as const).find(
        (b) => R.eq(len, rat(1, b)) || R.eq(len, R.mul(rat(1, b), [3, 2])),
      );
      if (!base) return refuse("not-offered");
      const out = staffEditOutcome(
        value,
        { op: "resize", eventId: edit.eventId, dur: writtenToCycles(base, edit.dots, meter) },
        rhythmContext(ctx, palette),
      );
      return out ? { ...out, list: canonicalRhythmList(out.list, ctx, palette) } : refuse("not-found");
    }
    case "tie": {
      const target = events.find((e) => e.id === edit.eventId);
      if (!target || target.midi === null) return refuse("not-found");
      const stop = R.add(target.onset, target.dur);
      const others = strip(events.filter((e) => e.id !== edit.eventId));
      const { id: _id, ...self } = target;
      if (edit.on) {
        const next = events.find(
          (e) => e.id !== edit.eventId && e.midi === target.midi && R.eq(e.onset, stop),
        );
        if (next) {
          const rest = strip(events.filter((e) => e.id !== edit.eventId && e.id !== next.id));
          return write([...rest, { ...self, dur: R.add(target.dur, next.dur) }]);
        }
        const len = edit.fill ? tokenCycles(edit.fill, meter) : null;
        if (!len) return refuse("no-next-note");
        const to = R.add(stop, len);
        if (R.lt(end, to)) return refuse("no-next-note");
        // The held part goes where there is silence only: another note there is not this note's to take.
        if (others.some((e) => R.lt(e.onset, to) && R.lt(stop, R.add(e.onset, e.dur))))
          return refuse("no-next-note");
        return write([...others, { ...self, dur: R.add(target.dur, len) }]);
      }
      // Untie: split at the end of the first written piece (the tie the learner sees).
      const score = scoreOf(events, ctx);
      const head = score ? headPiece(score, edit.eventId) : null;
      if (!head?.tied || !R.lt(head.dur, target.dur)) return refuse("no-tie");
      return write([
        ...others,
        { ...self, dur: head.dur },
        { ...self, onset: R.add(target.onset, head.dur), dur: R.sub(target.dur, head.dur) },
      ]);
    }
    case "triplet":
    case "triplet-note": {
      if (!palette.triplets.some((t) => t.base === edit.base)) return refuse("not-offered");
      const span = tripletSpan(edit.base, meter);
      const len = tripletLen(edit.base, meter);
      const start = edit.op === "triplet" ? edit.onset : groupStart(edit.onset, edit.base, meter);
      const stop = R.add(start, span);
      // A group starts on a multiple of its own length, inside the answer, and never crosses its bar line.
      if (
        R.lt(start, ZERO) ||
        R.lt(end, stop) ||
        !R.eq(groupStart(start, edit.base, meter), start) ||
        R.lt(rat(R.floor(start) + 1), stop)
      )
        return refuse("crosses-bar");
      const track = ctx.track ?? events[0]?.track ?? "main";
      const groups = tripletGroupsOf(events, meter);
      const same = groups.find((g) => R.eq(g.onset, start) && g.base === edit.base);
      let rest = strip(events);
      const made: Ev[] = [];
      const add = (pitch: string | null, slot: number): boolean => {
        if (!pitch) return true;
        const ev = noteEvent(pitch, R.add(start, R.mul(len, rat(slot))), len, track);
        if (ev) made.push(ev);
        return ev !== null;
      };
      if (edit.op === "triplet") {
        rest = clearGroups(rest, groups, start, stop);
        for (const [i, p] of edit.pitches.entries()) if (!add(p, i)) return refuse("not-found");
      } else if (same) {
        // Inside a group of the same value only this value changes.
        const slot = slotOf(edit.onset, start, len);
        const at = R.add(start, R.mul(len, rat(slot)));
        rest = cut(rest, at, R.add(at, len));
        if (!add(edit.pitch, slot)) return refuse("not-found");
      } else {
        // A rest where no group is changes nothing.
        if (edit.pitch === null) return { list: value, refused: null, clipped: false };
        // A new group: the beat is cleared and all three values take the pitch, so the bracket is complete
        // from the first key (the learner then changes the second and third in place).
        rest = clearGroups(rest, groups, start, stop);
        for (const i of [0, 1, 2]) if (!add(edit.pitch, i)) return refuse("not-found");
      }
      return write([...rest, ...made]);
    }
    case "untriplet": {
      const g = tripletGroupsOf(events, meter).find((x) => R.eq(x.onset, edit.onset)) ?? null;
      if (!g) return refuse("not-found");
      const len = tripletLen(g.base, meter);
      const half = R.div(g.span, rat(2));
      const stop = R.add(g.onset, g.span);
      const rest = cut(strip(events), g.onset, stop);
      const made: Ev[] = [];
      for (const slot of [0, 1]) {
        const at = R.add(g.onset, R.mul(len, rat(slot)));
        for (const e of events.filter((x) => R.eq(x.onset, at))) {
          const { id: _id, ...self } = e;
          made.push({ ...self, onset: R.add(g.onset, R.mul(half, rat(slot))), dur: half });
        }
      }
      return write([...rest, ...made]);
    }
  }
}

/** Clears `[from, to)` and every triplet group that reaches into it (a half-cut bracket would not engrave). */
function clearGroups(events: readonly Ev[], groups: readonly TripletGroup[], from: Rat, to: Rat): Ev[] {
  let lo = from;
  let hi = to;
  for (const g of groups) {
    const gEnd = R.add(g.onset, g.span);
    if (R.lt(g.onset, to) && R.lt(from, gEnd)) {
      if (R.lt(g.onset, lo)) lo = g.onset;
      if (R.lt(hi, gEnd)) hi = gEnd;
    }
  }
  return cut(events, lo, hi);
}

function scoreOf(events: readonly NEvent[], ctx: NoteListContext): Score | null {
  try {
    return notate({
      events: [...events],
      meter: ctx.meter,
      key: ctx.key,
      bars: ctx.bars,
      staff: ctx.staff ?? "treble",
    }).score;
  } catch {
    return null;
  }
}

/** The first written piece of an event: its length, and whether a tie leaves it. */
function headPiece(score: Score, eventId: string): { dur: Rat; tied: boolean } | null {
  for (const st of score.staves)
    for (const v of st.voices)
      for (const b of v.bars)
        for (const it of b.items)
          if (it.kind !== "rest" && !it.tieFromPrev && it.eventIds.includes(eventId))
            return { dur: it.dur, tied: it.tieToNext };
  return null;
}

/** True when the event is written as tied pieces. */
export function isTied(value: string, eventId: string, ctx: NoteListContext): boolean {
  const events = eventsOf(value, ctx);
  const score = events ? scoreOf(events, ctx) : null;
  return score ? headPiece(score, eventId)?.tied === true : false;
}

// --- keys -------------------------------------------------------------------------------------------

/** A key's result that may carry a rhythm edit instead of a notation edit. */
export type RhythmKeyResult = StaffKeyResult & { rhythm?: RhythmEdit };

/** What the rhythm keys need beyond the staff's own context: the engraved triplet groups. */
export type RhythmKeyContext = StaffKeyContext & { groups?: readonly TripletGroup[] };

const TRIPLET_NAME: Record<number, string> = { 4: "quarter", 8: "eighth", 16: "sixteenth" };
/** The plain value as long as a whole group. */
const GROUP_VALUE: Record<number, string> = { 4: "a half note", 8: "a quarter note", 16: "an eighth note" };
/** "eighth-note triplet". */
export function tripletName(base: 4 | 8 | 16): string {
  return `${TRIPLET_NAME[base]}-note triplet`;
}

/** The length the cursor writes with, as words: "quarter", "dotted quarter", "eighth-note triplet". */
export function lengthName(token: string): string {
  const t = parseTriplet(token);
  if (t) return tripletName(t.base);
  const d = parseDuration(token);
  return d ? durationName(d) : token;
}

function clampCursor(onset: Rat, k: RhythmKeyContext, step: Rat): Rat {
  const last = R.sub(totalCycles(k.ctx), step);
  if (R.lt(onset, ZERO)) return ZERO;
  return R.lt(last, onset) ? last : onset;
}

/**
 * The rhythm keys of the staff input, tried before `staffKey`; `undefined` for every key it does not take.
 * `t` ties (or unties) and `;` switches to triplet values, when the palette offers them. While the cursor writes
 * triplet values, or stands inside a triplet group, it also takes the letters (a letter writes ONE value of the
 * group and steps to the next), `0` (a rest of one value), `←`/`→` (one value at a time), `2`–`6` (back to a
 * plain length; a triplet note is never stretched into its neighbours) and `.` (triplets are not dotted here).
 */
export function rhythmKey(
  cursor: StaffCursor,
  input: StaffKeyInput,
  k: RhythmKeyContext,
): RhythmKeyResult | undefined {
  if (input.mod || input.alt) return undefined;
  const palette = rhythmPalette(k.spec);
  const meter = k.ctx.meter;
  const key = input.key;
  const groups = k.groups ?? [];
  const mode = parseTriplet(cursor.dur);
  const inGroup = groupAt(groups, cursor.onset);
  const under = noteAtOnset(k.notes, cursor.onset);
  const lastNote = cursor.last ? noteAtOnset(k.notes, cursor.last) : null;

  if (!input.shift && key === RHYTHM_KEYS.tie) {
    if (!palette.ties) return undefined;
    const target = lastNote ?? under;
    const id = target?.eventIds[0];
    if (!target || !id) return { cursor, say: "Put the cursor on a note first, then tie it." };
    if (target.tied)
      return { cursor, rhythm: { op: "tie", eventId: id, on: false }, say: "Tie removed: two notes again." };
    // With nothing of that pitch after it the note is held on by the cursor's length (over a rest or the bar
    // line): the cursor then stands after the held part, so the next letter does not write into it.
    const stop = R.add(target.onset, target.dur);
    const midi = target.pitches[0]?.midi;
    const next = k.notes.find((n) => n.pitches[0]?.midi === midi && R.eq(n.onset, stop));
    const hold = next ? null : tokenCycles(cursor.dur, meter);
    const after = hold ? R.add(stop, hold) : null;
    const onset =
      after && !R.lt(totalCycles(k.ctx), after)
        ? R.lt(after, totalCycles(k.ctx))
          ? after
          : cursor.onset
        : cursor.onset;
    // Holding on says by how much (Wave 6 review: "t" right after an eighth held it by an eighth, the learner then
    // typed the half note they meant as a new note, and nothing had said that the length comes first).
    const held = lengthName(cursor.dur);
    return {
      cursor: { ...cursor, onset, last: null },
      rhythm: { op: "tie", eventId: id, on: true, fill: cursor.dur },
      say: next
        ? "Tied: one note, held across."
        : `Tied: held on by ${/^[aeiou]/.test(held) ? "an" : "a"} ${held}. To hold it longer, pick that length (2–6) before T.`,
    };
  }

  if (!input.shift && key === RHYTHM_KEYS.triplet) {
    if (palette.triplets.length === 0) return undefined;
    if (mode) {
      // Back to the plain value of the same size (or the palette's nearest).
      const plain = paletteDurations(k.spec);
      const d = plain.find((x) => x.base === mode.base && x.dots === 0) ?? plain[0];
      const token = d?.token ?? "4";
      return { cursor: { ...cursor, dur: token, last: null }, say: `Next note: ${lengthName(token)}` };
    }
    const cur = parseDuration(cursor.dur);
    const t =
      palette.triplets.find((x) => x.base === cur?.base) ??
      palette.triplets.find((x) => x.base === 8) ??
      (palette.triplets[0] as TripletToken);
    // The cursor moves to the value it is in: inside a group that value, else the start of its beat.
    const g = inGroup && inGroup.base === t.base ? inGroup : null;
    const start = g ? g.onset : groupStart(cursor.onset, t.base, meter);
    const len = tripletLen(t.base, meter);
    const onset = g ? R.add(start, R.mul(len, rat(slotOf(cursor.onset, start, len)))) : start;
    return {
      cursor: { ...cursor, onset, dur: t.token, last: null },
      say: `Next notes: ${tripletName(t.base)}s, three to ${t.base === 8 ? "a beat" : "a group"}.`,
    };
  }

  // Everything below only matters where triplets are: the cursor writes them, stands inside a group, or steps
  // back into the group that ends where it stands.
  const before = key === "ArrowLeft" && !input.shift ? groupAt(groups, R.sub(cursor.onset, [1, 1024])) : null;
  const base = mode?.base ?? inGroup?.base ?? before?.base ?? null;
  if (base === null) return undefined;
  const len = tripletLen(base, meter);
  const start = inGroup && inGroup.base === base ? inGroup.onset : groupStart(cursor.onset, base, meter);
  const slot = slotOf(cursor.onset, start, len);
  const at = R.add(start, R.mul(len, rat(slot)));
  const onSlot = R.eq(at, cursor.onset);

  if ((key === "ArrowLeft" || key === "ArrowRight") && !input.shift) {
    const dir = key === "ArrowRight" ? 1 : -1;
    // Plain length outside a group: the staff's own grid. Standing just after a group, ← steps into it.
    if (!mode && !inGroup && !before) return undefined;
    let next: Rat;
    if (mode || inGroup) next = dir > 0 ? R.add(at, len) : onSlot ? R.sub(at, len) : at;
    else next = cursor.onset;
    if (dir < 0 && before && (!inGroup || R.eq(cursor.onset, inGroup.onset))) {
      const bl = tripletLen(before.base, meter);
      next = R.add(before.onset, R.mul(bl, rat(2)));
    }
    const onset = clampCursor(next, k, len);
    const note = noteAtOnset(k.notes, onset);
    return {
      cursor: { ...cursor, onset, dia: note?.pitches[0]?.dia ?? cursor.dia, last: null },
      say: note ? `On ${describeRhythmNote(note)}` : `${describePlace(onset, meter)}, empty`,
    };
  }
  if (input.shift) return undefined;

  if (/^[a-gA-G]$/.test(key) || (k.fixedDia !== undefined && /^[nNxX]$/.test(key))) {
    // A plain length at the very start of a group replaces the whole group when it is at least as long.
    if (!mode && inGroup && R.eq(cursor.onset, inGroup.onset)) {
      const d = parseDuration(cursor.dur);
      const plainLen = d ? writtenToCycles(d.base, d.dots, meter) : null;
      if (plainLen && !R.lt(plainLen, inGroup.span)) return undefined;
      return {
        cursor,
        say: `A triplet fills this beat. Press ; to write triplet notes here, or pick ${GROUP_VALUE[inGroup.base]} or longer to replace it.`,
      };
    }
    if (palette.triplets.length === 0 || !palette.triplets.some((t) => t.base === base)) return undefined;
    const dia = k.fixedDia ?? nearestLetter(key, cursor.dia);
    const p = pitchAt(dia, k.fixedDia !== undefined ? null : k.ctx.key);
    const stop = R.add(start, tripletSpan(base, meter));
    if (R.lt(totalCycles(k.ctx), stop) || R.lt(rat(R.floor(start) + 1), stop))
      return { cursor, say: "No room for a triplet here. Move to the start of a beat." };
    const nextOnset = clampCursor(R.add(at, len), k, len);
    const atEnd = R.eq(R.add(at, len), totalCycles(k.ctx));
    const fresh = !(inGroup && inGroup.base === base);
    const name = k.fixedDia !== undefined ? "" : `${p.display}, `;
    return {
      cursor: { onset: atEnd ? at : nextOnset, dia, dur: cursor.dur, last: at },
      rhythm: { op: "triplet-note", onset: at, base, pitch: p.name },
      play: [p.midi],
      say: fresh
        ? `A triplet from ${describePlace(start, meter)}: three ${tripletName(base)} notes${k.fixedDia !== undefined ? "" : ` on ${p.display}`}. Type the others to change them, or 0 for a rest.`
        : `${name}${tripletName(base)} ${slot + 1} of 3, ${describePlace(start, meter)}`,
    };
  }
  if (key === "0") {
    if (!k.spec.palette.rests) return { cursor, say: "This answer has no rests to write." };
    if (!mode && !inGroup) return undefined;
    return {
      cursor: { ...cursor, onset: clampCursor(R.add(at, len), k, len), last: null },
      rhythm: { op: "triplet-note", onset: at, base, pitch: null },
      say: `Rest, ${tripletName(base)} ${slot + 1} of 3, ${describePlace(start, meter)}`,
    };
  }
  if (/^[2-6]$/.test(key) && (mode || under?.tuplet)) {
    // Leave triplet values; the note under the cursor keeps its place in its group.
    const plain = paletteDurations(k.spec);
    const want = { "2": 16, "3": 8, "4": 4, "5": 2, "6": 1 }[key] as number;
    const d = plain.find((x) => x.base === want && x.dots === 0) ?? plain.find((x) => x.base === want);
    if (!d) return { cursor, say: `This answer has no ${durationName({ base: want, dots: 0 })} notes.` };
    return { cursor: { ...cursor, dur: d.token, last: null }, say: `Next note: ${durationName(d)}` };
  }
  if (key === "." && mode) return { cursor, say: "Triplet values are not dotted here." };
  return undefined;
}

/** "E4, eighth-note triplet, bar 1 beat 2", "G4, half tied on, bar 1 beat 3". */
export function describeRhythmNote(note: {
  pitches: readonly { letter: string; alt: number; oct: number }[];
  written: { base: number; dots: number };
  bar: number;
  beat: number;
  tied?: boolean;
  tuplet?: boolean;
}): string {
  const names = note.pitches.map(
    (p) => `${p.letter}${p.alt > 0 ? " sharp" : p.alt < 0 ? " flat" : ""}${p.oct}`,
  );
  const value =
    note.tuplet && (note.written.base === 4 || note.written.base === 8 || note.written.base === 16)
      ? tripletName(note.written.base)
      : durationName(note.written);
  const whole = Math.floor(note.beat + 1e-9);
  const frac = note.beat - whole;
  const beat =
    Math.abs(frac) < 1e-6
      ? `beat ${whole}`
      : Math.abs(frac - 0.5) < 1e-6
        ? `the and of beat ${whole}`
        : Math.abs(frac - 1 / 3) < 1e-6
          ? `beat ${whole}, second of three`
          : Math.abs(frac - 2 / 3) < 1e-6
            ? `beat ${whole}, third of three`
            : `beat ${Math.round(note.beat * 100) / 100}`;
  return `${names.join(" ")}, ${value}${note.tied ? ", tied on" : ""}, bar ${note.bar} ${beat}`;
}

/** In the learner's words, why a rhythm edit did not land (`null` when it did). */
export function rhythmRefusalText(refused: RhythmEditOutcome["refused"]): string | null {
  switch (refused) {
    case "not-built":
      return "This staff can't write that yet.";
    case "not-offered":
      return "This answer doesn't use that.";
    case "no-next-note":
      return "A tie joins a note to the same note after it. Nothing of that pitch follows, and there is no free room to hold it on.";
    case "crosses-bar":
      return "A triplet starts on the beat and stays inside its bar.";
    case "no-tie":
      return "That note has no tie to remove.";
    default:
      return null;
  }
}

// --- a rhythm as it is read back (the reveal) -----------------------------------------------------------

/** One written value of an answer, for a line that spells a rhythm out: a note, a rest, or a bar line. */
export type RhythmToken =
  | { kind: "bar" }
  | {
      kind: "note" | "rest";
      /** Display names of the pitches ("E4", "F♯4"); empty for a rest. */
      names: string[];
      base: 1 | 2 | 4 | 8 | 16 | 32;
      dots: 0 | 1 | 2;
      triplet: boolean;
      /** A tie leaves this value for the same note after it. */
      tie: boolean;
    };

/**
 * An answer as its written values, in order, bars separated: what the reveal of a rhythm shows (the staff's dashed
 * heads show where the notes are, not how long). The value is first rewritten in its canonical spelling, so a
 * reveal given as bare pitches or with gaps reads with its rests. `null` when it cannot be read.
 */
export function rhythmTokens(value: string, ctx: NoteListContext): RhythmToken[] | null {
  const events = eventsOf(value, ctx);
  if (events === null) return null;
  const list =
    rhythmList(strip(events), ctx, { ties: true, dots: true, triplets: [] }) ?? normalizeStaffValue(value);
  const out: RhythmToken[] = [];
  for (const tok of list.split(/\s+/).filter((x) => x !== "")) {
    if (tok === "|") {
      out.push({ kind: "bar" });
      continue;
    }
    const m = /^(.+):(\d+)(\.{0,2})(t?)(~?)$/.exec(tok);
    if (!m) return null;
    const what = m[1] as string;
    const rest = what === "r" || what === "z";
    const names = rest
      ? []
      : (what.startsWith("[") ? what.slice(1, -1).split(",") : [what]).map((n) =>
          n
            .replace(/##/g, "𝄪")
            .replace(/#/g, "♯")
            .replace(/([A-G])bb/g, "$1𝄫")
            .replace(/([A-G])b/g, "$1♭"),
        );
    out.push({
      kind: rest ? "rest" : "note",
      names,
      base: Number(m[2]) as 1 | 2 | 4 | 8 | 16 | 32,
      dots: (m[3] ?? "").length as 0 | 1 | 2,
      triplet: m[4] === "t",
      tie: m[5] === "~",
    });
  }
  return out;
}

/** A token as a screen reader says it: "E4 dotted quarter", "eighth rest", "A4 quarter tied on". */
export function tokenSpoken(t: RhythmToken, pitches = true): string {
  if (t.kind === "bar") return "bar line";
  const value =
    t.triplet && (t.base === 4 || t.base === 8 || t.base === 16)
      ? tripletName(t.base)
      : durationName({ base: t.base, dots: t.dots });
  if (t.kind === "rest") return `${value} rest`;
  const names = t.names.map((n) => n.replace("♯", " sharp").replace("♭", " flat"));
  return `${pitches ? `${names.join(" ")} ` : ""}${value}${t.tie ? " tied on" : ""}`;
}
