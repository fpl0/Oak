// Static SVG previews when a browser is unavailable. These are explicitly not browser screenshots.
// resvg is an optional local inspection tool, not a runtime dependency.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { learnerFixture } from "../fixtures.ts";
import { layoutIllustratedOak } from "../layout.ts";
import { illustratedOakSvg } from "../svg.tsx";

const directory = fileURLToPath(new URL("./previews/", import.meta.url));
await mkdir(directory, { recursive: true });
for (const seed of ["new", "mid", "mastered"] as const) {
  const fixture = learnerFixture(seed);
  const layout = layoutIllustratedOak(fixture.graph);
  for (const theme of ["paper", "bark"] as const) {
    const svg = illustratedOakSvg({ ...fixture, layout, theme });
    const file = `${directory}${seed}-${theme}.svg`;
    await Bun.write(file, svg);
    for (const [width, height] of [
      [1280, 800],
      [1440, 900],
    ]) {
      const process = Bun.spawn(
        ["resvg", "--width", String(width), file, `${directory}${seed}-${theme}-${width}x${height}.png`],
        { stdout: "inherit", stderr: "inherit" },
      );
      if ((await process.exited) !== 0) throw new Error("resvg could not render the static preview");
    }
  }
}
console.log(`Wrote 6 SVGs and 12 static PNG previews to ${directory}`);
