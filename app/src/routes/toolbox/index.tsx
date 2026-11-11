// /toolbox?cat= (ux §5.1): every tool, sound, scale and chord. The page lives in app/src/toolbox.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ToolboxIndex } from "../../toolbox/ToolboxIndex.tsx";

const searchSchema = z.object({ cat: z.string().optional().catch(undefined) });

export const Route = createFileRoute("/toolbox/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ToolboxRoute,
});

function ToolboxRoute() {
  const { cat } = Route.useSearch();
  return <ToolboxIndex cat={cat} />;
}
