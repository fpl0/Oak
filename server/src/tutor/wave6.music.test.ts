// Wave 6 against Oak's real analysis: the four capstone fixtures (C6, C7, CF-A, CF-T) through headless Strudel and
// the grader's views, Wave 6's included (`chromaticHarmonyView`, `modeView`, `keyPlanView`, `detectDevices`,
// `rhythmView`), shaped by `reviewFactsFrom` as the server's adapter does. The review cassettes (wave6.reviews.test.ts)
// are anchored to these facts, so a review that names a bar, a chord or a key names one the analysis really shows.
// Also: the tutor's mode, chromatic and seventh tables against @oak/theory and content-kit. (Test only: the tutor
// itself imports no package.)
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { type KeySpec, type MeterId, R } from "@oak/content-kit";
import {
  analyzePiece,
  bassView,
  bluesView,
  chromaticHarmonyView,
  contrastAxes,
  detectDevices,
  formView,
  keyPlanView,
  modeView,
  rhythmView,
  swingView,
} from "@oak/grader";
import { evalHeadless, midisOf } from "@oak/grader/testing";
import { CF_A_REFERENCE_POP } from "../../../content/specs/finale-reference.ts";
import { strudel } from "../../../packages/grader/src/analyze/__support__/fixtures.ts";
import { harmonyView } from "../../../packages/grader/src/analyze/harmony-view.ts";
import type { ReviewFacts } from "./domain.ts";
import {
  type AnalysisLike,
  type BassViewLike,
  type BluesViewLike,
  type CheckLike,
  type ChromaticViewLike,
  type DeviceLike,
  type FormViewLike,
  factLines,
  type HarmonyViewLike,
  type KeyPlanViewLike,
  type ModeViewLike,
  type ReviewFactsInput,
  type RhythmViewLike,
  reviewFactsFrom,
  type SectionFeaturesLike,
  stageFacts,
  type TrackSwingLike,
} from "./review-facts.ts";
import {
  C6_CODE,
  C6_FACTS,
  C6_REVIEW,
  C7_CODE,
  C7_FACTS,
  C7_REVIEW,
  CFA_CODE,
  CFA_FACTS,
  CFA_REVIEW,
  CFT_ANALYSED,
  CFT_CHECKS,
  CFT_CODE,
  CFT_FACTS,
} from "./testing/wave6-fixtures.ts";

setDefaultTimeout(90_000);

/** What the server's adapter does with a piece, the Wave 6 views included. */
async function factsOf(
  code: string,
  bars: number,
  key: KeySpec,
  checks: readonly CheckLike[] | null = null,
): Promise<ReviewFacts> {
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
    checks,
    chromatic: chromaticHarmonyView(n, { ...ctx, code } as Parameters<
      typeof chromaticHarmonyView
    >[1]) as unknown as ChromaticViewLike,
    mode: (span) =>
      modeView(n, { ...ctx, ...(span ? { span } : {}) } as Parameters<
        typeof modeView
      >[1]) as unknown as ModeViewLike,
    keyPlan: keyPlanView(n, { ...ctx, code } as Parameters<
      typeof keyPlanView
    >[1]) as unknown as KeyPlanViewLike,
    devices: detectDevices(n, { ...ctx, code } as Parameters<
      typeof detectDevices
    >[1]) as unknown as DeviceLike[],
    durationSec: (analysis as unknown as { durationSec?: number }).durationSec ?? null,
    rhythm: rhythmView(n, ctx as Parameters<typeof rhythmView>[1]) as unknown as RhythmViewLike,
  };
  return reviewFactsFrom(input);
}

