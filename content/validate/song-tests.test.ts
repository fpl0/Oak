import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { capstones } from "../capstones.ts";
import { withSongBriefTests } from "./song-tests.ts";

// The app loads content/capstones.ts (through content/index.ts): a song's answer key must not be in its module
// graph, or every page fetches it (the L8 ladder hides Georgia on My Mind's code; wave7 closer).
describe("song-reading brief tests stay out of the app's modules", () => {
  test("content/capstones.ts and the pieces it imports do not import a repertoire song", () => {
    const root = join(import.meta.dir, "..");
    const seen = new Set<string>();
    const queue = [join(root, "capstones.ts")];
    const songs: string[] = [];
    while (queue.length) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/^import\s[^;]*?from\s+"(\.{1,2}\/[^"]+)"/gms)) {
        const target = join(file, "..", m[1] as string);
        if (/repertoire\/.+\/song\.ts$/.test(target)) songs.push(target);
        else if (target.endsWith(".ts")) queue.push(target);
      }
    }
    expect(songs).toEqual([]);
  });
  test("JC4's brief gains its song tests in content CI: a pass and fails beside the starter", async () => {
    const jc4 = capstones.find((c) => c.id === "JC4");
    expect(jc4?.brief?.tests.length).toBe(1);
    const full = await withSongBriefTests(jc4 as NonNullable<typeof jc4>);
    const tests = full.brief?.tests ?? [];
    // W7 gate: + the two-own-devices piece that the song's chart (`songForm`) now fails.
    expect(tests.length).toBe(9);
    expect(tests.filter((t) => t.expect === "pass").length).toBe(4);
    const other = capstones.find((c) => c.id === "JC1");
    expect(await withSongBriefTests(other as NonNullable<typeof other>)).toBe(
      other as NonNullable<typeof other>,
    );
  });
});
