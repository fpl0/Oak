// A static roll or staff of a piece of authored code (an example, a staff to read, a stimulus to look at): the
// Workbench's own analysis path and views, evaluated and drawn, never played from here.
import type { KeySpec, MeterId } from "@oak/api";
import type { GraderHost } from "@oak/grader";
import { useEffect, useMemo, useState } from "react";
import { graderHost } from "../lib/grader-client.ts";
import { WorkbenchClock } from "../workbench/clock.ts";
import { HighlightBus } from "../workbench/highlight-bus.ts";
import { PianoRoll } from "../workbench/PianoRoll.tsx";
import { StaffView } from "../workbench/StaffView.tsx";
import { useAnalysis } from "../workbench/use-analysis.ts";
import { useStepHostOptional } from "./frame.tsx";

let host: GraderHost | null = null;
export function useGraderHost(): GraderHost | null {
  const [g, setG] = useState<GraderHost | null>(host);
  useEffect(() => {
    if (g) return;
    let live = true;
    void graderHost().then((h) => {
      host = h;
      if (live) setG(h);
    });
    return () => {
      live = false;
    };
  }, [g]);
  return g;
}

export function CodeMusic({
  code,
  bars,
  view,
  label,
  meter,
  keySpec,
}: {
  code: string;
  bars: number;
  view: "roll" | "staff" | "lead";
  label: string;
  meter?: MeterId;
  keySpec?: KeySpec | null;
}) {
  const h = useStepHostOptional();
  const m = meter ?? h?.env.meter ?? "4/4";
  const key = keySpec ?? h?.env.key ?? null;
  const grader = useGraderHost();
  const bus = useMemo(() => new HighlightBus(), []);
  const clock = useMemo(() => new WorkbenchClock(), []);
  const lint = useMemo(
    () => ({ profile: "content" as const, unlocked: new Set<never>(), allowPreview: true, meter: m, key }),
    [m, key],
  );
  // Built as a value, not a literal: the Workbench's analysis options grow this wave (lens lines), and a plain
  // static picture asks for none of them.
  const opts = {
    bars,
    meter: m,
    key,
    lint,
    band: null,
    staff: view === "roll" ? (false as const) : view === "lead" ? ("lead" as const) : ("auto" as const),
    staffLabels: "none" as const,
    annotations: { degree: false, solfege: false, noteName: false },
    debounceMs: 0,
  };
  const analysis = useAnalysis(grader, code, opts);
  return (
    // `oak-workbench` carries the theme's tokens to the roll and staff canvases (Bark as well as Paper).
    <figure
      className="oak-workbench overflow-x-auto rounded-card border border-border bg-surface p-2"
      aria-label={label}
    >
      {analysis.model ? (
        view === "roll" ? (
          <PianoRoll model={analysis.model} bus={bus} clock={clock} stale={false} height={140} />
        ) : (
          <StaffView model={analysis.model} bus={bus} stale={false} />
        )
      ) : (
        <p className="p-2 text-sm text-text-3">{analysis.error ? "This could not be drawn." : "Drawing…"}</p>
      )}
    </figure>
  );
}
