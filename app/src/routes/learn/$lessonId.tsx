// Lesson Player (focus mode, ux §3): `/learn/$lessonId?step=` opens a lesson at a step (a revisit); the player
// itself lives in app/src/lesson. `preview` (dev only) plays a locked lesson locally without saving.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LessonPlayer } from "../../lesson/LessonPlayer.tsx";

const searchSchema = z.object({
  step: z
    .string()
    .regex(/^S\d+$/)
    .optional()
    .catch(undefined),
  preview: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/learn/$lessonId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: LessonRoute,
});

function LessonRoute() {
  const { lessonId } = Route.useParams();
  const { step, preview } = Route.useSearch();
  return <LessonPlayer lessonId={lessonId} step={step} preview={preview} />;
}
