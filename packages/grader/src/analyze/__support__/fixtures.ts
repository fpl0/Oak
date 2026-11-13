// TEST SUPPORT ONLY. Event fixtures for the matcher tests: hand-built `NEvent`s, a compact note-list
// builder, and real Strudel output through `@oak/grader/testing` turned into a `Normalized` with a light
// normalization (the production `normalize` lives with the realm and may still be under construction).

import type { DrumRole, NEvent, Rat } from "@oak/content-kit";
import { parseRat, R, rat } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import * as core from "@strudel/core";
import type { GradeDeps } from "../../grade/index.ts";
import { soundControlsOf } from "../../normalize/hap.ts";
import type { HeadlessResult } from "../../testing.ts";
import { evalHeadless } from "../../testing.ts";
import type { EvalOptions, EvalResult, EvalSuccess, NormalizeContext, Normalized } from "../../types.ts";
import { sortEvents, toRat } from "../events.ts";
import { normalizedFromEvents } from "../tracks.ts";

let counter = 0;
/** A hand-built event: `track`, `onset`, `dur` in cycles; defaults for the rest. */
export function ev(p: Partial<NEvent> & { onset: Rat; track?: string }): NEvent {
  const track = p.track ?? "mel";
  return {
    id: p.id ?? `${track}|${p.onset[0]}/${p.onset[1]}|${p.midi ?? p.s ?? p.chordSymbol ?? "x"}|${counter++}`,
    track,
    onset: p.onset,
    dur: p.dur ?? rat(1, 4),
    midi: p.midi ?? null,
    pitchSource: p.midi === undefined || p.midi === null ? "none" : "note-num",
    gain: p.gain ?? 0.8,
    locs: p.locs ?? [],
    ...(p.drum ? { drum: p.drum } : {}),
    ...(p.s ? { s: p.s } : {}),
    ...(p.chordSymbol ? { chordSymbol: p.chordSymbol } : {}),
    ...(p.scaleCtx ? { scaleCtx: p.scaleCtx } : {}),
    ...(p.clipDur ? { clipDur: p.clipDur } : {}),
  };
}

/**
 * A line of notes: `"60:1/4 62:1/4 ~:1/4 64:1/4"` — MIDI (or `~` for a rest) and a length in cycles,
 * laid end to end from `start`.
 */
export function line(track: string, spec: string, start: Rat = rat(0)): NEvent[] {
  let at = start;
  const out: NEvent[] = [];
  for (const tok of spec.trim().split(/\s+/)) {
    const [p, d] = tok.split(":") as [string, string | undefined];
    const dur = parseRat(d ?? "1/4");
    if (p !== "~") {
      for (const m of p.split(",")) out.push(ev({ track, onset: at, dur, midi: Number(m) }));
    }
    at = R.add(at, dur);
  }
  return out;
}
/** Drum hits of one role at in-cycle positions, repeated for `bars` bars. */
export function hits(track: string, drum: DrumRole, positions: string[], bars = 1, gain = 0.8): NEvent[] {
  const out: NEvent[] = [];
  for (let b = 0; b < bars; b++)
    for (const p of positions)
      out.push(ev({ track, onset: R.add(rat(b), parseRat(p)), dur: rat(1, 16), drum, s: drum, gain }));
  return out;
}

const DRUMS: Record<string, DrumRole> = {
  bd: "kick",
  sd: "snare",
  cp: "clap",
  rim: "rim",
  rm: "rim",
  hh: "hatClosed",
  oh: "hatOpen",
  lt: "tom",
  mt: "tom",
  ht: "tom",
  cr: "crash",
  rd: "ride",
  sh: "shaker",
};

// The production realm tags voiced notes with their chord symbol (contracts §6.7 item 2); do the same here.
let shimmed = false;
function shimVoicing(): void {
  if (shimmed) return;
  const proto = core.Pattern.prototype as unknown as Record<string, unknown>;
  const orig = proto.voicing as ((this: unknown, ...a: unknown[]) => unknown) | undefined;
  if (typeof orig !== "function") return;
  proto.voicing = function (this: { fmap(f: (v: unknown) => unknown): unknown }, ...args: unknown[]) {
    const tagged = this.fmap((v) =>
      v && typeof v === "object" && "chord" in v
        ? { ...(v as object), _oakChord: (v as { chord: unknown }).chord }
        : v,
    );
    return orig.apply(tagged, args);
  };
  shimmed = true;
}

