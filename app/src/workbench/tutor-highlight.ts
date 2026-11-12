// What a tutor reference lights in the Workbench (app/src/tutor/context.ts `TutorHighlight`): the learner's
// events in bars `from`–`to` (1-based, inclusive), or every learner event at one pitch. The Band's events are
// never lit: the tutor talks about the learner's music. Pure; tested in tutor-highlight.test.ts.
import { barsToCycles, type TutorHighlight } from "../tutor/context.ts";
import type { ViewEvent } from "./model.ts";

export function tutorHighlightEvents(
  events: readonly Pick<ViewEvent, "id" | "band" | "onset" | "midi">[],
  h: Pick<TutorHighlight, "kind"> & ({ from: number; to: number } | { midi: number }),
): string[] {
  const mine = events.filter((e) => !e.band);
  if (h.kind === "bars" && "from" in h) {
    const [c0, c1] = barsToCycles(h.from, h.to);
    return mine.filter((e) => e.onset >= c0 - 1e-9 && e.onset < c1 - 1e-9).map((e) => e.id);
  }
  if (h.kind === "note" && "midi" in h)
    return mine.filter((e) => e.midi !== null && Math.round(e.midi) === h.midi).map((e) => e.id);
  return [];
}
