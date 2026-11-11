// /toolbox/$toolId (ux §5.1): one tool. The page lives in app/src/toolbox.
import { createFileRoute } from "@tanstack/react-router";
import { ToolPage } from "../../toolbox/ToolPage.tsx";

export const Route = createFileRoute("/toolbox/$toolId")({ component: ToolRoute });

function ToolRoute() {
  const { toolId } = Route.useParams();
  return <ToolPage toolId={toolId} />;
}
