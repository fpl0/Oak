import "./styles/app.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installAudioWake } from "./lib/oak.ts";
import { createQueryClient } from "./lib/query-client.ts";
import { useShell } from "./lib/shell-store.ts";
import { createAppRouter } from "./router.tsx";
import { installPrefsSync } from "./ui/theme/prefs.ts";

// boot.js stopped an unsupported browser before this module loaded (contracts §11.12).
const root = document.getElementById("root");
if (root && document.documentElement.dataset.unsupported !== "1") {
  installPrefsSync();
  installAudioWake();
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient);
  // Privacy (contracts §11): the mic belongs to one step. Leaving the page closes it, whoever opened it.
  let path = router.state.location.pathname;
  router.subscribe("onBeforeNavigate", ({ toLocation }) => {
    if (toLocation.pathname === path) return;
    path = toLocation.pathname;
    useShell.getState().closeMic?.();
  });
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  );
}
