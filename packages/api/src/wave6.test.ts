// The Wave 6 additions to the contract (docs/design/wave6.md §5): additive, so every Wave 5 body still parses, and
// each new shape accepts the example wave6.md gives and refuses the obvious mistakes.
import { describe, expect, test } from "bun:test";
import { contract, WAVE5_ENDPOINTS, WAVE6_ENDPOINTS } from "./contract.ts";
import {
  AlbumTakeChooseSchema,
  AlbumTrackVersionSchema,
  CapstoneCheckStateSchema,
  CF_T_GATE,
  CF_T_SONG_IDS,
  CheckpointOutcomeSchema,
  CORE_STAGES,
  CoreCompletionSchema,
  CourseProgressSchema,
  GymPlanSchema,
  LADDER_STAGES,
  LadderLevelSetSchema,
  LadderSongSchema,
  LadderStateSchema,
  LadderSubmitSchema,
  LessonSketchSchema,
  SessionDaySchema,
  SessionPlanSchema,
  SessionStartSchema,
  SessionSummarySchema,
  TRACK_GATES,
  TRACK_IDS,
  TRACK_TITLES,
  TrackGateStateSchema,
  TracksSchema,
  WAVE5_SEED_POINTS,
  WAVE6_SEED_POINTS,
} from "./dto.ts";

const AT = "2026-11-13T10:00:00.000Z";
const gate = {
  gateId: "J.main",
  trackId: "J",
  opens: "J1, J2.L01–L03, J3",
  requires: [{ ref: "U13.CP", kind: "checkpoint", label: "U13 checkpoint passed", met: true }],
  open: true,
  openedAt: AT,
  lessonsAuthored: 0,
  lessonsTotal: 12,
};
const completion = {
  stage: "complete",
  completedAt: AT,
  sessionsDone: 185,
  sessionsTotal: 185,
  remaining: [],
  milestone: {
    id: "ms.07",
    title: "You finished the core. Side A is complete.",
    description: "…",
    reachedAt: AT,
  },
  stats: {
    firstDay: "2026-04-02",
    days: 150,
    sessions: 190,
    activeMinutes: 3600,
    lessons: 125,
    tracksReleased: 10,
    transcriptions: 9,
    sketches: 140,
  },
  canDo: [
    {
      candoId: "cd.compose.fourchord",
      text: "I can write an 8-bar song over a four-chord loop.",
      status: "strong",
    },
  ],
  album: { released: 10, total: 10, latestTrackId: "trk_1" },
  open: [
    {
      kind: "track",
      id: "J",
      title: "Jazz Harmony",
      note: "Open. Its first lessons are still being written.",
      available: false,
    },
    {
      kind: "gym",
      id: null,
      title: "Transcription Gym",
      note: "Ladder L8: another standard, by ear.",
      available: true,
    },
    { kind: "studio", id: null, title: "Studio", note: "Everything you unlocked is here.", available: true },
  ],
};

