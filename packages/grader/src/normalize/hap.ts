// Hap → OakEvent: the JSON-safe, unnormalized event that leaves the realm (a raw Hap carries BigInt
// fractions and cannot be posted or stringified).
//
// Pitch rules (architecture §2.3, superdough's getFrequencyFromValue; executed in spike S1):
//   a number value is MIDI; a note-like string value goes through noteToMidi (default octave 3);
//   in an object, `freq` wins over `note`; a string `note` → noteToMidi; a numeric `note` is MIDI;
//   `n` without a note is a sample index / unresolved degree → midi null;
//   the `octave` control adds 12 per step (superdough multiplies the frequency by 2^octave).
// Never `getPlayableNoteValue` (it throws), and never display `value.note` (`.scale()` misspells).
import {
  CHORD_CONTEXT_KEY,
  CHORD_VALUE_KEY,
  DICT_CONTEXT_KEY,
  TRACK_KEY,
  VOICED_CONTEXT_KEY,
} from "../runtime/realm.ts";
import { core, type Hap } from "../runtime/strudel.ts";
import type { OakEvent } from "../types.ts";

type Pitch = Pick<OakEvent, "midi" | "pitchSource" | "note" | "freq">;

const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

function noteMidi(text: string): number | null {
  if (!core.isNote(text)) return null;
  try {
    const m = core.noteToMidi(text);
    return Number.isFinite(m) ? m : null;
  } catch {
    return null;
  }
}

/**
 * Longest text an event carries in one field. Evaluated code can put a megabyte string into every hap
 * (`pure({ s: "x".repeat(1e6) })`); every event is serialized back to the host, so one field is bounded.
 */
export const MAX_EVENT_TEXT = 1024;
export const capText = (x: string): string => (x.length > MAX_EVENT_TEXT ? x.slice(0, MAX_EVENT_TEXT) : x);

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function pitchOf(value: unknown): Pitch {
  if (typeof value === "number") {
    return { midi: Number.isFinite(value) ? value : null, pitchSource: "value", note: value, freq: null };
  }
  if (typeof value === "string") {
    const midi = noteMidi(value);
    return midi === null
      ? { midi: null, pitchSource: "none", note: null, freq: null }
      : { midi, pitchSource: "value", note: capText(value), freq: null };
  }
  if (typeof value !== "object" || value === null)
    return { midi: null, pitchSource: "none", note: null, freq: null };
  const v = value as Record<string, unknown>;
  const note = typeof v.note === "string" ? capText(v.note) : typeof v.note === "number" ? v.note : null;
  const octave = num(v.octave) ?? 0;
  const freq = num(v.freq);
  let out: Pitch;
  if (freq !== null && freq > 0) {
    out = { midi: round6(core.freqToMidi(freq)), pitchSource: "freq", note, freq };
  } else if (typeof v.note === "string") {
    out = { midi: noteMidi(v.note), pitchSource: "note-str", note, freq: null };
  } else if (typeof v.note === "number") {
    out = { midi: Number.isFinite(v.note) ? v.note : null, pitchSource: "note-num", note, freq: null };
  } else if (typeof v.n === "number" || typeof v.n === "string") {
    out = { midi: null, pitchSource: "n-index", note: null, freq: null };
  } else {
    out = { midi: null, pitchSource: "none", note: null, freq: null };
  }
  if (out.midi !== null && octave !== 0) out = { ...out, midi: round6(out.midi + 12 * octave) };
  return out;
}

/**
 * Wave 5. The sound controls an event keeps (`NEvent.controls`), by Strudel's value key: what the `controls`
 * matcher ("match this sound", A1) and the probes compare. Pitch, rhythm and sample controls are elsewhere.
 */
export const SOUND_CONTROL_KEYS = [
  "cutoff",
  "resonance",
  "hcutoff",
  "hresonance",
  "bandf",
  "bandq",
  "ftype",
  "lpenv",
  "lpattack",
  "lpdecay",
  "lpsustain",
  "lprelease",
  "attack",
  "decay",
  "sustain",
  "release",
  "room",
  "roomsize",
  "delay",
  "delaytime",
  "delayfeedback",
  "distort",
  "shape",
  "crush",
  "coarse",
  "pan",
  "orbit",
  "vowel",
  "partials",
] as const;

