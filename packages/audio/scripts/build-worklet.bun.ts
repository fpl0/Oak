// bun packages/audio/scripts/build-worklet.bun.ts [out-file]
// Writes the self-contained IIFE pitch worklet (the spare loader). Default output:
// packages/audio/e2e/.generated/pitch.worklet.iife.js (the e2e page loads it through `?raw` + a Blob URL).
import { buildPitchWorkletIife } from "../src/worklet-iife.bun.ts";

const out = process.argv[2] ?? new URL("../e2e/.generated/pitch.worklet.iife.js", import.meta.url).pathname;
const code = await buildPitchWorkletIife();
await Bun.write(out, code);
console.log(`${out}: ${code.length} bytes`);
