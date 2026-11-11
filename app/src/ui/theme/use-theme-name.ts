// Paper or Bark as data, following `<html data-theme>`: for colours drawn from data (degree colours, covers,
// canvases) rather than CSS tokens.
import { useSyncExternalStore } from "react";
import type { ThemeName } from "./palette.ts";

function subscribeTheme(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const themeNow = (): ThemeName => (document.documentElement.dataset.theme === "bark" ? "bark" : "paper");

export function useThemeName(): ThemeName {
  return useSyncExternalStore(subscribeTheme, themeNow, () => "paper");
}
