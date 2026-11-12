// AudioPlans the runner builds itself (pure): how a trial is staged in time (cue, stimulus, response window),
// "hear the answer", and "compare" (yours, then it). `@oak/drills` gives the trial's own plans
// (`trialAudio`); this file only arranges them and adds the learner's side. Tested without audio.
import type { Answer, Degree, KeySpec, MeterId, Trial } from "@oak/api";
import { type AudioPlan, clickPlan, eventsToAudioPlan, parseMiniCode, trialAudio } from "@oak/drills";
import { degreeSemitones, labelPitch, METERS } from "@oak/theory";
import type { SungSummary } from "../answers/types.ts";

const EMPTY: AudioPlan = { events: [], durationSec: 0, preload: [] };

export function keyOfTrial(trial: Trial<unknown>): KeySpec | undefined {
  const k = trial.params.key as KeySpec | undefined;
  return k && typeof k.tonic === "string" ? k : undefined;
}

/** Concatenates plans with an optional gap between them. */
export function sequence(plans: readonly (AudioPlan | null)[], gapSec = 0): AudioPlan {
  const out: AudioPlan["events"] = [];
  const preload = new Set<string>();
  let t = 0;
  let first = true;
  for (const p of plans) {
    if (!p || p.events.length === 0) continue;
    if (!first) t += gapSec;
    first = false;
    for (const e of p.events) out.push({ ...e, at: e.at + t });
    for (const s of p.preload) preload.add(s);
    t += p.durationSec;
  }
  return { events: out, durationSec: t, preload: [...preload].sort() };
}

/** Single notes in a row (piano by default). */
export function notesPlan(midis: readonly number[], durSec = 0.6, sound = "piano", gain = 0.7): AudioPlan {
  return {
    events: midis.map((note, i) => ({ at: i * durSec, dur: durSec * 0.9, value: { s: sound, note, gain } })),
    durationSec: midis.length * durSec,
    preload: midis.length ? [sound] : [],
  };
}

/** Clicks at the given times (the learner's taps, or the targets), on a rim sound. */
export function clicksPlan(times: readonly number[], sound = "rim", gain = 0.8): AudioPlan {
  const sorted = [...times].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  const start = Math.min(0, sorted[0] ?? 0);
  return {
    events: sorted.map((t) => ({ at: t - start, dur: 0.08, value: { s: sound, gain } })),
    durationSec: sorted.length ? (sorted[sorted.length - 1] as number) - start + 0.3 : 0,
    preload: sorted.length ? [sound] : [],
  };
}

export interface Staging {
  /** Played from t0 (the count-in click, the cadence, a tonic chord), or null. */
  cue: AudioPlan | null;
  /** Played right after the cue (null when the trial is shown, not played: rhythm and note reading). */
  stimulus: AudioPlan | null;
  /** Seconds from t0 to the stimulus. */
  stimulusAt: number;
  /** Seconds from t0 to the start of the response window (tap and sing trials). */
  responseAt: number;
  /** Length of the response window, seconds. */
  responseSec: number;
  /** A click under the response window (echo and reading), or null. */
  windowClick: AudioPlan | null;
  /** Seconds from t0 until the trial has been fully presented or captured. */
  endAt: number;
}

const unitsPerBar = (trial: Trial<unknown>): number =>
  (METERS[(trial.params.meter as MeterId | undefined) ?? "4/4"] ?? METERS["4/4"]).unitsPerBar;

/**
 * How a trial unfolds in time. Tap targets and sung targets are seconds from the start of the response
 * window (`@oak/drills` grade.ts); the window starts `responseAt` after the stimulus, or after the count-in
 * when the trial is read from the page (`playFirst: false`).
 */
