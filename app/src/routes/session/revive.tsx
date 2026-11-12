// The Oak's "Revive" and "Revive more" (contracts §7.10): app/src/session/revive/RevivePage.tsx.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { RevivePage } from "../../session/revive/RevivePage.tsx";

const searchSchema = z.object({
  skill: z.string().max(12).optional().catch(undefined),
  more: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/session/revive")({
  validateSearch: (s) => searchSchema.parse(s),
  component: RouteComponent,
});

function RouteComponent() {
  const { skill, more } = Route.useSearch();
  return <RevivePage skillId={skill ?? null} more={more === true} />;
}
