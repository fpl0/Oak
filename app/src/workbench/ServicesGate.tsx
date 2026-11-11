// Waits for the workbench services (the adapter and the grader host), started from a user gesture when the
// page asks for one: the app creates its adapter on the first gesture ("Sound asleep — press any key").
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { type WorkbenchServices, WorkbenchServicesProvider } from "./services.tsx";

export interface ServicesGateProps {
  load: () => Promise<WorkbenchServices>;
  /** Start loading at once (the adapter can exist before a gesture; audio unlocks on Play). */
  auto?: boolean;
  children: ReactNode;
}

export function ServicesGate({ load, auto, children }: ServicesGateProps) {
  const [services, setServices] = useState<WorkbenchServices | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(() => {
    setState("loading");
    load().then(
      (s) => setServices(s),
      (e: unknown) => {
        setState("error");
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  }, [load]);

  useEffect(() => {
    if (auto) start();
  }, [auto, start]);

  if (services) return <WorkbenchServicesProvider value={services}>{children}</WorkbenchServicesProvider>;
  return (
    <div className="oak-gate" data-testid="services-gate">
      <button type="button" onClick={start} disabled={state === "loading"} data-testid="wake-sound">
        {state === "loading" ? "Waking sound…" : "Wake sound"}
      </button>
      {error ? <p className="oak-muted">Sound did not start: {error}</p> : null}
    </div>
  );
}
