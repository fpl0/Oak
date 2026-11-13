import { describe, expect, test } from "bun:test";
import type { CanDoEntry, CourseProgress, StreakDay } from "@oak/api";
import {
  autoListen,
  canDoChanges,
  goalGradient,
  gymNextLabel,
  skillMoves,
  TOLERANCE_LINE,
  todayLines,
  tomorrowLine,
  toolCards,
} from "./coda-model.ts";
import { fixtureSummary } from "./fixtures.ts";
import {
  doneItems,
  formatMinutes,
  ledger,
  nextUnlocksFrom,
  practiceTime,
  statusesBefore,
  unitProgress,
} from "./progress-model.ts";

const entry = (candoId: string, status: CanDoEntry["status"], at: string): CanDoEntry => ({
  candoId: candoId as CanDoEntry["candoId"],
  status,
  evidenceKind: "lesson",
  evidenceId: "U01.L01",
  at,
});
const DEFS = [
  { id: "cd.a" as never, statement: "I can keep a steady pulse.", area: "code" as const },
  { id: "cd.b" as never, statement: "I can write a four-on-the-floor groove.", area: "write" as const },
];

describe("Coda cards (contracts §9.3): only what changed today", () => {
  test("can-do changes: new statements and status moves; unchanged ones are left out", () => {
    const before = new Map<string, CanDoEntry["status"]>([["cd.b", "emerging"]]);
    const today = [
      entry("cd.a", "emerging", "2026-11-11T09:10:00Z"),
      entry("cd.b", "emerging", "2026-11-11T09:11:00Z"),
      entry("cd.b", "solid", "2026-11-11T09:12:00Z"),
    ];
    expect(canDoChanges(today, before, DEFS)).toEqual([
      { candoId: "cd.a", statement: "I can keep a steady pulse.", area: "code", from: null, to: "emerging" },
      {
        candoId: "cd.b",
        statement: "I can write a four-on-the-floor groove.",
        area: "write",
        from: "emerging",
        to: "solid",
      },
    ]);
    expect(canDoChanges([entry("cd.b", "emerging", "2026-11-11T09:11:00Z")], before, DEFS)).toEqual([]);
  });

  test("tools unlocked carry their code and concept", () => {
    const cards = toolCards(
      [
        {
          itemId: "tb.mini.rest" as never,
          kind: "tool",
          sourceKind: "session-complete",
          sourceId: "U01.L01",
          unlockedAt: "2026-11-11T09:12:00Z",
          seen: false,
        },
      ],
      [{ id: "tb.mini.rest", code: "~", concept: "A rest is silence that keeps time." } as never],
    );
    expect(cards).toEqual([
      { id: "tb.mini.rest", code: "~", concept: "A rest is silence that keeps time.", kind: "tool" },
    ]);
  });

  test("skills that moved up on the map, highest first", () => {
    const before = new Map([
      ["R01", "learning" as const],
      ["R02", "available" as const],
    ]);
    const moves = skillMoves(
      before,
      [
        { skillId: "R01", level: "practiced" },
        { skillId: "R02", level: "available" },
        { skillId: "R03", level: "learning" },
      ],
      (id) => ({ R01: "Pulse", R03: "Subdivision" })[id] ?? id,
    );
    expect(moves).toEqual([
      { skillId: "R01", name: "Pulse", from: "learning", to: "practiced" },
      { skillId: "R03", name: "Subdivision", from: "new", to: "learning" },
    ]);
  });

  test("today in three lines, from the session's own reports", () => {
    const lines = todayLines(
      [
        { block: "warmup", source: "drills", warmupItemId: "w1", drillSessionId: "d1", meanCredit: 1 },
        {
          block: "warmup",
          source: "drills",
          warmupItemId: "w2",
          drillSessionId: null,
          meanCredit: null,
          skipped: true,
        },
        { block: "new", source: "lesson", itemId: "U01.L01", completed: true },
        { block: "make", source: "lesson", sketchId: "sk_1" },
      ],
      (id) => (id === "U01.L01" ? "Heartbeat" : id),
      1,
    );
    expect(lines).toEqual(["1 warm-up set", "learned Heartbeat", "saved a sketch"]);
    expect(
      todayLines([{ block: "new", source: "lesson", itemId: "U01.L01", completed: false }], (x) => x, 0),
    ).toEqual(["worked through part of U01.L01"]);
  });

  test("tolerance, goal gradient, tomorrow and the listening-note policy", () => {
    expect(TOLERANCE_LINE({ from: 50, to: 35 })).toBe("Your ear-to-voice aim got finer: ±35¢ now.");
    expect(goalGradient({ remaining: 2, remainingKind: "lesson" }, ".voicing()")).toBe(
      "2 lessons → .voicing()",
    );
    expect(goalGradient({ remaining: 1, remainingKind: "checkpoint" }, "~")).toBe("1 checkpoint → ~");
    expect(tomorrowLine(fixtureSummary(), { id: "U01.L02", title: "Count to four" })).toBe(
      "Next time: Count to four",
    );
    expect(
      tomorrowLine(fixtureSummary({ teaser: { mapItemId: "U01.L03" as never, title: "Rests" } }), null),
    ).toBe("Next time: Rests");
    expect(tomorrowLine(null, null)).toBeNull();
    expect(autoListen("auto", "sk_1")).toBe(true);
    expect(autoListen("auto", null)).toBe(false);
    expect(autoListen("offer", "sk_1")).toBe(false);
  });
});