/** Chord symbols a strength names that sound nowhere in the piece (key names such as "D major" are not chords). */
function chordsNotInPiece(facts: ReviewFacts, text: string): string[] {
  const flat = (s: string) => s.replace("♭", "b").replace("♯", "#");
  const named = (
    text.match(
      /\b[A-G][♭♯#b]?(?:m7b5|maj7|m7|o7|m|7)?(?=[\s,.:;)]|$)(?! (?:major|minor|dorian|mixolydian))/g,
    ) ?? []
  ).map(flat);
  const all = new Set(facts.chords.map((c) => flat(c.symbol)));
  for (const s of facts.form?.sections ?? [])
    for (const p of s.progression) all.add(flat(p.split(" ")[0] as string));
  return named.filter((n) => !all.has(n));
}

describe("the Wave 6 capstone facts are what Oak's analysis reads", () => {
  test("C6: D Dorian, the raised 6 on strong beats, Head and Solo", async () => {
    const facts = await factsOf(C6_CODE, 16, { tonic: "D", mode: "dorian" } as KeySpec);
    expect(facts).toEqual(C6_FACTS);
    expect(facts.modes?.map((m) => [m.section, m.stated, m.tone?.degree])).toEqual([
      [null, "D dorian", "6"],
      ["Head", "D dorian", "6"],
      ["Solo", "D dorian", "6"],
    ]);
    expect(facts.form?.sections.map((s) => s.name)).toEqual(["Head", "Solo"]);
  });

  test("C7: a V7/V that resolves, bVI bVII I, the last chorus a whole step up", async () => {
    const facts = await factsOf(C7_CODE, 24, { tonic: "C", mode: "major" } as KeySpec);
    expect(facts).toEqual(C7_FACTS);
    const lines = factLines(facts).join("\n");
    expect(lines).toContain("V7/V");
    expect(facts.keyPlan?.map((k) => k.key)).toEqual(["C major", "D major"]);
  });

  test("CF-A: the finale spec's reference single, 56 bars and over two minutes, with a bridge and its devices", async () => {
    expect(CFA_CODE).toBe(CF_A_REFERENCE_POP);
    const facts = await factsOf(CFA_CODE, 56, { tonic: "C", mode: "major" } as KeySpec);
    expect(facts).toEqual(CFA_FACTS);
    expect(facts.durationSec).toBeGreaterThanOrEqual(120);
    expect(facts.form?.sections.some((s) => s.name === "Bridge")).toBe(true);
    expect(new Set((facts.devices ?? []).map((d) => d.device)).size).toBeGreaterThanOrEqual(4);
  });

  test("CF-T: the learner's AABA take, with the stage checks as they stand", async () => {
    const analysed = await factsOf(CFT_CODE, 32, { tonic: "C", mode: "major" } as KeySpec);
    expect(analysed).toEqual(CFT_ANALYSED);
    expect({ ...analysed, stages: stageFacts(CFT_CHECKS) }).toEqual(CFT_FACTS);
  });
});

describe("the review cassettes say only what the facts show", () => {
  for (const [id, facts, review] of [
    ["C6", C6_FACTS, C6_REVIEW],
    ["C7", C7_FACTS, C7_REVIEW],
    ["CF-A", CFA_FACTS, CFA_REVIEW],
  ] as const) {
    test(`${id}: every bar is inside the piece; every chord a strength names sounds in it`, () => {
      for (const r of [...review.strengths, ...review.revisions])
        expect(r.bars[1]).toBeLessThanOrEqual(facts.bars);
      for (const s of review.strengths) expect(chordsNotInPiece(facts, s.text)).toEqual([]);
    });
  }

  test("each try-it plays in the piece's key (headless Strudel)", async () => {
    // C6, D Dorian: the Solo's new rhythm and the held raised 6 (B4 = 71) stay on D Dorian's notes.
    const dorian = [2, 4, 5, 7, 9, 11, 0];
    for (const rev of C6_REVIEW.revisions) {
      const m = (await midisOf(rev.tryCode, 2)) as number[];
      expect(m.every((x) => dorian.includes(x % 12))).toBe(true);
    }
    expect(await midisOf(C6_REVIEW.revisions[1]?.tryCode as string, 2)).toEqual([62, 65, 69, 71, 71, 69]);
    // C7: C, then A7 on the last beat (C♯ is its 3rd), then D: the lift prepared.
    const c7 = await evalHeadless(C7_REVIEW.revisions[1]?.tryCode as string, 2);
    const at = (from: number, to: number) =>
      c7.events.filter((e) => e.onset >= from && e.onset < to).map((e) => (e.midi as number) % 12);
    expect(new Set(at(0, 0.75))).toEqual(new Set([0, 4, 7]));
    expect(new Set(at(0.75, 1))).toEqual(new Set([9, 1, 4, 7]));
    expect(new Set(at(1, 2))).toEqual(new Set([2, 6, 9]));
    // CF-A: three tune notes in C climbing out of the silent bar 48, then the chorus tune in D (F♯ = D's 3).
    const cfa = await evalHeadless(CFA_REVIEW.revisions[1]?.tryCode as string, 2);
    const first = cfa.events.filter((e) => e.onset < 1).map((e) => e.midi as number);
    expect(first).toEqual([67, 69, 71]);
    expect(cfa.events.filter((e) => e.onset >= 1).some((e) => (e.midi as number) % 12 === 1)).toBe(true);
  });
});
