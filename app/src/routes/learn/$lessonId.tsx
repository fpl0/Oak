// Lesson Player (focus mode, ux §3). The player itself (prompt column, workbench, checks, hints) is Wave 2. This
// page already resolves the lesson, its step outline, the learner's progress and the current step's state, and
// draws the step rail in the focus header.
import { isLessonId } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { useContent } from "../../lib/content.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useCourseProgress, useStepState } from "../../lib/queries.ts";
import { keyScope } from "../../ui/keys/KeymapProvider.tsx";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Card, Chip, EmptyState, Page, type RailStep, WavePlaceholder } from "../../ui/kit/basics.tsx";
import { LoadingState } from "../../ui/kit/QueryState.tsx";
import { useFocusHeaderContent } from "../../ui/shell/focus-header.ts";

const searchSchema = z.object({
  step: z
    .string()
    .regex(/^S\d+$/)
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/learn/$lessonId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: LessonPlayer,
});

function LessonPlayer() {
  const { lessonId } = Route.useParams();
  const { step } = Route.useSearch();
  const content = useContent();
  const progress = useCourseProgress();
  const meta = useMemo(() => {
    for (const u of content.data?.syllabus?.units ?? []) {
      const l = u.lessons.find((x) => x.id === lessonId);
      if (l) return { lesson: l, unit: u };
    }
    return null;
  }, [content.data, lessonId]);
  const outline = content.data?.lessons.find((l) => l.id === lessonId) ?? null;
  const lp = progress.data?.lessons.find((l) => l.lessonId === lessonId);
  const currentStep = step ?? lp?.currentStep ?? outline?.steps[0]?.id ?? null;
  const stepState = useStepState(lessonId, currentStep ?? "S1", !!currentStep && !!outline);
  const title = meta?.lesson.title ?? lessonId;
  usePageTitle(title);
  const currentIdx = outline?.steps.findIndex((s) => s.id === currentStep) ?? -1;
  const rail: RailStep[] | null = outline
    ? outline.steps.map((s, i) => ({
        id: s.id,
        label: s.kind,
        state: i < currentIdx ? "done" : i === currentIdx ? "current" : s.optional ? "optional" : "todo",
      }))
    : null;
  useFocusHeaderContent(title, rail);

  if (content.isPending)
    return (
      <Page width="narrow">
        <LoadingState />
      </Page>
    );
  if (!isLessonId(lessonId) || !meta)
    return (
      <Page width="narrow">
        <EmptyState
          title="No such lesson"
          action={
            <Link to="/oak" search={{ view: "course" }} className={buttonClass("primary")}>
              See the course
            </Link>
          }
        >
          {lessonId} is not in the course.
        </EmptyState>
      </Page>
    );

  return (
    <Page width="narrow">
      <div {...keyScope("lesson-prompt")} className="flex flex-col gap-4">
        <header>
          <p className="font-mono text-sm text-text-3">
            {meta.unit.id} · {lessonId}
          </p>
          <h1 className="text-h1">{meta.lesson.title}</h1>
          <p className="mt-1 text-text-2">{meta.lesson.objective}</p>
          {lp && (
            <p className="mt-2">
              <Chip
                tone={
                  lp.status === "completed" ? "accent" : lp.status === "in_progress" ? "amber" : "neutral"
                }
              >
                {lp.status.replace("_", " ")}
              </Chip>
            </p>
          )}
        </header>
        <WavePlaceholder feature="The Lesson Player">
          {outline ? (
            <ol className="grid gap-1 text-sm sm:grid-cols-2">
              {outline.steps.map((s) => (
                <li
                  key={s.id}
                  aria-current={s.id === currentStep ? "step" : undefined}
                  className={s.id === currentStep ? "font-semibold" : "text-text-2"}
                >
                  <Link
                    to="/learn/$lessonId"
                    params={{ lessonId }}
                    search={{ step: s.id }}
                    className="hover:underline"
                  >
                    {s.id} · {s.kind} · {s.minutes} min{s.graded ? " · graded" : ""}
                    {s.optional ? " · optional" : ""}
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-text-2">This lesson is planned but not authored yet.</p>
          )}
        </WavePlaceholder>
        {outline && currentStep && (
          <Card className="p-4">
            <h2 className="mb-1 text-h3">Step {currentStep.replace(/^S/, "")}</h2>
            {stepState.isPending ? (
              <LoadingState rows={1} />
            ) : stepState.isError ? (
              <p className="text-sm text-text-3">No saved state for this step yet.</p>
            ) : (
              <p className="text-sm text-text-2">
                Attempts {stepState.data.attempts} · hint rung {stepState.data.rung} · series{" "}
                {stepState.data.seriesNo}
                {stepState.data.passed ? " · passed" : ""}
              </p>
            )}
          </Card>
        )}
      </div>
    </Page>
  );
}
