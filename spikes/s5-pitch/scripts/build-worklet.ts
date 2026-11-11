// bun spikes/s5-pitch/scripts/build-worklet.ts
// Fallback path: prebuild the worklet as ONE self-contained file with Bun.build, so it can be loaded
// by any bundler (or none) via `?raw` + Blob URL, or served as a static asset.
import { join } from 'node:path';

const root = join(import.meta.dir, '..');
const res = await Bun.build({
  entrypoints: [join(root, 'src/pitch.worklet.ts')],
  target: 'browser',
  format: 'iife',
  minify: true,
});
if (!res.success) {
  console.error(res.logs);
  process.exit(1);
}
const code = await (res.outputs[0] as Blob).text();
await Bun.write(join(root, 'src/generated/pitch.worklet.iife.js'), code);
console.log(`src/generated/pitch.worklet.iife.js: ${code.length} bytes`);
