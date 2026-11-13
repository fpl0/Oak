// Wave 5 against Oak's real analysis and theory: the capstone fixtures through headless Strudel and the grader's
// views (`formView`, `contrastAxes`, `bassView`, `bluesView`, `swingView`, `harmonyView`, `analyzePiece`), shaped by
// `reviewFactsFrom` exactly as the server's adapter does; the tutor's own mode, syllable and numeral tables against
// content-kit and @oak/theory; and every musical claim of the step fixtures by headless Strudel. (Test only: the
// tutor itself imports no package, so it keeps small tables that this file holds to the packages.)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import {
  MODE_DEGREES as CK_MODES,
  DEGREE_SYLLABLES as CK_SYLLABLES,
  type KeySpec,
  type MeterId,
  R,
} from "@oak/content-kit";
import { analyzePiece, bassView, bluesView, contrastAxes, formView, swingView } from "@oak/grader";
import { midisOf } from "@oak/grader/testing";
import { approachKind, minorKeyChords, parseChordSymbol, scaleDegrees, twelveBarPlan } from "@oak/theory";
import { strudel } from "../../../packages/grader/src/analyze/__support__/fixtures.ts";
import { harmonyView } from "../../../packages/grader/src/analyze/harmony-view.ts";
import { degreesOfN } from "./answer-guard.ts";
import type { ReviewFacts } from "./domain.ts";
import {
  type AnalysisLike,
  type BassViewLike,
  type BluesViewLike,
  type FormViewLike,
  factLines,
  type HarmonyViewLike,
  type ReviewFactsInput,
  reviewFactsFrom,
  type SectionFeaturesLike,
  type TrackSwingLike,
} from "./review-facts.ts";
import {
  BASS_LINE_STEP,
  C3_CODE,
  C3_FACTS,
  C4_CODE,
  C4_FACTS,
  C5_CODE,
  C5_FACTS,
  GRID_STEP,
  MINOR_DICTATION_STEP,
  SCALE_STEP,
  X2_ANALYSED,
  X2_LEARNER_CODE,
} from "./testing/wave5-fixtures.ts";
import { DEGREE_SYLLABLES, MINOR_NUMERALS, MODE_DEGREES } from "./vocabulary.ts";

setDefaultTimeout(60_000);

/** What the server's adapter (tutor-adapters/review-facts.ts) does with a piece, Wave 5 views included. */
async function factsOf(code: string, bars: number, key: KeySpec): Promise<ReviewFacts> {
  const meter: MeterId = "4/4";
  const n = await strudel(code, bars);
  const ctx = { meter, key, bars };
  const view = harmonyView(n, ctx);
  const analysis = analyzePiece(n, { ...ctx, code } as Parameters<typeof analyzePiece>[1]);
  const notes = n.all
    .filter((e) => e.midi !== null && e.drum === undefined)
    .map((e) => {
      const at = R.toNum(e.onset);
      const bar = Math.floor(at);
      return {
        track: e.track,
        midi: e.midi as number,
        bar: bar + 1,
        beat: Math.round(((at - bar) * 4 + 1) * 100) / 100,
      };
    });
  const input: ReviewFactsInput = {
    view: view as unknown as HarmonyViewLike,
    analysis: analysis as unknown as AnalysisLike,
    notes,
    meter,
    key: `${key.tonic} ${key.mode}`,
    form: formView(n, { code, bars }) as unknown as FormViewLike,
    contrast: contrastAxes as unknown as (a: SectionFeaturesLike, b: SectionFeaturesLike) => string[],
    bass: bassView(n, ctx) as unknown as BassViewLike,
    blues: bluesView(n, ctx) as unknown as BluesViewLike,
    swing: swingView(n, meter) as unknown as TrackSwingLike[],
  };
  return reviewFactsFrom(input);
}

describe("the capstone facts are what Oak's analysis reads", () => {
  test("C3: Verse Chorus Verse Chorus, contrast on five axes, the bass locked to the kick", async () => {
    const facts = await factsOf(C3_CODE, 16, { tonic: "C", mode: "major" });
    expect(facts).toEqual(C3_FACTS);
    const lines = factLines(facts);
    expect(lines).toContain(
      "form: Verse Chorus Verse Chorus (ABAB); section bars count from the first full bar",
    );
    expect(lines).toContain(
      "contrast Verse vs Chorus: density, register, instrumentation, pitch, energy (5 of 7 axes)",
    );
    expect(lines).toContain("groove_lock: 100% of bass notes on a kick · 75% of kicks carry a bass note");
    // The second Verse starts on the C carried over from bar 8: its progression still begins on I.
    expect(facts.form?.sections[2]?.progression[0]).toBe("C (I)");
  });

  test("C4: read in A minor (i VI III VII), never in its relative major", async () => {
    const facts = await factsOf(C4_CODE, 16, { tonic: "A", mode: "minor" });
    expect(facts).toEqual(C4_FACTS);
    expect(facts.key).toBe("A minor");
    expect(facts.chords.slice(0, 4).map((c) => c.rn)).toEqual(["i", "VI", "III6", "VII"]);
    expect(facts.schemas[0]).toEqual({ schema: "schema.aeolian", bars: [1, 4] });
  });

  test("C5: a quick-change chorus with a turnaround, all dominant sevenths, swung hats at 2", async () => {
    const facts = await factsOf(C5_CODE, 12, { tonic: "C", mode: "blues" });
    expect(facts).toEqual(C5_FACTS);
    expect(facts.blues).toMatchObject({ variant: "quick-change", turnaround: true, allDominant: true });
    expect(facts.swing).toEqual([{ track: "hats", ratio: 2, swung: 8 }]);
    // In the brief's blues key the chords read I7 IV7 V7, not V7/IV (contracts §6.8 item 1).
    expect(facts.chords.map((c) => c.rn)).toEqual(["I7", "IV7", "I7", "IV7", "I7", "V7", "IV7", "I7", "V7"]);
  });

  test("X2: the learner's strain in G blues", async () => {
    expect(await factsOf(X2_LEARNER_CODE, 12, { tonic: "G", mode: "blues" })).toEqual(X2_ANALYSED);
  });
});

