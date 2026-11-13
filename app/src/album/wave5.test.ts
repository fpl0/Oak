// The album's covers for the Wave 5 tracks (ux §5.3): C3's 32-bar demo, C4's ballad in A minor and C5's two
// 12-bar choruses each grow their own rings from their own music, in the key they are in, and no two of the
// album's covers are the same drawing, even with the same flavour and seed.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { C3_FULL, C4_FULL, C5_FULL } from "../capstone/e2e/w5-pieces.ts";
import { analysePiece, capstone } from "../capstone/test-support.ts";
import { type CoverInput, coverModel, coverSvg } from "./cover.ts";

setDefaultTimeout(120_000);

async function input(id: string, code: string, title: string): Promise<CoverInput> {
  const { n, bars, analysis } = await analysePiece(id, code);
  return {
    events: n.all,
    bars,
    key: capstone(id).key ?? analysis.key[0]?.key ?? null,
    bpm: analysis.bpm,
    flavour: "flavour.pop",
    title,
    albumTitle: "Oak Sessions",
    seed: "trk_same",
    slots: analysis.slots,
  };
}
const rings = (svg: string) => (svg.match(/data-ring="/g) ?? []).length;

describe("Wave 5 covers", () => {
  test("one ring per bar for the long pieces, each in its own key", async () => {
    const c3 = await input("C3", C3_FULL, "Two Rooms");
    const c4 = await input("C4", C4_FULL, "Low Light");
    const c5 = await input("C5", C5_FULL, "Late Shuffle");
    const m3 = coverModel(c3);
    const m4 = coverModel(c4);
    const m5 = coverModel(c5);
    expect(rings(coverSvg(m3, c3.title))).toBe(32);
    expect(rings(coverSvg(m4, c4.title))).toBe(16);
    expect(rings(coverSvg(m5, c5.title))).toBe(24);
    expect(m3.summary).toBe("32 rings, one per bar, C major, 80 BPM");
    expect(m4.summary).toContain("A minor");
    expect(m5.summary).toContain("112 BPM");
  });

  test("the same flavour and seed still give three different drawings, and the same piece the same one", async () => {
    const pieces = await Promise.all([
      input("C3", C3_FULL, "A"),
      input("C4", C4_FULL, "A"),
      input("C5", C5_FULL, "A"),
    ]);
    const svgs = pieces.map((p) => coverSvg(coverModel(p), p.title));
    expect(new Set(svgs).size).toBe(3);
    const again = await input("C3", C3_FULL, "A");
    expect(coverSvg(coverModel(again), again.title)).toBe(svgs[0] as string);
  });
});
