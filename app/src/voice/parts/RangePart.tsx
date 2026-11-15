// `voice.range` (ux §4.7, contracts §8.6): a ten-second sweep with a live pitch trace. Stores the range and the
// comfortable middle of it, which Oak uses to move sung targets into the learner's own octave. No voice-type
// labels, ever. Any result can be measured again (docs/design/retry.md §3.4): a new sweep replaces the saved range
// only when Oak caught one; a range saved earlier (a reload, Back) opens in its result, and "Set up later" is gone
// once a range is saved (Continue is the way on).
import type { PitchFrame } from "@oak/pitch";
import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatNoteMidi } from "../../lib/notes.ts";
import { MEASURE_LINE } from "../../lib/retry.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Progress } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { liveMidi, noteReadout, type RangeLike, rangeOk, rangeWords } from "../logic.ts";
import { PitchTrace } from "../PitchTrace.tsx";
import { closeInput, voiceAudio } from "../services.ts";
import { PartActions, PartFrame, type PartProps, StatusSlot, useSaveRun } from "./common.tsx";

const SWEEP_SEC = 10;

/** The prompt for second `t` of the sweep. */
export function sweepPrompt(t: number): string {
  if (t < 4) return "Slide down to your lowest comfortable note…";
  if (t < 8) return "…now up to your highest comfortable note…";
  return "…and settle on a comfortable middle note.";
}

type Phase = "ready" | "sweeping" | "result" | "unclear";

function savedRange(p: PartProps["profile"]): RangeLike | null {
  return p.vocalLowMidi !== null &&
    p.vocalHighMidi !== null &&
    p.comfortLowMidi !== null &&
    p.comfortHighMidi !== null
    ? {
        lowMidi: p.vocalLowMidi,
        highMidi: p.vocalHighMidi,
        comfortLowMidi: p.comfortLowMidi,
        comfortHighMidi: p.comfortHighMidi,
      }
    : null;
}

export function RangePart({ profile, onDone, onSkip, context, back }: PartProps) {
  // Onboarding opens on a range saved earlier (a reload, Back); Settings' re-run starts a new sweep.
  const resume = context === "onboarding";
  const [range, setRange] = useState<RangeLike | null>(() => (resume ? savedRange(profile) : null));
  const [phase, setPhase] = useState<Phase>(() => (resume && savedRange(profile) ? "result" : "ready"));
  const [takes, setTakes] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frames = useRef<PitchFrame[]>([]);
  const stop = useRef<AbortController | null>(null);
  const alive = useRef(true);
  const run = useSaveRun();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current?.abort();
      closeInput();
    };
  }, []);

  const sweep = async () => {
    setError(null);
    frames.current = [];
    setElapsed(0);
    setPhase("sweeping");
    const ctl = new AbortController();
    stop.current = ctl;
    const t0 = performance.now();
    const iv = setInterval(() => {
      setElapsed((performance.now() - t0) / 1000);
      setNote(liveMidi(frames.current));
    }, 100);
    const end = (p: Phase) => {
      setTakes((n) => n + 1);
      setPhase(p);
    };
    try {
      const { calibration } = await voiceAudio();
      const r = await calibration.rangeSweep((f) => {
        frames.current.push(f);
      }, ctl.signal);
      if (!alive.current) return;
      if (!rangeOk(r)) {
        end("unclear");
        return;
      }
      const saved = await run.save({
        kind: "range",
        result: { ...r, frames: frames.current.length },
        patch: {
          vocalLowMidi: r.lowMidi,
          vocalHighMidi: r.highMidi,
          comfortLowMidi: r.comfortLowMidi,
          comfortHighMidi: r.comfortHighMidi,
        },
      });
      if (!alive.current) return;
      if (saved) {
        setRange(r);
        end("result");
      } else end(range ? "result" : "ready");
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RangeError) end("unclear");
      else {
        setPhase(range ? "result" : "ready");
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      clearInterval(iv);
      stop.current = null;
    }
  };

  const shown = phase === "result" || phase === "unclear";
  const words = range ? rangeWords(range) : null;
  const marks =
    range && phase === "result"
      ? [
          { midi: range.comfortLowMidi, label: `comfortable from ${formatNoteMidi(range.comfortLowMidi)}` },
          { midi: range.comfortHighMidi, label: `to ${formatNoteMidi(range.comfortHighMidi)}` },
        ]
      : [];

  return (
    <PartFrame
      testId="part-range"
      context={context}
      title="Your voice"
      instruction="Sing an 'ooh' from your lowest comfortable note up to your highest, then settle in the middle."
      lead="Ten seconds. It tells Oak which keys suit your voice. There are no right answers and no voice types."
    >
      <PitchTrace
        frames={() => frames.current}
        live={phase === "sweeping"}
        lowMidi={36}
        highMidi={84}
        marks={marks}
        label="Live pitch trace of your voice"
        height={200}
      />
      {phase === "sweeping" && (
        <div className="flex flex-col gap-2" data-testid="range-sweeping">
          <p className="font-display text-h3" aria-live="polite">
            {sweepPrompt(elapsed)}
          </p>
          <Progress value={Math.min(elapsed, SWEEP_SEC)} max={SWEEP_SEC} label="Sweep progress" />
          <p className="text-sm text-text-2">
            Now: <span className="tabular-nums">{noteReadout(note)}</span>
          </p>
        </div>
      )}
      <StatusSlot>
        {phase === "result" && words && (
          <Callout tone="success" title={words.title}>
            <span data-testid="range-result">Oak will choose keys that sit there.</span>
            <span className="mt-1 block text-text-3" data-testid="range-detail">
              {words.detail}
            </span>
          </Callout>
        )}
        {phase === "unclear" && (
          <Callout tone="attention" title="Oak didn't catch a range">
            <span data-testid="range-unclear">
              It heard little or no change in pitch. Sing an "ooh" a little louder and slide further down and
              up.
              {range ? " Your saved range stays until a new one works." : ""}
            </span>
          </Callout>
        )}
        {error && (
          <Callout tone="issue" title="The microphone didn't open">
            {error}
          </Callout>
        )}
      </StatusSlot>
      <PartActions
        context={context}
        back={back}
        onSkip={range ? null : onSkip}
        running={phase === "sweeping" ? { label: "Listening…", onStop: () => stop.current?.abort() } : null}
        resultKey={shown ? `${phase}-${takes}` : null}
        onRetry={shown ? () => void sweep() : null}
        onContinue={shown || range ? onDone : null}
        continueDisabled={range === null || phase === "sweeping"}
        continueNote="Sing a sweep Oak can measure to go on, or set it up later."
        line={shown && range ? MEASURE_LINE : null}
        action={
          phase === "ready" ? (
            <Button
              variant="primary"
              onClick={() => void sweep()}
              icon={<Mic aria-hidden className="size-4" />}
              data-testid="range-start"
              autoFocus
            >
              Start the sweep
            </Button>
          ) : null
        }
      />
    </PartFrame>
  );
}
