// Sound for steps that are not a Workbench: a stimulus played on the AudioContext clock (ear, tap and sing
// steps, checkpoint items), with a count-in and the time of bar 1 for the tap pad, and authored examples played
// at full fidelity through a hidden pattern player. Everything goes through the app's one adapter (`getOak`).
import type { Cue, KeySpec, MeterId, Trial } from "@oak/api";
import { type AudioPlan, clickPlan, eventsToAudioPlan, trialAudio } from "@oak/drills";
import { normalize } from "@oak/grader";
import type { PatternPlayer, PlaybackHandle } from "@oak/strudel";
import { METERS } from "@oak/theory";
import { useEffect, useRef, useState } from "react";
import { analyzeCode } from "../lib/grader-client.ts";
import { getOak } from "../lib/oak.ts";
import { slicePlan } from "./plan-span.ts";
import { cadenceChords, tonicPc } from "./rules.ts";

export interface StimulusSource {
  code?: string;
  trial?: Trial | null;
  bars: number;
  meter: MeterId;
  key: KeySpec | null;
  countInBars?: number;
  click?: boolean;
  /**
   * What sets home before a code stimulus (a generator trial carries its own cue): "a few chords that set
   * home" for `cadence`/`short-cadence`, the tonic chord for `tonic-chord` and `drone`. Default none.
   */
  context?: Cue["context"];
  /**
   * Plays only these bars of the stimulus (`fromBar` 0-based, may be fractional): "hear this slot" on a slot strip.
   * No count-in or home cue is played before a span.
   */
  span?: { fromBar: number; bars: number };
}

/** One bar of ii–V–I (or the tonic chord) in the key at `cps`: the cue a code stimulus plays first. */
export function homeCuePlan(key: KeySpec, context: Cue["context"], cps: number): AudioPlan | null {
  if (context === "none") return null;
  const bar = 1 / cps;
  const pc = tonicPc(key.tonic);
  const root = 48 + (pc > 5 ? pc - 12 : pc);
  const third = /minor|aeolian|dorian|phrygian/.test(key.mode) ? 3 : 4;
  const chords =
    context === "cadence" || context === "short-cadence"
      ? cadenceChords(key)
      : [[root, root + 12 + third, root + 19, root + 24]];
  const each = chords.length === 1 ? bar : bar / chords.length;
  const events = chords.flatMap((c, i) =>
    c.map((note) => ({ at: i * each, dur: each * 0.95, value: { s: "piano", note, gain: 0.45 } })),
  );
  // A beat of silence after the chords, so the stimulus is heard on its own.
  return { events, durationSec: bar * 1.25, preload: ["piano"] };
}

export interface Playing {
  /** AudioContext time of bar 1 of the stimulus (after the count-in). */
  startAt: number;
  /** Seconds per bar. */
  barSec: number;
  done: Promise<void>;
  stop(): void;
}

async function planOf(src: StimulusSource): Promise<{ plan: AudioPlan; cue: AudioPlan | null; cps: number }> {
  if (src.trial) {
    const a = trialAudio(src.trial, src.key ?? undefined);
    return { plan: a.stimulus, cue: a.cue, cps: src.trial.cps };
  }
  const code = src.code ?? "";
  const res = await analyzeCode(code, { mode: "lesson", bars: src.bars, lint: null, meter: src.meter });
  if (!res.ok) throw new Error("the example did not run");
  const n = normalize(res, src.key ? { meter: src.meter, key: src.key } : { meter: src.meter });
  const cue = src.key && src.context ? homeCuePlan(src.key, src.context, n.cps) : null;
  return { plan: eventsToAudioPlan([...n.all, ...n.band], n.cps, { bars: src.bars }), cue, cps: n.cps };
}

/** One plan after another. */
export function joinPlans(a: AudioPlan, b: AudioPlan): AudioPlan {
  return {
    events: [...a.events, ...b.events.map((e) => ({ ...e, at: e.at + a.durationSec }))],
    durationSec: a.durationSec + b.durationSec,
    preload: [...new Set([...a.preload, ...b.preload])].sort(),
  };
}

