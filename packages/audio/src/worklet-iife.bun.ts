// The spare worklet loader (spike S5 §5, fallback 2): the pitch worklet bundled by Bun into ONE
// self-contained IIFE (pitchy and fft.js inlined, no imports), for a page that loads it through `?raw` and
// a Blob URL, or for a future without Vite. Not used by the app while `?worker&url` works.
import { fileURLToPath } from "node:url";

export const PITCH_WORKLET_ENTRY = fileURLToPath(new URL("./worklets/pitch.worklet.ts", import.meta.url));

export async function buildPitchWorkletIife(opts: { minify?: boolean } = {}): Promise<string> {
  const res = await Bun.build({
    entrypoints: [PITCH_WORKLET_ENTRY],
    target: "browser",
    format: "iife",
    minify: opts.minify ?? true,
  });
  if (!res.success) throw new Error(`@oak/audio: worklet build failed: ${res.logs.map(String).join("\n")}`);
  const out = res.outputs[0];
  if (!out) throw new Error("@oak/audio: worklet build produced no output");
  return out.text();
}