describe("Progress helpers", () => {
  test("ledger: latest status and first evidence", () => {
    const l = ledger([
      entry("cd.a", "solid", "2026-11-05T10:00:00Z"),
      entry("cd.a", "emerging", "2026-11-01T10:00:00Z"),
    ]);
    expect(l.get("cd.a")).toEqual({
      latest: entry("cd.a", "solid", "2026-11-05T10:00:00Z"),
      firstAt: "2026-11-01T10:00:00Z",
    });
    expect(
      statusesBefore([entry("cd.a", "solid", "2026-11-05T10:00:00Z")], "2026-11-05T09:00:00Z").size,
    ).toBe(0);
  });

  const course: CourseProgress = {
    lessons: [
      { lessonId: "U00.L01", status: "completed" },
      { lessonId: "U00.L02", status: "completed" },
      { lessonId: "U01.L01", status: "in_progress" },
      { lessonId: "U01.L02", status: "locked" },
    ].map((l) => ({
      ...l,
      currentStep: null,
      splitPart: null,
      startedAt: null,
      completedAt: null,
      bestScore: null,
      completedVersion: null,
      contentHash: null,
      updatedAt: "2026-11-11T09:00:00Z",
    })) as never,
    checkpoints: [
      {
        cpId: "U01.CP",
        status: "locked",
        attempts: 0,
        lastScore: null,
        softPassAvailable: false,
        pendingAttemptAt: null,
      },
    ] as never,
    capstones: [
      {
        capstoneId: "C0",
        status: "open",
        lockedReason: null,
        sessionsDone: 0,
        sessionsTotal: 1,
        sketchId: null,
        trackId: null,
      },
    ] as never,
    gym: [],
    next: "U01.L01" as never,
    mapDone: 2,
    mapTotal: 183,
  };

  test("per-unit progress counts completed lessons", () => {
    const units = unitProgress(
      {
        units: [
          { id: "U00", title: "Hello", track: "core", lessons: [{ id: "U00.L01" }, { id: "U00.L02" }] },
          {
            id: "U01",
            title: "Rhythm",
            track: "core",
            checkpoint: "U01.CP",
            lessons: [{ id: "U01.L01" }, { id: "U01.L02" }],
          },
          { id: "J1", title: "Jazz", track: "J", lessons: [{ id: "J1.L01" }] },
        ] as never,
      },
      course,
    );
    expect(units.map((u) => [u.unitId, u.done, u.total, u.inProgress, u.checkpoint?.status ?? null])).toEqual(
      [
        ["U00", 2, 2, false, null],
        ["U01", 0, 2, true, "locked"],
      ],
    );
  });

  test("next unlocks along the default order (the /unlocks/next rule)", () => {
    const done = doneItems(course);
    expect([...done]).toEqual(["U00.L01", "U00.L02"]);
    const next = nextUnlocksFrom(
      ["U00.L01", "U00.L02", "U01.L01", "GYM.01", "U01.L02", "U01.L03", "C0.S1"],
      done,
      [
        { id: "tb.a", kind: "tool", unlock: { at: "U01.L03", when: "complete" } },
        { id: "tb.b", kind: "tool", unlock: { at: "U01.L01", when: "complete" } },
        { id: "tb.c", kind: "tool", unlock: { at: ["C0.S1", "U01.L02"], when: "complete" } },
        { id: "tb.d", kind: "sound", unlock: { at: "U00.L01", when: "complete" } },
        { id: "tb.e", kind: "tool", unlock: { at: "U01.L01", when: "complete" } },
      ] as never,
      new Set(["tb.e"]),
    );
    expect(next.map((n) => [n.itemId, n.grantedBy, n.remaining, n.remainingKind])).toEqual([
      ["tb.b", "U01.L01", 1, "lesson"],
      ["tb.c", "U01.L02", 2, "lesson"],
      ["tb.a", "U01.L03", 3, "lesson"],
    ]);
  });

  test("practice time: totals and windows, idle never counted by construction", () => {
    const d = (day: string, minutes: number): StreakDay => ({
      day,
      qualified: minutes > 0,
      source: minutes > 0 ? "sketch" : "rest",
      kinds: [],
      minutes,
      reviewSets: 0,
      sketchSaved: false,
    });
    const t = practiceTime(
      [d("2026-11-11", 20), d("2026-11-06", 15), d("2026-10-20", 18), d("2026-10-01", 0)],
      "2026-11-11",
    );
    expect(t).toEqual({ totalMinutes: 53, last7: 35, last28: 53, daysPractised: 3 });
    expect(formatMinutes(40)).toBe("40 min");
    expect(formatMinutes(135)).toBe("2 h 15 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
});

describe("Coda: next time names a gym slot and a capstone session's place (wave 5 gate)", () => {
  const gym = (over: Record<string, unknown> = {}) =>
    ({
      active: true,
      slotDue: true,
      next: {
        gymId: "GYM.07",
        kind: "ladder",
        ladderLevel: 6,
        realism: 1,
        ownAudioFallback: false,
        transcriptionId: null,
      },
      ...over,
    }) as never;
  test("a due ladder slot is named before the lesson it delays", () => {
    const label = gymNextLabel(gym(), "U11.L06");
    expect(label).toBe("a Transcription Gym session (ladder level 6: blues)");
    expect(tomorrowLine(fixtureSummary(), { id: "U11.L06", title: "Quick Change & Turnaround" }, label)).toBe(
      "Next time: a Transcription Gym session (ladder level 6: blues). Then Quick Change & Turnaround",
    );
  });
  test("own audio, no slot due, and a capstone under way", () => {
    expect(
      gymNextLabel(
        gym({
          next: {
            gymId: "GYM.08",
            kind: "own-audio",
            ladderLevel: null,
            realism: null,
            ownAudioFallback: false,
            transcriptionId: "t1",
          },
        }),
        "U11.L06",
      ),
    ).toBe("a Transcription Gym session on your own audio");
    expect(gymNextLabel(gym({ slotDue: false }), "U11.L06")).toBeNull();
    expect(gymNextLabel(gym(), "C4.S2")).toBeNull();
    expect(gymNextLabel(null, "U11.L06")).toBeNull();
  });
});
