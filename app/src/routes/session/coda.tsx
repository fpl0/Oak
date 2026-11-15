// The Coda (focus mode, ux §1.5): app/src/session/coda/CodaPage.tsx. With `?ending=1` it is the ending reopened
// from Progress (content/specs/END.md): the finale section, read-only (app/src/session/coda/EndingPage.tsx). With
// `?ending=course` it is the whole course's ending reopened (wave7.md §5.8; CourseEndingPage.tsx).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CodaPage } from "../../session/coda/CodaPage.tsx";
import { CourseEndingPage } from "../../session/coda/CourseEndingPage.tsx";
import { EndingPage } from "../../session/coda/EndingPage.tsx";

// `ending=1`: the end of the core; `ending=course` (Wave 7): the end of the whole course.
const searchSchema = z.object({
  ending: z
    .union([z.literal(1), z.literal("course")])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/session/coda")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Coda,
});

function Coda() {
  const { ending } = Route.useSearch();
  return ending === 1 ? <EndingPage /> : ending === "course" ? <CourseEndingPage /> : <CodaPage />;
}