export function stagingOf(trial: Trial<unknown>): Staging {
  const audio = trialAudio(trial, keyOfTrial(trial));
  const cue = audio.cue;
  // A tonic-chord cue leaves a short breath before the target (ux §4.2: a gap, then the target).
  const tonicCue = cue !== null && !(Number(trial.params.cueBars ?? 0) > 0) && trial.cue.countInBars === 0;
  const cueDur = cue ? cue.durationSec + (tonicCue ? 0.4 : 0) : 0;
  const shown = trial.params.playFirst === false;
  const hasStimulus = !shown && audio.stimulus.events.length > 0;
  const stimulusAt = cueDur;
  const responseAtParam = typeof trial.params.responseAt === "number" ? trial.params.responseAt : 0;
  const mode = trial.params.mode;
  const bars = Number(trial.params.bars ?? 1);
  const cps = trial.cps;
  let responseAt = shown ? cueDur : stimulusAt + responseAtParam;
  let responseSec = 0;
  let windowClick: AudioPlan | null = null;
  if (mode === "tap") {
    const targets = (trial.params.tapTargets as number[] | undefined) ?? [];
    responseSec = Math.max(bars / cps, (targets[targets.length - 1] ?? 0) + 0.3);
    // Echo and reading are tapped over a click; tap-along has the groove itself.
    if (shown || responseAtParam > 0)
      windowClick = clickPlan(Math.ceil(responseSec * cps - 1e-6), cps, unitsPerBar(trial));
  } else if (mode === "sing") {
    const targets = (trial.params.singTargets as { off: number }[] | undefined) ?? [];
    responseSec = Math.max(0.5, ...targets.map((t) => t.off)) + 0.6;
  } else {
    responseAt = stimulusAt + (hasStimulus ? audio.stimulus.durationSec : 0);
  }
  const stimEnd = hasStimulus ? stimulusAt + audio.stimulus.durationSec : stimulusAt;
  return {
    cue,
    stimulus: hasStimulus ? audio.stimulus : null,
    stimulusAt,
    responseAt,
    responseSec,
    windowClick,
    endAt: Math.max(stimEnd, responseAt + responseSec) + (mode === "tap" || mode === "sing" ? 0.3 : 0),
  };
}

/** The pitched notes of the asked part (after the cue bars; melody track first). */
export function targetMidisOf(trial: Trial<unknown>): number[] {
  const cueBars = Number(trial.params.cueBars ?? 0);
  const pitched = trial.events.filter((e) => e.midi !== null && e.onset[0] / e.onset[1] >= cueBars);
  const mel = pitched.filter((e) => e.track === "mel");
  return (mel.length ? mel : pitched).map((e) => e.midi as number);
}

function noteOfAudio(code: string | undefined): number | null {
  const m = code ? /note\(\s*"?(\d{2,3})"?\s*\)/.exec(code) : null;
  return m ? Number(m[1]) : null;
}

function singTargetsOf(trial: Trial<unknown>): number[] {
  return ((trial.params.singTargets as { midi: number }[] | undefined) ?? []).map((t) => t.midi);
}

/** "Hear the answer": the asked sound with what it is (the resolution of a degree, the pattern, the sung notes). */
export function answerPlan(trial: Trial<unknown>): AudioPlan {
  const audio = trialAudio(trial, keyOfTrial(trial));
  const mode = trial.params.mode;
  if (mode === "sing") {
    const notes = singTargetsOf(trial);
    return notesPlan(notes, notes.length > 1 ? 0.55 : 1.2);
  }
  if (mode === "tap") {
    // The pattern over its own click, so the learner hears where each hit sits.
    const bars = Number(trial.params.bars ?? 1);
    const click = clickPlan(bars, trial.cps, unitsPerBar(trial));
    const stim = audio.stimulus;
    const merged: AudioPlan = {
      events: [
        ...stim.events,
        ...click.events.map((e) => ({ ...e, value: { ...e.value, gain: 0.35 } })),
      ].sort((a, b) => a.at - b.at),
      durationSec: Math.max(stim.durationSec, click.durationSec),
      preload: [...new Set([...stim.preload, ...click.preload])].sort(),
    };
    return merged;
  }
  // Keyboard naming: the highlighted key itself.
  if (typeof trial.params.showKey === "number") return notesPlan([trial.params.showKey], 1);
  const expected = trial.expected as Answer;
  const audioOf = new Map(
    ((trial.params.choiceAudio as { id: string; audio: string }[] | undefined) ?? []).map((c) => [
      c.id,
      c.audio,
    ]),
  );
  const chosen = expected.choice?.[0];
  const note = chosen ? noteOfAudio(audioOf.get(chosen)) : null;
  if (note !== null) return sequence([audio.stimulus, notesPlan([note], 1.2)], 0.5);
  if (audio.resolution) return sequence([audio.stimulus, audio.resolution], 0.3);
  return audio.stimulus.events.length ? audio.stimulus : EMPTY;
}

