// /dev/workbench: the workbench playground inside the app shell, with the app's own adapter and grader host.
import { Playground } from "../../../workbench/dev/Playground.tsx";
import "../../../workbench/index.ts";
import { ServicesGate } from "../../../workbench/ServicesGate.tsx";
import { appWorkbenchServices } from "../-lib/app-services.ts";

export function WorkbenchPage() {
  return (
    <div className="oak-dev-page" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h1>Workbench playground</h1>
      <ServicesGate load={appWorkbenchServices}>
        <Playground />
      </ServicesGate>
    </div>
  );
}
