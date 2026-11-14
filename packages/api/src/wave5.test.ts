// The Wave 5 additions to the contract (docs/design/wave5.md §5): additive, so every Wave 4 body still parses, and
// each new shape accepts the example wave5.md gives and refuses the obvious mistakes.
import { describe, expect, test } from "bun:test";
import { createClient } from "./client.ts";
import { contract, WAVE5_ENDPOINTS } from "./contract.ts";
import {
  CapstoneCheckStateSchema,
  CapstoneStateSchema,
  CONFIRM_ACTIONS,
  LADDER_STAGES,
  LadderItemSchema,
  LadderNextSchema,
  LadderSongSchema,
  LadderStateSchema,
  LadderSubmitSchema,
  LensPrefsSchema,
  LINE_LENS_IDS,
  SessionPlanSchema,
  SessionSummarySchema,
  SIDE_LESSON_IDS,
  SideLessonsSchema,
  TranscriptionVersionConfirmSchema,
  TranscriptionVersionSchema,
  VoicingGateSchema,
  WAVE4_SEED_POINTS,
  WAVE5_SEED_POINTS,
} from "./dto.ts";

describe("Wave 5 contract additions", () => {
  test("the new endpoints are in the table with their paths", () => {
    expect(WAVE5_ENDPOINTS.map((n) => `${contract[n].method} ${contract[n].path}`)).toEqual([
      "GET /side-lessons",
      "GET /ladder/songs",
      "POST /transcriptions/:id/versions/:v/confirm",
    ]);
    expect(contract["album.putAudio"].confirmIf).toBe("album.audio.replace");
    expect(CONFIRM_ACTIONS).toContain("album.audio.replace");
  });

  test("side lessons", () => {
    expect(SIDE_LESSON_IDS).toEqual(["A1.L01", "A1.L02", "A1.L03", "A1.L04"]);
    const ok = SideLessonsSchema.safeParse({
      open: true,
      items: [
        {
          lessonId: "A1.L01",
          title: "Waves & Harmonics",
          status: "done",
          estMinutes: 15,
          completedAt: "2026-11-13T10:00:00.000Z",
        },
      ],
      next: "A1.L02",
    });
    expect(ok.success).toBe(true);
    expect(SideLessonsSchema.safeParse({ open: true, items: [], next: "nope" }).success).toBe(false);
  });

  test("ladder L5 and L6: levels up to 6, L6 stages, song items, a phrase per L5 submission", () => {
    // Wave 6 appended `form` (L8's form map); the Wave 5 stages keep their order.
    expect(LADDER_STAGES.slice(0, 5)).toEqual(["bass", "quality", "rn", "changes", "melody"]);
    expect(
      LadderNextSchema.safeParse({ sessionId: null, gymId: "GYM.11", level: 5, songId: "song.aura-lee" })
        .success,
    ).toBe(true);
    // Wave 6: L8 (a standard) is an item; L7 is own audio and never one.
    expect(LadderNextSchema.safeParse({ sessionId: null, gymId: null, level: 7 }).success).toBe(false);
    expect(LadderNextSchema.safeParse({ sessionId: null, gymId: null, level: 8 }).success).toBe(true);
    expect(LadderNextSchema.safeParse({ sessionId: null, gymId: null, level: 9 }).success).toBe(false);
    expect(LadderSubmitSchema.safeParse({ sessionId: null, code: "x", rung: 0, phrase: 2 }).success).toBe(
      true,
    );
    expect(
      LadderSubmitSchema.safeParse({ sessionId: null, code: "x", rung: 0, stage: "changes" }).success,
    ).toBe(true);
    expect(LadderSubmitSchema.safeParse({ sessionId: null, code: "x", rung: 0, phrase: 0 }).success).toBe(
      false,
    );
    expect(
      LadderStateSchema.safeParse({
        level: 6,
        realism: 2,
        history: [],
        gradedPasses: { "6": 1 },
        levelUp: null,
      }).success,
    ).toBe(true);
    expect(
      LadderSongSchema.safeParse({
        songId: "song.st-louis-blues",
        title: "St. Louis Blues",
        year: 1914,
        level: 6,
        phrases: [[1, 12]],
        status: "open",
        lockedReason: null,
        passedPhrases: [],
        passedStages: ["bass"],
      }).success,
    ).toBe(true);
    const item = LadderItemSchema.shape;
    expect(Object.keys(item)).toContain("song");
    expect(Object.keys(item)).toContain("phrases");
  });

  test("optional fields: old bodies parse, new ones too", () => {
    expect(LensPrefsSchema.safeParse({ degrees: true, solfege: false, noteNames: true }).success).toBe(true);
    expect(
      LensPrefsSchema.safeParse({
        degrees: true,
        solfege: false,
        noteNames: true,
        sections: false,
        bassRoles: true,
        blueNotes: true,
      }).success,
    ).toBe(true);
    expect(LINE_LENS_IDS).toEqual(["sections", "bassRoles", "blueNotes"]);
    const v = { transcriptionId: "t", version: 2, code: "x", createdAt: "2026-11-13T10:00:00.000Z" };
    expect(TranscriptionVersionSchema.safeParse(v).success).toBe(true);
    expect(TranscriptionVersionSchema.safeParse({ ...v, reviewBeforeRun: true }).success).toBe(true);
    expect(TranscriptionVersionSchema.safeParse({ ...v, reviewBeforeRun: false }).success).toBe(false);
    expect(TranscriptionVersionConfirmSchema.safeParse({ strictLintPassed: true }).success).toBe(true);
    expect(TranscriptionVersionConfirmSchema.safeParse({}).success).toBe(false);
    expect(Object.keys(VoicingGateSchema.shape)).toContain("passedCodeImported");
    expect(Object.keys(CapstoneStateSchema.shape)).toContain("draftChangedSinceCheck");
    expect(Object.keys(CapstoneCheckStateSchema.shape)).toEqual(expect.arrayContaining(["after", "passAt"]));
    expect(Object.keys(SessionPlanSchema.shape)).toContain("sideLesson");
    expect(Object.keys(SessionSummarySchema.shape)).toContain("gym");
  });

  test("seed points are new names", () => {
    expect(WAVE5_SEED_POINTS).toHaveLength(30);
    for (const p of WAVE5_SEED_POINTS)
      expect((WAVE4_SEED_POINTS as readonly string[]).includes(p)).toBe(false);
    expect(new Set(WAVE5_SEED_POINTS).size).toBe(WAVE5_SEED_POINTS.length);
  });

  test("a confirmIf endpoint sends the nonce only when given", async () => {
    const seen: (string | null)[] = [];
    const api = createClient({
      fetch: async (_url, init) => {
        seen.push(new Headers(init?.headers).get("X-Oak-Confirm"));
        return Response.json({}, { status: 400 });
      },
    });
    const call = (nonce?: string) =>
      api
        .call(
          "album.putAudio",
          { params: { id: "t", v: "1" }, query: {}, body: new Uint8Array([1]) },
          nonce ? { confirmNonce: nonce } : {},
        )
        .catch(() => null);
    await call();
    await call("nonce-1234567890abcdef");
    expect(seen).toEqual([null, "nonce-1234567890abcdef"]);
  });
});