/**
 * "Compare": what the learner gave, then what it was. Null when there is nothing meaningful to compare (the
 * button is then not shown).
 */
export function comparePlan(
  trial: Trial<unknown>,
  captured: { taps: number[] | null; answer: Answer | null },
  sung: readonly SungSummary[] | null,
): AudioPlan | null {
  const expected = trial.expected as Answer;
  const mode = trial.params.mode;
  if (mode === "tap") {
    const taps = captured.taps ?? [];
    const targets = (trial.params.tapTargets as number[] | undefined) ?? [];
    if (taps.length === 0 || targets.length === 0) return null;
    return sequence([clicksPlan(taps, "rim"), clicksPlan(targets, "rim")], 0.8);
  }
  if (mode === "sing") {
    const mine = (sung ?? []).map((s) => s.midi).filter((m): m is number => m !== null);
    const target = singTargetsOf(trial);
    if (mine.length === 0 || target.length === 0) return null;
    const dur = target.length > 1 ? 0.55 : 1;
    return sequence([notesPlan(mine.map(Math.round), dur), notesPlan(target, dur)], 0.6);
  }
  const got = captured.answer;
  if (!got) return null;
  if (expected.degrees && got.degrees && got.degrees.length === expected.degrees.length) {
    const targets = targetMidisOf(trial);
    const first = targets[0];
    const exp0 = expected.degrees[0];
    if (first === undefined || exp0 === undefined) return null;
    const tonic = first - degreeSemitones(exp0);
    const yours = got.degrees.map((d) => tonic + degreeSemitones(d));
    const its = expected.degrees.map((d) => tonic + degreeSemitones(d));
    if (yours.every((m, i) => m === its[i])) return null;
    const audio = trialAudio(trial, keyOfTrial(trial));
    // One FET degree: yours and it, each walking home (ux §4.2: "yours (6) vs it (4), each resolving").
    const g = got.degrees[0];
    if (isFetTrial(trial) && expected.degrees.length === 1 && g) {
      const mode = keyOfTrial(trial)?.mode ?? "major";
      return sequence([audio.cue, homePlan(tonic, g, mode), homePlan(tonic, exp0, mode)], 0.6);
    }
    return sequence([audio.cue, notesPlan(yours, 0.6), notesPlan(its, 0.6)], 0.5);
  }
  if (expected.choice && got.choice) {
    const audioOf = new Map(
      ((trial.params.choiceAudio as { id: string; audio: string }[] | undefined) ?? []).map((c) => [
        c.id,
        c.audio,
      ]),
    );
    const mine = noteOfAudio(audioOf.get(got.choice[0] ?? ""));
    const its = noteOfAudio(audioOf.get(expected.choice[0] ?? ""));
    if (mine === null || its === null || mine === its) return null;
    return sequence([notesPlan([mine], 1), notesPlan([its], 1)], 0.5);
  }
  return null;
}

// --- functional ear training: the way home -------------------------------------------------------

const MODE_SEMIS: Readonly<Record<string, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

/**
 * Semitones above the tonic of the path from `degree` home (ux §4.2): 2–4 step down to 1; ♯4 and 5–7 step up to
 * 1′ (12). A chromatic degree first steps to the scale note in its direction. 1 is home already: `[0]`.
 */