describe("Wave 6 contract additions", () => {
  test("the new endpoints are in the table with their paths", () => {
    expect(WAVE6_ENDPOINTS.map((n) => `${contract[n].method} ${contract[n].path}`)).toEqual([
      "GET /tracks",
      "GET /course/completion",
      "GET /lessons/:id/sketch",
      "POST /album/tracks/:id/versions/:v/takes",
      "PUT /album/tracks/:id/versions/:v/take",
    ]);
    // No new media GET (contracts §11.1 rule 4 names three): a take is served by the existing one, by query.
    expect(contract["album.getAudio"].query.safeParse({ take: "2" }).success).toBe(true);
    expect(contract["album.getAudio"].query.safeParse({ take: "0" }).success).toBe(false);
    expect(contract["album.getAudio"].query.safeParse({}).success).toBe(true);
    expect(contract["session.day"].query.safeParse({ tab: "tab_12345678" }).success).toBe(true);
    for (const n of WAVE5_ENDPOINTS) expect(contract[n]).toBeDefined();
  });

  test("advanced-track gates: the table of contracts §4.3 and a recorded gate", () => {
    expect(TRACK_IDS).toEqual(["J", "R", "A"]);
    expect(TRACK_TITLES.J).toBe("Jazz Harmony");
    const byId = Object.fromEntries(TRACK_GATES.map((g) => [g.gateId, g]));
    expect(byId["J.main"]?.requires).toEqual(["U13.CP"]);
    expect(byId["R.main"]?.requires).toEqual(["U13.CP"]);
    expect(byId["J.chord-scales"]?.requires).toEqual(["U14.CP"]);
    expect(byId["J.forms"]?.requires).toEqual(["U15.L06"]);
    expect(byId["J.reharmonization"]?.requires).toEqual(["U17.CP"]);
    expect(new Set(TRACK_GATES.map((g) => g.gateId)).size).toBe(TRACK_GATES.length);
    expect(TrackGateStateSchema.safeParse(gate).success).toBe(true);
    expect(TrackGateStateSchema.safeParse({ ...gate, trackId: "X" }).success).toBe(false);
    const tracks = {
      items: [
        {
          trackId: "J",
          title: "Jazz Harmony",
          status: "open",
          openedAt: AT,
          gates: [gate],
          sessionsDone: 0,
          sessionsTotal: 34,
          next: null,
          note: "Open. Its first lessons are still being written.",
        },
      ],
    };
    expect(TracksSchema.safeParse(tracks).success).toBe(true);
    expect(TracksSchema.safeParse({ items: [{ ...tracks.items[0], next: "nope" }] }).success).toBe(false);
  });

  test("the end of the core", () => {
    expect(CORE_STAGES).toEqual(["in-progress", "lessons-done", "complete"]);
    expect(CoreCompletionSchema.safeParse(completion).success).toBe(true);
    expect(CoreCompletionSchema.safeParse({ ...completion, stage: "done" }).success).toBe(false);
    expect(
      CoreCompletionSchema.safeParse({
        ...completion,
        stage: "lessons-done",
        completedAt: null,
        remaining: [{ kind: "capstone", id: "CF-A", title: "Core Finale: Album Single" }],
      }).success,
    ).toBe(true);
  });

  test("the plan, the progress and the summary carry the new fields; older bodies still parse", () => {
    const plan = {
      day: "2026-11-13",
      targetMinutes: 20,
      kind: "capstone",
      mapItemId: "CF-T.S2",
      title: "Standard Transcription: the changes",
      note: "Transcription day",
      warmup: { cards: [], estMinutes: 0, deferred: 0 },
      main: null,
      returning: null,
      alternatives: [],
      tutorNote: null,
    };
    const base = SessionPlanSchema.safeParse(plan);
    // The warm-up batch has its own required fields; this test only cares about the Wave 6 keys.
    const strip = (r: typeof base) => (r.success ? [] : r.error.issues.filter((i) => i.path[0] !== "warmup"));
    expect(strip(base)).toEqual([]);
    expect(
      strip(
        SessionPlanSchema.safeParse({
          ...plan,
          slot: { fills: "cf-t", sinceLast: 4 },
          tracks: { open: ["J", "R"], lessonsAuthored: false, note: "The Jazz and Rhythm tracks are open." },
          core: "in-progress",
        }),
      ),
    ).toEqual([]);
    expect(
      strip(SessionPlanSchema.safeParse({ ...plan, slot: { fills: "lesson", sinceLast: 4 } })),
    ).not.toEqual([]);
    expect(strip(SessionPlanSchema.safeParse({ ...plan, core: "finished" }))).not.toEqual([]);
    const progress = {
      lessons: [],
      checkpoints: [],
      capstones: [],
      gym: [],
      next: null,
      mapDone: 0,
      mapTotal: 184,
    };
    expect(CourseProgressSchema.safeParse(progress).success).toBe(true);
    expect(CourseProgressSchema.safeParse({ ...progress, tracks: [], core: "lessons-done" }).success).toBe(
      true,
    );
    expect(SessionSummarySchema.shape.coreComplete.safeParse(completion).success).toBe(true);
    expect(SessionSummarySchema.shape.coreComplete.safeParse(null).success).toBe(true);
    expect(SessionSummarySchema.shape.gatesOpened.safeParse([gate]).success).toBe(true);
    expect(CheckpointOutcomeSchema.shape.gatesOpened.safeParse([gate]).success).toBe(true);
  });

  test("CF-T in the gym plan; four-stage standards on the ladder (L8), never L7", () => {
    expect(CF_T_GATE).toBe("U15.L01");
    expect(CF_T_SONG_IDS).toHaveLength(3);
    expect(
      GymPlanSchema.shape.cfT.safeParse({
        status: "in_progress",
        nextSessionId: "CF-T.S2",
        takesSlot: true,
        songId: "song.five-foot-two",
      }).success,
    ).toBe(true);
    expect(
      GymPlanSchema.shape.cfT.safeParse({
        status: "open",
        nextSessionId: "C7.S9x",
        takesSlot: true,
        songId: null,
      }).success,
    ).toBe(false);
    expect(LADDER_STAGES).toContain("form");
    expect(
      LadderSubmitSchema.safeParse({
        sessionId: null,
        code: "",
        rung: 0,
        stage: "form",
        formMap: { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] },
      }).success,
    ).toBe(true);
    expect(
      LadderSubmitSchema.safeParse({
        sessionId: null,
        code: "",
        rung: 0,
        stage: "form",
        formMap: { sections: [], bars: [] },
      }).success,
    ).toBe(false);
    expect(LadderLevelSetSchema.safeParse({ level: 8 }).success).toBe(true);
    expect(LadderLevelSetSchema.safeParse({ level: 7 }).success).toBe(false);
    expect(
      LadderStateSchema.safeParse({
        level: 8,
        realism: 1,
        history: [],
        gradedPasses: { "8": 1 },
        levelUp: null,
      }).success,
    ).toBe(true);
    const song = {
      songId: "song.five-foot-two",
      title: "Five Foot Two, Eyes of Blue",
      year: 1925,
      level: 8,
      phrases: [[1, 8]],
      status: "open",
      lockedReason: null,
      passedPhrases: [],
      passedStages: ["form", "bass"],
    };
    expect(LadderSongSchema.safeParse(song).success).toBe(true);
    expect(LadderSongSchema.safeParse({ ...song, level: 7 }).success).toBe(false);
    expect(CapstoneCheckStateSchema.shape.layer.safeParse("form").success).toBe(true);
  });

  test("an own session per tab (d21): the start carries the tab, the day lists every open session", () => {
    const start = { kind: "lesson", mapItemId: "U12.L02", targetMinutes: 20 };
    expect(SessionStartSchema.safeParse(start).success).toBe(true);
    expect(SessionStartSchema.safeParse({ ...start, tabId: "tab_1a2b3c4d5e" }).success).toBe(true);
    expect(SessionStartSchema.safeParse({ ...start, tabId: "x" }).success).toBe(false);
    const day = { day: "2026-11-13", open: null, ended: [], doneForToday: false, summarySessionId: null };
    expect(SessionDaySchema.safeParse(day).success).toBe(true);
    expect(SessionDaySchema.safeParse({ ...day, openSessions: [] }).success).toBe(true);
  });

  test("re-recording keeps both takes (d20); a Make can open with an earlier sketch (d15)", () => {
    expect(AlbumTakeChooseSchema.safeParse({ take: 2 }).success).toBe(true);
    expect(AlbumTakeChooseSchema.safeParse({ take: 0 }).success).toBe(false);
    expect(
      AlbumTrackVersionSchema.shape.takes.safeParse([
        { take: 1, audioMime: "audio/webm", durationS: 96.2, bytes: 1200, recordedAt: AT },
        { take: 2, audioMime: "audio/webm", durationS: 97, bytes: 1300, recordedAt: AT },
      ]).success,
    ).toBe(true);
    expect(AlbumTrackVersionSchema.shape.currentTake.safeParse(2).success).toBe(true);
    expect(LessonSketchSchema.safeParse({ lessonId: "U11.L05", sketch: null }).success).toBe(true);
    expect(LessonSketchSchema.safeParse({ lessonId: "nope", sketch: null }).success).toBe(false);
  });

  test("dev seed points: the 22 the wave asks for, the three carry-over points, no clash with Wave 5", () => {
    expect(WAVE6_SEED_POINTS.slice(0, 22)).toEqual([
      "after X2 (U12.L02 next)",
      "after U12.L05",
      "after U13.L03",
      "U13.CP due",
      "tracks open (after U13.CP)",
      "after U14.L03",
      "U14.CP due",
      "C6 open",
      "C6 released",
      "CF-T open (U15.L01 done)",
      "CF-T.S2 done",
      "after U15.L05",
      "after U16.L03",
      "after U17.L02",
      "U17.CP due",
      "C7 open",
      "C7.S2 done",
      "C7 released",
      "CF-A open",
      "CF-A.S3 done",
      "core complete",
      "ladder L8",
    ]);
    expect(WAVE6_SEED_POINTS).toHaveLength(25);
    const w5: readonly string[] = WAVE5_SEED_POINTS;
    expect(WAVE6_SEED_POINTS.filter((p) => w5.includes(p))).toEqual([]);
  });
});
