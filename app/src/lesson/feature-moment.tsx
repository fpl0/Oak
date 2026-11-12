// A feature tool switching on in the lesson's own Workbench (degree labels at U03.L02, the key-signature panel,
// the circle, solfège): at the first step that shows it, a short card says what is new and what it does, and the
// roll's labels come on a moment later, so the learner sees them arrive (at once under reduced motion). "Show
// me again" replays the switch. The Coda's unlock moment (toolbox) still marks the tool seen at the end.
import type { ToolEntry } from "@oak/api";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toolLabel } from "../lib/tool-label.ts";
import { Button } from "../ui/kit/Button.tsx";
import { useReducedMotion } from "../ui/theme/motion.ts";
import { InlineMd } from "./frame.tsx";
import type { FeatureToolId } from "./rules.ts";

/** How long the labels stay off before they switch on, so the change is seen (ux §5.1 "unlock ceremony"). */
export const SWITCH_DELAY_MS = 900;

/**
 * Whether the moment's features are on yet for `stepKey`: off for a beat after the step opens, then on; a replay
 * turns them off and on again. With no moment it is always on.
 */
export function useFeatureSwitch(stepKey: string, active: boolean): { on: boolean; replay(): void } {
  const reduced = useReducedMotion();
  const [state, setState] = useState<{ key: string; on: boolean; n: number }>({ key: "", on: true, n: 0 });
  const current = state.key === stepKey ? state : { key: stepKey, on: !active || reduced, n: 0 };
  useEffect(() => {
    if (!active) return;
    if (current.on) return;
    const t = window.setTimeout(
      () => setState((s) => ({ key: stepKey, on: true, n: s.key === stepKey ? s.n : 0 })),
      reduced ? 0 : SWITCH_DELAY_MS,
    );
    return () => window.clearTimeout(t);
  }, [active, current.on, stepKey, reduced]);
  return {
    on: current.on,
    replay: () => setState({ key: stepKey, on: reduced, n: current.n + 1 }),
  };
}

export function FeatureMoment({
  tools,
  entries,
  on,
  onReplay,
}: {
  tools: readonly FeatureToolId[];
  entries: readonly ToolEntry[];
  on: boolean;
  onReplay(): void;
}) {
  const byId = new Map(entries.map((t) => [t.id as string, t]));
  const shown = tools.map((id) => byId.get(id)).filter((t): t is ToolEntry => !!t);
  if (shown.length === 0) return null;
  return (
    <section
      aria-label="New in your Workbench"
      className="mt-3 flex flex-col gap-2 rounded-card border border-accent/50 bg-lane-in p-3"
      data-testid="feature-moment"
      data-tools={tools.join(" ")}
      data-on={on ? "1" : "0"}
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <Sparkles aria-hidden className="size-4 text-accent" />
        New in your Workbench: {shown.map((t) => toolLabel(t).text).join(", ")}
      </p>
      {shown.map((t) => (
        <p key={t.id} className="text-sm text-text-2">
          <InlineMd text={t.catalog.meaning} />
        </p>
      ))}
      <p className="text-sm" role="status">
        {on ? "They are on now: look at the roll and the staff." : "Watch the Workbench: they switch on now."}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="secondary" onClick={onReplay} data-testid="feature-replay">
          Show me again
        </Button>
        <Link to="/toolbox" className="text-sm text-link underline-offset-2 hover:underline">
          Read more in the Toolbox
        </Link>
      </div>
    </section>
  );
}
