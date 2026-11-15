// `audio.headphones` (ux §4.7, contracts §8.6): what the learner listens on, a left/right ear test, and the
// AirPods guidance. Stores `outputKind` and the context's output latency. The ear test can be taken again after
// any answer (docs/design/retry.md §5 row 26); a test saved earlier (a reload, Back) opens in its result.
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { useCalibrations } from "../../lib/queries.ts";
import { MEASURE_LINE } from "../../lib/retry.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Callout, SegmentedControl, type SegmentOption } from "../../ui/kit/Controls.tsx";
import { type OutputChoice, outputChoiceOf, outputGuidance } from "../logic.ts";
import { voiceAudio } from "../services.ts";
import { PartActions, PartFrame, type PartProps, StatusSlot, useSaveRun } from "./common.tsx";

const CHOICES: readonly SegmentOption<OutputChoice>[] = [
  { value: "wired", label: "Wired headphones" },
  { value: "bluetooth", label: "Bluetooth or AirPods" },
  { value: "speakers", label: "Speakers" },
];

type Test = "idle" | "playing" | "asking" | "right" | "swapped" | "saved";

export function HeadphonesPart({ profile, onDone, onSkip, context, back }: PartProps) {
  const [choice, setChoice] = useState<OutputChoice>(outputChoiceOf(profile.outputKind));
  const [detected, setDetected] = useState<string | null>(null);
  const [test, setTest] = useState<Test>("idle");
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const run = useSaveRun();
  const saved = useCalibrations("output");
  // Onboarding opens on a test saved earlier (a reload, Back); Settings' re-run starts a new one.
  const hasSaved =
    context === "onboarding" && (saved.data?.items.length ?? 0) > 0 && profile.outputKind !== "unknown";

  // A test saved earlier (a reload or Back in the middle of onboarding) opens in its result.
  useEffect(() => {
    if (hasSaved) setTest((t) => (t === "idle" ? "saved" : t));
  }, [hasSaved]);

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
    // Nothing new since the saved test, and the same kind of output: the saved result stands.
    if (test === "saved" && choice === outputChoiceOf(profile.outputKind)) {
      onDone();
      return;
    }
    const { oak } = await voiceAudio().catch(() => ({ oak: null }));
    const ctx = oak?.ctx;
    const outputLatencyMs = ctx
      ? Math.round(((ctx.outputLatency || 0) + (ctx.baseLatency || 0)) * 1000)
      : null;
    const ok = await run.save({
      kind: "output",
      result: { choice, lrCorrect: test === "right" || test === "saved", attempts, label: detected },
      patch: { outputKind: choice, ...(outputLatencyMs === null ? {} : { outputLatencyMs }) },
    });
    if (ok) onDone();
  };
  const guidance = outputGuidance(choice);
  const answered = test === "right" || test === "swapped" || test === "saved";

  return (
    <PartFrame
      testId="part-headphones"
      context={context}
      title="Headphones"
      instruction="Choose what you listen on, then take the ear test."
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

      {(test === "playing" || test === "asking" || test === "right" || test === "swapped") && (
        <div
          className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
          data-testid="lr-test"
        >
          <span className="text-sm text-text-2" aria-live="polite">
            {test === "playing" ? "Left ear first, then right…" : ""}
          </span>
          {test !== "playing" && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-medium">Which ear did the first tone come from?</legend>
              <div className="flex gap-2">
                <Button
                  onClick={() => answer("left")}
                  data-testid="lr-left"
                  aria-pressed={test === "right"}
                  disabled={test !== "asking"}
                  autoFocus={test === "asking"}
                >
                  Left
                </Button>
                <Button
                  onClick={() => answer("right")}
                  data-testid="lr-right"
                  aria-pressed={test === "swapped"}
                  disabled={test !== "asking"}
                >
                  Right
                </Button>
              </div>
            </fieldset>
          )}
        </div>
      )}

      <StatusSlot>
        {test === "right" && (
          <Callout tone="success" title="Left, then right: the sides are the right way round." />
        )}
        {test === "swapped" && (
          <Callout tone="attention" title="The first tone came from the left">
            Check the L and R marks on your headphones, then try again. Speakers can blur the sides; that is
            fine for Oak.
          </Callout>
        )}
        {test === "saved" && (
          <Callout tone="success" title="Your ear test is saved.">
            <span data-testid="lr-saved">Try it again if you changed headphones.</span>
          </Callout>
        )}
        {error && (
          <Callout tone="issue" title="Sound didn't start">
            {error}
          </Callout>
        )}
      </StatusSlot>

      <PartActions
        context={context}
        back={back}
        // Answered: Continue is the way on. "Set up later" beside it would throw the answer away and record the step
        // as skipped (the same rule as a saved range).
        onSkip={answered ? null : onSkip}
        running={test === "playing" ? { label: "Listening…" } : null}
        resultKey={answered ? `${test}-${attempts}` : null}
        onRetry={answered ? () => void play() : null}
        onContinue={answered ? () => void finish() : null}
        line={test === "saved" ? MEASURE_LINE : null}
        action={
          test === "idle" ? (
            <Button
              variant="primary"
              onClick={() => void play()}
              icon={<Play aria-hidden className="size-4" />}
              data-testid="lr-play"
              autoFocus
            >
              Start the ear test
            </Button>
          ) : null
        }
        retryDisabled={run.pending}
        continueDisabled={run.pending}
      />
    </PartFrame>
  );
}
