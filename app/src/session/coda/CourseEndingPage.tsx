// The whole course's ending, reopened from /progress (wave7.md §5.8): the course finale, read-only, from
// `GET /course/whole` — the same object that rode on that session's summary (`courseComplete`). "Back to Progress"
// stands where the day's two buttons stood; nothing is announced a second time.
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { usePageTitle } from "../../lib/nav.ts";
import { useWholeCourse } from "../../lib/queries.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Page } from "../../ui/kit/basics.tsx";
import { ErrorState, LoadingState } from "../../ui/kit/QueryState.tsx";
import { FINALE_COPY, longDate } from "../finale-model.ts";
import { CourseFinale } from "./CodaWave7.tsx";

export function CourseEndingPage() {
  usePageTitle("The end of the course");
  const navigate = useNavigate();
  const whole = useWholeCourse();
  const back = useRef<HTMLAnchorElement>(null);
  const w = whole.data ?? null;
  const complete = w?.stage === "complete";
  // Before the course is complete there is nothing to reopen: Progress says where the learner stands.
  useEffect(() => {
    if (w && !complete) void navigate({ to: "/progress", replace: true });
  }, [w, complete, navigate]);
  useEffect(() => {
    if (complete) back.current?.focus();
  }, [complete]);
  useHotkeys([
    {
      id: "course-ending-back",
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
      {whole.isError ? (
        <ErrorState error={whole.error} onRetry={() => void whole.refetch()} />
      ) : !w || !complete ? (
        <LoadingState rows={4} label="Opening the ending" />
      ) : (
        <div className="flex flex-col gap-4" data-testid="course-ending-page">
          {w.completedAt && <p className="text-sm text-text-2">{longDate(w.completedAt)}</p>}
          <CourseFinale whole={w} />
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
