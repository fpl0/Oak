// The workbench's own e2e page (port 5193): the /dev/workbench playground without the app shell, with its own
// adapter and grader host (standalone-services.ts). Served by ./vite.config.ts.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KeymapProvider } from "../../ui/keys/KeymapProvider.tsx";
import { Playground } from "../dev/Playground.tsx";
import { StepHarness } from "../dev/StepHarness.tsx";
import "../index.ts";
import { ServicesGate } from "../ServicesGate.tsx";
import { standaloneServices } from "../standalone-services.ts";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    {/* The workbench lists its Wave 2 keys in the shortcut sheet through the app's keymap. */}
    <KeymapProvider focusRoute={() => false}>
      <h1 style={{ fontSize: 18 }}>Oak workbench (e2e)</h1>
      <ServicesGate load={() => standaloneServices()} auto>
        {new URLSearchParams(location.search).get("w4") === "step" ? <StepHarness /> : <Playground />}
      </ServicesGate>
    </KeymapProvider>
  </StrictMode>,
);
