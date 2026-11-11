// One drill family (focus mode). The drill runner (TrialFrame, answer pads, singing) is Wave 2; this page
// already loads the family's definition and the learner's level, statistics and confusions.
import { createFileRoute } from "@tanstack/react-router";
import { useContent } from "../../lib/content.ts";
import { pct } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useFamilyState } from "../../lib/queries.ts";
import { keyScope } from "../../ui/keys/KeymapProvider.tsx";
import { Card, Chip, EmptyState, Page, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

export const Route = createFileRoute("/practice/$familyId")({ component: FamilyDrill });

function FamilyDrill() {
  const { familyId } = Route.useParams();
  const content = useContent();
  const state = useFamilyState(familyId);
  const def = content.data?.families.find((f) => f.id === familyId);
  const title = def?.title ?? familyId;
  usePageTitle(title);
  useFocusHeaderContent(title);

  if (content.isPending)
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  if (!def)
    return (
      <Page width="narrow">
        <EmptyState title="Unknown drill family">There is no family called {familyId}.</EmptyState>
      </Page>
    );
  const confusions = Object.entries(state.data?.confusion ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  return (
    <Page width="narrow">
      <div {...keyScope("answer-pad")} className="flex flex-col gap-4">
        <WavePlaceholder feature="The drill runner">
          <p className="text-sm text-text-2">
            {def.trialsPerSet} trials a set · answer with {def.answer} ·{" "}
            {def.mic ? "uses the microphone" : "no microphone"}
          </p>
        </WavePlaceholder>
        {state.isPending ? (
          <LoadingState rows={2} />
        ) : state.isError ? (
          <ErrorState error={state.error} onRetry={() => void state.refetch()} />
        ) : (
          <Card className="p-4">
            <h2 className="mb-2 text-h3">Where you are</h2>
            <p>
              Level {state.data.level} of {def.levels.length}
              {state.data.maxOpenLevel < def.levels.length && ` (open up to ${state.data.maxOpenLevel})`}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Categories">
              {Object.entries(state.data.categoryStats).map(([cat, s]) => (
                <li key={cat}>
                  <Chip>
                    {cat}: {s.n ? pct(s.hits / s.n) : "–"}
                  </Chip>
                </li>
              ))}
            </ul>
            {confusions.length > 0 && (
              <>
                <h3 className="mt-4 mb-1 font-sans text-sm font-semibold text-text-2">Often confused</h3>
                <ul className="text-sm">
                  {confusions.map(([pair, n]) => {
                    const [expected, got] = pair.split("|");
                    return (
                      <li key={pair}>
                        heard {got} for {expected} · {n}×
                        {def.confusionTips?.[pair] ? ` — ${def.confusionTips[pair]}` : ""}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}
