// `evaluate_strudel` output for the tutor (contracts §10.3): per track, the first 64 events with bar,
// beat, length in beats, spelled pitch, scale degree, sound and chord symbol. Unredacted: the tutor's
// executors redact it. Pure, so the server and tests can build it from any EvalResult.
import type { NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { barPosition, degreeOf, METERS, parseChordSymbol, spellMidi } from "@oak/theory";
import { normalize } from "../normalize/nevent.ts";
import type { EvalResult, NormalizeContext, TutorEvalView } from "../types.ts";
import { keyOfEvent } from "./tracks.ts";

/** Most events listed per track; `totalEvents` keeps the real count. */
export const TUTOR_EVENTS_PER_TRACK = 64;

const round = (x: number, d = 3): number => Math.round(x * 10 ** d) / 10 ** d;

function eventView(e: NEvent, ctx: NormalizeContext): TutorEvalView["tracks"][number]["events"][number] {
  const meter = METERS[ctx.meter];
  const pos = barPosition(e.onset, ctx.meter, ctx.pickup);
  const key = keyOfEvent(e, ctx);
  const chordId = e.chordSymbol ? parseChordSymbol(e.chordSymbol) : null;
  let pitch: string | null = null;
  let degree: string | null = null;
  if (e.midi !== null && !e.drum) {
    pitch = spellMidi(e.midi, { key, ...(chordId ? { chord: chordId } : {}) }).name;
    if (key) degree = degreeOf(e.midi, key).degree;
  }
  return {
    bar: pos.bar,
    beat: round(pos.beat),
    durBeats: round(R.toNum(e.dur) * meter.unitsPerBar),
    pitch,
    degree,
    sound: e.s ? (e.bank ? `${e.bank}:${e.s}` : e.s) : null,
    chord: e.chordSymbol ?? null,
  };
}

/** `evaluate_strudel` output (≤ 64 events per track), before redaction. */
export function toTutorEvalView(result: EvalResult, ctx: NormalizeContext): TutorEvalView {
  if (!result.ok) {
    return {
      ok: false,
      error: { kind: result.error.kind, message: result.error.message, line: result.error.line ?? null },
      tempo: null,
      tracks: [],
      warnings: (result.lint?.diagnostics ?? []).filter((d) => d.severity !== "error").map((d) => d.id),
      lockedTools: [...(result.lint?.lockedTools ?? [])],
    };
  }
  const n = normalize(result, ctx);
  const roleOf = new Map<string, string>();
  for (const [role, track] of Object.entries(n.roles))
    if (track && !roleOf.has(track)) roleOf.set(track, role);
  const tracks = result.tracks
    .filter((t) => (n.byTrack[t]?.length ?? 0) > 0)
    .map((label) => {
      const events = n.byTrack[label] ?? [];
      return {
        label,
        role: roleOf.get(label) ?? (label.startsWith("band.") ? "band" : "other"),
        totalEvents: events.length,
        events: events.slice(0, TUTOR_EVENTS_PER_TRACK).map((e) => eventView(e, ctx)),
      };
    });
  const warnings = [
    ...new Set(result.diagnostics.filter((d) => d.severity !== "error").map((d) => d.id as string)),
  ];
  return {
    ok: true,
    error: null,
    tempo: { cps: result.cps, bpm: result.bpm, meter: ctx.meter },
    tracks,
    warnings,
    lockedTools: [...(result.lint?.lockedTools ?? [])],
  };
}
