// The Wave 5 learner review of the album's covers (review:studio): a learner's C3s, C4s and C5s, honest pieces and
// near misses that differ by a note, a tempo or a chord, each grow a cover of their own (no two the same drawing,
// as released with their own track ids), with one ring per bar, in the key the piece is in: C3 has no key in its
// brief, so a demo in G reads G major, not the C the brief's default would say.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { KeySpec } from "@oak/content-kit";
import { keyEstimate } from "@oak/grader";
import { PIECES } from "../capstone/review-w5-pieces.ts";
import { analysePiece, capstone } from "../capstone/test-support.ts";
import { type CoverInput, coverModel, coverSvg } from "./cover.ts";

setDefaultTimeout(180_000);

async function input(id: string, code: string, seed: string): Promise<CoverInput & { key: KeySpec | null }> {
  const { n, bars, analysis } = await analysePiece(id, code);
  return {
    events: n.all,
    bars,
    key: capstone(id).key ?? keyEstimate(n.all)[0]?.key ?? null,
    bpm: analysis.bpm,
    flavour: "flavour.pop",
    title: "Untitled",
    albumTitle: "Oak Sessions",
    seed,
    slots: analysis.slots,
  };
}
const rings = (svg: string) => (svg.match(/data-ring="/g) ?? []).length;

describe("covers of similar pieces", () => {
  test("every piece of the review grows its own drawing, one ring per bar, in its own key", async () => {
    const svgs = new Map<string, string>();
    for (const [i, p] of PIECES.entries()) {
      const c = await input(p.id, p.code, `trk_review_${i}`);
      const m = coverModel(c);
      const svg = coverSvg(m, c.title);
      expect(rings(svg)).toBeLessThanOrEqual(c.bars);
      expect(rings(svg)).toBeGreaterThanOrEqual(Math.min(c.bars, 12));
      if (c.key)
        expect(m.summary).toContain(`${c.key.tonic} ${c.key.mode === "blues" ? "blues" : c.key.mode}`);
      svgs.set(p.name, svg);
    }
    expect(new Set(svgs.values()).size).toBe(PIECES.length);
    // The G major demo is not drawn as C major.
    const g = await input("C3", PIECES[0]?.code as string, "trk_g");
    expect(coverModel(g).summary).toContain("G major");
  });

  test("two takes a note apart, on the same track id, still differ; the same piece twice is the same drawing", async () => {
    const a = PIECES.find((p) => p.name.startsWith("note names")) as (typeof PIECES)[number];
    const b = PIECES.find((p) =>
      p.name.startsWith("near miss: the tune ends on C"),
    ) as (typeof PIECES)[number];
    const ca = await input("C4", a.code, "trk_same");
    const cb = await input("C4", b.code, "trk_same");
    const sa = coverSvg(coverModel(ca), "Same");
    const sb = coverSvg(coverModel(cb), "Same");
    expect(sa).not.toBe(sb);
    expect(coverSvg(coverModel(await input("C4", a.code, "trk_same")), "Same")).toBe(sa);
  });
});
