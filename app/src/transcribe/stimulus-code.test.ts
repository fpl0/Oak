// The reference rebuilt from its events plays exactly the reference: every generated ladder level and realism,
// checked against the original events with headless Strudel.
import { describe, expect, test } from "bun:test";
import type { NEvent } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { DEFAULT_PROFILE, generateLadderPiece } from "@oak/drills";
import { evalHeadless } from "@oak/grader/testing";
import { combinedCode, lineMini, REF_PREFIX, refLabel, stimulusCode } from "./stimulus-code.ts";

const sig = (onset: number, midi: number | null, s: string | null) =>
  `${onset.toFixed(4)}|${midi ?? s ?? "?"}`;

async function sameAsReference(events: NEvent[], bars: number) {
  const { code, tracks } = stimulusCode(events, bars);
  expect(tracks.every((t) => t.startsWith(REF_PREFIX))).toBe(true);
  const out = await evalHeadless(code, bars);
  const want = events
    .filter((e) => R.toNum(e.onset) < bars)
    .map((e) => sig(R.toNum(e.onset), e.midi, e.midi === null ? (e.s ?? null) : null))
    .sort();
  const got = out.events.map((e) => sig(e.onset, e.midi, e.midi === null ? e.s : null)).sort();
  expect(got).toEqual(want);
}

describe("stimulusCode", () => {
  for (const level of [1, 2, 3, 4] as const)
    for (const realism of [0, 2, 4] as const)
      test(`L${level} R${realism}: the rebuilt pattern plays the reference's onsets and notes`, async () => {
        const piece = generateLadderPiece(level, realism, 1000 + level * 10 + realism, DEFAULT_PROFILE);
        await sameAsReference(piece.events, piece.bars);
      });

  test("durations hold with `_` and rests fill the bar", () => {
    const steps = [
      { at: [0, 1] as [number, number], end: [1, 2] as [number, number], atoms: ["60"] },
      { at: [3, 4] as [number, number], end: [1, 1] as [number, number], atoms: ["62", "65"] },
    ];
    expect(lineMini(steps, 1)).toBe("60 _ ~ [62,65]");
  });

  test("an empty line is a rest; labels are safe and never muted", () => {
    expect(lineMini([], 2)).toBe("~");
    expect(refLabel("band.drums", 0)).toBe("ref_band_drums");
    expect(refLabel("$0", 1)).toBe("ref_0_1");
    expect(refLabel("___", 0)).toBe("ref_t");
  });

  test("the combined pattern keeps both: reference tracks and the learner's", async () => {
    const piece = generateLadderPiece(1, 0, 7, DEFAULT_PROFILE);
    const ref = stimulusCode(piece.events, piece.bars);
    const out = await evalHeadless(combinedCode(ref, 'mine: s("bd ~ bd ~")'), piece.bars);
    expect(out.tracks).toContain("mine");
    for (const t of ref.tracks) expect(out.tracks).toContain(t);
  });

  test("triplet onsets stay exact", async () => {
    const ev = (k: number, d: number): NEvent => ({
      id: `x${k}`,
      track: "mel",
      onset: [k, d],
      dur: [1, d],
      midi: 60 + k,
      pitchSource: "note-num",
      gain: 0.8,
      s: "piano",
      locs: [],
    });
    const events = [ev(0, 3), ev(1, 3), ev(2, 3)];
    const { code } = stimulusCode(events, 1);
    const out = await evalHeadless(code, 1);
    expect(out.events.map((e) => e.begin)).toEqual(["0", "1/3", "2/3"]);
  });
});
