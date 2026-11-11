// Oak boot script: a classic script that runs before the app module (contracts §11.2 forbids inline
// scripts, so this lives in its own file). Two jobs:
//  1. Apply the stored UI preferences (theme, motion, contrast, scale) to <html> before first paint, so
//     there is no flash of the wrong theme. The keys match app/src/ui/theme/prefs.ts.
//  2. Stop browsers Oak does not support (contracts §11.12: Chromium only) with a static page before
//     any app code loads.
(() => {
  const root = document.documentElement;
  let prefs = {};
  try {
    prefs = JSON.parse(localStorage.getItem("oak.ui.v1") || "{}") || {};
  } catch {
    prefs = {};
  }
  const media = (q) => typeof matchMedia === "function" && matchMedia(q).matches;
  const theme =
    prefs.theme === "paper" || prefs.theme === "bark"
      ? prefs.theme
      : media("(prefers-color-scheme: dark)")
        ? "bark"
        : "paper";
  root.dataset.theme = theme;
  const reduce =
    prefs.motion === "on" || (prefs.motion !== "off" && media("(prefers-reduced-motion: reduce)"));
  root.dataset.motion = reduce ? "reduced" : "full";
  if (prefs.contrast === true) root.dataset.contrast = "high";
  if (typeof prefs.uiScale === "number" && prefs.uiScale >= 90 && prefs.uiScale <= 125) {
    root.style.fontSize = `${prefs.uiScale}%`;
  }

  const brands = navigator.userAgentData?.brands || [];
  const chromium =
    brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand)) ||
    // userAgentData is missing on non-secure origins in some builds; fall back to the UA string.
    (/Chrome\/\d+/.test(navigator.userAgent) && !/Firefox|FxiOS|EdgiOS|CriOS/.test(navigator.userAgent));
  if (!chromium) {
    root.dataset.unsupported = "1";
    document.addEventListener("DOMContentLoaded", () => {
      document.body.innerHTML =
        '<main style="max-width:32rem;margin:15vh auto;padding:0 1.5rem;font:16px/1.5 system-ui,sans-serif">' +
        '<h1 style="font-size:1.75rem;margin:0 0 .75rem">Open Oak in Chrome</h1>' +
        "<p>Oak listens to your microphone and keeps time to the millisecond. It needs a Chromium " +
        "browser for that: Chrome, Arc or Edge.</p>" +
        "<p>Copy this address into one of them to carry on.</p></main>";
    });
  }
})();
