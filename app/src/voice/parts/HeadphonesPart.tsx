// `audio.headphones` (ux §4.7, contracts §8.6): what the learner listens on, a left/right check, and the
// AirPods guidance. Stores `outputKind` and the context's output latency.
import { Headphones, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../../ui/kit/Button.tsx";
import { Callout, SegmentedControl, type SegmentOption } from "../../ui/kit/Controls.tsx";
import { type OutputChoice, outputChoiceOf, outputGuidance } from "../logic.ts";
import { voiceAudio } from "../services.ts";
import { PartFooter, PartFrame, type PartProps, useSaveRun } from "./common.tsx";

const CHOICES: readonly SegmentOption<OutputChoice>[] = [
  { value: "wired", label: "Wired headphones" },
  { value: "bluetooth", label: "Bluetooth or AirPods" },
  { value: "speakers", label: "Speakers" },
];

type Test = "idle" | "playing" | "asking" | "right" | "swapped";

export function HeadphonesPart({ profile, onDone, onSkip }: PartProps) {
  const [choice, setChoice] = useState<OutputChoice>(outputChoiceOf(profile.outputKind));
  const [detected, setDetected] = useState<string | null>(null);
  const [test, setTest] = useState<Test>("idle");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const run = useSaveRun();

  // Read the output device's name once (the adapter already exists after the first gesture).
  useEffect(() => {
    let live = true;
    void voiceAudio()
      .then(({ calibration }) => calibration.devices())
      .then((d) => {
        if (!live) return;
        if (d.outputLabel) setDetected(d.outputLabel);
        if (d.bluetoothOutput) setChoice("bluetooth");
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const play = async () => {
    setError(null);
    setTest("playing");
    try {
      const { oak, calibration } = await voiceAudio();
      await oak.unlock();
      await calibration.outputCheck();
      setTest("asking");
    } catch (e) {
      setTest("idle");
      setError(e instanceof Error ? e.message : "Sound did not start.");
    }
  };
  const answer = (side: "left" | "right") => {
    setAttempts((a) => a + 1);
    setTest(side === "left" ? "right" : "swapped");
  };
  const finish = async () => {
    const { oak } = await voiceAudio().catch(() => ({ oak: null }));
    const ctx = oak?.ctx;
    const outputLatencyMs = ctx
      ? Math.round(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000)
      : null;
    const saved = await run.save({
      kind: "output",
      result: { choice, lrCorrect: test === "right", attempts, label: detected },
      patch: { outputKind: choice, ...(outputLatencyMs === null ? {} : { outputLatencyMs }) },
    });
    if (saved) onDone();
  };
  const guidance = outputGuidance(choice);
  const answered = test === "right" || test === "swapped";

  return (
    <PartFrame
      testId="part-headphones"
      title="Headphones on"
      lead="Wired headphones work best: no delay, and the microphone hears only you. Oak plays a tone in one ear, then in the other."
    >
      <div className="flex flex-col gap-3">
        <span className="text-sm font-medium" aria-hidden>
          What are you listening on?
        </span>
        <div>
          <SegmentedControl<OutputChoice>
            label="What are you listening on?"
            value={choice}
            options={CHOICES}
            onChange={setChoice}
          />
        </div>
        {detected && (
          <p className="text-sm text-text-3">
            Your computer reports <span className="text-text-2">{detected}</span>.
          </p>
        )}
        <Callout tone={guidance.tone} title={guidance.title}>
          {guidance.body}
        </Callout>
      </div>

      <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => void play()}
            loading={test === "playing"}
            icon={<Play aria-hidden className="size-4" />}
            data-testid="lr-play"
          >
            {test === "idle" ? "Play the test" : "Play it again"}
          </Button>
          <span className="text-sm text-text-2" aria-live="polite">
            {test === "playing" ? "Left ear first, then right…" : ""}
          </span>
        </div>
        {(test === "asking" || answered) && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium">Which ear did the first tone come from?</legend>
            <div className="flex gap-2">
              <Button onClick={() => answer("left")} data-testid="lr-left" aria-pressed={test === "right"}>
                Left
              </Button>
              <Button
                onClick={() => answer("right")}
                data-testid="lr-right"
                aria-pressed={test === "swapped"}
              >
                Right
              </Button>
            </div>
          </fieldset>
        )}
        {test === "right" && (
          <Callout tone="success" title="Left, then right: the sides are the right way round." />
        )}
        {test === "swapped" && (
          <Callout tone="attention" title="The first tone came from the left">
            Check the L and R marks on your headphones, then play it again. Speakers can blur the sides; that
            is fine for Oak.
          </Callout>
        )}
        {error && (
          <Callout tone="issue" title="Sound didn't start">
            {error}
          </Callout>
        )}
      </div>

      <PartFooter
        onSkip={onSkip}
        primary={
          <Button
            variant="primary"
            disabled={!answered}
            loading={run.pending}
            onClick={() => void finish()}
            icon={<Headphones aria-hidden className="size-4" />}
            data-testid="part-continue"
          >
            Continue
          </Button>
        }
      />
    </PartFrame>
  );
}
