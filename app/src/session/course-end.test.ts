import { describe, expect, test } from "bun:test";
import type { WholeCourse } from "@oak/api";
import {
  afterCourse,
  COURSE_END_COPY,
  courseEndEntry,
  coursePaceLine,
  isCourseEnding,
  recordLine,
  trackDoneLines,
} from "./course-end.ts";

const whole = (over: Partial<WholeCourse> = {}): WholeCourse => ({
  stage: "complete",
  completedAt: "2027-09-14T19:30:00.000Z",
  sessionId: "ses_259",
  sessionsDone: 259,
  sessionsTotal: 259,
  core: "complete",
  tracks: [
    {
      trackId: "J",
      title: "Jazz Harmony",
      status: "open",
      openedAt: null,
      gates: [],
      sessionsDone: 34,
      sessionsTotal: 34,
      next: null,
      note: "",
      checkpoints: [
        { cpId: "J.CP1", status: "passed" },
        { cpId: "J.CP2", status: "soft-passed" },
      ],
      capstones: ["JC1", "JC2", "JC3", "JC4"].map((capstoneId) => ({
        capstoneId,
        status: "released" as const,
        lockedReason: null,
      })),
    },
  ] as WholeCourse["tracks"],
  album: { released: 20, total: 20, latestTrackId: "trk_ac2" },
  stats: {
    firstDay: "2026-03-03",
    days: 241,
    sessions: 259,
    activeMinutes: 5400,
    lessons: 171,
    tracksReleased: 20,
    transcriptions: 3,
    sketches: 260,
  } as WholeCourse["stats"],
  canDo: [],
  open: [
    { kind: "review", id: null, title: "Reviews", note: "14 due. They keep the Oak green.", available: true },
    { kind: "gym", id: null, title: "Transcription Gym", note: "Own audio.", available: true },
    { kind: "studio", id: null, title: "Studio", note: "Your sketchbook.", available: true },
  ] as WholeCourse["open"],
  ...over,
});

describe("the whole course's ending (wave7.md §5.8)", () => {
  test("only a summary carrying courseComplete at stage complete is the ending", () => {
    expect(isCourseEnding({ courseComplete: whole() })).toBe(true);
    expect(isCourseEnding({ courseComplete: whole({ stage: "in-progress" }) })).toBe(false);
    expect(isCourseEnding({ courseComplete: null })).toBe(false);
    expect(isCourseEnding(null)).toBe(false);
  });
  test("the copy is calm: no exclamation mark, no congratulation, nothing that says the learner is done with Oak", () => {
    for (const line of Object.values(COURSE_END_COPY).flat())
      expect(line).not.toMatch(/!|congratulation|well done|you're done|course complete|countdown/i);
  });
  test("the record line counts what the server counted, both sides named", () => {
    expect(recordLine(whole().album, { A: 12, B: 8 })).toBe("Twenty tracks: 12 on Side A, 8 on Side B.");
    expect(recordLine({ released: 19, total: 20, latestTrackId: null }, { A: 12, B: 7 })).toBe(
      "19 tracks: 12 on Side A, 7 on Side B.",
    );
    expect(recordLine(whole().album, null)).toBe("Twenty tracks on your record.");
  });
  test("each track in one line of what it was", () => {
    expect(trackDoneLines(whole().tracks)).toEqual([
      { trackId: "J", title: "Jazz Harmony", line: "34 sessions, 2 checkpoints, 4 tracks released." },
    ]);
  });
  test("Today on the day after: the first-day line once, what stays open, today's own kind not listed again", () => {
    const today = { day: "2027-09-15", timezone: "UTC", rolloverHour: 4 };
    const a = afterCourse({ kind: "review", mapItemId: null }, whole(), today);
    expect(a?.firstDay).toBe(true);
    expect(a?.open.map((r) => r.kind)).toEqual(["gym", "studio"]);
    expect(a?.tomorrow).toBe("Tomorrow: reviews. 14 due. They keep the Oak green.");
    expect(
      afterCourse({ kind: "review", mapItemId: null }, whole(), { ...today, day: "2027-09-20" })?.firstDay,
    ).toBe(false);
    expect(
      afterCourse({ kind: "lesson", mapItemId: null }, whole({ stage: "in-progress" }), today),
    ).toBeNull();
    expect(afterCourse({ kind: "lesson", mapItemId: null }, null, today)).toBeNull();
  });
  test("Progress keeps one entry; the pace line after the core estimates the tracks and compares with nothing", () => {
    const e = courseEndEntry(whole(), "en-GB");
    expect(e?.title).toBe("You have completed Oak.");
    expect(e?.dateLine).toBe("14 September 2027");
    expect(e?.road).toContain("259 sessions on 241 days");
    expect(courseEndEntry(whole({ stage: "in-progress" }))).toBeNull();
    const pace = coursePaceLine(
      whole({ stage: "in-progress", sessionsDone: 209 }),
      5,
      "2026-11-15",
      (m) => m,
    );
    expect(pace).toBe("At 5 sessions a week you'd finish the three tracks around 2027-01.");
    expect(coursePaceLine(whole(), 5, "2026-11-15", (m) => m)).toBeNull();
    expect(coursePaceLine(whole({ stage: "in-progress" }), null, "2026-11-15", (m) => m)).toBeNull();
  });
});

describe("the ending's copy (W7 gate)", () => {
  test("the line under the heading is ms.28's description word for word", async () => {
    const { milestones } = await import("../../../content/milestones.ts");
    const ms28 = (milestones as readonly { id: string; title: string; description: string }[]).find(
      (m) => m.id === "ms.28",
    );
    expect(ms28?.title).toBe(COURSE_END_COPY.heading);
    expect(ms28?.description).toBe(COURSE_END_COPY.under);
  });
});
