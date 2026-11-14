// The Coda (focus mode, ux §1.5): app/src/session/coda/CodaPage.tsx. With `?ending=1` it is the ending reopened
// from Progress (content/specs/END.md): the finale section, read-only (app/src/session/coda/EndingPage.tsx).
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CodaPage } from "../../session/coda/CodaPage.tsx";
import { EndingPage } from "../../session/coda/EndingPage.tsx";

const searchSchema = z.object({ ending: z.literal(1).optional().catch(undefined) });

export const Route = createFileRoute("/session/coda")({
  validateSearch: (s) => searchSchema.parse(s),
  component: Coda,
});

function Coda() {
  const { ending } = Route.useSearch();
  return ending === 1 ? <EndingPage /> : <CodaPage />;
}
