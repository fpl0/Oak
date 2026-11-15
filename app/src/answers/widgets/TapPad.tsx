// Tap capture (contracts §8.4, ux §4.4 TapPad): a count-in, then one row per bar on a `1 e & a` grid with a tick
// for every tap as it lands. Space (or F/J for two voices), a click or a touch on the pad: only while armed and
// only while focus is in the pad (`data-keyscope="tap"`). Times are AudioContext seconds through
// `getOutputTimestamp()` pairs minus the calibrated `tapLatencyMs` (@oak/audio `createTapInput`). After an
// attempt the targets are drawn and matched pairs joined; `tapReport` (gradeTaps) makes the marks.
// Wave 6 (U13): with `AnswerEnv.tap.meter` in a compound meter the beat is the dotted quarter (the count-in clicks
// it, the pad draws it in three, "1 la li"); `stepsPerBeat: 3` in a simple meter is a triplet grid ("1 trip let").
// A syncopated target is drawn where it falls between the beats, and a missed one is named by its count.
// Wave 7: with `AnswerEnv.tap.lanes` (feature `tap.lanes`, R2.L04's 3 against 2) each bar has two lanes, F taps the
// first and J the second, each lane drawn and marked on its own (`lanesReport`); in an odd meter (5/4, 7/8, 9/8i)
// the pad's strong lines fall on the meter's group starts, counted "1 2 | 1 2 | 1 2 3".
import { createTapInput, type TapEvent, type TapInput, type TapInputExtras } from "@oak/audio";
import { clsx } from "clsx";
import { Hand, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { appAudio, NEUTRAL_PROFILE, useAnswerEnv } from "../env.tsx";
import { padGrid, padPoint } from "../tap.ts";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  KeyHint,
  markOf,
  SubmitHint,
  TAKE_RETRY_PROPS,
  TakeRetryLabel,
  useTakeRetryKey,
} from "../ui.tsx";

type Phase = "idle" | "starting" | "count-in" | "taking" | "done";

