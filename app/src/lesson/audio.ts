// Sound for steps that are not a Workbench: a stimulus played on the AudioContext clock (ear, tap and sing
// steps, checkpoint items), with a count-in and the time of bar 1 for the tap pad, and authored examples played
// at full fidelity through a hidden pattern player. Everything goes through the app's one adapter (`getOak`).
import type { KeySpec, MeterId, Trial } from "@oak/api";
import { type AudioPlan, clickPlan, eventsToAudioPlan, trialAudio } from "@oak/drills";
import { normalize } from "@oak/grader";
import type { PatternPlayer, PlaybackHandle } from "@oak/strudel";
import { METERS } from "@oak/theory";
import { useEffect, useRef, useState } from "react";
import { analyzeCode } from "../lib/grader-client.ts";
import { getOak } from "../lib/oak.ts";

export interface StimulusSource {
  code?: string;
  trial?: Trial | null;
  bars: number;
  meter: MeterId;
  key: KeySpec | null;
  countInBars?: number;
  click?: boolean;
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
  return { plan: eventsToAudioPlan([...n.all, ...n.band], n.cps, { bars: src.bars }), cue: null, cps: n.cps };
}

/** Plays a stimulus once (count-in first when asked) and says when bar 1 sounds. */
export async function playStimulus(src: StimulusSource): Promise<Playing> {
  const oak = await getOak();
  await oak.unlock();
  const { plan, cue, cps } = await planOf(src);
  const units = METERS[src.meter].unitsPerBar;
  const countIn = src.countInBars ?? 0;
  const lead = cue ?? (countIn > 0 ? clickPlan(countIn, cps, units) : null);
  const sounds = [...new Set([...plan.preload, ...(lead?.preload ?? [])])];
  await oak.preload({ sounds: sounds.map((s) => ({ s })) });
  const t0 = oak.ctx.currentTime + 0.12;
  const handles: PlaybackHandle[] = [];
  if (lead) handles.push(oak.playEvents(lead, { at: t0 }));
  const startAt = t0 + (lead ? lead.durationSec : 0);
  handles.push(oak.playEvents(plan, { at: startAt, exclusive: !lead }));
  if (src.click && !cue)
    handles.push(oak.playEvents(clickPlan(src.bars, cps, units), { at: startAt, exclusive: false }));
  // The handles' own `done` can stay pending when every event falls inside the first scheduling window (a single
  // note or chord: @oak/strudel's `playEvents` only arms its end timer from its interval, which never starts when
  // the first pump empties the queue). The plan's own length settles it: a sing step's cue waited forever on that.
  const endsIn = Math.max(0, startAt - oak.ctx.currentTime + plan.durationSec) * 1000 + 150;
  const byClock = new Promise<void>((resolve) => setTimeout(resolve, endsIn));
  return {
    startAt,
    barSec: 1 / cps,
    done: Promise.race([Promise.all(handles.map((h) => h.done)).then(() => undefined), byClock]),
    stop: () => {
      for (const h of handles) h.stop();
    },
  };
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
