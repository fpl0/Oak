import { describe, expect, test } from "bun:test";
import { bandById } from "../../../content/bands/index.ts";
import { bandSetupOf, checkpointMakeBand } from "./band.ts";

const C = { tonic: "C", mode: "major" } as const;
const jazz = (at: string | null) =>
  bandSetupOf({ band: "band.two-chord-vamp" } as never, {
    flavour: "flavour.jazz-soul" as never,
    key: C,
    bpm: 96,
    at: at as never,
  })?.code;

describe("the Band a lesson plays (contracts §5.10 stages)", () => {
  test("jazz-soul plays its first stage before U03 and its staged chords from U03 on", () => {
    const first = (bandById.get("band.two-chord-vamp")?.code["flavour.jazz-soul" as never] ?? "")
      .replaceAll("{{key}}", "C4:major")
      .replaceAll("{{bpm}}", "96");
    expect(jazz("U02.L01")).toBe(first);
    expect(jazz(null)).toBe(first);
    expect(jazz("U03.L05")).not.toBe(first);
    expect(jazz("U03.L05")).toBe(jazz("U04.L02"));
  });

  test("a checkpoint's Make plays the Band content names for it", () => {
    expect(checkpointMakeBand("U03.CP", null)?.band).toBe("band.phrase-8bar");
    expect(checkpointMakeBand("U99.CP", { steps: [] })).toBeNull();
  });
});
