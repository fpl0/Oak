// Files the Workbench keeps in step with others: the standalone page (port 5193) loads the locked sound pack, and
// the staff's degree colours (workbench.css) are the palette's.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("the standalone page's sounds root is the pack lock's publicRoot", () => {
  const lock = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../../sounds/pack.lock.json"), "utf8"),
  ) as {
    publicRoot: string;
  };
  const source = readFileSync(resolve(import.meta.dirname, "standalone-services.ts"), "utf8");
  const root = /STANDALONE_SOUNDS_ROOT = "([^"]+)"/.exec(source)?.[1];
  expect(root).toBe(lock.publicRoot);
});

test("the staff's degree colours in workbench.css are the palette's fills, in Paper and in Bark", async () => {
  const { DEGREE_COLOURS } = await import("../ui/theme/palette.ts");
  const css = readFileSync(resolve(import.meta.dirname, "workbench.css"), "utf8");
  for (const theme of ["paper", "bark"] as const)
    for (const d of [1, 2, 3, 4, 5, 6, 7] as const) {
      const sel =
        theme === "paper" ? `\n[data-oak-deg="${d}"] {` : `:root[data-theme="bark"] [data-oak-deg="${d}"] {`;
      const at = css.indexOf(sel);
      expect([theme, d, at >= 0]).toEqual([theme, d, true]);
      const fill = /fill:\s*(#[0-9a-f]{6})/i.exec(css.slice(at))?.[1]?.toLowerCase();
      expect([theme, d, fill]).toEqual([theme, d, DEGREE_COLOURS[theme][d].fill.toLowerCase()]);
    }
});
