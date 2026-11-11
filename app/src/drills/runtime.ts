// The drill machine's side effects in the browser: the server calls (start, per-trial upserts, finish), the
// trial source (planned SRS sets, composite sets, and the free-practice staircase), audio through the app's one
// OakStrudel (`lib/oak.ts`), taps through `@oak/audio`'s TapInput, and singing through the app's one mic graph
// (`lib/mic.ts`, so the "Mic live" indicator is always right). High-frequency live data (taps, pitch frames)
// goes to a small store the panels read; the machine only gets the result.
import type {
  DrillFinish,
  DrillSession,
  DrillTrialRecord,
  FamilyDef,
  FamilyId,
  FamilyState,
  LearnerProfile,
  Trial,
} from "@oak/api";
import { type AudioPlan, type DrillRegistry, gradeSungResolution, gradeTrial, setPreload } from "@oak/drills";
import type { PitchFrame } from "@oak/pitch";
import type { OakStrudel, PlaybackHandle } from "@oak/strudel";
import { freqToMidi } from "@oak/theory";
import { fromCallback, fromPromise } from "xstate";
import { create } from "zustand";
import type { SungSummary } from "../answers/types.ts";
import { callApi } from "../lib/api.ts";
import { openMic } from "../lib/mic.ts";
import { getOak } from "../lib/oak.ts";
import { clearInflight, saveInflight } from "./inflight.ts";
import type {
  AuditionInput,
  DrillContext,
  DrillDeps,
  DrillEvent,
  FinishInput,
  PresentInput,
  ResolveInput,
  ResumeState,
  TrialSource,
} from "./machine.ts";
import { answerPlan, comparePlan, cuePlan, resolutionOf, sequence, stagingOf } from "./plans.ts";
import { compositeSource, plannedSource, staircaseSource } from "./sources.ts";

// --- live data for the panels -------------------------------------------------------------------

export interface LiveFrame {
  /** Seconds from the start of the response window. */
  t: number;
  /** Fractional MIDI, or null when unvoiced. */
  midi: number | null;
}
interface Live {
  taps: number[];
  frames: LiveFrame[];
  /** Seconds the response window lasts (0: none open). */
  windowSec: number;
  /** AudioContext time of the window start, and the context to read the clock from. */
  windowStart: number | null;
  clock: (() => number) | null;
  /** Input level, dBFS (singing). */
  levelDb: number;
  /** A pointer tap on the on-screen pad while armed (`timeStamp` from the DOM event). */
  tapNow: ((timeStamp: number) => void) | null;
  reset(): void;
}
export const useLive = create<Live>((set) => ({
  taps: [],
  frames: [],
  windowSec: 0,
  windowStart: null,
  clock: null,
  levelDb: -100,
  tapNow: null,
  reset: () =>
    set({ taps: [], frames: [], windowSec: 0, windowStart: null, clock: null, levelDb: -100, tapNow: null }),
}));

// --- audio helpers ------------------------------------------------------------------------------

/** `["piano", "RolandTR909_bd:2"]` → a PreloadSpec. */
export function preloadSpec(names: readonly string[]) {
  return {
    sounds: names.map((name) => {
      const [s, n] = name.split(":") as [string, string | undefined];
      return n !== undefined && /^\d+$/.test(n) ? { s, n: Number(n) } : { s };
    }),
  };
}

async function preload(oak: OakStrudel, names: readonly string[]): Promise<void> {
  if (names.length === 0) return;
  try {
    await oak.preload(preloadSpec(names));
  } catch {
    // A sound that fails to load plays silently; the trial still runs.
  }
}

/** Plays `plan` at context time `at`; returns its handle (or null for an empty plan). */
function play(oak: OakStrudel, plan: AudioPlan | null, at: number): PlaybackHandle | null {
  if (!plan || plan.events.length === 0) return null;
  return playSettled(oak, plan, { at });
}

/**
 * `oak.playEvents` whose `done` also settles by the clock at the plan's end. @oak/strudel's own `done` stays
 * pending when every event falls inside its first scheduling window (one note, one chord: its end timer is armed
 * only from the interval that never starts), which froze a single-note listen block on "playing" and held a
 * pitch trial's cue stage until the learner answered blind.
 */
