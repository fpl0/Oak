// AudioPlans: trial events as values handed straight to `superdough()` (internal control names), with
// times in seconds relative to the plan start. `@oak/strudel` plays them with `playEvents` after
// preloading `preload`.
import type { KeySpec, MeterId, NEvent, Trial } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { tonicMidi } from "./kernel.ts";
import { drumKey } from "./pools.ts";
import type { AudioPlan, SuperdoughValue } from "./types.ts";

/** Events to an AudioPlan at `cps`. `fromBar`/`bars` cut a window; `rate` slows (<1) or speeds playback. */
export function eventsToAudioPlan(
  events: readonly NEvent[],
  cps: number,
  opts: {
    gain?: number;
    rate?: number;
    transpose?: number;
    fromBar?: number;
    bars?: number;
    /**
     * Sound controls per bar (superdough's internal names: `cutoff`, `resonance`, `attack`, `release`,
     * `room`, `delay`, …), indexed by the event's bar from 0; applied to every event of that bar.
     */
    controlsByBar?: readonly (Readonly<Record<string, number>> | null)[];
  } = {},
): AudioPlan {
  const rate = opts.rate ?? 1;
  const from = opts.fromBar ?? 0;
  const to = opts.bars !== undefined ? from + opts.bars : Number.POSITIVE_INFINITY;
  const out: AudioPlan["events"] = [];
  const preload = new Set<string>();
  let end = 0;
  for (const e of events) {
    const onset = R.toNum(e.onset);
    if (onset < from || onset >= to) continue;
    const at = (onset - from) / cps / rate;
    const dur = R.toNum(e.clipDur ?? e.dur) / cps / rate;
    const value: SuperdoughValue = {
      s: e.s ?? "piano",
      gain: Math.round(e.gain * (opts.gain ?? 1) * 1000) / 1000,
    };
    if (e.midi !== null) value.note = e.midi + (opts.transpose ?? 0);
    const controls = opts.controlsByBar?.[Math.floor(onset)];
    if (controls) Object.assign(value, controls);
    if (e.bank) value.bank = e.bank;
    if (e.sampleN !== undefined) value.n = e.sampleN;
    out.push({ at, dur, value });
    preload.add(e.midi === null ? drumKey(value.s, e.bank) : value.s);
    end = Math.max(end, at + dur);
  }
  out.sort((a, b) => a.at - b.at);
  const windowSec =
    opts.bars !== undefined
      ? opts.bars / cps / rate
      : Math.ceil(events.reduce((m, e) => Math.max(m, R.toNum(R.add(e.onset, e.dur))), 0) - from) /
        cps /
        rate;
  return { events: out, durationSec: Math.max(end, windowSec, 0), preload: [...preload].sort() };
}

/** A click track: `bars` of the meter's tempo units, accented on beat 1. */
export function clickPlan(bars: number, cps: number, unitsPerBar: number): AudioPlan {
  const events: AudioPlan["events"] = [];
  const unit = 1 / cps / unitsPerBar;
  for (let b = 0; b < bars; b++)
    for (let u = 0; u < unitsPerBar; u++)
      events.push({
        at: (b * unitsPerBar + u) * unit,
        dur: unit / 2,
        value: { s: "rim", gain: u === 0 ? 0.9 : 0.5 },
      });
  return { events, durationSec: bars / cps, preload: ["rim"] };
}

/** A tonic triad around middle C for one bar: the cue of trials whose context is a tonic chord but which carry none. */
function tonicCue(key: KeySpec, cps: number): AudioPlan {
  const root = tonicMidi(key.tonic, 3);
  const minor = /minor|dorian|phrygian|locrian|blues/.test(key.mode);
  const notes = [root, root + (minor ? 3 : 4), root + 7];
  return {
    events: notes.map((note) => ({ at: 0, dur: 1 / cps, value: { s: "piano", note, gain: 0.5 } })),
    durationSec: 1 / cps,
    preload: ["piano"],
  };
}

/**
 * The parts of a trial as plans: the cue (the context bars at the start of the trial, else a count-in
 * click or a tonic chord), the stimulus (everything after the cue bars), and the resolution or contrast replay.
 */
export function trialAudio(
  trial: Trial<unknown>,
  key?: { tonic: string; mode: string },
): { cue: AudioPlan | null; stimulus: AudioPlan; resolution: AudioPlan | null } {
  const cueBars = typeof trial.params.cueBars === "number" ? trial.params.cueBars : 0;
  const meter = (trial.params.meter as MeterId | undefined) ?? "4/4";
  const controlsByBar = Array.isArray(trial.params.controlsByBar)
    ? (trial.params.controlsByBar as (Record<string, number> | null)[])
    : undefined;
  const withControls = controlsByBar ? { controlsByBar } : {};
  let cue: AudioPlan | null = null;
  if (cueBars > 0)
    cue = eventsToAudioPlan(trial.events, trial.cps, { fromBar: 0, bars: cueBars, ...withControls });
  else if (trial.cue.countInBars > 0)
    cue = clickPlan(trial.cue.countInBars, trial.cps, (METERS[meter] ?? METERS["4/4"]).unitsPerBar);
  else if (key && trial.cue.context !== "none" && trial.events.length > 0)
    cue = tonicCue(key as KeySpec, trial.cps);
  const bars = typeof trial.params.bars === "number" ? trial.params.bars - cueBars : undefined;
  const stimulus = eventsToAudioPlan(trial.events, trial.cps, {
    fromBar: cueBars,
    ...(bars !== undefined && bars > 0 ? { bars } : {}),
    ...withControls,
  });
  const resolution = trial.resolution ? eventsToAudioPlan(trial.resolution.events, trial.cps) : null;
  return { cue, stimulus, resolution };
}