/** The sound controls a hap value sets, or `undefined` when it sets none. */
export function soundControlsOf(obj: Record<string, unknown>): Record<string, number | string> | undefined {
  let out: Record<string, number | string> | undefined;
  for (const k of SOUND_CONTROL_KEYS) {
    const v = obj[k];
    let x: number | string | null = null;
    if (typeof v === "number" && Number.isFinite(v)) x = v;
    else if (typeof v === "string") x = capText(v);
    else if (
      Array.isArray(v) &&
      v.length <= 64 &&
      v.every((y) => typeof y === "number" && Number.isFinite(y))
    )
      x = v.join(",");
    if (x === null) continue;
    out ??= {};
    out[k] = x;
  }
  return out;
}

/** Where each mini-notation literal of the code sits and which call it is an argument of. */
export interface LiteralRole {
  start: number;
  end: number;
  fn: string | null;
}

/**
 * Whether a voiced note was moved to another pitch class after `voicing()` / `rootNotes()` (`.note("c#4")`,
 * `.transpose(1)`, `.add(note(5))`): its chord symbol then names notes that no longer sound. An octave move
 * keeps the pitch class and the symbol.
 */
export function voicedAway(midi: number | null, voiced: unknown): boolean {
  if (midi === null || (typeof voiced !== "string" && typeof voiced !== "number")) return false;
  const was = pitchOf(voiced).midi;
  if (was === null) return false;
  const pc = (x: number): number => ((Math.round(x) % 12) + 12) % 12;
  return pc(midi) !== pc(was);
}

export function hapToEvent(
  hap: Hap,
  fallbackTrack: string,
  code: string,
  roles: readonly LiteralRole[],
): OakEvent {
  const whole = hap.whole as NonNullable<Hap["whole"]>;
  const v = hap.value;
  const obj = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  const ctx = hap.context ?? {};
  const str = (x: unknown): string | null => (typeof x === "string" ? capText(x) : null);
  const clip = num(obj.clip) ?? num(obj.legato);
  const chord = str(obj[CHORD_VALUE_KEY]) ?? str(obj.chord) ?? str(ctx[CHORD_CONTEXT_KEY]);
  const locations = (ctx.locations ?? []).map((l) => {
    const role = roles.find((r) => l.start >= r.start && l.end <= r.end);
    const text = code.slice(l.start, l.end).trim();
    return {
      start: l.start,
      end: l.end,
      ...(role?.fn ? { fn: role.fn } : {}),
      ...(text ? { text } : {}),
    };
  });
  const pitch = pitchOf(v);
  return {
    track: str(ctx[TRACK_KEY]) ?? fallbackTrack,
    begin: whole.begin.toFraction(),
    end: whole.end.toFraction(),
    beginF: whole.begin.valueOf(),
    endF: whole.end.valueOf(),
    ...pitch,
    ...(chord !== null && voicedAway(pitch.midi, ctx[VOICED_CONTEXT_KEY])
      ? { chordStale: true as const }
      : {}),
    ...(typeof ctx[DICT_CONTEXT_KEY] === "string" ? { voicedWith: ctx[DICT_CONTEXT_KEY] as string } : {}),
    s: str(obj.s),
    n: typeof obj.n === "number" ? obj.n : typeof obj.n === "string" ? capText(obj.n) : null,
    bank: str(obj.bank),
    gain: num(obj.gain),
    velocity: num(obj.velocity),
    postgain: num(obj.postgain),
    clip,
    octave: num(obj.octave),
    chord,
    scale: str(ctx.scale),
    locations,
    ...((): { controls?: Record<string, number | string> } => {
      const c = soundControlsOf(obj);
      return c ? { controls: c } : {};
    })(),
  };
}

/** The one event order: (begin, track order, midi, end). `queryArc` is not time-sorted across cycles. */
export function sortOakEvents(events: OakEvent[], trackOrder: readonly string[]): OakEvent[] {
  const order = new Map(trackOrder.map((t, i) => [t, i]));
  return events.sort(
    (a, b) =>
      a.beginF - b.beginF ||
      (order.get(a.track) ?? 1e6) - (order.get(b.track) ?? 1e6) ||
      (a.midi ?? -1) - (b.midi ?? -1) ||
      a.endF - b.endF ||
      (a.s ?? "").localeCompare(b.s ?? ""),
  );
}
