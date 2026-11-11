// The workbench screens need the adapter and the grader host. After the welcome screen they already exist; after a
// reload mid-way they need one gesture first (browsers start audio only from one), so this asks for it calmly.
import { Volume2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { peekOak } from "../lib/oak.ts";
import { Button } from "../ui/kit/Button.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { type WorkbenchServices, WorkbenchServicesProvider } from "../workbench/services.tsx";
import { onboardingServices } from "./services.ts";

export function SoundGate({ children }: { children: ReactNode }) {
  const [services, setServices] = useState<WorkbenchServices | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">(peekOak() ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setState("loading");
    setError(null);
    onboardingServices().then(
      (s) => setServices(s),
      (e: unknown) => {
        setState("error");
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };
  // The adapter exists already (the learner came from the welcome screen): no gesture needed.
  // Deliberately once, on mount
  useEffect(() => {
    if (peekOak()) start();
  }, []);

  if (services) return <WorkbenchServicesProvider value={services}>{children}</WorkbenchServicesProvider>;
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-6"
      data-testid="sound-gate"
    >
      <h2 className="text-h3">Sound is asleep</h2>
      <p className="text-text-2">Your place is saved. Start sound to pick up the loop where you left it.</p>
      <Button
        variant="primary"
        onClick={start}
        loading={state === "loading"}
        icon={<Volume2 aria-hidden className="size-4" />}
        data-testid="gate-start"
        autoFocus
      >
        Start sound
      </Button>
      {state === "error" && error && (
        <Callout tone="issue" title="Sound didn't start">
          {error}
        </Callout>
      )}
    </div>
  );
}