export function playSettled(
  oak: OakStrudel,
  plan: AudioPlan,
  opts: Parameters<OakStrudel["playEvents"]>[1] = {},
): PlaybackHandle {
  const h = oak.playEvents(plan, opts);
  const endsIn = Math.max(0, h.startTime - oak.ctx.currentTime + plan.durationSec) * 1000 + 150;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const byClock = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, endsIn);
  });
  const done = Promise.race([h.done, byClock]).then(() => {
    if (timer !== null) clearTimeout(timer);
  });
  return { ...h, done, stop: () => h.stop() };
}

/** Schedules `fn` at context time `t` (a timer; the audio itself is sample-accurate). */
function atTime(oak: OakStrudel, t: number, fn: () => void): ReturnType<typeof setTimeout> {
  return setTimeout(fn, Math.max(0, (t - oak.ctx.currentTime) * 1000));
}

const LEAD_S = 0.15;

function micMessage(e: unknown): string {
  const reason = (e as { reason?: string } | null)?.reason;
  if (reason === "denied")
    return "Microphone access is blocked. Allow it in the browser, or skip the sung part with Shift+S.";
  if (reason === "no-device") return "No microphone was found. Skip the sung part with Shift+S.";
  return "The microphone did not start. Skip the sung part with Shift+S, or try again.";
}

export function framesToSummary(frames: readonly PitchFrame[]): SungSummary[] {
  const voiced = frames.filter((f) => f.hz > 0 && f.clarity >= 0.85).map((f) => freqToMidi(f.hz));
  if (voiced.length === 0) return [{ midi: null, cents: null, credit: 0 }];
  const sorted = [...voiced].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] as number;
  return [{ midi: Math.round(med), cents: Math.round((med - Math.round(med)) * 100), credit: 0 }];
}

/**
 * Plays a choice's audition code through the shared adapter. Drill generators write single notes
 * (`note(65).s("piano")`); anything else is not auditioned.
 */
export function auditionCode(code: string): void {
  const note = /note\(\s*"?([A-Ga-g][#b]?\d|\d{2,3})"?\s*\)/.exec(code)?.[1];
  if (!note) return;
  const s = /\.s\(\s*"([\w-]+)"\s*\)/.exec(code)?.[1] ?? "piano";
  void getOak()
    .then((oak) => oak.playNote({ s, note: /^\d+$/.test(note) ? Number(note) : note.toLowerCase(), dur: 1 }))
    .catch(() => {});
}

// --- the environment of one runner ---------------------------------------------------------------

export interface DrillEnv {
  registry: DrillRegistry;
  defs: ReadonlyMap<string, FamilyDef>;
  states: ReadonlyMap<string, FamilyState>;
  profile: LearnerProfile;
  /** The warm-up opens with an easy win (a level-down trial first). */
  easyFirst: boolean;
  /** First FET set of the day sings 3 resolutions, later ones 2 (contracts §8.3). */
  sungResolutions: number;
  /** Free practice: the level to start the staircase at. */
  practiceLevel: number | null;
  /** Inflight key (resume after reload). */
  inflightKey: string;
  /** Called after a set finishes (query invalidation). */
  onFinished?(finish: DrillFinish): void;
}

export function drillDeps(env: Pick<DrillEnv, "registry" | "profile">): DrillDeps {
  return {
    grade: (trial, response) => gradeTrial(env.registry.family(trial.family), trial, response, env.profile),
    gradeResolution: (trial, frames) => {
      const r = gradeSungResolution(trial, { frames, rtMs: 0, replays: 0 }, env.profile);
      return { credit: r.credit, sung: framesToSummary(frames) };
    },
    sungOf: (_trial, frames) => framesToSummary(frames),
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    iso: () => new Date().toISOString(),
  };
}

// --- actors ---------------------------------------------------------------------------------------

async function postRecords(session: DrillSession, records: readonly DrillTrialRecord[]): Promise<void> {
  for (let i = 0; i < records.length; i += 50)
    await callApi("drills.trials", {
      params: { id: session.id },
      body: { trials: records.slice(i, i + 50) },
    });
}