/** Plays a stimulus once (count-in first when asked) and says when bar 1 sounds. */
export async function playStimulus(src: StimulusSource): Promise<Playing> {
  const oak = await getOak();
  await oak.unlock();
  const whole = await planOf(src);
  const { cps } = whole;
  const plan = src.span ? slicePlan(whole.plan, src.span.fromBar / cps, src.span.bars / cps) : whole.plan;
  const cue = src.span ? null : whole.cue;
  const units = METERS[src.meter].unitsPerBar;
  const countIn = src.span ? 0 : (src.countInBars ?? 0);
  // The chords that set home, then the count-in clicks (both when asked: a sung take after a cadence).
  const clicks = countIn > 0 ? clickPlan(countIn, cps, units) : null;
  const lead = cue && clicks && !src.trial ? joinPlans(cue, clicks) : (cue ?? clicks);
  const sounds = [...new Set([...plan.preload, ...(lead?.preload ?? [])])];
  await oak.preload({ sounds: sounds.map((s) => ({ s })) });
  const t0 = oak.ctx.currentTime + 0.12;
  const handles: PlaybackHandle[] = [];
  if (lead) handles.push(oak.playEvents(lead, { at: t0 }));
  const startAt = t0 + (lead ? lead.durationSec : 0);
  handles.push(oak.playEvents(plan, { at: startAt, exclusive: !lead }));
  if (src.click && !cue)
    handles.push(oak.playEvents(clickPlan(src.bars, cps, units), { at: startAt, exclusive: false }));
  // @oak/strudel resolves `done` for every plan, a single note or chord included (wave2.md gap 8, its
  // playback.test.ts); the clock-settled race the lesson kept for it is gone.
  return {
    startAt,
    barSec: 1 / cps,
    done: Promise.all(handles.map((h) => h.done)).then(() => undefined),
    stop: () => {
      for (const h of handles) h.stop();
    },
  };
}

/**
 * What a sung take hears before it starts: the chords that set home and the count-in clicks, without the
 * target (`null` when there is neither). Resolves when it has been scheduled; `done` when it has sounded.
 */
export async function playLead(o: {
  key: KeySpec;
  context: Cue["context"];
  countInBars: number;
  meter: MeterId;
  cps: number;
}): Promise<{ done: Promise<void>; stop(): void } | null> {
  const home = homeCuePlan(o.key, o.context, o.cps);
  const clicks = o.countInBars > 0 ? clickPlan(o.countInBars, o.cps, METERS[o.meter].unitsPerBar) : null;
  const plan = home && clicks ? joinPlans(home, clicks) : (home ?? clicks);
  if (!plan) return null;
  const oak = await getOak();
  await oak.unlock();
  await oak.preload({ sounds: plan.preload.map((s) => ({ s })) });
  const handle = oak.playEvents(plan, { at: oak.ctx.currentTime + 0.12 });
  return { done: handle.done.then(() => undefined), stop: () => handle.stop() };
}

/** A hidden pattern player for authored examples (full sound, loops until stopped). */
export function useExamplePlayer() {
  const player = useRef<PatternPlayer | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      player.current?.dispose();
      player.current = null;
    },
    [],
  );
  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    player.current?.stop();
    setPlayingId(null);
  };
  const play = async (id: string, code: string, bars: number, loops = 2) => {
    stop();
    const oak = await getOak();
    await oak.unlock();
    player.current ??= oak.createPatternPlayer();
    const p = player.current;
    const out = await p.load(code, { bars, cps: 0 });
    if (!out.ok) return false;
    await p.play();
    setPlayingId(id);
    const cps = out.cps ?? 0.5;
    timer.current = window.setTimeout(stop, (bars * loops * 1000) / cps);
    return true;
  };
  return { play, stop, playingId };
}
