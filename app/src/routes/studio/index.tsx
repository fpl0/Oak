// /studio (ux §2.3): the sketchbook. The page lives in app/src/studio/Sketchbook.tsx.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Sketchbook } from "../../studio/Sketchbook.tsx";
import { TryTool } from "../../studio/TryTool.tsx";

const searchSchema = z.object({
  new: z.boolean().optional().catch(undefined),
  /** "Try it in Studio" (the Coda, the unlock moment): a new sketch from this tool's demo. */
  try: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/studio/")({
  validateSearch: (s) => searchSchema.parse(s),
  component: StudioRoute,
});

function StudioRoute() {
  const { new: wantsNew, try: tryTool } = Route.useSearch();
  const navigate = useNavigate();
  if (tryTool)
    return (
      <TryTool
        toolId={tryTool}
        onHandled={() => void navigate({ to: "/studio", search: {}, replace: true })}
      />
    );
  return (
    <Sketchbook
      wantsNew={wantsNew === true}
      onNewHandled={() => void navigate({ to: "/studio", search: {}, replace: true })}
    />
  );
}
