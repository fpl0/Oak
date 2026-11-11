// Sing capture (contracts §8, ux §4.3 PitchLane): the mic through `app/src/lib/mic.ts` only, a live trace of the
// tracked pitch folded onto the target lane, a ribbon per target at ±tolerance, a needle in words (never red or
// green), and the per-note credit from `gradeSungLive` while singing and `gradeSung` at the end: the fill, the tick
// and the grade come from the one rule. Quiet mode or no usable mic: "listen and self-check" (contracts §8.5),
// which reports quiet evidence and records nothing.
import type { MicSession } from "@oak/audio";
import type { PitchFrame, SungResult } from "@oak/pitch";
import { clsx } from "clsx";
import { Ear, Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, dbToLevel, MicLevelMeter } from "../../ui/kit/index.ts";
import { appAudio, NEUTRAL_PROFILE, type QuietEvidence, useAnswerEnv } from "../env.tsx";
import {
  centsText,
  DEFAULT_SING_TOL,
  fitNotes,
  gradeLive,
  gradeTake,
  needleWords,
  type SingNote,
  summarize,
  type TracePoint,
  takeSeconds,
  traceOf,
} from "../sing.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint } from "../ui.tsx";

type Phase = "idle" | "cue" | "opening" | "singing" | "done" | "quiet";

const LANE_H = 220;

function cssVar(el: Element, name: string, fallback: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || fallback;
}

function drawLane(
  canvas: HTMLCanvasElement,
  notes: readonly SingNote[],
  trace: readonly TracePoint[],
  graded: readonly { cents: number | null; credit: number }[] | null,
  tolCents: number,
  span: number,
  now: number | null,
  showTrace: boolean,
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = LANE_H;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const g = canvas.getContext("2d");
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const c = {
    surface: cssVar(canvas, "--oak-surface-2", "#efe9de"),
    border: cssVar(canvas, "--oak-border", "#ddd3c3"),
    text: cssVar(canvas, "--oak-text", "#1f1a14"),
    text3: cssVar(canvas, "--oak-text-3", "#6e6457"),
    accent: cssVar(canvas, "--oak-accent", "#2f6b45"),
    amber: cssVar(canvas, "--oak-accent-2", "#b7791f"),
    lane: cssVar(canvas, "--oak-lane-in", "rgba(47,107,69,.06)"),
  };
  g.fillStyle = c.surface;
  g.fillRect(0, 0, w, h);
  const midis = notes.map((n) => n.midi);
  const lo = Math.min(...midis) - 2.5;
  const hi = Math.max(...midis) + 2.5;
  const y = (m: number) => h - 14 - ((m - lo) / (hi - lo)) * (h - 28);
  const x = (t: number) => 8 + (Math.max(0, Math.min(span, t)) / span) * (w - 16);
  // Semitone lines.
  g.strokeStyle = c.border;
  g.lineWidth = 1;
  for (let m = Math.ceil(lo); m <= hi; m++) {
    g.beginPath();
    g.moveTo(0, Math.round(y(m)) + 0.5);
    g.lineTo(w, Math.round(y(m)) + 0.5);
    g.stroke();
  }
  // Ribbons: ±tolerance; filled by credit once graded (opacity ∝ accuracy), with a tick at the mean error.
  notes.forEach((n, i) => {
    const top = y(n.midi + tolCents / 100);
    const bottom = y(n.midi - tolCents / 100);
    const x0 = x(n.at);
    const x1 = x(n.at + n.dur);
    const nr = graded?.[i];
    g.fillStyle = c.lane;
    g.fillRect(x0, top, x1 - x0, bottom - top);
    if (nr && nr.cents !== null) {
      g.globalAlpha = 0.15 + 0.45 * nr.credit;
      g.fillStyle = c.accent;
      g.fillRect(x0, top, x1 - x0, bottom - top);
      g.globalAlpha = 1;
      const ty = y(n.midi + Math.max(-100, Math.min(100, nr.cents)) / 100);
      g.strokeStyle = c.text;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x1 - 14, ty);
      g.lineTo(x1 - 2, ty);
      g.stroke();
    }
    g.strokeStyle = c.accent;
    g.lineWidth = 1.5;
    g.strokeRect(x0 + 0.5, top + 0.5, x1 - x0 - 1, bottom - top - 1);
    g.fillStyle = c.text;
    g.font = "600 12px Inter Variable, system-ui, sans-serif";
    g.fillText(n.label ?? "", x0 + 4, top - 4);
  });
  // The live trace: 3 px, degree-neutral text colour, gaps for unvoiced frames.
  if (showTrace) {
    g.strokeStyle = c.text;
    g.lineWidth = 3;
    g.lineJoin = "round";
    g.beginPath();
    let pen = false;
    for (const pt of trace) {
      if (pt.midi === null || pt.t < 0 || pt.t > span) {
        pen = false;
        continue;
      }
      const px = x(pt.t);
      const py = y(Math.max(lo, Math.min(hi, pt.midi)));
      if (pen) g.lineTo(px, py);
      else g.moveTo(px, py);
      pen = true;
    }
    g.stroke();
  }
  if (now !== null && now >= 0) {
    g.strokeStyle = c.amber;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(x(now), 0);
    g.lineTo(x(now), h);
    g.stroke();
  }
}