function startActor(env: DrillEnv) {
  return fromPromise<
    { session: DrillSession; source: TrialSource },
    { input: DrillContext["input"]; resume: ResumeState | null }
  >(async ({ input: { input, resume } }) => {
    const same =
      resume !== null &&
      resume.session.familyIds.join(",") === input.familyIds.join(",") &&
      resume.session.purpose === input.purpose;
    const session = same
      ? resume.session
      : await callApi("drills.start", {
          body: {
            sessionId: input.sessionId,
            purpose: input.purpose,
            familyIds: input.familyIds,
            warmupItemId: input.warmupItemId,
          },
        });
    let source: TrialSource;
    if (session.familyIds.length > 1) source = compositeSource(env, session);
    else {
      const family = env.registry.family(session.familyIds[0] as FamilyId);
      if (input.purpose === "practice" && env.practiceLevel !== null) {
        const state = env.states.get(family.def.id);
        const max = Math.max(env.practiceLevel, state?.maxOpenLevel ?? 1);
        source = staircaseSource(family, session, env.profile, env.practiceLevel, max);
      } else source = plannedSource(env, family, session);
    }
    // Preload every sound of a planned set before trial 1 (a staircase preloads per trial).
    const firstTrials = Array.from({ length: Math.min(source.total, 12) }, (_, i) => {
      try {
        return source.at(i, []).trial;
      } catch {
        return null;
      }
    }).filter((t): t is Trial => t !== null);
    const oak = await getOak();
    await preload(oak, setPreload(firstTrials));
    return { session, source };
  });
}

