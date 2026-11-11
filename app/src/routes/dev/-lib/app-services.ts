// The app's own adapter and grader host as workbench services (the dev pages run inside the app shell).
import { renderFeedback } from "@oak/grader";
import { graderHost } from "../../../lib/grader-client.ts";
import { getOak } from "../../../lib/oak.ts";
import type { WorkbenchServices } from "../../../workbench/services.tsx";

function render(d: Parameters<typeof renderFeedback>[0]): string {
  try {
    return renderFeedback(d);
  } catch {
    return d.id;
  }
}

/** Call from a user gesture: the app creates its adapter on the first one. */
export async function appWorkbenchServices(): Promise<WorkbenchServices> {
  const [oak, grader] = await Promise.all([getOak(), graderHost()]);
  return { oak, grader, renderFeedback: render };
}
