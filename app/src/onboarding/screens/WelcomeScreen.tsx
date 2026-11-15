// `onb.welcome` (ux §8; the onboarding frame, docs/design/retry.md §6.1): one sentence, one button. "Start sound" is the real user gesture that unlocks audio
// (the AudioContext may only start from one); it then warms the loop's sounds so the loop starts at once.
import { Volume2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../../ui/kit/Button.tsx";
import { Progress } from "../../ui/kit/basics.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { PartActions, PartFrame, StatusSlot } from "../../voice/parts/common.tsx";
import { ONBOARDING_LOOP } from "../loop.ts";
import { onboardingServices } from "../services.ts";

/** Oak's mark: growth rings. */
export function Rings({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="32" cy="32" r="29" />
      <circle cx="31" cy="33" r="21" opacity="0.8" />
      <circle cx="30" cy="33" r="13" opacity="0.6" />
      <circle cx="30" cy="34" r="5" opacity="0.5" />
    </svg>
  );
}

export function WelcomeScreen({ onStarted }: { onStarted(): void }) {
  const [state, setState] = useState<"idle" | "waking" | "loading" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 1 });
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setError(null);
    setState("waking");
    try {
      const { oak } = await onboardingServices();
      await oak.unlock();
      setState("loading");
      await oak.preload(oak.soundsIn(ONBOARDING_LOOP), (done, total) => setProgress({ done, total }));
      onStarted();
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <PartFrame
      testId="screen-welcome"
      context="onboarding"
      title="Welcome"
      instruction="Put headphones on if you have them, then start the sound."
      lead={
        <>
          <span className="flex items-center gap-3 font-display text-h3 text-text">
            <Rings className="size-10 shrink-0 text-accent" />
            Learn music by making it.
          </span>
          <span className="mt-2 block">
            You'll hear a short loop, change one number in its code, and hear what changes. Then Oak sets up
            your headphones and microphone. About ten minutes.
          </span>
        </>
      }
    >
      <StatusSlot>
        {state === "loading" && (
          <div className="w-full max-w-sm" aria-live="polite">
            <Progress
              value={progress.done}
              max={Math.max(1, progress.total)}
              label="Loading the loop's sounds"
            />
            <p className="mt-2 text-sm text-text-3">Loading the loop's sounds…</p>
          </div>
        )}
        {state === "error" && error && (
          <Callout tone="issue" title="Sound didn't start">
            {error}. Press Start sound to try again.
          </Callout>
        )}
      </StatusSlot>
      <PartActions
        context="onboarding"
        resultKey={null}
        onRetry={null}
        onContinue={null}
        testId="welcome-actions"
        action={
          <Button
            variant="primary"
            onClick={() => void start()}
            loading={state === "waking" || state === "loading"}
            icon={<Volume2 aria-hidden className="size-4" />}
            data-testid="start-sound"
            autoFocus
          >
            Start sound
          </Button>
        }
      />
    </PartFrame>
  );
}
