// The Wave 4 additions to the contract (docs/design/wave4.md §5): additive, so every Wave 3 body still parses,
// and each new shape accepts the example wave4.md gives and refuses the obvious mistakes.
import { describe, expect, test } from "bun:test";
import { contract, ENDPOINT_NAMES, WAVE4_ENDPOINTS } from "./contract.ts";
import {
  AlbumVersionPatchSchema,
  CapstoneCheckRecordSchema,
  CapstoneGateSchema,
  CHORD_LENS_IDS,
  DEFAULT_SETTINGS,
  DEFAULT_TRANSCRIPTION_SETTINGS,
  FamilyStateSchema,
  LadderNextSchema,
  LadderSubmitSchema,
  LensPrefsSchema,
  OWN_AUDIO_CHECKLIST,
  ReviewRecordSchema,
  SettingsSchema,
  TranscriptionSettingsPatchSchema,
  TranscriptionSettingsSchema,
  TranscriptionVersionCreateSchema,
  WAVE3_SEED_POINTS,
  WAVE4_SEED_POINTS,
} from "./dto.ts";
import { TutorTurnRequestSchema } from "./tutor.ts";

describe("Wave 4 contract additions", () => {
  test("the new endpoints are in the table with their paths", () => {
    expect(WAVE4_ENDPOINTS.map((n) => `${contract[n].method} ${contract[n].path}`)).toEqual([
      "GET /capstones/:id/sessions",
      "POST /capstones/:id/drafts",
      "POST /capstones/:id/checks/:checkId",
      "GET /capstones/:id/gate",
      "PATCH /album/tracks/:id/versions/:v",
      "PUT /album/tracks/:id/versions/:v/review",
      "GET /tutor/reviews",
      "PUT /transcriptions/:id/settings",
      "GET /ladder",
      "PUT /ladder",
      "POST /ladder/items",
      "POST /ladder/items/:id/submissions",
      "GET /gym",
      "GET /gates/voicing",
    ]);
  });
  test("no two endpoints share a method and path", () => {
    const sigs = ENDPOINT_NAMES.map((n) => `${contract[n].method} ${contract[n].path}`);
    expect(new Set(sigs).size).toBe(sigs.length);
  });
  test("the chord lenses are optional: a Wave 3 lens preference still parses", () => {
    expect(CHORD_LENS_IDS).toEqual(["chordSymbols", "romanNumerals"]);
    expect(SettingsSchema.parse(DEFAULT_SETTINGS).lenses.chordSymbols).toBeUndefined();
    expect(LensPrefsSchema.safeParse({ degrees: true, solfege: true, noteNames: false }).success).toBe(true);
    expect(
      LensPrefsSchema.safeParse({ degrees: true, solfege: true, noteNames: false, romanNumerals: false })
        .success,
    ).toBe(true);
  });
  test("transcription settings: rate 25–100 %, ±12 semitones, ±50¢; a patch needs a field", () => {
    expect(TranscriptionSettingsSchema.parse(DEFAULT_TRANSCRIPTION_SETTINGS).rate).toBe(1);
    expect(
      TranscriptionSettingsPatchSchema.safeParse({ rate: 0.75, loop: { startS: 2, endS: 6 } }).success,
    ).toBe(true);
    expect(TranscriptionSettingsPatchSchema.safeParse({ rate: 1.5 }).success).toBe(false);
    expect(TranscriptionSettingsPatchSchema.safeParse({ semitones: 13 }).success).toBe(false);
    expect(TranscriptionSettingsPatchSchema.safeParse({}).success).toBe(false);
    expect(OWN_AUDIO_CHECKLIST.map((c) => c.id)).toEqual(["contour", "rhythm", "landing", "bass", "chords"]);
  });
  test("a Wave 3 version body still parses; a machine draft is flagged", () => {
    const v = { sessionId: null, code: 'mel: n("0 2 4").scale("C4:major")', result: null, ranOk: true };
    expect(TranscriptionVersionCreateSchema.safeParse(v).success).toBe(true);
    expect(TranscriptionVersionCreateSchema.parse({ ...v, machineDraft: true }).machineDraft).toBe(true);
  });
  test("capstone checks: a staged stage or none", () => {
    const base = { capstoneSessionId: "X1.S3", sketchId: "sk1", sketchVersion: 2 };
    const result = {
      exerciseId: "X1/phrase-1",
      exerciseVersion: 1,
      attemptNo: 1,
      firstAttempt: true,
      mode: "capstone",
      status: "pass",
      score: 0.9,
      adjustedScore: 0.9,
      dims: {},
      constraints: [],
      diagnostics: [],
      messages: [],
      assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
    };
    expect(CapstoneCheckRecordSchema.safeParse({ ...base, stage: "bass", result }).success).toBe(true);
    expect(CapstoneCheckRecordSchema.safeParse({ ...base, stage: "voicing", result }).success).toBe(false);
    expect(
      CapstoneCheckRecordSchema.safeParse({ ...base, capstoneSessionId: "X1", stage: null, result }).success,
    ).toBe(false);
  });
  test("the X1 gate says why it is closed", () => {
    const gate = {
      capstoneId: "X1",
      open: false,
      conditions: [
        {
          kind: "checkpoint",
          ref: "U07.CP",
          label: "U07 checkpoint passed",
          met: true,
          have: null,
          need: null,
        },
        { kind: "capstone", ref: "C2", label: "C2 released", met: true, have: null, need: null },
        {
          kind: "family-level",
          ref: "fam.mel.dictation",
          label: "Melodic dictation at level 4",
          met: false,
          have: 3,
          need: 4,
        },
      ],
      gymSetsToOpen: 2,
      message: "Two more gym sets open X1",
    };
    expect(CapstoneGateSchema.parse(gate).gymSetsToOpen).toBe(2);
  });
  test("ladder requests: levels 1–6 (L5–L6 joined in Wave 5), a rung, an idempotency key", () => {
    expect(LadderNextSchema.safeParse({ sessionId: null, gymId: "GYM.01" }).success).toBe(true);
    expect(LadderNextSchema.safeParse({ sessionId: null, gymId: "GYM.1" }).success).toBe(false);
    expect(LadderNextSchema.safeParse({ sessionId: null, gymId: null, level: 7 }).success).toBe(false);
    expect(
      LadderSubmitSchema.safeParse({
        sessionId: null,
        code: 's("bd*4")',
        rung: 0,
        idempotencyKey: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });
  test("album version patch and review records", () => {
    expect(AlbumVersionPatchSchema.safeParse({ includeReviewNote: true }).success).toBe(true);
    expect(AlbumVersionPatchSchema.safeParse({}).success).toBe(false);
    const review = {
      strengths: [{ text: "The bass lands on beat 1.", bars: [1, 2] }],
      revisions: [
        { title: "Land the cadence", bars: [7, 8], why: "End on 1.", tryCode: "", skills: ["H03"] },
      ],
      listeningQuestion: "Where does it feel finished?",
      linerNote: "A four-chord loop that lands.",
    };
    const rec = {
      kind: "capstone",
      subject: { subjectKind: "capstone", subjectId: "C2" },
      conversationId: "cv1",
      track: { trackId: "t1", version: 1 },
      review,
      at: "2026-11-12T10:00:00.000Z",
    };
    expect(ReviewRecordSchema.safeParse(rec).success).toBe(true);
    expect(ReviewRecordSchema.safeParse({ ...rec, kind: "transcription" }).success).toBe(false);
  });
  test("tutor turns may name an album version; sung stats are optional on family state", () => {
    const turn = {
      thread: { subjectKind: "capstone", subjectId: "C2" },
      kind: "review-capstone",
      userText: "",
    };
    expect(TutorTurnRequestSchema.safeParse({ ...turn, albumTrackId: "t1", albumVersion: 2 }).success).toBe(
      true,
    );
    expect(TutorTurnRequestSchema.safeParse(turn).success).toBe(true);
    expect(FamilyStateSchema.shape.sungStats.safeParse(undefined).success).toBe(true);
    expect(FamilyStateSchema.shape.sungStats.safeParse({ "5": { n: 4, hits: 3 } }).success).toBe(true);
  });
  test("the Wave 4 seed points are new names", () => {
    expect(WAVE4_SEED_POINTS).toHaveLength(17);
    for (const p of WAVE4_SEED_POINTS)
      expect((WAVE3_SEED_POINTS as readonly string[]).includes(p)).toBe(false);
  });
});
