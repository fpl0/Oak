// Type-level probe (tsc -p spikes/s4-notation/tsconfig.json): abcjs' d.ts declares named exports only, yet
// under moduleResolution "bundler" the dynamic-import type also gets a synthetic `default`, so BOTH forms
// type-check. The named form is the one that matches the d.ts and works at runtime in Vite dev/build and Bun.
export async function loadAbcjs() {
  const abcjs = await import("abcjs");
  const viaDefault: typeof abcjs.renderAbc = abcjs.default.renderAbc;
  const tune = abcjs.renderAbc("*", "X:1\nK:C\nC|]", { add_classes: true, responsive: "resize" })[0];
  return { viaDefault, tune };
}
