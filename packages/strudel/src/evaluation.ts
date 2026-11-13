// What every evaluation in the adapter realm shares (editors and the hidden pattern player):
// - the `.p` wrapper installed in `beforeEval` (repl.evaluate re-injects `Pattern.prototype.p` first, so
//   this is the one place it is this repl's fresh collector): it tags every hap with its track and applies
//   UI mute and solo as a LIVE filter, never a code rewrite (contracts §6.2 rule 3);
// - the Band layer, evaluated separately and stacked as `band.<label>` (contracts §5.10);
// - the final `editPattern` step: Band stack, mute of untagged and Band haps, transposition, painter.
import * as core from "@strudel/core";
import { transpiler } from "@strudel/transpiler";
import { TRACK_KEY } from "./haps.ts";
import { isMuted, trackNameOf } from "./mutes.ts";
import type { MuteMap } from "./types.ts";

type Pattern = Strudel.Pattern;

export interface EvalSession {
  /** Labels the learner's code registered, in source order (`$0`, `drums`, …). */
  tracks: string[];
  /** The Band's tracks of this evaluation, already tagged `band.<label>`. */
  band: { track: string; pattern: Pattern }[];
  /** The repl's own evaluation error (onEvalError), if any. */
  error: unknown;
  anonymous: number;
}

export function newSession(): EvalSession {
  return { tracks: [], band: [], error: null, anonymous: 0 };
}

type ContextFn = (fn: (context: Record<string, unknown>) => Record<string, unknown>) => Pattern;
const withContext = (
  pattern: Pattern,
  fn: (context: Record<string, unknown>) => Record<string, unknown>,
): Pattern => (pattern.withContext as ContextFn).call(pattern, fn);
const tag = (pattern: Pattern, track: string): Pattern =>
  withContext(pattern, (context) => ({ ...context, [TRACK_KEY]: track }));

/**
 * Wraps the `.p` the repl just injected. Muted-in-code labels (`_x`, `x_`) and non-strings pass through
 * untouched; every other label is tagged and filtered live by `mutes()`.
 */
export function installTrackWrapper(session: EvalSession, mutes: () => MuteMap): void {
  const proto = core.Pattern.prototype as Record<string, unknown>;
  const injected = proto.p as (this: Pattern, id: unknown) => Pattern;
  proto.p = function (this: Pattern, id: unknown): Pattern {
    if (typeof id !== "string") return injected.call(this, id);
    const { track } = trackNameOf(id, session.anonymous);
    if (track === null) return injected.call(this, id);
    if (id.includes("$")) session.anonymous++;
    session.tracks.push(track);
    const live = tag(this, track).filterHaps(() => !isMuted(track, mutes()));
    return injected.call(live, id);
  };
}

/**
 * Evaluates Band code with a private `.p` collector (it never reaches the repl's label map), keeping only
 * the roles the step asked for. Hap locations are dropped: they are offsets into the Band code, not into
 * the learner's editor.
 */
export async function evaluateBand(
  code: string,
  roles: readonly string[],
  session: EvalSession,
): Promise<void> {
  const proto = core.Pattern.prototype as Record<string, unknown>;
  const saved = proto.p;
  const collected: { label: string; pattern: Pattern }[] = [];
  proto.p = function (this: Pattern, id: unknown): Pattern {
    if (typeof id === "string" && !id.startsWith("_") && !id.endsWith("_") && !id.includes("$")) {
      collected.push({ label: id, pattern: this });
    }
    return this;
  };
  try {
    await core.evaluate(code, transpiler, { id: "oak_band_", emitWidgets: false });
  } finally {
    proto.p = saved;
  }
  for (const { label, pattern } of collected) {
    if (roles.length > 0 && !roles.includes(label)) continue;
    const track = `band.${label}`;
    const clean = withContext(pattern, (context) => ({ ...context, locations: [], [TRACK_KEY]: track }));
    session.band.push({ track, pattern: clean });
  }
}

/** A MIDI number for a note value: numbers pass, names go through Strudel's own `noteToMidi`. */
export function midiOfNote(note: unknown): number | null {
  if (typeof note === "number" && Number.isFinite(note)) return note;
  if (typeof note === "string") {
    try {
      const midi = core.noteToMidi(note) as number;
      return Number.isFinite(midi) ? midi : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** Transposes every hap that carries a `note` (drums carry none and pass untouched). */
export function transposeValue(value: unknown, semitones: number): unknown {
  if (semitones === 0 || !value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = value as Record<string, unknown>;
  if (v.note === undefined) return value;
  const midi = midiOfNote(v.note);
  return midi === null ? value : { ...v, note: midi + semitones };
}

export interface FinalizeOptions {
  session: EvalSession;
  mutes: () => MuteMap;
  /** Live transposition in semitones (the pattern player). */
  transpose?: () => number;
  /** The track Oak's scope taps (`ScopeTap.setSource({ kind: "track" })`), read live; null for the master bus. */
  scopeTrack?: () => string | null;
}

/** Superdough's analyser id the scope's track source reads (`analyze` on a hap sends its voice there). */
export const SCOPE_TRACK_ANALYSER = "oak.scope.track";
/** superdough sizes an `analyze` analyser as 2^(fft + 5): 6 gives the master analyser's 2048. */
export const SCOPE_TRACK_FFT = 6;

/** Sends the voices of one track, live, to the scope's track analyser too (pre-reverb, post-filter). */
export function tapTrack(pattern: Pattern, scopeTrack: () => string | null): Pattern {
  return (pattern.withHap as (fn: (hap: Strudel.Hap) => Strudel.Hap) => Pattern).call(pattern, (hap) => {
    const label = scopeTrack();
    if (label === null || hap.context[TRACK_KEY] !== label) return hap;
    const v = hap.value;
    if (!v || typeof v !== "object" || Array.isArray(v)) return hap;
    return (hap as unknown as { withValue(f: (x: unknown) => unknown): Strudel.Hap }).withValue((x) => ({
      ...(x as Record<string, unknown>),
      analyze: SCOPE_TRACK_ANALYSER,
      fft: SCOPE_TRACK_FFT,
    }));
  });
}

/**
 * The `editPattern` step: stack the Band, mute untagged (`main`) and Band haps live, transpose live.
 * The painter is added by the caller, last, so that nothing after it drops the painters.
 */
export function finalizePattern(pattern: Pattern, opts: FinalizeOptions): Pattern {
  let out = pattern;
  if (opts.session.band.length > 0)
    out = core.stack(out, ...opts.session.band.map((b) => b.pattern)) as Pattern;
  out = out.filterHaps((hap) => {
    const track = hap.context[TRACK_KEY];
    if (typeof track !== "string") return !isMuted("main", opts.mutes());
    return track.startsWith("band.") ? !isMuted(track, opts.mutes()) : true;
  });
  const transpose = opts.transpose;
  if (transpose) out = out.fmap((value) => transposeValue(value, transpose()));
  if (opts.scopeTrack) out = tapTrack(out, opts.scopeTrack);
  return out;
}
