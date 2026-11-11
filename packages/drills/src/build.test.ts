import { describe, expect, test } from "bun:test";
import { rat } from "@oak/content-kit";
import { buildPiece, fmtNum, type TrackSpec } from "./build.ts";
import { alt, atom, chordOf, line, type Node, print, rest, seq, stack } from "./pat.ts";
import { createRng } from "./rng.ts";
import { flattenEvents, strudelEvents } from "./testing.test-util.ts";

describe("pattern printing", () => {
  test("mini-notation of the supported subset", () => {
    expect(print(line([0, 2, null, 4])).text).toBe("0 2 ~ 4");
    expect(print(alt([rest, atom(5)])).text).toBe("<~ 5>");
    expect(print(seq([atom("hh", 8)])).text).toBe("hh*8");
    expect(print(seq([atom("c4"), atom("d4")], [3, 1])).text).toBe("c4@3 d4");
    expect(print(alt([seq([chordOf(["c3", "e3"]), chordOf(["d3", "f3"])]), rest])).text).toBe(
      "<[[c3,e3] [d3,f3]] ~>",
    );
    expect(fmtNum(0.55)).toBe(".55");
    expect(fmtNum(1)).toBe("1");
  });
  test("code ranges point at the atoms", () => {
    const piece = buildPiece({
      bpm: 100,
      bars: 1,
      tracks: [{ label: "mel", src: "note", pat: line(["c4", "eb4"]), s: "piano" }],
    });
    expect(piece.code).toBe('setcpm(100/4)\n\nmel: note("c4 eb4").s("piano")');
    const [a, b] = piece.events;
    expect(piece.code.slice(a?.locs[0]?.from, a?.locs[0]?.to)).toBe("c4");
    expect(piece.code.slice(b?.locs[0]?.from, b?.locs[0]?.to)).toBe("eb4");
    expect(a?.id).toBe("mel|1|0/1|60|0");
  });
});

describe("generated code plays the generated events (headless Strudel)", () => {
  const cases: { name: string; bpm: number; bars: number; tracks: TrackSpec[] }[] = [
    {
      name: "FET cadence and target",
      bpm: 100,
      bars: 2,
      tracks: [
        {
          label: "chords",
          src: "note",
          pat: alt([
            seq([
              chordOf(["a2", "c#4", "e4"]),
              chordOf(["d3", "a3", "d4", "f#4"]),
              chordOf(["e3", "b3", "g#4"]),
              chordOf(["a2", "c#4", "e4"]),
            ]),
            rest,
          ]),
          s: "rhodes",
          gain: 0.55,
        },
        {
          label: "mel",
          src: "n",
          pat: alt([rest, atom(5)]),
          key: { tonic: "A", mode: "major" },
          octave: 3,
          s: "piano",
        },
      ],
    },
    {
      name: "swung hats over a backbeat",
      bpm: 120,
      bars: 2,
      tracks: [
        { label: "hats", src: "s", pat: seq([atom("hh", 8)]), swing: { amount: rat(1, 3), per: 4 }, gain: 0.6 },
        { label: "kick", src: "s", pat: line(["bd", null, "bd", null]), bank: "RolandTR909" },
        { label: "snare", src: "s", pat: line([null, "sd", null, "sd"]), bank: "RolandTR909" },
      ],
    },
    {
      name: "chromatic steps in minor and a patterned gain",
      bpm: 88,
      bars: 3,
      tracks: [
        {
          label: "mel",
          src: "n",
          pat: alt([line([0, "2#", 4, "6#"]), line([-1, "1b", 7, 9]), seq([atom(4), atom(0)], [3, 1])]),
          key: { tonic: "F#", mode: "harmonic minor" },
          octave: 4,
          s: "piano",
        },
        {
          label: "hats",
          src: "s",
          pat: seq([atom("hh", 7)]),
          gain: line([1, 0.5, 1, 0.5, 1, 0.5, 0.5].map((x) => fmtNum(x))),
        },
      ],
    },
    {
      name: "sixteenth swing",
      bpm: 96,
      bars: 1,
      tracks: [
        { label: "hats", src: "s", pat: seq([atom("hh", 16)]), swing: { amount: rat(1, 4), per: 8 } },
      ],
    },
  ];
  for (const c of cases) {
    test(c.name, async () => {
      const piece = buildPiece(c);
      const got = await strudelEvents(piece.code, c.bars);
      expect(got.logs).toEqual([]);
      expect(flattenEvents(piece.events)).toEqual(got.flat);
      expect(got.cps).toBeCloseTo(piece.cps, 9);
    });
  }

  test("random patterns of the subset", async () => {
    const rng = createRng(20261111);
    const leaf = (): Node => (rng.next() < 0.2 ? rest : atom(rng.pick(["c3", "eb4", "f#4", "bb2", "g5"])));
    const tree = (depth: number): Node => {
      const r = rng.next();
      if (depth === 0 || r < 0.3) return leaf();
      const items = Array.from({ length: rng.int(1, 4) }, () => tree(depth - 1));
      if (r < 0.6) return seq(items, rng.next() < 0.4 ? items.map(() => rng.int(1, 3)) : undefined);
      if (r < 0.8) return stack(items);
      return alt(items);
    };
    for (let i = 0; i < 40; i++) {
      const pat = seq([tree(3), tree(2)]);
      const piece = buildPiece({ bpm: 90, bars: 6, tracks: [{ label: "mel", src: "note", pat, s: "piano" }] });
      if (piece.events.length === 0) continue;
      const got = await strudelEvents(piece.code, 6);
      expect(flattenEvents(piece.events)).toEqual(got.flat);
    }
  });
});
