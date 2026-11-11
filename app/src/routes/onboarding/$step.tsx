// Onboarding = lesson U00.L01 "Hello, loop" (focus mode, ux §8). The flow (sound check, mic, voice, first loop)
// is Wave 2. This page already loads the profile and the server health so each step knows what is set up.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { usePageTitle } from "../../lib/nav.ts";
import { useHealth, useProfile } from "../../lib/queries.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Page, type RailStep, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

const ONBOARDING_STEPS = [
  "Welcome",
  "Sound check",
  "Headphones",
  "Microphone",
  "Noise floor",
  "Tap latency",
  "Your voice",
  "Range",
  "Tutor",
  "First loop",
] as const;

export const Route = createFileRoute("/onboarding/$step")({ component: Onboarding });

function Onboarding() {
  const { step } = Route.useParams();
  const n = Math.min(ONBOARDING_STEPS.length, Math.max(1, Number.parseInt(step, 10) || 1));
  const profile = useProfile();
  const health = useHealth();
  const label = ONBOARDING_STEPS[n - 1] ?? "Welcome";
  usePageTitle(`Hello, loop · ${label}`);
  const rail: RailStep[] = ONBOARDING_STEPS.map((s, i) => ({
    id: String(i + 1),
    label: s,
    state: i + 1 < n ? "done" : i + 1 === n ? "current" : "todo",
  }));
  useFocusHeaderContent("Hello, loop", rail);
  return (
    <Page width="narrow">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-3">
          Step {n} of {ONBOARDING_STEPS.length}
        </p>
        <h1 className="text-h1">{label}</h1>
        <WavePlaceholder feature="The onboarding flow" />
        <QueryView query={profile}>
          {(p) => {
            const rows: [string, boolean][] = [
              ["Output device", p.outputKind !== "unknown"],
              ["Microphone", p.inputKind !== "none"],
              ["Noise floor", p.noiseFloorDb !== null],
              ["Tap latency", p.tapLatencyMs !== null],
              ["Vocal range", p.vocalLowMidi !== null && p.vocalHighMidi !== null],
              ["Tutor", health.data?.tutor === "ready"],
            ];
            return (
              <Card className="p-4">
                <h2 className="mb-2 text-h3">Set up so far</h2>
                <ul className="flex flex-col gap-1">
                  {rows.map(([name, ok]) => (
                    <li key={name} className="flex items-center gap-2">
                      {ok ? (
                        <Check aria-label="done" className="size-4 text-accent" />
                      ) : (
                        <Circle aria-label="not yet" className="size-4 text-text-3" />
                      )}
                      {name}
                    </li>
                  ))}
                </ul>
              </Card>
            );
          }}
        </QueryView>
        <div className="flex gap-2">
          {n > 1 && (
            <Link
              to="/onboarding/$step"
              params={{ step: String(n - 1) }}
              className={buttonClass("secondary")}
            >
              Back
            </Link>
          )}
          {n < ONBOARDING_STEPS.length ? (
            <Link to="/onboarding/$step" params={{ step: String(n + 1) }} className={buttonClass("primary")}>
              Next
            </Link>
          ) : (
            <Link to="/" className={buttonClass("primary")}>
              Finish
            </Link>
          )}
        </div>
      </div>
    </Page>
  );
}
