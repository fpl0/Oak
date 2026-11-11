// The app's Workbench services: its one Strudel adapter, the one browser grader host and the feedback catalog
// (`renderFeedback`). Every page that mounts a Workbench (Studio, the Toolbox, the lesson and checkpoint players,
// the capstone, the session's sketch blocks, the dev pages) loads them through `ServicesGate load={…}`.
import { renderFeedback } from "@oak/grader";
import type { WorkbenchServices } from "../workbench/services.tsx";
import { graderHost } from "./grader-client.ts";
import { getOak } from "./oak.ts";

/** The catalog text of a diagnostic (its ID when the catalog has no entry, so a gap never throws in the UI). */
export function catalogText(
  d: Parameters<typeof renderFeedback>[0],
  overrides?: Parameters<typeof renderFeedback>[1],
): string {
  try {
    return renderFeedback(d, overrides);
  } catch {
    return d.id;
  }
}

/** The adapter can exist before a gesture; audio unlocks on the first Play. */
export async function appWorkbenchServices(): Promise<WorkbenchServices> {
  const [oak, grader] = await Promise.all([getOak(), graderHost()]);
  return { oak, grader, renderFeedback: (d) => catalogText(d) };
}
