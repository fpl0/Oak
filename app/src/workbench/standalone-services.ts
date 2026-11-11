// Services for a workbench page that runs WITHOUT the app shell (the e2e page on port 5193): its own
// OakStrudel and browser GraderHost, built from the content toolbox. The app itself uses
// app/src/lib/oak.ts (`getOak`) and app/src/lib/grader-client.ts (`graderHost`) instead.
import { lintOak, renderFeedback } from "@oak/grader";
import { createBrowserGraderHost } from "@oak/grader/host/browser";
import { createOakStrudel, getOakStrudel, type OakStrudel } from "@oak/strudel";
import { toolbox } from "../../../content/toolbox.ts";
import type { WorkbenchServices } from "./services.tsx";

let pending: Promise<WorkbenchServices> | null = null;

function adapter(soundsRoot: string): OakStrudel {
  try {
    return getOakStrudel();
  } catch {
    return createOakStrudel({
      soundsRoot,
      toolbox,
      lint: (code, ctx) => lintOak(code, ctx, toolbox),
    });
  }
}

/** Safe wrapper: `renderFeedback` may not cover every code yet; the result's own message is the fallback. */
function render(d: Parameters<typeof renderFeedback>[0]): string {
  try {
    return renderFeedback(d);
  } catch {
    return d.id;
  }
}

/** One adapter and one grader host per page; call it from a user gesture so audio may start. */
export function standaloneServices(soundsRoot = "/sounds/v1"): Promise<WorkbenchServices> {
  pending ??= (async () => {
    const oak = adapter(soundsRoot);
    const grader = createBrowserGraderHost({ toolbox: [...toolbox] });
    await Promise.all([oak.ready.catch(() => undefined), grader.ready()]);
    return { oak, grader, renderFeedback: render };
  })();
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
