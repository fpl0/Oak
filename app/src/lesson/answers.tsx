// The answer widgets the lesson and checkpoint players render: the answers engineer's registry
// (`app/src/answers/registry.tsx`). Writing on a staff (`staff-input`) is the registry's staff widget, by mouse
// and by keyboard, with the typed note list as its accessible alternative; a key signature is the registry's
// key-signature staff. A kind the registry has no widget for shows a calm "not available yet" line and the host
// lets the learner move on.
import { answerWidgetFor } from "../answers/registry.tsx";
import type { AnswerWidgetFor } from "../answers/types.ts";

/** The registry's widget for an answer kind, or null. */
export const lessonWidgetFor: AnswerWidgetFor = (spec) => answerWidgetFor(spec);
