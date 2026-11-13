// Lesson Player (focus mode, ux §3): `/learn/$lessonId?step=` opens a lesson at a step (a revisit); the player
// itself lives in app/src/lesson. `preview` (dev only) plays a locked lesson locally without saving. `from` (Wave 5)
// names where the lesson was opened from — `today`, `toolbox`, `map`, `progress` — so a side lesson (or any lesson
// opened outside the day's session) returns there when it ends or is left.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { LessonPlayer } from "../../lesson/LessonPlayer.tsx";
import { LESSON_ORIGINS } from "../../lesson/side.ts";

const searchSchema = z.object({
  step: z
    .string()
    .regex(/^S\d+$/)
    .optional()
    .catch(undefined),
  preview: z.boolean().optional().catch(undefined),
  from: z.enum(LESSON_ORIGINS).optional().catch(undefined),
});

export const Route = createFileRoute("/learn/$lessonId")({
  validateSearch: (s) => searchSchema.parse(s),
  component: LessonRoute,
});

function LessonRoute() {
  const { lessonId } = Route.useParams();
  const { step, preview, from } = Route.useSearch();
  return <LessonPlayer lessonId={lessonId} step={step} preview={preview} from={from} />;
}
