// Capstone workspace (shell, ux §2.3): Studio layout with a Brief panel in place of the sketchbook sidebar. The
// workbench and the rubric checklist are Wave 2; the brief, session plan and server state are live here.
import { isCapstoneId } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Circle, Lock } from "lucide-react";
import { useMemo } from "react";
import { useContent } from "../../lib/content.ts";
import { FLAVOUR_LABEL } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useCapstone } from "../../lib/queries.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/capstone/$id")({ component: Capstone });

function Capstone() {
  const { id } = Route.useParams();
  const content = useContent();
  const state = useCapstone(id);
  const meta = content.data?.capstones.find((c) => c.id === id);
  const sessions = useMemo(
    () =>
      Array.from({ length: meta?.sessions ?? state.data?.sessionsTotal ?? 0 }, (_, i) => `${id}.S${i + 1}`),
    [meta, state.data, id],
  );
  usePageTitle(meta?.title ?? id);
  if (!isCapstoneId(id))
    return (
      <Page>
        <EmptyState title="No such capstone">“{id}” is not a capstone.</EmptyState>
      </Page>
    );
  return (
    <div className="flex h-full min-h-0">
      <aside
        aria-label="Brief"
        className="w-[300px] shrink-0 overflow-auto border-r border-border bg-surface p-4"
      >
        <p className="font-mono text-sm text-text-3">{id}</p>
        <h1 className="text-h2">{meta?.title ?? id}</h1>
        {meta && <p className="mt-2 text-text-2">{meta.objective}</p>}
        <h2 className="mt-5 mb-2 font-sans text-sm font-semibold text-text-2">Sessions</h2>
        <ol className="flex flex-col gap-1.5">
          {sessions.map((s, i) => {
            const done = state.data?.sessions.includes(s);
            return (
              <li key={s} className="flex items-center gap-2 text-sm">
                {done ? (
                  <Check aria-label="done" className="size-4 text-accent" />
                ) : (
                  <Circle aria-hidden className="size-4 text-text-3" />
                )}
                {i + 1}/{sessions.length}
              </li>
            );
          })}
        </ol>
        {state.data?.flavour && (
          <p className="mt-4">
            <Chip>{FLAVOUR_LABEL[state.data.flavour] ?? state.data.flavour}</Chip>
          </p>
        )}
      </aside>
      <div className="min-w-0 flex-1 overflow-auto">
        <Page>
          {state.isPending ? (
            <LoadingState />
          ) : state.isError ? (
            <ErrorState error={state.error} onRetry={() => void state.refetch()} />
          ) : state.data.status === "locked" ? (
            <EmptyState icon={<Lock aria-hidden />} title="Not open yet">
              {state.data.lockedReason ?? "Finish the lessons before it to open this capstone."}
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <Chip tone={state.data.status === "released" ? "accent" : "amber"}>
                  {state.data.status.replace("_", " ")}
                </Chip>
                <span className="text-sm text-text-2">
                  {state.data.sessionsDone} of {state.data.sessionsTotal} sessions done
                </span>
                {state.data.sketchId && (
                  <Link
                    to="/studio/$sketchId"
                    params={{ sketchId: state.data.sketchId }}
                    className={buttonClass("secondary", "sm")}
                  >
                    Open the draft
                  </Link>
                )}
                {state.data.trackId && (
                  <Link
                    to="/album/$trackId"
                    params={{ trackId: state.data.trackId }}
                    className={buttonClass("secondary", "sm")}
                  >
                    On the album
                  </Link>
                )}
              </Card>
              <WavePlaceholder feature="The capstone workbench, requirements checklist and release">
                {state.data.lastResult && (
                  <p className="text-sm text-text-2">Last check: {state.data.lastResult.status}</p>
                )}
              </WavePlaceholder>
            </div>
          )}
        </Page>
      </div>
    </div>
  );
}
