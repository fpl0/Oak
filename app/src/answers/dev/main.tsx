// The answer gallery's own entry, served by the app's Vite at /src/answers/dev/gallery.html (dev only: the
// production build has one entry, index.html). It boots like the app (styles, preferences, "press any key to
// wake sound") without the router or the shell, so every answer widget can be seen and tested on its own.
import "../../styles/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { installAudioWake } from "../../lib/oak.ts";
import { installPrefsSync } from "../../ui/theme/prefs.ts";
import { Gallery } from "./GalleryPage.tsx";

// `?pin=1` (the Playwright specs): other engineers' edits elsewhere in the tree make Vite reload every open page,
// which would wipe a take mid-test. A `vite:beforeFullReload` listener that never settles holds that reload off.
if (import.meta.hot && new URLSearchParams(location.search).get("pin") === "1")
  import.meta.hot.on("vite:beforeFullReload", () => new Promise<void>(() => {}));

const root = document.getElementById("root");
if (root) {
  installPrefsSync();
  installAudioWake();
  createRoot(root).render(
    <StrictMode>
      <Gallery />
    </StrictMode>,
  );
}