describe("the tutor's tables equal the packages'", () => {
  test("mode degrees and do-based syllables equal content-kit", () => {
    expect(MODE_DEGREES).toEqual(CK_MODES as unknown as typeof MODE_DEGREES);
    expect(DEGREE_SYLLABLES).toEqual(CK_SYLLABLES as unknown as typeof DEGREE_SYLLABLES);
    for (const mode of Object.keys(MODE_DEGREES))
      expect(scaleDegrees({ tonic: "C", mode } as KeySpec)).toEqual([...(MODE_DEGREES[mode] ?? [])]);
  });

  test("minor numerals equal @oak/theory: natural i ii° III iv v VI VII, harmonic V and vii°", () => {
    const glyph = (rn: string) => rn.replace("o", "°");
    expect(minorKeyChords("A").map((c) => glyph(c.rn))).toEqual([...MINOR_NUMERALS.natural]);
    const harmonic = minorKeyChords("A", { form: "harmonic" }).map((c) => glyph(c.rn));
    expect([harmonic[4], harmonic[6]]).toEqual([...MINOR_NUMERALS.harmonic]);
  });

  test("n() counts each scale's own notes: degreesOfN equals what Strudel plays", async () => {
    const cases: [string, string, number[]][] = [
      ["A3:minor", "minor", [0, 2, 4, 3, 6]],
      ["A3:harmonic:minor", "harmonic minor", [0, 4, 6, 7]],
      ["C4:minor:pentatonic", "minor pentatonic", [0, 1, 2, 3, 4, 5]],
      ["C4:major:pentatonic", "major pentatonic", [0, 2, 4]],
      ["C4:blues", "blues", [0, 1, 2, 3, 4, 5]],
    ];
    const semis: Record<string, number> = {
      "1": 0,
      b2: 1,
      "2": 2,
      b3: 3,
      "3": 4,
      "4": 5,
      b5: 6,
      "5": 7,
      b6: 8,
      "6": 9,
      b7: 10,
      "7": 11,
    };
    for (const [scale, mode, nums] of cases) {
      const tonic = await midisOf(`mel: n("0").scale("${scale}")`, 1);
      const got = await midisOf(`mel: n("${nums.join(" ")}").scale("${scale}")`, 1);
      const want = degreesOfN(nums, mode).map((d) => semis[d] as number);
      expect(got.map((m) => ((((m as number) - (tonic[0] as number)) % 12) + 12) % 12)).toEqual(want);
    }
  });
});

describe("the Wave 5 step fixtures are musically right", () => {
  test("the chart is a quick change with a turnaround (twelveBarPlan)", () => {
    expect(GRID_STEP.solutions[0]).toBe(
      twelveBarPlan({ variant: "quick-change", turnaround: true }).join(" "),
    );
  });

  test("the blues scale is 1 b3 4 b5 5 b7 (C Eb F Gb G Bb)", async () => {
    expect(SCALE_STEP.solutions[0]).toBe(scaleDegrees({ tonic: "C", mode: "blues" }).join(" "));
    expect(await midisOf('mel: n("0 1 2 3 4 5").scale("C4:blues")', 1)).toEqual([60, 63, 65, 66, 67, 70]);
  });

  test("the minor tune n 0 2 4 3 on A minor is A C E D: degrees 1 b3 5 4", async () => {
    expect(await midisOf('mel: n("0 2 4 3").scale("A3:minor")', 1)).toEqual([57, 60, 64, 62]);
    expect(degreesOfN([0, 2, 4, 3], "minor").join(" ")).toBe(MINOR_DICTATION_STEP.solutions[1]);
  });

  test("the bass line is root, fifth, octave, fifth under Am F C G, and G#1 approaches A1 from below", async () => {
    const midis = (await midisOf(BASS_LINE_STEP.solutions[0] as string, 4)) as number[];
    const roots = [45 - 12, 41 - 12, 48 - 12, 43 - 12]; // a1 f1 c2 g1
    for (let bar = 0; bar < 4; bar++) {
      const [r, f, o] = midis.slice(bar * 4, bar * 4 + 3);
      expect([r, f, o]).toEqual([roots[bar], (roots[bar] as number) + 7, (roots[bar] as number) + 12]);
    }
    expect(midis[15]).toBe(32); // g#1
    expect(
      approachKind(32, parseChordSymbol("Am") as NonNullable<ReturnType<typeof parseChordSymbol>>, {
        tonic: "A",
        mode: "minor",
      }),
    ).toBe("chromatic-below");
  });
});
