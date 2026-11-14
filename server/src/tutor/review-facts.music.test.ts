// The review facts against Oak's real analysis: SONG_CODE through headless Strudel, `harmonyView` and
// `analyzePiece` (@oak/grader), shaped by `reviewFactsFrom`. This proves the structural inputs fit the grader's
// own types and that the facts in the Wave 4 fixtures are what Oak computes, not what someone remembered.
// (Test only: the tutor itself imports no package.)
import { expect, setDefaultTimeout, test } from "bun:test";
import { analyzePiece } from "@oak/grader";
import { strudel } from "../../../packages/grader/src/analyze/__support__/fixtures.ts";
import { harmonyView } from "../../../packages/grader/src/analyze/harmony-view.ts";
import { factLines, reviewFactsFrom } from "./review-facts.ts";
import { SONG_CODE, SONG_FACTS } from "./testing/wave4-fixtures.ts";

setDefaultTimeout(30_000);

test("SONG_FACTS are what Oak's analysis reads from SONG_CODE", async () => {
  const C = { tonic: "C", mode: "major" } as const;
  const n = await strudel(SONG_CODE, 8);
  const view = harmonyView(n, { meter: "4/4", key: C, bars: 8 });
  const analysis = analyzePiece(n, { meter: "4/4", key: C, code: SONG_CODE } as Parameters<
    typeof analyzePiece
  >[1]);
  const notes = view.melody.map((m) => ({ track: "mel", midi: m.midi, bar: m.bar, beat: m.beat }));
  const facts = reviewFactsFrom({ view, analysis, notes, meter: "4/4" });
  expect(facts).toEqual(SONG_FACTS);
  expect(factLines(facts)).toContain("cadence: bar 8 authentic cadence (V to I, melody on 1)");
});
