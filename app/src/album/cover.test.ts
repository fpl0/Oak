// "Tree Rings" covers (ux §5.3, §10 item 9): deterministic, one ring per bar, coloured by the music.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { analysePiece, testPiece } from "../capstone/test-support.ts";
import { DEGREE_COLOURS } from "../ui/theme/palette.ts";
import {
  type CoverInput,
  coverModel,
  coverSvg,
  functionDegree,
  OUTER_R,
  PITH_R,
  seededRandom,
  WOODS,
} from "./cover.ts";

setDefaultTimeout(60_000);

async function input(id: "C0" | "C1", name: string, over: Partial<CoverInput> = {}): Promise<CoverInput> {
  const { n, bars, analysis } = await analysePiece(id, testPiece(id, name));
  return {
    events: n.all,
    bars,
    key: analysis.key[0]?.key ?? null,
    bpm: analysis.bpm,
    flavour: "flavour.pop",
    title: id === "C0" ? "Intro" : "First Loop",
    albumTitle: "Oak Sessions",
    seed: "trk_test",
    slots: analysis.slots,
    ...over,
  };
}

const rings = (svg: string) => (svg.match(/data-ring="/g) ?? []).length;

describe("tree-ring covers", () => {
  test("byte-identical for the same music and seed (snapshot)", async () => {
    const i = await input("C0", "four bars, tom fill in bar 4");
    const a = coverSvg(coverModel(i), i.title);
    expect(coverSvg(coverModel(i), i.title)).toBe(a);
    expect(a).toMatchSnapshot();
  });

  test("one ring per bar; a drum intro's pith shows its tempo", async () => {
    const four = await input("C0", "four bars, tom fill in bar 4");
    const svg = coverSvg(coverModel(four), four.title);
    expect(rings(svg)).toBe(4);
    expect(svg).toContain(">100</text>");
    expect(svg).toContain(">BPM</text>");
    expect(coverModel(four).summary).toBe("4 rings, one per bar, 100 BPM");
    const eight = await input("C0", "eight bars, sixteenth hats, crash and fill");
    expect(rings(coverSvg(coverModel(eight), eight.title))).toBe(8);
  });

  test("drums are marks on the ring line: one thorn per kick and per snare, one dash per hat", async () => {
    const i = await input("C0", "four bars, tom fill in bar 4");
    const model = coverModel(i);
    const ringItems = model.groups.filter((g) => g.kind === "ring").flatMap((g) => g.items);
    const count = (role: string) => ringItems.filter((p) => p.t === "path" && p.role === role).length;
    const drums = (role: string) => (i.events ?? []).filter((e) => e.drum === role).length;
    expect(count("kick")).toBe(drums("kick"));
    expect(count("snare")).toBe(drums("snare"));
    expect(count("hat")).toBe(drums("hatClosed"));
    expect(count("note")).toBe(0);
  });

  test("pitched notes are arcs in their degree colour; the pith names the key", async () => {
    const i = await input("C1", "four bars, riff answers itself");
    const model = coverModel(i);
    const svg = coverSvg(model, i.title);
    expect(model.summary).toBe("4 rings, one per bar, C major, 96 BPM");
    expect(svg).toContain(">C</text>");
    // The riff starts on c4 (degree 1) and the bass on c2: both drawn in the degree-1 colour.
    const one = DEGREE_COLOURS.paper[1].fill;
    expect(svg).toContain(`stroke="${one}" stroke-width`);
    const notes = model.groups.flatMap((g) => g.items).filter((p) => p.t === "path" && p.role === "note");
    expect(notes.length).toBe((i.events ?? []).filter((e) => e.midi !== null && !e.drum).length);
  });

  test("the flavour chooses the wood; the seed moves only the grain", async () => {
    const i = await input("C1", "four bars, riff answers itself");
    const jazz = coverSvg(coverModel({ ...i, flavour: "flavour.jazz-soul" }), i.title);
    expect(jazz).toContain(`fill="${WOODS["flavour.jazz-soul"].bg}"`);
    expect(jazz).toContain(DEGREE_COLOURS.bark[1].fill);
    const other = coverSvg(coverModel({ ...i, seed: "trk_other" }), i.title);
    expect(other).not.toBe(coverSvg(coverModel(i), i.title));
    expect(rings(other)).toBe(4);
  });

  test("an unanalysed track still gets a cover; long pieces fold into the trunk", () => {
    const base: CoverInput = {
      events: null,
      bars: 6,
      key: null,
      bpm: null,
      flavour: null,
      title: "B-side <1>",
      albumTitle: "Oak Sessions",
      seed: "x",
    };
    const svg = coverSvg(coverModel(base), base.title);
    expect(rings(svg)).toBe(6);
    expect(svg).toContain("B-side &lt;1&gt;");
    const long = coverModel({ ...base, bars: 400 });
    expect(long.groups.filter((g) => g.kind === "ring").length).toBe(Math.floor((OUTER_R - PITH_R) / 2.5));
  });

  test("function tints and the PRNG", () => {
    expect(functionDegree("I")).toBe(1);
    expect(functionDegree("vi")).toBe(1);
    expect(functionDegree("IV")).toBe(4);
    expect(functionDegree("ii7")).toBe(4);
    expect(functionDegree("V7")).toBe(5);
    expect(functionDegree("V7/vi")).toBe(5);
    expect(functionDegree("?")).toBeNull();
    const a = seededRandom("s");
    const b = seededRandom("s");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
