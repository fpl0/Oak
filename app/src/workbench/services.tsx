// What a workbench needs from the app: the one OakStrudel adapter, the one browser GraderHost and the
// feedback renderer. The app shell provides them once (app/src/lib/oak.ts in the integrated app); the dev
// pages and the e2e page use `dev-services.ts`. Tests can pass fakes.
import type { Diagnostic } from "@oak/content-kit";
import type { GraderHost } from "@oak/grader";
import type { OakStrudel } from "@oak/strudel";
import { createContext, type ReactNode, useContext } from "react";

export interface WorkbenchServices {
  oak: OakStrudel;
  grader: GraderHost;
  /** Catalog text for a diagnostic (@oak/grader `renderFeedback`); the result's own messages otherwise. */
  renderFeedback?: (d: Diagnostic) => string;
}

const ServicesContext = createContext<WorkbenchServices | null>(null);

export function WorkbenchServicesProvider({
  value,
  children,
}: {
  value: WorkbenchServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useWorkbenchServices(): WorkbenchServices {
  const s = useContext(ServicesContext);
  if (!s)
    throw new Error("<Workbench> needs a <WorkbenchServicesProvider> (the adapter and the grader host)");
  return s;
}
