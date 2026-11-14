// The ending, reopened (content/specs/END.md "Reopened later from /progress"): the finale section of the Coda that
// completed the core, read-only, from `GET /course/completion` — the same object that rode on that session's
// summary. "Back to Progress" stands where the day's two buttons stood; nothing is announced a second time on any
// other page.
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { usePageTitle } from "../../lib/nav.ts";
import { useCoreCompletion } from "../../lib/queries.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Page } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { FINALE_COPY, longDate } from "../finale-model.ts";
import { Finale } from "./CodaWave6.tsx";

export function EndingPage() {
  usePageTitle("The end of the core");
  const navigate = useNavigate();
  const completion = useCoreCompletion();
  const back = useRef<HTMLAnchorElement>(null);
  const c = completion.data ?? null;
  const complete = c?.stage === "complete";
  // Before the core is complete there is no ending to reopen: Progress says where the learner stands.
  useEffect(() => {
    if (c && !complete) void navigate({ to: "/progress", replace: true });
  }, [c, complete, navigate]);
  useEffect(() => {
    if (complete) back.current?.focus();
  }, [complete]);
  useHotkeys([
    {
      id: "ending-back",
      keys: "Enter",
      scope: "global",
      group: "Coda",
      description: "Back to Progress",
      when: (k) => !k.onControl && !k.inEditable && complete,
      run: () => void navigate({ to: "/progress" }),
    },
  ]);
  return (
    <Page width="narrow">
      {completion.isError ? (
        <ErrorState error={completion.error} onRetry={() => void completion.refetch()} />
      ) : !c || !complete ? (
        <LoadingState rows={4} label="Opening the ending" />
      ) : (
        <div className="flex flex-col gap-4" data-testid="ending-page">
          {c.completedAt && (
            <p className="text-sm text-text-2" data-testid="ending-date">
              {longDate(c.completedAt)}
            </p>
          )}
          <Finale completion={c} since={null} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              ref={back}
              to="/progress"
              className={buttonClass("primary", "lg")}
              data-testid="ending-back"
            >
              {FINALE_COPY.back}
            </Link>
          </div>
        </div>
      )}
    </Page>
  );
}
