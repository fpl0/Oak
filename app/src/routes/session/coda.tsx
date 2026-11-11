// Coda (focus mode, ux §1.5): the wrap-up. The full ceremony (sketch card, can-do changes, unlock flips,
// listening note, teaser) runs from `POST /session/:id/end` in Wave 2. This page already shows what the server
// knows now: this week's rhythm and the unlocks not yet celebrated.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useContent } from "../../lib/content.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useBootstrap, useUnlockSeen } from "../../lib/queries.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Page, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

export const Route = createFileRoute("/session/coda")({ component: Coda });

function Coda() {
  usePageTitle("Coda");
  useFocusHeaderContent("Coda");
  const navigate = useNavigate();
  const bootstrap = useBootstrap();
  const content = useContent();
  const seen = useUnlockSeen();
  const done = () => void navigate({ to: "/" });
  useHotkeys([
    {
      id: "coda-done",
      keys: "Enter",
      scope: "global",
      description: "Done for today",
      when: (c) => !c.onControl,
      run: done,
    },
  ]);
  const toolName = (id: string) => content.data?.toolbox.find((t) => t.id === id)?.code ?? id;
  return (
    <Page width="narrow">
      <QueryView query={bootstrap}>
        {(b) => {
          const fresh = b.unlocks.filter((u) => !u.seen);
          return (
            <div className="flex flex-col gap-4">
              <h1 className="text-h1">Session complete.</h1>
              <p className="text-text-2">Stopping here is good practice — spacing beats cramming.</p>
              <Card className="p-4">
                <h2 className="mb-1 text-h3">This week</h2>
                <p>
                  {b.streak.thisWeek.qualifyingDays} of {b.streak.thisWeek.goal} days · {b.streak.weeks} week
                  {b.streak.weeks === 1 ? "" : "s"} in a row
                </p>
              </Card>
              {fresh.length > 0 && (
                <Card className="p-4">
                  <h2 className="mb-2 text-h3">New in your toolbox</h2>
                  <ul className="flex flex-col gap-2">
                    {fresh.map((u) => (
                      <li key={u.itemId} className="flex items-center justify-between gap-3">
                        <code className="font-mono">{toolName(u.itemId)}</code>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => seen.mutate({ params: { id: u.itemId } })}
                        >
                          Got it
                        </Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              <WavePlaceholder feature="The full Coda (sketch, can-do changes, listening note, teaser)" />
              <div className="flex gap-2">
                <Button variant="primary" size="lg" onClick={done}>
                  Done for today
                </Button>
                <Link to="/studio" className={buttonClass("secondary", "lg")}>
                  Keep playing in Studio
                </Link>
              </div>
            </div>
          );
        }}
      </QueryView>
    </Page>
  );
}