function presentActor(env: DrillEnv) {
  return fromCallback<DrillEvent, PresentInput>(({ input, sendBack }) => {
    const { trial, mode } = input;
    let cancelled = false;
    const handles: (PlaybackHandle | null)[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cleanups: (() => void)[] = [];
    const live = useLive.getState();

    void (async () => {
      const oak = await getOak();
      if (cancelled) return;
      await preload(oak, trial.preload);
      if (cancelled) return;
      if (mode === "cue") {
        const plan = cuePlan(trial);
        const h = play(oak, plan, oak.ctx.currentTime + LEAD_S);
        handles.push(h);
        sendBack({ type: "STAGE", stage: "cue" });
        await h?.done;
        if (!cancelled) sendBack({ type: "PRESENTED" });
        return;
      }
      const st = stagingOf(trial);
      const t0 = oak.ctx.currentTime + LEAD_S;
      const kind = trial.params.mode;
      if (kind === "tap") {
        const { createTapInput } = await import("@oak/audio");
        if (cancelled) return;
        const tap = createTapInput(oak.ctx, { latencyMs: env.profile.tapLatencyMs });
        cleanups.push(() => tap.dispose());
        const origin = t0 + st.responseAt;
        live.reset();
        useLive.setState({
          windowSec: st.responseSec,
          windowStart: origin,
          clock: () => oak.ctx.currentTime,
        });
        tap.arm({ twoVoices: trial.params.twoVoices === true });
        useLive.setState({ tapNow: (ts) => void tap.tapAt(0, ts) });
        cleanups.push(() => useLive.setState({ tapNow: null }));
        cleanups.push(tap.onTap((e) => useLive.setState((s) => ({ taps: [...s.taps, e.time - origin] }))));
        handles.push(play(oak, st.cue, t0));
        handles.push(play(oak, st.stimulus, t0 + st.stimulusAt));
        handles.push(play(oak, st.windowClick, origin));
        sendBack({ type: "STAGE", stage: st.cue ? "count-in" : "respond", startedAt: origin });
        if (st.stimulus && st.stimulusAt + 0.01 < st.responseAt)
          timers.push(
            atTime(oak, t0 + st.stimulusAt, () =>
              sendBack({ type: "STAGE", stage: "listen", startedAt: origin }),
            ),
          );
        timers.push(
          atTime(oak, origin, () => sendBack({ type: "STAGE", stage: "respond", startedAt: origin })),
        );
        timers.push(
          atTime(oak, t0 + st.endAt, () => {
            const taps = tap
              .taps()
              .map((e) => e.time - origin)
              .filter((t) => t >= -0.25 && t <= st.responseSec + 0.3);
            tap.disarm();
            useLive.setState({ tapNow: null });
            sendBack({ type: "CAPTURED", taps });
          }),
        );
        return;
      }
      if (kind === "sing") {
        let mic: Awaited<ReturnType<typeof openMic>>;
        try {
          mic = await openMic({ deviceId: null });
        } catch (e) {
          if (!cancelled) sendBack({ type: "MIC_ERROR", message: micMessage(e) });
          return;
        }
        if (cancelled) {
          mic.close();
          return;
        }
        cleanups.push(() => mic.close());
        const t1 = oak.ctx.currentTime + LEAD_S;
        const origin = t1 + st.responseAt;
        live.reset();
        useLive.setState({
          windowSec: st.responseSec,
          windowStart: origin,
          clock: () => oak.ctx.currentTime,
        });
        cleanups.push(
          mic.onFrame((f) => {
            const voiced = f.hz > 0 && f.clarity >= 0.85;
            useLive.setState((s) => ({
              frames:
                f.t >= origin - 0.2
                  ? [...s.frames.slice(-600), { t: f.t - origin, midi: voiced ? freqToMidi(f.hz) : null }]
                  : s.frames,
              levelDb: mic.levelDb(),
            }));
          }),
        );
        handles.push(play(oak, st.cue, t1));
        handles.push(play(oak, st.stimulus, t1 + st.stimulusAt));
        sendBack({ type: "STAGE", stage: "listen", startedAt: origin });
        timers.push(atTime(oak, origin, () => sendBack({ type: "STAGE", stage: "sing", startedAt: origin })));
        timers.push(
          atTime(oak, t1 + st.endAt, () => {
            const frames = mic
              .frames()
              .filter((f) => f.t >= origin - 0.2 && f.t <= origin + st.responseSec + 0.3)
              .map((f) => ({ ...f, t: f.t - origin }));
            mic.close();
            sendBack({ type: "CAPTURED", frames });
          }),
        );
        return;
      }
      // An answer trial: cue, then stimulus; the answer pad is live from the start.
      handles.push(play(oak, st.cue, t0));
      const stim = play(oak, st.stimulus, t0 + st.stimulusAt);
      handles.push(stim);
      sendBack({ type: "STAGE", stage: st.cue ? "cue" : "listen" });
      if (st.cue && st.stimulus)
        timers.push(atTime(oak, t0 + st.stimulusAt, () => sendBack({ type: "STAGE", stage: "listen" })));
      if (stim) await stim.done;
      if (!cancelled) sendBack({ type: "PRESENTED" });
    })().catch((e: unknown) => {
      // Audio failed to start: the trial can still be answered (and replayed once sound wakes).
      console.warn("oak: drill audio", e);
      if (!cancelled)
        sendBack(
          trial.params.mode === "sing"
            ? { type: "MIC_ERROR", message: micMessage(e) }
            : { type: "PRESENTED" },
        );
    });

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      for (const h of handles) h?.stop();
      for (const c of cleanups.splice(0)) c();
    };
  });
}

function auditionActor() {
  return fromCallback<DrillEvent, AuditionInput>(({ input, sendBack }) => {
    let cancelled = false;
    let handle: PlaybackHandle | null = null;
    void (async () => {
      const oak = await getOak();
      if (cancelled) return;
      const { trial, what, captured } = input;
      let plan: AudioPlan | null = null;
      if (what === "answer") plan = answerPlan(trial);
      else if (what === "cue") plan = cuePlan(trial);
      else if (what === "compare") plan = comparePlan(trial, captured, null);
      else {
        const st = stagingOf(trial);
        plan = sequence(
          [st.cue, st.stimulus ?? answerPlan(trial)],
          st.cue ? Math.max(0, st.stimulusAt - (st.cue.durationSec ?? 0)) : 0,
        );
      }
      if (plan) await preload(oak, plan.preload);
      if (cancelled) return;
      handle = play(oak, plan, oak.ctx.currentTime + LEAD_S);
      await handle?.done;
      if (!cancelled) sendBack({ type: "AUDITION_DONE" });
    })().catch(() => {
      if (!cancelled) sendBack({ type: "AUDITION_DONE" });
    });
    return () => {
      cancelled = true;
      handle?.stop();
    };
  });
}