export function SingCaptureAnswer(p: AnswerWidgetProps<"mic">) {
  const { value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const setup = env.sing;
  const profile = env.profile ?? NEUTRAL_PROFILE;
  const audio = env.audio ?? appAudio;
  const tol = setup?.tol ?? DEFAULT_SING_TOL;
  const tolCents = tol.cents === "learner" ? profile.singTolCents : tol.cents;
  const showTrace = setup?.showTrace ?? "live";
  const leadIn = setup?.leadIn ?? 1;
  const fitted = setup ? fitNotes(setup.notes, profile) : { notes: [], shift: 0 };
  const notes = fitted.notes.map((n) => ({ ...n, at: n.at + leadIn }));
  const span = takeSeconds(notes) + 0.4;

  const [phase, setPhase] = useState<Phase>(env.quiet ? "quiet" : value.length > 0 ? "done" : "idle");
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<SungResult | null>(null);
  const [trace, setTrace] = useState<TracePoint[]>([]);
  const [now, setNow] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [selfCheck, setSelfCheck] = useState<QuietEvidence["selfCheck"] | null>(null);
  const [srLine, setSrLine] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const session = useRef<MicSession | null>(null);
  const frames = useRef<PitchFrame[]>([]);
  const startAt = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (env.quiet) setPhase("quiet");
  }, [env.quiet]);
  useEffect(() => {
    if (p.autoFocus) btn.current?.focus();
  }, [p.autoFocus]);
  useEffect(() => () => session.current?.close(), []);

  // What the lane and the chips show: the live or final result, else a stored take's summary (`value`).
  const graded: readonly { cents: number | null; credit: number }[] | null =
    result?.notes ?? (value.length > 0 ? value : null);
  // Redraw on every change (cheap: a few hundred points).
  useEffect(() => {
    const el = canvas.current;
    if (!el || notes.length === 0) return;
    drawLane(
      el,
      notes,
      trace,
      graded,
      tolCents,
      span,
      phase === "singing" ? now : null,
      showTrace === "live" || (showTrace === "after" && phase === "done"),
    );
  });

  // The take: frames in, live grade and trace out (10 per second); the end closes the mic and grades.
  const lastSr = useRef(0);
  const tick = useRef<() => void>(() => {});
  tick.current = () => {
    const s = session.current;
    const ctx = ctxRef.current;
    if (!ctx || !s) return;
    const t = ctx.currentTime - startAt.current;
    setNow(t);
    setLevel(dbToLevel(s.levelDb()));
    const fs = frames.current;
    const tr = traceOf(fs, notes, startAt.current, profile);
    setTrace(tr);
    setResult(gradeLive(fs, notes, startAt.current, tol, setup?.mode ?? "pitch", profile, ctx.currentTime));
    if (performance.now() - lastSr.current > 1500) {
      lastSr.current = performance.now();
      const active = notes.findIndex((n) => t >= n.at && t <= n.at + n.dur);
      const last = [...tr].reverse().find((pt) => pt.midi !== null);
      if (active >= 0 && last && last.midi !== null) {
        const cents = (last.midi - (notes[active] as SingNote).midi) * 100;
        const n = needleWords(cents, tolCents);
        setSrLine(`Target ${notes[active]?.label ?? active + 1}. You're ${n.words}, ${centsText(cents)}.`);
      }
    }
    if (t >= span) stop(true);
  };
  useEffect(() => {
    if (phase !== "singing") return;
    const id = window.setInterval(() => tick.current(), 100);
    return () => window.clearInterval(id);
  }, [phase]);

  const stop = (grade: boolean) => {
    const s = session.current;
    session.current = null;
    s?.close();
    setNow(null);
    setLevel(0);
    if (!grade) {
      setPhase("idle");
      return;
    }
    const final = gradeTake(frames.current, notes, startAt.current, tol, setup?.mode ?? "pitch", profile);
    setResult(final);
    setTrace(traceOf(frames.current, notes, startAt.current, profile));
    setPhase("done");
    onChange(summarize(final));
    setup?.onTake?.({ result: final, startAt: startAt.current, frames: frames.current.length });
  };

  const sing = async () => {
    if (disabled || !setup) return;
    setProblem(null);
    setResult(null);
    setTrace([]);
    onChange([]);
    try {
      if (setup.playCue) {
        setPhase("cue");
        await setup.playCue();
      }
      setPhase("opening");
      const [{ openMic }, ctx] = await Promise.all([import("../../lib/mic.ts"), audio.context()]);
      const s = await openMic();
      session.current = s;
      frames.current = [];
      s.onFrame((f) => frames.current.push(f));
      ctxRef.current = ctx;
      startAt.current = ctx.currentTime;
      setPhase("singing");
    } catch (e) {
      const reason = (e as { reason?: string }).reason;
      session.current?.close();
      session.current = null;
      if (reason === "denied" || reason === "no-device") {
        setProblem(
          reason === "denied"
            ? "The microphone is blocked for Oak. You can listen and self-check instead."
            : "No microphone was found. You can listen and self-check instead.",
        );
        setPhase("quiet");
      } else {
        setProblem(
          e instanceof Error ? `The microphone did not open: ${e.message}` : "The microphone did not open.",
        );
        setPhase("idle");
      }
    }
  };

  const report = (check: QuietEvidence["selfCheck"]) => {
    setSelfCheck(check);
    setup?.onQuietEvidence?.({ modality: "fallback", selfCheck: check, at: Date.now() });
  };

  if (!setup)
    return (
      <AnswerFrame kind="mic" idBase={p.idBase} label={p.label} feedback={feedback} onSubmit={p.onSubmit}>
        <p className="text-sm text-text-2">This step has no notes to sing yet.</p>
      </AnswerFrame>
    );

  const quiet = phase === "quiet";
  const lastCents = (() => {
    if (phase !== "singing" || now === null) return null;
    const active = notes.find((n) => now >= n.at && now <= n.at + n.dur);
    const last = trace.at(-1);
    if (!active || !last || last.midi === null) return null;
    return { cents: (last.midi - active.midi) * 100, folded: last.folded };
  })();
  const needle = needleWords(lastCents?.cents ?? null, tolCents);

  return (
    <AnswerFrame
      kind="mic"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      keys={
        <>
          {quiet ? null : <KeyHint keys={["⌘/Ctrl ⇧ M"]}>close the mic</KeyHint>}
          <KeyHint keys={["Enter"]}>check</KeyHint>
        </>
      }
    >
      {quiet ? (
        <div className="flex max-w-[40rem] flex-col gap-3 rounded-card border border-border bg-surface p-3">
          <p className="flex items-center gap-2 font-medium">
            <Ear aria-hidden className="size-4 text-text-2" />
            Listen and self-check
          </p>
          <p className="text-sm text-text-2">
            {/* "Quiet mode" only when the learner chose it; a blocked or missing mic says why below instead. */}
            {problem ? "Play it" : "Quiet mode: play it"}, hear it in your head, then say how it went. Nothing
            is recorded, and there is no penalty.
          </p>
          {problem ? <p className="text-sm text-text-2">{problem}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {setup.playTarget ? (
              <Button data-enter="native" onClick={() => setup.playTarget?.()} disabled={disabled}>
                Play it
              </Button>
            ) : null}
            <Button
              data-enter="native"
              variant={selfCheck === "heard-it" ? "primary" : "secondary"}
              aria-pressed={selfCheck === "heard-it"}
              onClick={() => report("heard-it")}
              disabled={disabled}
            >
              I heard it
            </Button>
            <Button
              data-enter="native"
              variant={selfCheck === "not-sure" ? "primary" : "secondary"}
              aria-pressed={selfCheck === "not-sure"}
              onClick={() => report("not-sure")}
              disabled={disabled}
            >
              Not sure yet
            </Button>
          </div>
          <p className="min-h-5 text-sm text-text-2" aria-live="polite">
            {selfCheck === "heard-it"
              ? "Noted. Singing it later turns this into voice practice."
              : selfCheck === "not-sure"
                ? "Noted. Play it again as often as you like."
                : ""}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-10 flex-wrap items-center gap-3">
            {phase === "singing" ? (
              <Button
                data-enter="native"
                icon={<Square aria-hidden className="size-4" />}
                onClick={() => stop(false)}
              >
                Stop
              </Button>
            ) : (
              <Button
                ref={btn}
                data-enter="native"
                variant={phase === "done" ? "secondary" : "primary"}
                icon={
                  phase === "done" ? (
                    <RotateCcw aria-hidden className="size-4" />
                  ) : (
                    <Mic aria-hidden className="size-4" />
                  )
                }
                onClick={() => void sing()}
                disabled={disabled || phase === "cue" || phase === "opening"}
                loading={phase === "opening"}
              >
                {phase === "done" ? "Sing it again" : phase === "cue" ? "Listen…" : "Sing"}
              </Button>
            )}
            <span className="text-sm text-text-2" aria-live="polite" data-testid="sing-phase">
              {phase === "idle"
                ? `${notes.length === 1 ? "One note" : `${notes.length} notes`}, within ±${tolCents}¢. Your voice is analysed live on this computer. Nothing is recorded or sent.`
                : phase === "cue"
                  ? "Listen first."
                  : phase === "opening"
                    ? "Opening the microphone…"
                    : phase === "singing"
                      ? (now ?? 0) < (notes[0]?.at ?? 0)
                        ? "Get ready…"
                        : "Sing now."
                      : `Done: ${value.filter((n) => n.credit >= 1).length} of ${value.length} in tune.`}
            </span>
            {phase !== "singing" ? (
              <Button
                variant="ghost"
                size="sm"
                data-enter="native"
                onClick={() => setPhase("quiet")}
                disabled={disabled}
              >
                Can't sing now
              </Button>
            ) : null}
          </div>
          {problem ? <p className="text-sm text-issue">{problem}</p> : null}
          <div className="relative">
            <canvas
              ref={canvas}
              role="img"
              aria-label={`Pitch lane: ${notes.map((n) => n.label ?? "").join(" ")}`}
              className="block w-full rounded-card border border-border"
              style={{ height: LANE_H }}
            />
            <div className="pointer-events-none absolute top-2 right-2 flex flex-col items-end gap-1 text-sm">
              <span
                className={clsx(
                  "rounded-control bg-surface/90 px-2 py-0.5 font-medium tabular-nums",
                  phase !== "singing" && "invisible",
                )}
                data-testid="sing-needle"
              >
                {needle.arrow ? <span aria-hidden>{needle.arrow} </span> : null}
                {needle.words}
                {lastCents ? ` ${centsText(lastCents.cents)}` : ""}
              </span>
              {lastCents && lastCents.folded !== 0 ? (
                <span className="rounded-control bg-surface/90 px-1.5 text-[0.75rem] text-text-2">
                  {lastCents.folded > 0 ? "8vb" : "8va"}
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <ol className="flex min-h-7 flex-wrap items-start gap-2 text-sm" aria-label="Notes">
              {notes.map((n, i) => {
                const r = graded?.[i];
                const settled = phase === "done" && r;
                return (
                  <li
                    key={i}
                    className={clsx(
                      "inline-flex items-center gap-1 rounded-control border px-2 py-0.5",
                      settled ? (r.credit >= 1 ? "border-accent" : "border-issue") : "border-border",
                    )}
                  >
                    <span className="font-semibold">{n.label ?? i + 1}</span>
                    <span className="text-text-2 tabular-nums">
                      {settled ? (r.cents === null ? "not heard" : centsText(r.cents)) : "·"}
                    </span>
                  </li>
                );
              })}
            </ol>
            <MicLevelMeter level={level} live={phase === "singing"} segments={16} />
          </div>
          <p className="sr-only" aria-live="polite">
            {srLine}
          </p>
        </div>
      )}
    </AnswerFrame>
  );
}
