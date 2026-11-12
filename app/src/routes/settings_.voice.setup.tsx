// /settings/voice/setup: the mic and voice wizard (focus mode, ux §4.7; contracts §8.6), the same screens as
// onboarding. `?part=range` (or headphones, mic, latency, first-sing) runs one of them only: Settings › Voice
// links here to re-run the range or the timing.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { usePageTitle } from "../lib/nav.ts";
import { useProfile } from "../lib/queries.ts";
import { buttonClass } from "../ui/kit/Button.tsx";
import { Page, type RailStep } from "../ui/kit/basics.tsx";
import { Callout } from "../ui/kit/Controls.tsx";
import { QueryView } from "../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../ui/shell/focus-header.ts";
import { renderPart } from "../voice/index.tsx";
import { clearRecheck } from "../voice/recheck.ts";
import { SETUP_ROUTE_PARTS, WIZARD, type WizardPart, wizardNext } from "../voice/wizard.ts";

const searchSchema = z.object({
  part: z.enum(SETUP_ROUTE_PARTS).optional().catch(undefined),
  at: z
    .enum([...SETUP_ROUTE_PARTS, "done"])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/settings_/voice/setup")({
  validateSearch: (s) => searchSchema.parse(s),
  component: VoiceSetup,
});

const LABEL: Record<WizardPart, string> = {
  headphones: "Headphones",
  mic: "Microphone",
  range: "Range",
  latency: "Timing",
  match: "Match three notes",
  "first-sing": "First note",
  noise: "Quiet check",
};

function VoiceSetup() {
  const { part, at } = Route.useSearch();
  const navigate = useNavigate();
  const profile = useProfile();
  const parts: readonly WizardPart[] = part ? [part] : WIZARD;
  const current: WizardPart | "done" = at ?? parts[0] ?? "done";
  usePageTitle(part ? `Re-run · ${LABEL[part]}` : "Set up mic and voice");
  const rail: RailStep[] = parts.map((p) => ({
    id: p,
    label: LABEL[p],
    state:
      current === "done" || parts.indexOf(p) < parts.indexOf(current as WizardPart)
        ? "done"
        : p === current
          ? "current"
          : "todo",
  }));
  useFocusHeaderContent(part ? LABEL[part] : "Mic and voice", rail);

  const go = (next: WizardPart | "done") =>
    void navigate({ to: "/settings/voice/setup", search: { ...(part ? { part } : {}), at: next } });

  return (
    <Page width="narrow">
      <QueryView query={profile}>
        {(p) => {
          if (current === "done")
            return (
              <section className="flex flex-col gap-4 py-6" data-testid="setup-done">
                <h1 className="text-h1 outline-none" tabIndex={-1}>
                  All set
                </h1>
                <Callout tone="success" title="Your results are saved.">
                  Settings › Voice shows them; re-run any part whenever you change headphones or rooms.
                </Callout>
                <div>
                  <Link to="/settings/voice" className={buttonClass("primary")} autoFocus>
                    Back to Settings › Voice
                  </Link>
                </div>
              </section>
            );
          const next = wizardNext(parts, current, p.quiet);
          return renderPart(p, {
            part: current,
            context: "settings",
            onDone: () => {
              // A fresh quiet check answers the "re-run the quiet check" suggestion.
              if (current === "noise" || current === "mic") clearRecheck();
              go(next);
            },
            onSkip: () => go(next),
            onQuiet: () => go("done"),
          });
        }}
      </QueryView>
    </Page>
  );
}