export function homeSemitones(degree: Degree, mode = "major"): number[] {
  const scale = MODE_SEMIS[/minor|aeolian/.test(mode) ? "minor" : "major"] as readonly number[];
  const s = ((degreeSemitones(degree) % 12) + 12) % 12;
  if (s === 0) return [0];
  const out = [s];
  if (s <= 5) {
    for (let i = scale.length - 1; i >= 0; i--) if ((scale[i] as number) < s) out.push(scale[i] as number);
  } else {
    for (const x of scale) if (x > s) out.push(x);
    out.push(12);
  }
  return out;
}

/** The degrees of an FET trial's resolution path, labelled in its key ("4" "3" "2" "1"). */
export function resolutionPath(trial: Trial<unknown>): Degree[] {
  const key = keyOfTrial(trial);
  const targets = (trial.params.resolutionTargets as { midi: number }[] | undefined) ?? [];
  if (!key || targets.length === 0) return [];
  return targets.map((t) => labelPitch(t.midi, key).degree);
}

/** The tonic of a keyed trial in the register of its first asked note (from the expected first degree). */
export function trialTonicMidi(trial: Trial<unknown>): number | null {
  const expected = trial.expected as Answer;
  const first = targetMidisOf(trial)[0];
  const exp0 = expected.degrees?.[0];
  if (first === undefined || exp0 === undefined) return null;
  return first - degreeSemitones(exp0);
}

/** "Hear it resolve": a degree, then its way home, in the trial's register. */
export function homePlan(tonic: number, degree: Degree, mode = "major", dur = 0.5): AudioPlan {
  return notesPlan(
    homeSemitones(degree, mode).map((s) => tonic + s),
    dur,
  );
}

/** True for a functional-ear trial: a single asked degree after a key context, with a way home. */
export function isFetTrial(trial: Trial<unknown>): boolean {
  return Array.isArray(trial.params.resolutionTargets) && trial.params.mode !== "sing";
}

// --- dictation: the learner's answer as sound, and A/B by bar -----------------------------------------

/** The asked melody's events (after the context bars; the `mel` track when there is one). */
function melodyEvents(trial: Trial<unknown>) {
  const cueBars = Number(trial.params.cueBars ?? 0);
  const pitched = trial.events.filter((e) => e.midi !== null && e.onset[0] / e.onset[1] >= cueBars);
  const mel = pitched.filter((e) => e.track === "mel");
  return (mel.length ? mel : pitched).sort((a, b) => a.onset[0] / a.onset[1] - b.onset[0] / b.onset[1]);
}

/** Bars of the asked melody (not counting the context bars). */
export function melodyBarsOf(trial: Trial<unknown>): number {
  const cueBars = Number(trial.params.cueBars ?? 0);
  const total = Number(trial.params.answerBars ?? 0);
  if (total > 0) return total;
  const last = melodyEvents(trial).at(-1);
  return last ? Math.max(1, Math.floor(last.onset[0] / last.onset[1] - cueBars) + 1) : 1;
}

export interface MineNote {
  /** Cycles from the start of the asked melody (bar 0 = the first asked bar). */
  t: number;
  /** Cycles. */
  dur: number;
  midi: number;
}

/**
 * The learner's degrees as notes: slot i takes the rhythm of the i-th heard note, and each degree sits in the
 * octave nearest the note before it (the first near the tonic), so the octave of the source is never leaked.
 * Empty slots are rests.
 */
export function mineFromDegrees(trial: Trial<unknown>, degrees: readonly (Degree | null)[]): MineNote[] {
  const tonic = trialTonicMidi(trial);
  if (tonic === null) return [];
  const cueBars = Number(trial.params.cueBars ?? 0);
  const src = melodyEvents(trial);
  const out: MineNote[] = [];
  let prev = tonic;
  degrees.forEach((d, i) => {
    const e = src[i];
    if (!d || !e) return;
    const base = tonic + degreeSemitones(d);
    // The first entered note sits on or above the tonic (a tune opens on 1, 3 or 5 above it); each later one
    // takes the octave nearest the note before it.
    const midi = out.length === 0 ? base : base + 12 * Math.round((prev - base) / 12);
    prev = midi;
    out.push({ t: e.onset[0] / e.onset[1] - cueBars, dur: e.dur[0] / e.dur[1], midi });
  });
  return out;
}