export function TapPadAnswer(p: AnswerWidgetProps<"tap">) {
  const { value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const setup = env.tap;
  const profile = env.profile ?? NEUTRAL_PROFILE;
  const audio = env.audio ?? appAudio;
  const pad = useRef<HTMLDivElement>(null);
  const input = useRef<(TapInput & TapInputExtras) | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const [phase, setPhase] = useState<Phase>(value.length > 0 ? "done" : "idle");
  const [takeStart, setStartAt] = useState<number | null>(null);
  const startAt = takeStart ?? setup?.startAt ?? null;
  const [live, setLive] = useState<TapEvent[]>([]);
  const [beat, setBeat] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const bars = setup?.bars ?? 1;
  const grid = padGrid({
    ...(setup?.meter ? { meter: setup.meter } : {}),
    ...(setup?.beatsPerBar !== undefined ? { beatsPerBar: setup.beatsPerBar } : {}),
    ...(setup?.stepsPerBeat !== undefined ? { stepsPerBeat: setup.stepsPerBeat } : {}),
  });
  const beatsPerBar = grid.beatsPerBar;
  const stepsPerBeat = grid.stepsPerBeat;
  const barSec = setup ? (60 / setup.bpm) * beatsPerBar : 2;
  const cps = 1 / barSec;
  const countIn = setup?.countInBars ?? 1;

  useEffect(() => {
    if (p.autoFocus) pad.current?.querySelector<HTMLElement>("button")?.focus();
  }, [p.autoFocus]);
  useEffect(() => () => input.current?.dispose(), []);

  // The clock: count-in numerals, the playhead, and the end of the take.
  const frame = useRef<() => boolean>(() => false);
  frame.current = () => {
    const ctx = ctxRef.current;
    if (!ctx || startAt === null) return false;
    const t = ctx.currentTime - startAt;
    setBeat(Math.floor(t / (barSec / beatsPerBar)));
    if (t >= 0 && phase === "count-in") setPhase("taking");
    if (t >= bars * barSec + 0.35) {
      finish();
      return false;
    }
    return true;
  };
  useEffect(() => {
    if (phase !== "count-in" && phase !== "taking") return;
    let raf = 0;
    const loop = () => {
      if (frame.current()) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const finish = () => {
    const tin = input.current;
    if (!tin || startAt === null) return;
    tin.disarm();
    const lo = startAt - barSec / 4;
    const hi = startAt + bars * barSec + barSec / 4;
    const taps = tin.taps().filter((t) => t.time >= lo && t.time <= hi);
    setPhase("done");
    setBeat(null);
    onChange(taps.map((t) => t.time));
    setup?.onTake?.({ startAt, cps, taps: taps.map((t) => t.time), voices: taps.map((t) => t.voice) });
  };

  const start = async () => {
    if (disabled || !setup || !pad.current) return;
    setProblem(null);
    setPhase("starting");
    try {
      const ctx = await audio.context();
      ctxRef.current = ctx;
      input.current?.dispose();
      const tin = createTapInput(ctx, { target: pad.current, latencyMs: profile.tapLatencyMs });
      input.current = tin;
      tin.onTap((t) => setLive((xs) => [...xs, t]));
      setLive([]);
      onChange([]);
      tin.arm({ twoVoices: setup.twoVoices === true || Boolean(setup.lanes) });
      let at: number;
      if (setup.start) at = await setup.start();
      else {
        const beatSec = barSec / beatsPerBar;
        at = ctx.currentTime + 0.25 + countIn * barSec;
        for (let i = 0; i < countIn * beatsPerBar; i++)
          audio.click(at - (countIn * beatsPerBar - i) * beatSec, i % beatsPerBar === 0);
      }
      setStartAt(at);
      setPhase("count-in");
      pad.current.querySelector<HTMLElement>("[data-tap-surface]")?.focus();
    } catch (e) {
      setPhase("idle");
      setProblem(e instanceof Error ? `Sound did not start: ${e.message}` : "Sound did not start.");
    }
  };

  // The take's own Try again before a verdict: Alt+R as the button, the same key as the host's row after one.
  useTakeRetryKey(phase === "done" && p.locked !== true && !disabled, () => void start());

  // The host's "Try again" (docs/design/retry.md §2.5): the pad re-arms and the count-in starts at once.
  const retakes = useRef(p.retake ?? 0);
  useEffect(() => {
    const n = p.retake ?? 0;
    if (n <= retakes.current) return;
    retakes.current = n;
    if (phase === "idle" || phase === "done") void start();
  }, [p.retake]);

  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    // The tap input already took Space/F/J while armed; keep them from scrolling or reaching the workbench.
    const armed = phase === "count-in" || phase === "taking";
    if (armed && (e.code === "Space" || e.code === "KeyF" || e.code === "KeyJ")) return true;
    if (armed && e.key === "Enter") return true;
    return false;
  };

  const pointerTap = (voice: 0 | 1) => (e: React.PointerEvent) => {
    if (phase !== "count-in" && phase !== "taking") return;
    e.preventDefault();
    input.current?.tapAt(voice, e.timeStamp);
  };

  if (!setup)
    return (
      <AnswerFrame
        kind="tap"
        idBase={p.idBase}
        label={p.label}
        feedback={feedback}
        onSubmit={p.onSubmit}
        keyscope="tap"
      >
        <p className="text-sm text-text-2">This step has no beat to tap to yet.</p>
      </AnswerFrame>
    );

  const taps: { time: number; voice: 0 | 1 }[] =
    phase === "done" || phase === "idle"
      ? value.map((time, i) => ({ time, voice: live[i]?.voice ?? setup.voices?.[i] ?? 0 }))
      : live;
  const showTargets =
    feedback.state !== "idle" &&
    feedback.state !== "pending" &&
    startAt !== null &&
    (setup.targets || setup.lanes);
  const steps = beatsPerBar * stepsPerBeat;
  const countNumeral =
    phase === "count-in" && beat !== null && beat < 0
      ? (((beat % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1
      : null;
  const headPos = phase === "taking" && beat !== null && beat >= 0 ? beat / beatsPerBar : null;
  const lanes = setup.lanes && setup.lanes.length >= 2 ? setup.lanes : null;
  const laneLabel = (v: 0 | 1) => lanes?.[v]?.label ?? "";
  const twoVoices = setup.twoVoices === true || lanes !== null;
  /** A lane's taps, sorted, with their index in the take (marks name a lane's extra taps by sorted index). */
  const laneTaps = (lane: 0 | 1) =>
    taps
      .map((t, i) => ({ ...t, i }))
      .filter((t) => t.voice === lane)
      .sort((a, b) => a.time - b.time);

  const gridLines = (counts: boolean) =>
    Array.from({ length: steps }, (_, st) => (
      <span
        key={st}
        aria-hidden
        className={clsx(
          "absolute top-0 h-full",
          grid.groupStarts?.[st] ? "border-l-2 border-text-2" : "border-l",
          !grid.groupStarts?.[st] && (st % stepsPerBeat === 0 ? "border-text-3/60" : "border-border"),
        )}
        style={{ left: `${(st / steps) * 100}%` }}
      >
        {counts ? (
          <span className="absolute top-0.5 left-1 text-[0.65rem] text-text-3">{grid.counts[st]}</span>
        ) : null}
      </span>
    ));
  const head = (bar: number) =>
    headPos !== null && Math.floor(headPos) === bar ? (
      <span
        aria-hidden
        className="absolute top-0 h-full w-0.5 bg-accent"
        style={{ left: `${(headPos - bar) * 100}%` }}
      />
    ) : null;
  const target = (onset: number, i: number, bar: number, part: number | string, place: string) => {
    if (startAt === null) return null;
    const pt = padPoint(startAt + onset / cps, startAt, cps, bars);
    if (!pt || pt.bar !== bar) return null;
    const mark = markOf(feedback, part);
    return (
      <span
        key={`t${i}`}
        aria-hidden
        title={mark?.note}
        className={clsx(
          "absolute size-3 -translate-x-1/2 rotate-45 border-2",
          place,
          mark?.ok === false ? "border-issue bg-surface" : "border-accent bg-accent",
        )}
        style={{ left: `${pt.pos * 100}%` }}
      />
    );
  };
  const tick = (t: { time: number }, i: number, bar: number, extraPart: string, place: string) => {
    if (startAt === null) return null;
    const pt = padPoint(t.time, startAt, cps, bars);
    if (!pt || pt.bar !== bar) return null;
    const extra = markOf(feedback, extraPart);
    return (
      <span
        key={`k${i}`}
        aria-hidden
        data-tap-tick
        className={clsx("absolute w-1 -translate-x-1/2 rounded-full", place, extra ? "bg-issue" : "bg-text")}
        style={{ left: `${pt.pos * 100}%` }}
      />
    );
  };

  return (
    <AnswerFrame
      kind="tap"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keyscope="tap"
      keys={
        <>
          <KeyHint keys={twoVoices ? ["F", "J"] : ["Space"]}>tap</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div
        ref={pad}
        className="flex flex-col gap-2"
        data-start-at={startAt ?? undefined}
        data-phase={phase}
        data-taps={taps.map((t) => (startAt === null ? 0 : Math.round((t.time - startAt) * 1000))).join(" ")}
      >
        <div className="flex min-h-10 flex-wrap items-center gap-3">
          {(phase === "idle" || phase === "done") && p.locked !== true ? (
            <Button
              variant={phase === "idle" ? "primary" : "secondary"}
              data-enter="native"
              {...(phase === "done" ? TAKE_RETRY_PROPS : {})}
              icon={
                phase === "idle" ? (
                  <Hand aria-hidden className="size-4" />
                ) : (
                  <RotateCcw aria-hidden className="size-4" />
                )
              }
              onClick={() => void start()}
              disabled={disabled}
            >
              {phase === "idle" ? "Start tapping" : <TakeRetryLabel />}
            </Button>
          ) : null}
          <span className="text-sm text-text-2" aria-live="polite" data-testid="tap-phase">
            {phase === "starting"
              ? "Getting ready…"
              : phase === "count-in"
                ? `Count-in: ${countNumeral ?? ""}`
                : phase === "taking"
                  ? `Tap now: ${live.length} ${live.length === 1 ? "tap" : "taps"}`
                  : phase === "done"
                    ? `${value.length} ${value.length === 1 ? "tap" : "taps"} recorded.`
                    : `${bars} ${bars === 1 ? "bar" : "bars"}${setup.meter ? ` of ${setup.meter.id}` : ""} at ${setup.bpm} BPM${grid.compound ? " (the dotted quarter)" : ""}, after a ${countIn}-bar count-in.`}
          </span>
          {problem ? <span className="text-sm text-issue">{problem}</span> : null}
        </div>
        <div
          data-tap-surface
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the pad takes Space/F/J taps while armed
          tabIndex={0}
          role="application"
          aria-roledescription="tap pad"
          aria-label={`Tap pad: ${lanes ? `F for ${laneLabel(0)}, J for ${laneLabel(1)}` : twoVoices ? "F for the low voice, J for the high voice" : "tap with Space"}, or click`}
          onPointerDown={twoVoices ? undefined : pointerTap(0)}
          className={clsx(
            "relative flex touch-none flex-col gap-1 rounded-card border-2 bg-surface p-2 select-none",
            phase === "taking" ? "border-accent" : phase === "count-in" ? "border-accent-2" : "border-border",
          )}
        >
          {countNumeral !== null ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center font-display text-6xl text-accent-2"
            >
              {countNumeral}
            </span>
          ) : null}
          {Array.from({ length: bars }, (_, bar) => (
            <div key={bar} className="flex items-stretch gap-2">
              <span className="w-10 shrink-0 pt-1 text-right text-[0.7rem] text-text-3">bar {bar + 1}</span>
              {lanes ? (
                <div className="flex min-w-0 flex-1 flex-col gap-1" data-lanes>
                  {([0, 1] as const).map((lane) => (
                    <div
                      key={lane}
                      className="relative h-10 min-w-0 rounded-[6px] bg-surface-2"
                      data-lane={lane}
                    >
                      <span
                        aria-hidden
                        className="absolute bottom-0.5 left-0.5 font-mono text-[0.6rem] leading-none text-text-3"
                      >
                        {lane === 0 ? "F" : "J"}
                      </span>
                      <div className="absolute inset-y-0 right-3 left-3">
                        {gridLines(lane === 0)}
                        {head(bar)}
                        {showTargets
                          ? (lanes[lane]?.targets ?? []).map((onset, i) =>
                              target(onset, i, bar, `${lane}:${i}`, "bottom-1"),
                            )
                          : null}
                        {laneTaps(lane).map((t, j) => tick(t, t.i, bar, `${lane}:extra:${j}`, "top-2 h-6"))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="relative h-14 min-w-0 flex-1 rounded-[6px] bg-surface-2">
                  <div className="absolute inset-y-0 right-3 left-3">
                    {gridLines(true)}
                    {head(bar)}
                    {showTargets
                      ? (setup.targets ?? []).map((onset, i) => target(onset, i, bar, i, "bottom-1"))
                      : null}
                    {taps.map((t, i) =>
                      tick(t, i, bar, `extra:${i}`, t.voice === 1 ? "top-5 h-6" : "top-3 h-8"),
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {twoVoices ? (
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([0, 1] as const).map((v) => (
                <div
                  key={v}
                  onPointerDown={pointerTap(v)}
                  className="flex h-12 items-center justify-center rounded-control border border-border bg-surface-2 text-sm text-text-2"
                >
                  {lanes ? `${v === 0 ? "F" : "J"}: ${laneLabel(v)}` : v === 0 ? "Low (F)" : "High (J)"}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <p className="sr-only" aria-live="polite">
          {showTargets && "marks" in feedback
            ? lanes
              ? lanes
                  .slice(0, 2)
                  .map(
                    (l, lane) =>
                      `${l.label}: ${feedback.marks?.filter((m) => m.ok && String(m.part).startsWith(`${lane}:`) && !String(m.part).includes("extra")).length ?? 0} of ${l.targets?.length ?? 0}`,
                  )
                  .join(". ")
              : `${feedback.marks?.filter((m) => m.ok && typeof m.part === "number").length ?? 0} of ${setup.targets?.length ?? 0} ${setup.targetWord ?? "beat"}s matched`
            : ""}
        </p>
      </div>
    </AnswerFrame>
  );
}