function resolveActor() {
  return fromCallback<DrillEvent, ResolveInput>(({ input, sendBack }) => {
    let cancelled = false;
    const handles: (PlaybackHandle | null)[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const cleanups: (() => void)[] = [];
    void (async () => {
      const oak = await getOak();
      if (cancelled) return;
      const { plan, targets, playFirst } = resolutionOf(input.trial);
      const t0 = oak.ctx.currentTime + LEAD_S;
      if (input.quiet || targets.length === 0) {
        // Quiet mode: hear the resolution, then hear it in your head (contracts §8.5).
        handles.push(play(oak, plan, t0));
        sendBack({ type: "STAGE", stage: "resolution" });
        await handles[0]?.done;
        if (!cancelled) sendBack({ type: "PRESENTED" });
        return;
      }
      let mic: Awaited<ReturnType<typeof openMic>>;
      try {
        mic = await openMic({ deviceId: null });
      } catch (e) {
        if (!cancelled) sendBack({ type: "MIC_ERROR", message: micMessage(e) });
        return;
      }
      if (cancelled) {
        mic.close();
        return;
      }
      cleanups.push(() => mic.close());
      const pathSec = plan?.durationSec ?? 0;
      const singSec = Math.max(...targets.map((t) => t.off)) + 0.6;
      const start = oak.ctx.currentTime + LEAD_S;
      const origin = playFirst ? start + pathSec + 0.3 : start;
      if (playFirst) handles.push(play(oak, plan, start));
      useLive.getState().reset();
      useLive.setState({ windowSec: singSec, windowStart: origin, clock: () => oak.ctx.currentTime });
      cleanups.push(
        mic.onFrame((f) => {
          const voiced = f.hz > 0 && f.clarity >= 0.85;
          if (f.t >= origin - 0.2)
            useLive.setState((s) => ({
              frames: [...s.frames.slice(-600), { t: f.t - origin, midi: voiced ? freqToMidi(f.hz) : null }],
              levelDb: mic.levelDb(),
            }));
        }),
      );
      sendBack({ type: "STAGE", stage: playFirst ? "resolution" : "sing", startedAt: origin });
      if (playFirst)
        timers.push(atTime(oak, origin, () => sendBack({ type: "STAGE", stage: "sing", startedAt: origin })));
      timers.push(
        atTime(oak, origin + singSec, () => {
          const frames = mic
            .frames()
            .filter((f) => f.t >= origin - 0.2 && f.t <= origin + singSec)
            .map((f) => ({ ...f, t: f.t - origin }));
          mic.close();
          // From level 3 the learner sings first, then hears the path (audiation).
          if (!playFirst) handles.push(play(oak, plan, oak.ctx.currentTime + LEAD_S));
          sendBack({ type: "CAPTURED", frames });
        }),
      );
    })().catch((e: unknown) => {
      if (!cancelled) sendBack({ type: "MIC_ERROR", message: micMessage(e) });
    });
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
      for (const h of handles) h?.stop();
      for (const c of cleanups.splice(0)) c();
    };
  });
}

function finishActor(env: DrillEnv) {
  return fromPromise<DrillFinish | null, FinishInput>(async ({ input }) => {
    if (input.records.length > 0) await postRecords(input.session, input.records);
    const finish = await callApi("drills.finish", { params: { id: input.session.id } });
    env.onFinished?.(finish);
    return finish;
  });
}

/** Everything `drillMachine.provide()` needs, bound to one runner's environment. */
export function drillImplementations(env: DrillEnv) {
  return {
    actors: {
      start: startActor(env),
      present: presentActor(env),
      audition: auditionActor(),
      resolve: resolveActor(),
      finish: finishActor(env),
    },
    actions: {
      persist: (_: unknown, p: { ctx: DrillContext }) => {
        if (!p.ctx.session) return;
        saveInflight(env.inflightKey, {
          session: p.ctx.session,
          outcomes: p.ctx.outcomes.slice(0, p.ctx.index),
          records: p.ctx.records.slice(0, p.ctx.index),
        });
      },
      send: (_: unknown, p: { session: DrillSession; record: DrillTrialRecord }) => {
        if (!p.session || !p.record) return;
        void postRecords(p.session, [p.record]).catch(() => {
          // `finish` sends every record again (upserts); nothing is lost.
        });
      },
      done: () => clearInflight(env.inflightKey),
    },
  };
}