/** Evaluates Strudel code headlessly and returns its events as a `Normalized` (roles inferred). */
export async function strudel(code: string, bars = 1): Promise<Normalized> {
  shimVoicing();
  const res = await evalHeadless(code, bars);
  return normalizedFromEvents(sortEvents(toNEvents(res)), { cps: res.cps });
}

/** Light normalization of headless events (test support; production uses the realm's `normalize`). */
export function toNEvents(res: HeadlessResult): NEvent[] {
  const counts = new Map<string, number>();
  return res.events.map((e) => {
    const v = e.value as Record<string, unknown>;
    const onset = parseRat(e.begin);
    const end = parseRat(e.end);
    const s = typeof v.s === "string" ? v.s : undefined;
    const bareS = s?.includes("_") ? s.slice(s.lastIndexOf("_") + 1) : s;
    const drum = bareS && e.midi === null ? (DRUMS[bareS] ?? undefined) : undefined;
    const chordSymbol =
      typeof v._oakChord === "string" ? v._oakChord : typeof v.chord === "string" ? v.chord : undefined;
    const midi =
      e.midi === null ? null : Math.round(e.midi + 12 * (typeof v.octave === "number" ? v.octave : 0));
    const gain =
      (typeof v.gain === "number" ? v.gain : 0.8) *
      (typeof v.velocity === "number" ? v.velocity : 1) *
      (typeof v.postgain === "number" ? v.postgain : 1);
    const base = `${e.track}|${R.floor(onset) + 1}|${onset[0]}/${onset[1]}|${midi ?? s ?? chordSymbol ?? ""}`;
    const k = counts.get(base) ?? 0;
    counts.set(base, k + 1);
    const clip = typeof v.clip === "number" ? v.clip : typeof v.legato === "number" ? v.legato : undefined;
    return {
      id: `${base}|${k}`,
      track: e.track,
      onset,
      dur: R.sub(end, onset),
      ...(clip !== undefined ? { clipDur: R.mul(R.sub(end, onset), toRat(clip)) } : {}),
      midi,
      pitchSource: midi === null ? "none" : typeof e.note === "string" ? "note-str" : "note-num",
      ...(chordSymbol ? { chordSymbol } : {}),
      ...(drum ? { drum } : {}),
      ...(s ? { s: bareS as string } : {}),
      gain,
      ...(e.scale ? { scaleCtx: e.scale } : {}),
      locs: e.locations.map((l) => ({ from: l.start, to: l.end })),
      ...((): { controls?: Record<string, number | string> } => {
        const c = soundControlsOf(v);
        return c ? { controls: c } : {};
      })(),
    } satisfies NEvent;
  });
}

/**
 * Grade-pipeline dependencies on the headless evaluator: no lint, no fuel. A syntax or query error comes
 * back as an `EvalFailure`, as the production realm does.
 */
export function headlessDeps(): GradeDeps {
  const raw = new Map<EvalSuccess, NEvent[]>();
  return {
    async evaluate(code: string, opts: EvalOptions): Promise<EvalResult> {
      shimVoicing();
      const t0 = Date.now();
      try {
        const res = await evalHeadless(code, opts.bars);
        const unitsPerBar = METERS[opts.meter ?? "4/4"].unitsPerBar;
        const ok: EvalSuccess = {
          ok: true,
          cps: res.cps,
          cpsSet: res.cpsSet,
          bpm: res.cps * 60 * unitsPerBar,
          tracks: res.tracks,
          events: [],
          miniLocations: [],
          logs: [],
          diagnostics: [],
          lint: null,
          bars: opts.bars,
          totalBars: null,
          truncated: false,
          fuelUsed: 0,
          ms: Date.now() - t0,
        };
        raw.set(ok, toNEvents(res));
        return ok;
      } catch (e) {
        return {
          ok: false,
          error: { kind: "eval", message: e instanceof Error ? e.message : String(e), line: 1 },
          logs: [],
          lint: null,
          ms: Date.now() - t0,
        };
      }
    },
    normalize(result: EvalSuccess, _ctx: NormalizeContext): Normalized {
      const n = normalizedFromEvents(sortEvents(raw.get(result) ?? []), { cps: result.cps, bpm: result.bpm });
      return n;
    },
  };
}

/** A `Normalized` from hand-built events. */
export const norm = (...groups: NEvent[][]): Normalized => normalizedFromEvents(groups.flat());
