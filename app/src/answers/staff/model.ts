// The staff-input answer model (contracts §5.4 `staff-input`, ux §4.5 StaffInput): what the widget needs between
// the answer value (the note-list DSL, `"F#4:4 r:4 A4:2"`) and the notation engineer's edit model
// (`editNoteList`, wave3.md §3.1): the context a spec engraves in, the notes as the learner reads them ("E4,
// quarter, bar 1 beat 2"), the cursor and its keyboard grammar, and pointer → (onset, staff step → pitch) through
// the measured geometry. Pure: tested with `bun test`; the DOM half is `measure.ts`.
import type { KeySpec, MeterSpec, Rat } from "@oak/content-kit";
import { R, rat } from "@oak/content-kit";
import {
  editNoteList,
  type NoteItem,
  type NoteListContext,
  notate,
  noteListInput,
  type Score,
  type StaffBandGeometry,
  type StaffEdit,
  type StaffGeometry,
  staffAt,
  writtenToCycles,
} from "@oak/notation";
import { METERS, signatureOf } from "@oak/theory";
import type { AnswerSpecOf } from "../types.ts";

export type StaffSpec = AnswerSpecOf<"staff-input">;

const LETTERS = "CDEFGAB";
const NATURAL = [0, 2, 4, 5, 7, 9, 11] as const;
/** Diatonic number (C0 = 0, one per letter) of each clef's top line: treble F5, bass A3. */
export const TOP_LINE_DIA: Record<"treble" | "bass", number> = { treble: 5 * 7 + 3, bass: 3 * 7 + 5 };
/** A grand-staff answer is one voice split by register (notation's default split, middle C to the right hand). */
export const GRAND_SPLIT_MIDI = 60;

// --- context and value -----------------------------------------------------------------------------

/** What a spec engraves in: meter (4/4 unless the host says), key signature, bars, clef. */
export function staffContext(spec: StaffSpec, meter: MeterSpec = METERS["4/4"]): NoteListContext {
  // Ties and dots only when the step's palette offers them (notation refuses or shortens the edit otherwise).
  const dots = spec.palette.durations.some((d) => d.includes("."));
  return {
    meter,
    key: spec.key ?? null,
    bars: spec.bars,
    staff: spec.clef,
    ties: spec.palette.ties === true,
    dots,
  };
}

/**
 * A value as the note list `parseNoteList` reads: a bare pitch (`C4`, as the lesson host's reveal sends it)
 * becomes a quarter note. Anything else is kept as written.
 */