/** The learner's code answer as notes (the drills' own mini-notation reader; null when it does not parse). */
export function mineFromCode(trial: Trial<unknown>, code: string): MineNote[] | null {
  const bars = melodyBarsOf(trial);
  const key = trial.params.answerKey as { key: KeySpec; octave: number } | undefined;
  const parsed = parseMiniCode(code, bars, key);
  if (!parsed.ok) return null;
  const evs = parsed.events.filter((e) => e.midi !== null).sort((a, b) => a.t - b.t);
  return evs.map((e, i) => {
    const next = evs[i + 1]?.t ?? Math.ceil(e.t + 1e-9);
    return { t: e.t, dur: Math.max(0.0625, Math.min(0.5, next - e.t)), midi: e.midi as number };
  });
}

/** Notes of one bar (or all of them) as a plan at the trial's tempo. */
export function minePlan(
  trial: Trial<unknown>,
  notes: readonly MineNote[],
  bar: number | null = null,
): AudioPlan {
  const from = bar ?? 0;
  const to = bar === null ? Number.POSITIVE_INFINITY : bar + 1;
  const cps = trial.cps;
  const inBar = notes.filter((n) => n.t >= from - 1e-9 && n.t < to - 1e-9);
  return {
    events: inBar.map((n) => ({
      at: (n.t - from) / cps,
      dur: (n.dur / cps) * 0.9,
      value: { s: "piano", note: n.midi, gain: 0.7 },
    })),
    durationSec: bar === null ? Math.max(0, ...inBar.map((n) => (n.t + n.dur) / cps)) : 1 / cps,
    preload: inBar.length ? ["piano"] : [],
  };
}

/** The source melody: one bar of it (0-based, after the context), or all of it. */
export function sourcePlan(trial: Trial<unknown>, bar: number | null = null): AudioPlan {
  const cueBars = Number(trial.params.cueBars ?? 0);
  const melTrack = melodyEvents(trial)[0]?.track;
  const events = trial.events.filter((e) => melTrack === undefined || e.track === melTrack);
  return eventsToAudioPlan(
    events,
    trial.cps,
    bar === null ? { fromBar: cueBars, bars: melodyBarsOf(trial) } : { fromBar: cueBars + bar, bars: 1 },
  );
}

/** A/B at the bar: the source's bar, a breath, then yours. */
export function abBarPlan(trial: Trial<unknown>, notes: readonly MineNote[], bar: number): AudioPlan {
  return sequence([sourcePlan(trial, bar), minePlan(trial, notes, bar)], 0.6);
}

/** The FET resolution plan and its sung targets (levels 1–2 play the path first; from level 3 the learner sings first). */
export function resolutionOf(trial: Trial<unknown>): {
  plan: AudioPlan | null;
  targets: { midi: number; on: number; off: number }[];
  playFirst: boolean;
} {
  const audio = trialAudio(trial, keyOfTrial(trial));
  const targets =
    (trial.params.resolutionTargets as { midi: number; on: number; off: number }[] | undefined) ?? [];
  const playFirst =
    typeof trial.params.playPathFirst === "boolean" ? trial.params.playPathFirst : trial.level <= 2;
  return { plan: audio.resolution, targets, playFirst };
}

/** A plan from absolute note events (used for the cue-only replay). */
export function cuePlan(trial: Trial<unknown>): AudioPlan | null {
  const audio = trialAudio(trial, keyOfTrial(trial));
  if (audio.cue) return audio.cue;
  const key = keyOfTrial(trial);
  if (!key) return null;
  // No cue of its own: a tonic chord sets the key (the generator's context bars are part of the stimulus).
  const t = { ...trial, cue: { ...trial.cue, context: "tonic-chord" as const } };
  return trialAudio(t, key).cue ?? eventsToAudioPlan([], trial.cps);
}
