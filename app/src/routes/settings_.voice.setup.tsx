// Mic and voice calibration wizard (focus mode, ux §4.7), shared with onboarding steps 4–8. The measuring steps
// (device detection, noise floor, bleed, tap latency, range) run on @oak/audio in Wave 2; this page loads the
// profile and the calibration state and shows where each measurement stands.
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Circle } from "lucide-react";
import { usePageTitle } from "../lib/nav.ts";
import { formatNoteMidi } from "../lib/notes.ts";
import { useProfile } from "../lib/queries.ts";
import { buttonClass } from "../ui/kit/Button.tsx";
import { Card, Page, type RailStep, WavePlaceholder } from "../ui/kit/basics.tsx";
import { QueryView } from "../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../ui/shell/focus-header.ts";

export const Route = createFileRoute("/settings_/voice/setup")({ component: VoiceSetup });

function VoiceSetup() {
  usePageTitle("Set up mic and voice");
  const profile = useProfile();
  const p = profile.data;
  const steps: { id: string; label: string; done: boolean; value: string }[] = p
    ? [
        { id: "output", label: "Output", done: p.outputKind !== "unknown", value: p.outputKind },
        { id: "mic", label: "Microphone", done: p.inputKind !== "none", value: p.inputKind },
        {
          id: "noise",
          label: "Noise floor",
          done: p.noiseFloorDb !== null,
          value: p.noiseFloorDb === null ? "" : `${Math.round(p.noiseFloorDb)} dBFS`,
        },
        {
          id: "tap",
          label: "Tap latency",
          done: p.tapLatencyMs !== null,
          value: p.tapLatencyMs === null ? "" : `${Math.round(p.tapLatencyMs)} ms`,
        },
        {
          id: "sing",
          label: "Sing latency",
          done: p.singLatencyMs !== null,
          value: p.singLatencyMs === null ? "" : `${Math.round(p.singLatencyMs)} ms`,
        },
        {
          id: "range",
          label: "Range",
          done: p.vocalLowMidi !== null && p.vocalHighMidi !== null,
          value:
            p.vocalLowMidi !== null && p.vocalHighMidi !== null
              ? `${formatNoteMidi(p.vocalLowMidi)}–${formatNoteMidi(p.vocalHighMidi)}`
              : "",
        },
      ]
    : [];
  const firstTodo = steps.findIndex((s) => !s.done);
  const rail: RailStep[] = steps.map((s, i) => ({
    id: s.id,
    label: s.label,
    state: s.done ? "done" : i === firstTodo ? "current" : "todo",
  }));
  useFocusHeaderContent("Set up mic and voice", rail.length ? rail : null);
  return (
    <Page width="narrow">
      <div className="flex flex-col gap-4">
        <h1 className="text-h1">Set up mic and voice</h1>
        <p className="text-text-2">
          Your voice is analysed live on this computer. Nothing is recorded or sent.
        </p>
        <WavePlaceholder feature="The calibration wizard" />
        <QueryView query={profile}>
          {() => (
            <Card className="p-4">
              <ul className="flex flex-col gap-2">
                {steps.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      {s.done ? (
                        <Check aria-label="measured" className="size-4 text-accent" />
                      ) : (
                        <Circle aria-label="not yet" className="size-4 text-text-3" />
                      )}
                      {s.label}
                    </span>
                    <span className="text-sm text-text-2">{s.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </QueryView>
        <Link to="/settings/voice" className={buttonClass("secondary", "md", "self-start")}>
          Back to voice settings
        </Link>
      </div>
    </Page>
  );
}
