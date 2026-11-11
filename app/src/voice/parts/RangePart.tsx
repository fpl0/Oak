// `voice.range` (ux §4.7, contracts §8.6): a ten-second sweep with a live pitch trace. Stores the range and the
// comfortable middle of it, which Oak uses to move sung targets into the learner's own octave. No voice-type
// labels, ever.
import type { PitchFrame } from "@oak/pitch";
import { Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatNoteMidi } from "../../lib/notes.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Progress } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { liveMidi, noteReadout, type RangeLike, rangeOk, rangeSummary } from "../logic.ts";
import { PitchTrace } from "../PitchTrace.tsx";
import { closeInput, voiceAudio } from "../services.ts";
import { PartFooter, PartFrame, type PartProps, useSaveRun } from "./common.tsx";

const SWEEP_SEC = 10;

/** The prompt for second `t` of the sweep. */
export function sweepPrompt(t: number): string {
  if (t < 4) return "Slide down to your lowest comfortable note…";
  if (t < 8) return "…now up to your highest comfortable note…";
  return "…and settle on a comfortable middle note.";
}

type Phase = "intro" | "sweeping" | "result" | "unclear";

export function RangePart({ profile, onDone, onSkip }: PartProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [elapsed, setElapsed] = useState(0);
  const [note, setNote] = useState<number | null>(null);
  const [range, setRange] = useState<RangeLike | null>(
    profile.vocalLowMidi !== null &&
      profile.vocalHighMidi !== null &&
      profile.comfortLowMidi !== null &&
      profile.comfortHighMidi !== null
      ? {
          lowMidi: profile.vocalLowMidi,
          highMidi: profile.vocalHighMidi,
          comfortLowMidi: profile.comfortLowMidi,
          comfortHighMidi: profile.comfortHighMidi,
        }
      : null,
  );
  const [error, setError] = useState<string | null>(null);
  const frames = useRef<PitchFrame[]>([]);
  const alive = useRef(true);
  const run = useSaveRun();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      closeInput();
    };
  }, []);

  const sweep = async () => {
    setError(null);
    frames.current = [];
    setPhase("sweeping");
    const t0 = performance.now();
    const iv = setInterval(() => {
      setElapsed((performance.now() - t0) / 1000);
      setNote(liveMidi(frames.current));
    }, 100);
    try {
      const { calibration } = await voiceAudio();
      const r = await calibration.rangeSweep((f) => {
        frames.current.push(f);
      });
      if (!alive.current) return;
      if (!rangeOk(r)) {
        setPhase("unclear");
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
        setPhase("result");
      } else setPhase("intro");
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RangeError) setPhase("unclear");
      else {
        setPhase("intro");
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      clearInterval(iv);
    }
  };

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
      title="Your voice"
      lead="Ten seconds: slide down to your lowest comfortable note, up to your highest, then settle in the middle. It tells Oak which keys suit your voice. There are no right answers and no voice types."
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
      {phase === "result" && range && (
        <Callout tone="success" title={rangeSummary(range)}>
          You can measure it again any time in Settings › Voice.
        </Callout>
      )}
      {phase === "unclear" && (
        <Callout tone="attention" title="Oak didn't catch a range">
          It heard little or no change in pitch. Sing an "ooh" a little louder and slide further down and up,
          or set this up later.
        </Callout>
      )}
      {error && (
        <Callout tone="issue" title="The microphone didn't open">
          {error}
        </Callout>
      )}
      <PartFooter
        onSkip={phase === "sweeping" ? undefined : onSkip}
        primary={
          phase === "result" ? (
            <Button variant="primary" onClick={onDone} data-testid="part-continue" autoFocus>
              Continue
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={phase === "sweeping"}
              onClick={() => void sweep()}
              icon={<Mic aria-hidden className="size-4" />}
              data-testid="range-start"
              autoFocus
            >
              {phase === "intro" ? "Start the sweep" : "Sweep again"}
            </Button>
          )
        }
      >
        {phase === "result" && (
          <Button onClick={() => void sweep()} data-testid="range-again">
            Sweep again
          </Button>
        )}
      </PartFooter>
    </PartFrame>
  );
}
