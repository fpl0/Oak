// Today's review (focus mode): the warm-up plan from GET /srs/due. Running the sets is the Wave 2 drill runner.
import { createFileRoute } from "@tanstack/react-router";
import { Mic } from "lucide-react";
import { useState } from "react";
import { useContent } from "../../lib/content.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useDue } from "../../lib/queries.ts";
import { Button } from "../../ui/kit/Button.tsx";
import { Card, EmptyState, Page, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

export const Route = createFileRoute("/practice/review")({ component: Review });

function Review() {
  usePageTitle("Today's review");
  const [more, setMore] = useState(false);
  const due = useDue(undefined, more);
  const content = useContent();
  const titleOf = (id: string | null) =>
    content.data?.families.find((f) => f.id === id)?.title ?? id ?? "Facts";
  useFocusHeaderContent(
    "Today's review",
    due.data?.items.map((i, n) => ({
      id: i.id,
      label: titleOf(i.familyId),
      state: n === 0 ? "current" : "todo",
    })) ?? null,
  );
  return (
    <Page width="narrow">
      <QueryView
        query={due}
        isEmpty={(d) => d.items.length === 0}
        empty={
          <EmptyState title="Nothing due">
            Your ears are fresh. Come back tomorrow, or practise a family for fun.
          </EmptyState>
        }
      >
        {(d) => (
          <div className="flex flex-col gap-4">
            <h1 className="text-h2">{d.label}</h1>
            <WavePlaceholder feature="Running the sets" />
            <Card className="p-2">
              <ol className="divide-y divide-border">
                {d.items.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span>
                      {titleOf(i.familyId)}
                      <span className="ml-2 text-sm text-text-3">
                        {i.trials} trials{i.level ? ` · level ${i.level}` : ""}
                        {!i.rated && " · anchor"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-sm text-text-2">
                      {i.mic && <Mic aria-label="uses the microphone" className="size-4" />}≈
                      {Math.max(1, Math.round(i.estSec / 60))} min
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
            {d.moreAvailable && !more && (
              <Button className="self-start" onClick={() => setMore(true)}>
                A little more
              </Button>
            )}
          </div>
        )}
      </QueryView>
    </Page>
  );
}