export function normalizeStaffValue(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter((t) => t !== "")
    .map((t) => (/^(?:\[[^\]]+\]|[A-Ga-g](?:##|bb|#|b)?-?\d)$/.test(t) ? `${t}:4` : t))
    .join(" ");
}

export interface Engraved {
  ok: true;
  list: string;
  score: Score;
  abc: ReturnType<typeof notate>["abc"];
}
export type EngraveResult = Engraved | { ok: false; error: string };

/** The value engraved: Score and ABC (never throws; a list the DSL cannot read says why). */
export function engrave(value: string, ctx: NoteListContext): EngraveResult {
  const list = normalizeStaffValue(value);
  try {
    const { score, abc } = notate(noteListInput(list, ctx));
    return { ok: true, list, score, abc };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * One edit on the value; `null` when the edit does not apply (the value is not a readable list). The list is
 * rebuilt on one treble staff whatever the clef: the answer is one voice, and `editNoteList` on a grand staff
 * would keep only the right hand (`toNoteList` reads staff 0). Event IDs do not depend on the staff.
 */
export function applyStaffEdit(value: string, edit: StaffEdit, ctx: NoteListContext): string | null {
  return staffEditOutcome(value, edit, ctx)?.list ?? null;
}

/** What an edit did: the new value, and why it was refused or shortened (notation's `editNoteList`). */
export interface StaffEditOutcome {
  list: string;
  refused: "not-found" | "outside" | "needs-dot" | "needs-tie" | null;
  clipped: boolean;
}

export function staffEditOutcome(
  value: string,
  edit: StaffEdit,
  ctx: NoteListContext,
): StaffEditOutcome | null {
  try {
    // A grand staff is edited as one: notation keeps both hands (an edit only displaces notes on its own side
    // of middle C), so the old treble-context workaround, which cut a left-hand note under a right-hand edit,
    // is gone.
    const r = editNoteList(normalizeStaffValue(value), edit, ctx);
    return { list: r.list, refused: r.refused ?? null, clipped: r.clipped === true };
  } catch {
    return null;
  }
}

/**
 * Why an edit did not land as asked, in the learner's words (the staff keeps every bar full and writes no ties
 * or dots unless the step offers them): `null` when it did.
 */
export function refusalText(o: Pick<StaffEditOutcome, "refused" | "clipped">): string | null {
  switch (o.refused) {
    case "needs-dot":
      return "That length needs a dotted note, which this answer doesn't use. Pick a shorter length.";
    case "needs-tie":
      return "That note would cross the bar line. Pick a shorter length, or start it earlier.";
    case "outside":
      return "That is past the end of the answer's bars.";
    case "not-found":
      return "That note is no longer there.";
    default:
      return o.clipped ? "Shortened to end at the bar line: notes here don't cross it." : null;
  }
}

// --- durations -------------------------------------------------------------------------------------

/** A written value as the note list writes it: `"4"` quarter, `"8."` dotted eighth. */
export interface DurationToken {
  token: string;
  base: 1 | 2 | 4 | 8 | 16 | 32;
  dots: 0 | 1 | 2;
}

export function parseDuration(token: string): DurationToken | null {
  const m = /^(1|2|4|8|16|32)(\.{0,2})$/.exec(token.trim());
  if (!m) return null;
  return {
    token: token.trim(),
    base: Number(m[1]) as DurationToken["base"],
    dots: (m[2] ?? "").length as 0 | 1 | 2,
  };
}

/** The palette's durations (longest first); a palette without readable ones gives the quarter. */
export function paletteDurations(spec: StaffSpec): DurationToken[] {
  const out = spec.palette.durations.map(parseDuration).filter((d): d is DurationToken => d !== null);
  const list = out.length > 0 ? out : [parseDuration("4") as DurationToken];
  return list.sort((a, b) => a.base - b.base || b.dots - a.dots);
}

/** Length in cycles (bars). */
export function durCycles(d: DurationToken, meter: MeterSpec): Rat {
  return writtenToCycles(d.base, d.dots, meter);
}

/** The snap grid: the shortest palette value, in whole notes (`HitContext.grid`). */
export function snapGrid(spec: StaffSpec): Rat {
  const whole = (d: DurationToken): Rat => R.mul(rat(1, d.base), rat(2 ** (d.dots + 1) - 1, 2 ** d.dots));
  return paletteDurations(spec)
    .map(whole)
    .reduce((a, b) => (R.lt(b, a) ? b : a));
}

/** The grid in cycles. */
export function gridCycles(spec: StaffSpec, meter: MeterSpec): Rat {
  return R.div(snapGrid(spec), rat(meter.num, meter.den));
}

/** ux §4.5: `2 3 4 5 6` = sixteenth, eighth, quarter, half, whole. */
export const DIGIT_DURATION: Readonly<Record<string, string>> = {
  "2": "16",
  "3": "8",
  "4": "4",
  "5": "2",
  "6": "1",
};

const VALUE_NAME: Record<number, string> = {
  1: "whole",
  2: "half",
  4: "quarter",
  8: "eighth",
  16: "sixteenth",
  32: "thirty-second",
};

/** "quarter", "dotted half". */
export function durationName(d: { base: number; dots: number }): string {
  const name = VALUE_NAME[d.base] ?? `1/${d.base}`;
  return d.dots === 0 ? name : `${d.dots === 2 ? "double-dotted" : "dotted"} ${name}`;
}

// --- pitches on the staff --------------------------------------------------------------------------

export interface StaffPitch {
  /** Diatonic number: C0 = 0, D0 = 1 … (octave × 7 + letter). */
  dia: number;
  letter: string;
  alt: number;
  oct: number;
  midi: number;
  /** Note-list spelling: `F#4`. */
  name: string;
  /** Display: `F♯4`. */
  display: string;
}

/** Alteration per letter of a key signature (`F: 1` in D major). */
export function signatureAlts(key: KeySpec | null | undefined): Record<string, number> {
  const out: Record<string, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (!key) return out;
  const sig = signatureOf(key);
  for (const s of sig.sharps) out[s[0] as string] = 1;
  for (const f of sig.flats) out[f[0] as string] = -1;
  return out;
}

const accText = (alt: number) => (alt > 0 ? "#".repeat(alt) : "b".repeat(-alt));
const accGlyph = (alt: number) =>
  alt === 2 ? "𝄪" : alt === -2 ? "𝄫" : alt > 0 ? "♯".repeat(alt) : "♭".repeat(-alt);

/** The pitch at a diatonic number: the key signature's accidental unless `alt` is given. */
export function pitchAt(dia: number, key: KeySpec | null | undefined, alt?: number): StaffPitch {
  const li = ((dia % 7) + 7) % 7;
  const oct = Math.floor(dia / 7);
  const letter = LETTERS[li] as string;
  const a = alt ?? signatureAlts(key)[letter] ?? 0;
  return {
    dia,
    letter,
    alt: a,
    oct,
    midi: (oct + 1) * 12 + (NATURAL[li] as number) + a,
    name: `${letter}${accText(a)}${oct}`,
    display: `${letter}${accGlyph(a)}${oct}`,
  };
}

/** A spelled name (`F#4`, `Bb3`) as a staff pitch, or `null`. */
export function parsePitch(name: string): StaffPitch | null {
  const m = /^([A-Ga-g])(##|bb|#|b)?(-?\d)$/.exec(name.trim());
  if (!m) return null;
  const li = LETTERS.indexOf((m[1] as string).toUpperCase());
  const alt = (m[2] ?? "").startsWith("#") ? (m[2] ?? "").length : -(m[2] ?? "").length;
  return pitchAt(Number(m[3]) * 7 + li, null, alt);
}

/** Half-spaces below the top line of a clef for a diatonic number (0 = top line, 8 = bottom line). */
export function stepOf(dia: number, clef: "treble" | "bass"): number {
  return TOP_LINE_DIA[clef] - dia;
}

/** The clef a pitch sits on: its own clef, or on a grand staff the hand its register goes to. */
export function clefFor(spec: StaffSpec, midi: number): "treble" | "bass" {
  if (spec.clef === "grand") return midi < GRAND_SPLIT_MIDI ? "bass" : "treble";
  return spec.clef;
}

/** Ledger lines a note at `step` needs: the steps of each line (−2, −4 … above; 10, 12 … below). */
export function ledgerSteps(step: number): number[] {
  const out: number[] = [];
  for (let s = -2; s >= step; s -= 2) out.push(s);
  for (let s = 10; s <= step; s += 2) out.push(s);
  return out;
}

/** The pitch of a letter nearest to a diatonic number (a tie goes down: E4 then `B` gives B3). */
export function nearestLetter(letter: string, fromDia: number): number {
  const li = LETTERS.indexOf(letter.toUpperCase());
  const base = Math.floor(fromDia / 7) * 7 + li;
  let best = base;
  for (const c of [base - 7, base, base + 7])
    if (
      Math.abs(c - fromDia) < Math.abs(best - fromDia) ||
      (Math.abs(c - fromDia) === Math.abs(best - fromDia) && c < best)
    )
      best = c;
  return best;
}

// --- the notes as the learner reads them -----------------------------------------------------------

export interface StaffNote {
  /** Index among the pitched notes (the `part` of a per-note mark). */
  index: number;
  /** The engraved `oak-e{n}`. */
  n: number | null;
  eventIds: string[];
  pitches: StaffPitch[];
  onset: Rat;
  dur: Rat;
  written: { base: number; dots: number };
  staff: "S1" | "RH" | "LH" | "DR";
  /** 1-based bar and beat (beat in tempo units, fractional off the beat). */
  bar: number;
  beat: number;
}

function pitchOfSpelled(p: { letter: string; alt: number; oct: number }): StaffPitch {
  return pitchAt(p.oct * 7 + LETTERS.indexOf(p.letter), null, p.alt);
}

/** Every pitched note of the score in time order (tie continuations are part of the note they continue). */
export function staffNotes(score: Score): StaffNote[] {
  const items: { item: NoteItem; staff: StaffNote["staff"] }[] = [];
  for (const st of score.staves)
    for (const v of st.voices)
      for (const b of v.bars)
        for (const item of b.items)
          if (item.kind !== "rest" && !item.tieFromPrev && !item.hidden) items.push({ item, staff: st.id });
  items.sort(
    (a, b) =>
      R.cmp(a.item.onset, b.item.onset) || (a.item.pitches[0]?.midi ?? 0) - (b.item.pitches[0]?.midi ?? 0),
  );
  const unit = rat(score.meter.unitsPerBar);
  return items.map(({ item, staff }, index) => {
    const cycle = R.floor(item.onset);
    const inBar = R.sub(item.onset, rat(cycle));
    return {
      index,
      n: item.n,
      eventIds: item.eventIds,
      pitches: item.pitches.map(pitchOfSpelled),
      onset: item.onset,
      dur: item.dur,
      written: item.written,
      staff,
      bar: cycle + 1,
      beat: 1 + R.toNum(R.mul(inBar, unit)),
    };
  });
}

function beatText(beat: number): string {
  const whole = Math.floor(beat);
  const frac = beat - whole;
  if (Math.abs(frac) < 1e-9) return `beat ${whole}`;
  if (Math.abs(frac - 0.5) < 1e-9) return `the and of beat ${whole}`;
  return `beat ${Math.round(beat * 100) / 100}`;
}

/** The screen-reader line of a note: "E4, quarter, bar 1 beat 2" (sharps and flats spoken). */
export function describeNote(note: Pick<StaffNote, "pitches" | "written" | "bar" | "beat">): string {
  const names = note.pitches.map(
    (p) => `${p.letter}${p.alt > 0 ? " sharp" : p.alt < 0 ? " flat" : ""}${p.oct}`,
  );
  return `${names.join(" ")}, ${durationName(note.written)}, bar ${note.bar} ${beatText(note.beat)}`;
}

/** A place in the bars, spoken: "bar 2 beat 3". */
export function describePlace(onset: Rat, meter: MeterSpec): string {
  const cycle = R.floor(onset);
  const beat = 1 + R.toNum(R.mul(R.sub(onset, rat(cycle)), rat(meter.unitsPerBar)));
  return `bar ${cycle + 1} ${beatText(beat)}`;
}

/** The note starting at `onset` (the selected note when the cursor is on it). */
export function noteAtOnset(notes: readonly StaffNote[], onset: Rat): StaffNote | null {
  return notes.find((n) => R.eq(n.onset, onset)) ?? null;
}

// --- chords (Wave 4, `palette.chords`) --------------------------------------------------------------

/** The notes that start together, across both staves of a grand staff, low to high: one chord of the answer. */
export interface StaffChord {
  /** Index among the chords (the `part` of a per-chord mark when the palette has chords). */
  index: number;
  onset: Rat;
  /** The longest length among its notes. */
  dur: Rat;
  bar: number;
  beat: number;
  pitches: StaffPitch[];
  /** Aligned with `pitches`. */
  eventIds: string[];
  /** The `StaffNote.index` of every engraved item it is drawn with (one per staff). */
  items: number[];
}

/** The answer's chords in time order: every group of notes that start together. */
export function staffChords(notes: readonly StaffNote[]): StaffChord[] {
  const out: StaffChord[] = [];
  for (const n of notes) {
    let c = out.find((x) => R.eq(x.onset, n.onset));
    if (!c) {
      c = {
        index: out.length,
        onset: n.onset,
        dur: n.dur,
        bar: n.bar,
        beat: n.beat,
        pitches: [],
        eventIds: [],
        items: [],
      };
      out.push(c);
    }
    if (R.lt(c.dur, n.dur)) c.dur = n.dur;
    c.items.push(n.index);
    n.pitches.forEach((p, i) => {
      c.pitches.push(p);
      c.eventIds.push(n.eventIds[i] ?? n.eventIds[0] ?? "");
    });
  }
  for (const c of out) {
    const order = c.pitches
      .map((_, i) => i)
      .sort((a, b) => (c.pitches[a]?.midi ?? 0) - (c.pitches[b]?.midi ?? 0));
    c.pitches = order.map((i) => c.pitches[i] as StaffPitch);
    c.eventIds = order.map((i) => c.eventIds[i] as string);
  }
  out.sort((a, b) => R.cmp(a.onset, b.onset));
  out.forEach((c, i) => {
    c.index = i;
  });
  return out;
}

/** The chord starting at `onset`, if any. */
export function chordAt(notes: readonly StaffNote[], onset: Rat): StaffChord | null {
  return staffChords(notes).find((c) => R.eq(c.onset, onset)) ?? null;
}

/** The note of a chord the cursor means: the one on the ghost's line or space, else the top note. */
export function pickInChord(chord: StaffChord, dia: number): number {
  const i = chord.pitches.findIndex((p) => p.dia === dia);
  return i >= 0 ? i : chord.pitches.length - 1;
}

/** "C4 E4 G4, half, bar 1 beat 1" (sharps and flats spoken). */
export function describeChord(
  c: Pick<StaffChord, "pitches" | "bar" | "beat">,
  written?: { base: number; dots: number },
): string {
  const names = c.pitches.map((p) => `${p.letter}${p.alt > 0 ? " sharp" : p.alt < 0 ? " flat" : ""}${p.oct}`);
  return `${names.join(" ")}${written ? `, ${durationName(written)}` : ""}, bar ${c.bar} ${beatText(c.beat)}`;
}

// --- the cursor and its keys (ux §4.5, wave3 task) ---------------------------------------------------

export interface StaffCursor {
  /** Where the next note goes (cycles). */
  onset: Rat;
  /** The ghost note's diatonic number. */
  dia: number;
  /** The duration the next note takes. */
  dur: string;
  /** Onset of the note the last letter placed: `#`, `-` right after a letter alter it ("E" then "-" = E♭). */
  last: Rat | null;
}

/** Where a fresh cursor starts: bar 1, beat 1, on the middle line of the clef, the palette's longest value. */
export function initialCursor(spec: StaffSpec): StaffCursor {
  const middle = spec.clef === "bass" ? TOP_LINE_DIA.bass - 4 : TOP_LINE_DIA.treble - 4; // B4 treble, D3 bass; grand: B4
  const ds = paletteDurations(spec);
  const quarter = ds.find((d) => d.token === "4");
  return { onset: [0, 1], dia: middle, dur: (quarter ?? (ds[0] as DurationToken)).token, last: null };
}

export interface StaffKeyInput {
  key: string;
  shift?: boolean;
  alt?: boolean;
  mod?: boolean;
}

export interface StaffKeyResult {
  cursor: StaffCursor;
  edit?: StaffEdit;
  /** MIDI notes to sound (every placement and pitch change sounds). */
  play?: number[];
  /** What a screen reader hears. */
  say?: string;
}

export interface StaffKeyContext {
  spec: StaffSpec;
  ctx: NoteListContext;
  notes: readonly StaffNote[];
}

/** Total length of the answer in cycles. */
export function totalCycles(ctx: NoteListContext): Rat {
  return rat(ctx.bars);
}

function clampOnset(onset: Rat, k: StaffKeyContext): Rat {
  const grid = gridCycles(k.spec, k.ctx.meter);
  const last = R.sub(totalCycles(k.ctx), grid);
  if (R.lt(onset, [0, 1])) return [0, 1];
  if (R.lt(last, onset)) return last;
  return onset;
}

function retarget(cursor: StaffCursor, k: StaffKeyContext): StaffCursor {
  const on = noteAtOnset(k.notes, cursor.onset);
  return on?.pitches[0] ? { ...cursor, dia: on.pitches[0].dia } : cursor;
}

/**
 * The chord grammar (`palette.chords`): the cursor stays on a chord while it is built. A letter adds that note to
 * the chord at the cursor, the nearest one ABOVE its top note (`Shift` + letter: BELOW its bass), with the chord's
 * length; on an empty place it starts a chord with the chosen length. `↑`/`↓` (`Shift`: a half step, `Mod`: an
 * octave), `#`/`-`/`=` and `Backspace`/`Delete` act on the chord's note on the ghost's line, else its top note.
 * `→` steps past the chord, `←` back to the chord before. Every change plays the whole chord. `undefined`: the
 * plain grammar handles the key (lengths, rests, Home/End).
 */
function chordKey(
  cursor: StaffCursor,
  input: StaffKeyInput,
  k: StaffKeyContext,
): StaffKeyResult | null | undefined {
  const { spec, ctx } = k;
  const key = input.key;
  const meter = ctx.meter;
  const chords = staffChords(k.notes);
  const chord = chords.find((c) => R.eq(c.onset, cursor.onset)) ?? null;
  const sounding = (c: StaffChord | null, extra: number[] = [], drop: number | null = null) => [
    ...(c?.pitches.filter((_, i) => i !== drop).map((p) => p.midi) ?? []),
    ...extra,
  ];
  const landOn = (onset: Rat): StaffKeyResult => {
    const at = chords.find((c) => R.eq(c.onset, onset));
    const top = at?.pitches[at.pitches.length - 1];
    return {
      cursor: { ...cursor, onset, dia: top ? top.dia : cursor.dia, last: null },
      say: at ? `On ${describeChord(at)}` : `${describePlace(onset, meter)}, empty`,
    };
  };
  if ((key === "ArrowLeft" || key === "ArrowRight") && !input.mod && !input.alt && !input.shift) {
    if (key === "ArrowRight" && chord) return landOn(clampOnset(R.add(chord.onset, chord.dur), k));
    if (key === "ArrowLeft") {
      const before = [...chords].reverse().find((c) => R.lt(c.onset, cursor.onset));
      if (before) return landOn(before.onset);
    }
    return undefined;
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (input.alt || !chord) return undefined;
    const i = pickInChord(chord, cursor.dia);
    const p = chord.pitches[i] as StaffPitch;
    const id = chord.eventIds[i] as string;
    const dir = key === "ArrowUp" ? 1 : -1;
    if (input.shift) {
      if (!spec.palette.accidentals) return { cursor, say: "This answer has no sharps or flats to add." };
      const alt = Math.max(-2, Math.min(2, p.alt + dir)) as -2 | -1 | 0 | 1 | 2;
      const np = pitchAt(p.dia, null, alt);
      return {
        cursor: { ...cursor, dia: p.dia, last: null },
        edit: { op: "accidental", eventId: id, alt },
        play: sounding(chord, [np.midi], i),
        say: np.display,
      };
    }
    const dia = p.dia + dir * (input.mod ? 7 : 1);
    const np = input.mod ? pitchAt(dia, null, p.alt) : pitchAt(dia, ctx.key);
    if (chord.pitches.some((q, j) => j !== i && q.midi === np.midi))
      return { cursor, say: `${np.display} is already in the chord.` };
    return {
      cursor: { ...cursor, dia, last: null },
      edit: { op: "repitch", eventId: id, pitch: np.name },
      play: sounding(chord, [np.midi], i),
      say: `Moved to ${np.display}`,
    };
  }
  if (input.mod || input.alt) return undefined;
  if (key === "#" || key === "+" || key === "-" || key === "=") {
    const target = (cursor.last ? chords.find((c) => R.eq(c.onset, cursor.last as Rat)) : null) ?? chord;
    if (!target) return { cursor, say: "Put the cursor on a chord first." };
    if (!spec.palette.accidentals) return { cursor, say: "This answer has no sharps or flats to add." };
    const i = pickInChord(target, cursor.dia);
    const p = target.pitches[i] as StaffPitch;
    const alt = (key === "=" ? 0 : Math.max(-2, Math.min(2, p.alt + (key === "-" ? -1 : 1)))) as
      | -2
      | -1
      | 0
      | 1
      | 2;
    const np = pitchAt(p.dia, null, alt);
    return {
      cursor: { ...cursor, last: cursor.last },
      edit: { op: "accidental", eventId: target.eventIds[i] as string, alt },
      play: sounding(target, [np.midi], i),
      say: np.display,
    };
  }
  if (/^[a-gA-G]$/.test(key)) {
    if (chord) {
      const top = chord.pitches[chord.pitches.length - 1] as StaffPitch;
      const low = chord.pitches[0] as StaffPitch;
      const li = LETTERS.indexOf(key.toUpperCase());
      // Above the top note (or below the bass with Shift): the first such letter strictly beyond it.
      let dia: number;
      if (input.shift) {
        dia = Math.floor(low.dia / 7) * 7 + li;
        while (dia >= low.dia) dia -= 7;
      } else {
        dia = Math.floor(top.dia / 7) * 7 + li;
        while (dia <= top.dia) dia += 7;
      }
      const p = pitchAt(dia, ctx.key);
      if (chord.pitches.some((q) => q.midi === p.midi))
        return { cursor, say: `${p.display} is already in the chord.` };
      return {
        cursor: { ...cursor, dia, last: cursor.onset },
        edit: { op: "insert", onset: chord.onset, dur: chord.dur, pitch: p.name, keep: true },
        play: sounding(chord, [p.midi]),
        say: `${p.display} added. The chord: ${[...chord.pitches, p]
          .sort((a, b) => a.midi - b.midi)
          .map((q) => q.display)
          .join(" ")}`,
      };
    }
    const d = parseDuration(cursor.dur) ?? (paletteDurations(spec)[0] as DurationToken);
    const len = durCycles(d, meter);
    if (R.lt(totalCycles(ctx), R.add(cursor.onset, len)))
      return { cursor, say: `No room for a ${durationName(d)} here. Pick a shorter value or move left.` };
    const dia = nearestLetter(key, cursor.dia);
    const p = pitchAt(dia, ctx.key);
    return {
      cursor: { ...cursor, dia, last: cursor.onset },
      edit: { op: "insert", onset: cursor.onset, dur: len, pitch: p.name },
      play: [p.midi],
      say: `${p.display}, ${durationName(d)}, ${describePlace(cursor.onset, meter)}: a new chord. Add its other notes.`,
    };
  }
  if (key === "Backspace" || key === "Delete") {
    let target = chord;
    if (!target && key === "Backspace")
      target = [...chords].reverse().find((c) => R.lt(c.onset, cursor.onset)) ?? null;
    if (!target) return { cursor, say: "No note to delete here." };
    const i = target === chord ? pickInChord(target, cursor.dia) : target.pitches.length - 1;
    const p = target.pitches[i] as StaffPitch;
    const left = target.pitches.filter((_, j) => j !== i);
    const nextTop = left[left.length - 1];
    return {
      cursor: { ...cursor, onset: target.onset, dia: nextTop ? nextTop.dia : p.dia, last: null },
      edit: { op: "delete", eventId: target.eventIds[i] as string },
      ...(left.length ? { play: left.map((q) => q.midi) } : {}),
      say: `Deleted ${p.display}${left.length ? `; the chord has ${left.length === 1 ? "one note" : `${left.length} notes`}` : ""}`,
    };
  }
  return undefined;
}

/**
 * The staff's keyboard grammar. Letters `A`–`G` place the nearest such note at the cursor (the key signature
 * applies) and step on; `#`/`+` sharpen, `-` flattens, `=` naturals the note just placed (else the one under the
 * cursor);
 * `←`/`→` move by the grid; `↑`/`↓` move the ghost by a step, or the note under the cursor (`Shift` a
 * semitone, `Mod` an octave); `2`–`6` set the length (and resize the note under the cursor), `.` dots it;
 * `0` writes a rest; `Backspace` deletes the note under or before the cursor, `Delete` the one under it.
 * `Enter` is not handled here: it checks (the answer frame). Returns `null` for keys it does not take.
 */
export function staffKey(
  cursor: StaffCursor,
  input: StaffKeyInput,
  k: StaffKeyContext,
): StaffKeyResult | null {
  const { spec, ctx } = k;
  const key = input.key;
  const meter = ctx.meter;
  const grid = gridCycles(spec, meter);
  const under = noteAtOnset(k.notes, cursor.onset);
  const lastNote = cursor.last ? noteAtOnset(k.notes, cursor.last) : null;
  if (spec.palette.chords === true) {
    const r = chordKey(cursor, input, k);
    if (r !== undefined) return r;
  }
  const moved = (c: StaffCursor): StaffKeyResult => {
    const next = retarget({ ...c, last: null }, k);
    const at = noteAtOnset(k.notes, next.onset);
    return {
      cursor: next,
      say: at
        ? `On ${describeNote(at)}`
        : `${describePlace(next.onset, meter)}, ${pitchAt(next.dia, ctx.key).display}`,
    };
  };

  if (key === "ArrowLeft" || key === "ArrowRight") {
    if (input.mod || input.alt) return null;
    const dir = key === "ArrowLeft" ? -1 : 1;
    const by = input.shift ? rat(1) : grid;
    return moved({ ...cursor, onset: clampOnset(R.add(cursor.onset, R.mul(by, rat(dir))), k) });
  }
  if (key === "Home" || key === "End") {
    return moved({ ...cursor, onset: key === "Home" ? [0, 1] : clampOnset(totalCycles(ctx), k) });
  }
  if (key === "ArrowUp" || key === "ArrowDown") {
    if (input.alt) return null;
    const dir = key === "ArrowUp" ? 1 : -1;
    if (under?.pitches[0] && under.eventIds[0]) {
      const p = under.pitches[0];
      if (input.shift) {
        if (!spec.palette.accidentals) return { cursor, say: "This answer has no sharps or flats to add." };
        const alt = Math.max(-2, Math.min(2, p.alt + dir)) as -2 | -1 | 0 | 1 | 2;
        const np = pitchAt(p.dia, null, alt);
        return {
          cursor: { ...cursor, last: null },
          edit: { op: "accidental", eventId: under.eventIds[0], alt },
          play: [np.midi],
          say: `${np.display}`,
        };
      }
      const dia = p.dia + dir * (input.mod ? 7 : 1);
      const np = input.mod ? pitchAt(dia, null, p.alt) : pitchAt(dia, ctx.key);
      return {
        cursor: { ...cursor, dia, last: null },
        edit: { op: "repitch", eventId: under.eventIds[0], pitch: np.name },
        play: [np.midi],
        say: `Moved to ${np.display}`,
      };
    }
    const dia = cursor.dia + dir * (input.mod ? 7 : 1);
    return { cursor: { ...cursor, dia, last: null }, say: pitchAt(dia, ctx.key).display };
  }
  if (input.mod || input.alt) return null;

  // Accidentals: on the note a letter just placed (`E` then `-` = E♭), else on the note under the cursor. (`b` is
  // always the note B: "g a b" must write G A B.)
  const accidental = (delta: number | "natural"): StaffKeyResult | null => {
    const target = lastNote ?? under;
    if (!target?.pitches[0] || !target.eventIds[0]) return null;
    if (!spec.palette.accidentals) return { cursor, say: "This answer has no sharps or flats to add." };
    const p = target.pitches[0];
    const alt = (delta === "natural" ? 0 : Math.max(-2, Math.min(2, p.alt + delta))) as -2 | -1 | 0 | 1 | 2;
    const np = pitchAt(p.dia, null, alt);
    return {
      cursor: { ...cursor, last: null },
      edit: { op: "accidental", eventId: target.eventIds[0], alt },
      play: [np.midi],
      say: np.display,
    };
  };
  if (key === "#" || key === "+") return accidental(1) ?? { cursor, say: "Put the cursor on a note first." };
  if (key === "-") return accidental(-1) ?? { cursor, say: "Put the cursor on a note first." };
  if (key === "=") return accidental("natural") ?? { cursor, say: "Put the cursor on a note first." };

  if (/^[a-gA-G]$/.test(key)) {
    const d = parseDuration(cursor.dur) ?? (paletteDurations(spec)[0] as DurationToken);
    const len = durCycles(d, meter);
    if (R.lt(totalCycles(ctx), R.add(cursor.onset, len)))
      return { cursor, say: `No room for a ${durationName(d)} here. Pick a shorter value or move left.` };
    const dia = nearestLetter(key, cursor.dia);
    const p = pitchAt(dia, ctx.key);
    const next = clampOnset(R.add(cursor.onset, len), k);
    const atEnd = R.eq(R.add(cursor.onset, len), totalCycles(ctx));
    return {
      cursor: { onset: atEnd ? cursor.onset : next, dia, dur: cursor.dur, last: cursor.onset },
      edit: { op: "insert", onset: cursor.onset, dur: len, pitch: p.name },
      play: [p.midi],
      say: `${p.display}, ${durationName(d)}, ${describePlace(cursor.onset, meter)}`,
    };
  }
  if (/^[2-6]$/.test(key)) {
    const token = DIGIT_DURATION[key] as string;
    const allowed = paletteDurations(spec);
    const d = allowed.find((x) => x.token === token) ?? allowed.find((x) => x.base === Number(token));
    if (!d)
      return { cursor, say: `This answer has no ${durationName({ base: Number(token), dots: 0 })} notes.` };
    if (under?.eventIds[0]) {
      const len = durCycles(d, meter);
      if (R.lt(totalCycles(ctx), R.add(under.onset, len)))
        return { cursor, say: `No room for a ${durationName(d)} here.` };
      return {
        cursor: { ...cursor, dur: d.token, last: null },
        edit: { op: "resize", eventId: under.eventIds[0], dur: len },
        say: `${durationName(d)}`,
      };
    }
    return { cursor: { ...cursor, dur: d.token }, say: `Next note: ${durationName(d)}` };
  }
  if (key === ".") {
    const cur = parseDuration(cursor.dur);
    if (!cur) return null;
    const want = cur.dots > 0 ? String(cur.base) : `${cur.base}.`;
    const allowed = paletteDurations(spec).find((x) => x.token === want);
    if (!allowed) return { cursor, say: "This answer has no dotted notes." };
    return { cursor: { ...cursor, dur: want }, say: `Next note: ${durationName(allowed)}` };
  }
  if (key === "0") {
    if (!spec.palette.rests) return { cursor, say: "This answer has no rests to write." };
    const d = parseDuration(cursor.dur) ?? (paletteDurations(spec)[0] as DurationToken);
    const len = durCycles(d, meter);
    if (R.lt(totalCycles(ctx), R.add(cursor.onset, len)))
      return { cursor, say: "No room for that rest here." };
    return {
      cursor: { ...cursor, onset: clampOnset(R.add(cursor.onset, len), k), last: null },
      edit: { op: "rest", onset: cursor.onset, dur: len },
      say: `${durationName(d)} rest, ${describePlace(cursor.onset, meter)}`,
    };
  }
  if (key === "Backspace" || key === "Delete") {
    let target = under;
    if (!target && key === "Backspace")
      target = [...k.notes].reverse().find((n) => R.lt(n.onset, cursor.onset)) ?? null;
    if (!target?.eventIds[0]) return { cursor, say: "No note to delete here." };
    return {
      cursor: { ...cursor, onset: target.onset, last: null },
      edit: { op: "delete", eventId: target.eventIds[0] },
      say: `Deleted ${describeNote(target)}`,
    };
  }
  return null;
}

// --- pointer → (onset, pitch) ------------------------------------------------------------------------

/** An engraved item's x on the staff and the onset it stands for (notes and rests; whole-bar rests excluded). */
export interface OnsetAnchor {
  x: number;
  onset: Rat;
}

/** Piecewise-linear x of an onset inside a bar, through the engraved items' anchors. */
export function xOfOnset(
  bar: { x0: number; x1: number; cycle: number },
  anchors: readonly OnsetAnchor[],
  onset: Rat,
): number {
  const inside = anchors
    .map((a) => ({ x: a.x, t: R.toNum(a.onset) }))
    .filter((a) => a.t >= bar.cycle && a.t < bar.cycle + 1 && a.x > bar.x0 && a.x < bar.x1);
  const pts: { x: number; t: number }[] = inside[0]?.t === bar.cycle ? [] : [{ x: bar.x0, t: bar.cycle }];
  for (const a of inside) if (pts.length === 0 || a.x > (pts.at(-1) as { x: number }).x) pts.push(a);
  pts.push({ x: bar.x1, t: bar.cycle + 1 });
  const t = R.toNum(onset);
  for (let i = 0; i < pts.length; i++) {
    const b = pts[i] as { x: number; t: number };
    if (t === b.t) return b.x;
    if (t < b.t) {
      const a = pts[i - 1];
      return a ? a.x + ((t - a.t) / (b.t - a.t)) * (b.x - a.x) : b.x;
    }
  }
  return bar.x1;
}

/** The grid slot nearest to `x` in a bar: its onset and x. */
export function snapX(
  bar: { x0: number; x1: number; cycle: number },
  anchors: readonly OnsetAnchor[],
  x: number,
  grid: Rat,
): { onset: Rat; x: number } {
  const steps = Math.max(1, Math.round(1 / R.toNum(grid)));
  let best = { onset: rat(bar.cycle) as Rat, x: bar.x0, d: Number.POSITIVE_INFINITY };
  for (let k = 0; k < steps; k++) {
    const onset = R.add(rat(bar.cycle), R.mul(grid, rat(k)));
    const sx = xOfOnset(bar, anchors, onset);
    const d = Math.abs(sx - x);
    if (d < best.d) best = { onset, x: sx, d };
  }
  return { onset: best.onset, x: best.x };
}

export interface PointerHit {
  band: StaffBandGeometry;
  onset: Rat;
  /** Where the ghost note is drawn. */
  x: number;
  y: number;
  step: number;
  pitch: StaffPitch;
}

/** Pointer (in the geometry's coordinates) → a snapped place and a pitch on lines and spaces; `null` outside. */
export function pointerHit(
  geom: StaffGeometry,
  anchors: readonly OnsetAnchor[],
  point: { x: number; y: number },
  spec: StaffSpec,
  meter: MeterSpec,
): PointerHit | null {
  const band = staffAt(geom, point.y);
  if (!band || band.clef === "perc") return null;
  const bar =
    band.bars.find((b) => point.x >= b.x0 && point.x < b.x1) ??
    (point.x >= (band.bars.at(-1)?.x1 ?? Number.POSITIVE_INFINITY) ? band.bars.at(-1) : undefined) ??
    (point.x < (band.bars[0]?.x0 ?? 0) - 24 ? undefined : band.bars[0]);
  if (!bar) return null;
  const snapped = snapX(bar, anchors, point.x, gridCycles(spec, meter));
  const step = Math.round(((point.y - band.topLineY) * 2) / band.lineSpacing);
  const clamped = Math.max(-8, Math.min(16, step));
  const dia = TOP_LINE_DIA[band.clef] - clamped;
  return {
    band,
    onset: snapped.onset,
    x: snapped.x,
    y: band.topLineY + (clamped * band.lineSpacing) / 2,
    step: clamped,
    pitch: pitchAt(dia, spec.key ?? null),
  };
}

/** The band a pitch is drawn on (by clef; the first system holding the onset's bar). */
export function bandFor(geom: StaffGeometry, clef: "treble" | "bass", onset: Rat): StaffBandGeometry | null {
  const cycle = R.floor(onset);
  return (
    geom.staves.find((s) => s.clef === clef && s.bars.some((b) => b.cycle === cycle)) ??
    geom.staves.find((s) => s.clef === clef) ??
    null
  );
}

/** Translate a geometry measured in client pixels into the host's own coordinates. */
export function localGeometry(geom: StaffGeometry, origin: { x: number; y: number }): StaffGeometry {
  const dx = -origin.x;
  const dy = -origin.y;
  return {
    staves: geom.staves.map((s) => ({
      ...s,
      topLineY: s.topLineY + dy,
      y0: s.y0 + dy,
      y1: s.y1 + dy,
      bars: s.bars.map((b) => ({ ...b, x0: b.x0 + dx, x1: b.x1 + dx })),
    })),
    notes: geom.notes.map((n) => ({
      ...n,
      box: { ...n.box, x: n.box.x + dx, y: n.box.y + dy },
      heads: n.heads.map((h) => ({ ...h, x: h.x + dx, y: h.y + dy })),
    })),
  };
}
