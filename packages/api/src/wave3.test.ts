// The Wave 3 additions to the contract (docs/design/wave3.md §5): additive, so every Wave 2 body still parses.
import { describe, expect, test } from "bun:test";
import { contract, WAVE3_ENDPOINTS } from "./contract.ts";
import {
  DEFAULT_SETTINGS,
  DevSeedRequestSchema,
  DrillTrialRecordSchema,
  IdempotencyKeySchema,
  SettingsSchema,
  SrsReviewRequestSchema,
  StepAttemptCreateSchema,
  VoiceLadderSetSchema,
  VoiceQuietSetSchema,
  WAVE3_SEED_POINTS,
} from "./dto.ts";

const trial = {
  idx: 0,
  familyId: "fam.deg.fet-major",
  seed: 7,
  level: 2,
  category: "135",
  params: {},
  response: { answer: { degrees: ["5"] }, taps: null, sung: null, skipped: false },
  credit: 1,
  correct: true,
  rtMs: 900,
  replays: 0,
  confusion: null,
  centsError: null,
  at: "2026-11-11T09:30:00.000Z",
};

describe("Wave 3 contract additions", () => {
  test("the new endpoints are in the table with their paths", () => {
    const sigs = WAVE3_ENDPOINTS.map((n) => `${contract[n].method} ${contract[n].path}`);
    expect(sigs).toEqual([
      "GET /session/day",
      "GET /voice",
      "PUT /voice/quiet",
      "PUT /voice/ladder",
      "GET /drills/sessions/:id",
    ]);
  });
  test("lenses are a setting with defaults", () => {
    expect(DEFAULT_SETTINGS.lenses).toEqual({ degrees: true, solfege: true, noteNames: false });
    expect(SettingsSchema.parse(DEFAULT_SETTINGS).lenses.noteNames).toBe(false);
    expect(SettingsSchema.shape.lenses.safeParse({ degrees: true }).success).toBe(false);
  });
  test("idempotency keys: optional, shaped", () => {
    expect(IdempotencyKeySchema.safeParse(crypto.randomUUID()).success).toBe(true);
    expect(IdempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(IdempotencyKeySchema.safeParse("has spaces in it").success).toBe(false);
    const review = {
      cardId: "fam.deg.fet-major",
      drillSessionId: null,
      outcome: {
        meanCredit: 1,
        medianRtMs: 800,
        extraReplays: 0,
        hintRung: 0,
        revealed: false,
        playedLevel: 1,
        meanAbsCents: null,
      },
    };
    expect(SrsReviewRequestSchema.safeParse(review).success).toBe(true);
    expect(SrsReviewRequestSchema.safeParse({ ...review, idempotencyKey: crypto.randomUUID() }).success).toBe(
      true,
    );
    expect(StepAttemptCreateSchema.shape.idempotencyKey.safeParse(undefined).success).toBe(true);
  });
  test("drill trials: Wave 2 records still parse; reveal, modality and the sung resolution are accepted", () => {
    expect(DrillTrialRecordSchema.safeParse(trial).success).toBe(true);
    const sung = {
      ...trial,
      revealed: false,
      modality: "normal",
      sungResolution: {
        path: ["5", "6", "7", "1"],
        order: "play-first",
        notes: [
          { midi: 67, cents: -12, credit: 1 },
          { midi: 69, cents: 30, credit: 1 },
          { midi: 71, cents: 80, credit: 0.5 },
          { midi: 72, cents: null, credit: 0 },
        ],
        credit: 0.625,
        passed: false,
        skipped: false,
        quiet: false,
        tolCents: 70,
      },
    };
    expect(DrillTrialRecordSchema.safeParse(sung).success).toBe(true);
    expect(
      DrillTrialRecordSchema.safeParse({ ...trial, modality: "quiet", sungResolution: null }).success,
    ).toBe(true);
    expect(
      DrillTrialRecordSchema.safeParse({ ...sung, sungResolution: { ...sung.sungResolution, path: ["8"] } })
        .success,
    ).toBe(false);
  });
  test("voice bodies", () => {
    expect(VoiceQuietSetSchema.safeParse({ quiet: true, scope: "today" }).success).toBe(true);
    expect(VoiceLadderSetSchema.safeParse({ mode: "auto" }).success).toBe(true);
    expect(VoiceLadderSetSchema.safeParse({ mode: "fixed", cents: 35 }).success).toBe(true);
    expect(VoiceLadderSetSchema.safeParse({ mode: "fixed" }).success).toBe(false);
    expect(VoiceLadderSetSchema.safeParse({ mode: "auto", cents: 50 }).success).toBe(false);
    expect(VoiceLadderSetSchema.safeParse({ mode: "fixed", cents: 40 }).success).toBe(false);
  });
  test("the Wave 3 seed points; a seed may ask for a learner without a mic", () => {
    expect(WAVE3_SEED_POINTS).toContain("U03.CP due");
    expect(WAVE3_SEED_POINTS).toHaveLength(7);
    expect(WAVE3_SEED_POINTS).toContain("after U04.CP");
    expect(DevSeedRequestSchema.safeParse({ point: "after U03.L02" }).success).toBe(true);
    expect(DevSeedRequestSchema.safeParse({ point: "after U03.L02", mic: false }).success).toBe(true);
    expect(DevSeedRequestSchema.safeParse({ point: "after U03.L02", mic: "no" }).success).toBe(false);
  });
});
