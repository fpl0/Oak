// Wave 4 days, as pure models: a capstone over several sessions (C2.S1–S2, X1.S1–S3), a gym slot (ladder, own
// audio, the fallback), "Two more gym sets open X1", the extra gym session, a capstone never interrupted by a gym
// slot, and the end of the written course moved to after X1 — with U07.CP offered while U08.L01 is unwritten.
import { describe, expect, test } from "bun:test";
import type {
  CapstoneGate,
  CapstoneSessions,
  CourseProgress,
  GymPlan,
  LadderState,
  SyllabusDef,
} from "@oak/api";
import { type CapstoneDefLike, capstoneDay, capstoneInProgress, keepCapstone } from "./capstone-day.ts";
import { courseEdge, edgeLead, mapNextId, pastSlots } from "./edge.ts";
import { DAY, fixtureBootstrap, fixturePlan } from "./fixtures.ts";
import { alternativePlan, extraGym, gymDay, ladderCoda, levelName, x1Line } from "./gym-day.ts";
import { itemTitle } from "./titles.ts";
import { todayView } from "./today-model.ts";

const C2: CapstoneDefLike = {
  id: "C2",
  title: "C2 Four-Chord Song",
  kind: "compose",
  sessionDefs: [
    { id: "C2.S1", title: "Chords" },
    { id: "C2.S2", title: "Melody", release: true, review: true },
  ],
};
const X1: CapstoneDefLike = {
  id: "X1",
  title: "X1 Folk Transcription",
  kind: "transcribe",
  sessionDefs: [
    { id: "X1.S1", title: "Phrases 1–2" },
    { id: "X1.S2", title: "Phrases 3–4" },
    { id: "X1.S3", title: "Chords", release: true, review: true },
  ],
};

const at = "2026-11-10T18:00:00.000Z";
function sessions(id: string, n: number, over: (i: number) => Partial<CapstoneSessions["sessions"][number]>) {
  return {
    capstoneId: id,
    current: `${id}.S${n}`,
    sessions: Array.from({ length: n }, (_, i) => ({
      capstoneSessionId: `${id}.S${i + 1}`,
      status: "open" as const,
      sessionId: null,
      draft: null,
      checks: [],
      startedAt: null,
      completedAt: null,
      ...over(i),
    })),
  } as CapstoneSessions;
}

const capPlan = (mapItemId: string, title = "C2 Four-Chord Song") =>
  fixturePlan({ kind: "capstone", mapItemId: mapItemId as never, title });

describe("capstone days over several sessions", () => {
  test("C2.S1: the first of two sessions, nothing to resume", () => {
    const d = capstoneDay(capPlan("C2.S1"), C2, null, null);
    expect(d?.detail).toBe("C2 Four-Chord Song · session 1 of 2: Chords");
    expect(d?.resume).toBe(false);
    expect(d?.releases).toBe(false);
    expect(d?.lead).toContain("The first of 2 sessions");
  });

  test("C2.S2 resumes S1's draft from the top and ends with the release", () => {
    const s = sessions("C2", 2, (i) =>
      i === 0
        ? {
            status: "done",
            draft: { sketchId: "sk1", sketchVersion: 3, savedAt: at },
            completedAt: at,
          }
        : {},
    );
    const d = capstoneDay(capPlan("C2.S2"), C2, s, null);
    expect(d).toMatchObject({
      index: 2,
      total: 2,
      title: "C2 Four-Chord Song",
      sessionTitle: "Melody",
      detail: "C2 Four-Chord Song · session 2 of 2: Melody",
      resume: true,
      releases: true,
      draft: { sketchId: "sk1", sketchVersion: 3 },
    });
    expect(d?.lead).toContain("plays from the top");
    expect(d?.lead).toContain("release it to your album");
  });

  test("without GET /capstones/:id/sessions (501) the capstone's sketch still resumes", () => {
    const d = capstoneDay(capPlan("C2.S2"), C2, null, { sketchId: "sk9", sessionsDone: 1, sessionsTotal: 2 });
    expect(d?.resume).toBe(true);
    expect(d?.draft).toEqual({ sketchId: "sk9", sketchVersion: null });
  });

  test("X1.S3: the phrase checks so far, a revealed one named, chords today", () => {
    const check = (phrase: number, revealed = false) => ({
      checkId: `phrase-${phrase}`,
      phrase,
      layer: "melody" as const,
      stage: null,
      open: true,
      score: revealed ? null : 0.9,
      passed: !revealed,
      revealed,
      attempts: 1,
      lastAt: at,
    });
    const s = sessions("X1", 3, (i) =>
      i === 0
        ? {
            status: "done",
            checks: [check(1), check(2)],
            draft: { sketchId: "x", sketchVersion: 1, savedAt: at },
          }
        : i === 1
          ? {
              status: "done",
              checks: [check(3), check(4, true)],
              draft: { sketchId: "x", sketchVersion: 2, savedAt: at },
            }
          : {},
    );
    const d = capstoneDay(capPlan("X1.S3", "X1 Folk Transcription"), X1, s, null);
    expect(d?.detail).toBe("X1 Folk Transcription · session 3 of 3: Chords");
    expect(d?.checksLine).toBe("Phrases 1–4 checked; 1 revealed, so it earns no evidence");
    expect(d?.draft).toEqual({ sketchId: "x", sketchVersion: 2 });
    expect(d?.lead).toContain("transcription plays from the top");
  });

  test("a capstone in progress is never interrupted by a gym slot", () => {
    const course = {
      capstones: [
        {
          capstoneId: "C2",
          status: "in_progress",
          lockedReason: null,
          sessionsDone: 1,
          sessionsTotal: 2,
          sketchId: "sk1",
          trackId: null,
        },
      ],
    } as unknown as CourseProgress;
    const inProgress = capstoneInProgress(course);
    expect(inProgress?.nextSession).toBe("C2.S2");
    const gym = fixturePlan({
      kind: "gym",
      mapItemId: "GYM.03" as never,
      title: "Transcription Gym: ladder",
      alternatives: [{ kind: "capstone", mapItemId: "C2.S2" as never, title: "C2 Four-Chord Song" }],
    });
    const kept = keepCapstone(gym, inProgress, () => "C2 Four-Chord Song");
    expect(kept).toMatchObject({ kind: "capstone", mapItemId: "C2.S2", title: "C2 Four-Chord Song" });
    expect(kept.alternatives).toEqual([{ kind: "gym", mapItemId: "GYM.03", title: "Transcription Gym" }]);
    // Nothing in progress, or a lesson day: the plan as it is.
    expect(keepCapstone(gym, null, () => "")).toBe(gym);
    const lesson = fixturePlan();
    expect(keepCapstone(lesson, inProgress, () => "")).toBe(lesson);
    // Released or not started: not in progress.
    expect(
      capstoneInProgress({ capstones: [{ ...course.capstones[0], sessionsDone: 0 }] } as never),
    ).toBeNull();
    expect(
      capstoneInProgress({
        capstones: [{ ...course.capstones[0], status: "released", sessionsDone: 2 }],
      } as never),
    ).toBeNull();
  });

  test("Today on a capstone day: the session in the setlist, the lead, the draft is the Make", () => {
    const s = sessions("C2", 2, (i) =>
      i === 0 ? { status: "done", draft: { sketchId: "a", sketchVersion: 1, savedAt: at } } : {},
    );
    const plan = capPlan("C2.S2");
    const v = todayView({
      plan,
      boot: fixtureBootstrap({ day: DAY }),
      lastEnded: null,
      titleOf: (id) => id,
      capstone: capstoneDay(plan, C2, s, null),
    });
    expect(v.state).toBe("capstone");
    expect(v.rows.find((r) => r.key === "new")?.detail).toBe(
      "C2 Four-Chord Song · session 2 of 2: Melody · the draft is the Make",
    );
    expect(v.rows.some((r) => r.key === "make")).toBe(false);
    expect(v.lead).toContain("plays from the top");
  });

  test("X1 session titles read as their capstone (titleOf in lib only knows C capstones)", () => {
    const titles = new Map([
      ["X1", "X1 Folk Transcription"],
      ["C2", "C2 Four-Chord Song"],
    ]);
    expect(itemTitle("X1.S1", titles)).toBe("X1 Folk Transcription");
    expect(itemTitle("X1.S3", titles)).toBe("X1 Folk Transcription · session 3");
    expect(itemTitle("C2.S2", titles)).toBe("C2 Four-Chord Song · session 2");
    expect(itemTitle("GYM.04", titles)).toBe("Transcription Gym · GYM.04");
  });
});

const ladder = (over: Partial<LadderState> = {}): LadderState => ({
  level: 1,
  realism: 0,
  history: [],
  gradedPasses: {},
  levelUp: null,
  ...over,
});
const gymPlan = (next: GymPlan["next"], x1: CapstoneGate | null = null): GymPlan => ({
  active: true,
  sinceLast: 4,
  slotDue: true,
  next,
  history: [],
  x1,
});

describe("gym days", () => {
  test("an odd slot: a graded ladder session at the learner's level and realism, explained plainly", () => {
    const plan = fixturePlan({
      kind: "gym",
      mapItemId: "GYM.01" as never,
      title: "Transcription Gym: ladder",
    });
    const g = gymDay(
      plan,
      gymPlan({
        gymId: "GYM.01",
        kind: "ladder",
        ladderLevel: 1,
        realism: 0,
        ownAudioFallback: false,
        transcriptionId: null,
      }),
      ladder(),
    );
    expect(g).toMatchObject({ kind: "ladder", level: 1, realism: 0, fallback: false });
    expect(g?.detail).toBe("GYM.01 · Ladder, level 1: drum loops · R0");
    expect(g?.lead).toContain("Every fifth session is a transcription slot");
    expect(g?.explain.join(" ")).toContain("85% or better is a pass");
    expect(g?.explain.join(" ")).toContain("R0: clean and exactly on the grid");
    const v = todayView({
      plan,
      boot: fixtureBootstrap({ day: DAY }),
      lastEnded: null,
      titleOf: (id) => id,
      gym: g,
    });
    expect(v.state).toBe("gym");
    expect(v.rows.find((r) => r.key === "new")?.detail).toContain("the saved version is the Make");
    expect(v.lead).toBe(g?.lead ?? "");
  });

  test("an even slot: the learner's own audio, self-assessed", () => {
    const plan = fixturePlan({
      kind: "gym",
      mapItemId: "GYM.02" as never,
      title: "Transcription Gym: your own audio",
    });
    const g = gymDay(
      plan,
      gymPlan({
        gymId: "GYM.02",
        kind: "own-audio",
        ladderLevel: null,
        realism: null,
        ownAudioFallback: false,
        transcriptionId: "tr1",
      }),
      ladder(),
      "Kitchen demo",
    );
    expect(g).toMatchObject({ kind: "own-audio", level: null });
    expect(g?.detail).toBe("GYM.02 · your own audio: Kitchen demo");
    expect(g?.explain.join(" ")).toContain("Nothing is graded");
    // Without GET /gym the plan's own title decides.
    expect(gymDay(plan, null, null)?.kind).toBe("own-audio");
  });

  test("an even slot with no audio project: a ladder session one realism level up", () => {
    const plan = fixturePlan({
      kind: "gym",
      mapItemId: "GYM.02" as never,
      title: "Transcription Gym: ladder",
      note: "No audio project yet: a ladder session one realism level up.",
    });
    const fromServer = gymDay(
      plan,
      gymPlan({
        gymId: "GYM.02",
        kind: "own-audio",
        ladderLevel: 1,
        realism: 1,
        ownAudioFallback: true,
        transcriptionId: null,
      }),
      ladder(),
    );
    expect(fromServer).toMatchObject({ kind: "ladder", fallback: true, level: 1, realism: 1 });
    expect(fromServer?.lead).toContain("you have none yet");
    // From the plan alone (GET /gym not built): the realism is the ladder's plus one.
    expect(gymDay(plan, null, ladder({ realism: 0 }))).toMatchObject({
      kind: "ladder",
      fallback: true,
      realism: 1,
    });
  });

  test("'Two more gym sets open X1' only while X1 waits on melodic dictation alone", () => {
    const gate = (met: [boolean, boolean], have = 3): CapstoneGate => ({
      capstoneId: "X1",
      open: false,
      conditions: [
        {
          kind: "checkpoint",
          ref: "U07.CP",
          label: "U07 checkpoint passed",
          met: met[0],
          have: null,
          need: null,
        },
        { kind: "capstone", ref: "C2", label: "C2 released", met: met[1], have: null, need: null },
        {
          kind: "family-level",
          ref: "fam.mel.dictation",
          label: "Melodic dictation",
          met: false,
          have,
          need: 4,
        },
      ],
      gymSetsToOpen: 2,
      message: "Two more gym sets open X1",
    });
    const line = x1Line(gate([true, true]));
    expect(line?.title).toBe("Two more gym sets open X1");
    expect(line?.body).toContain("level 3 now, 4 opens it");
    expect(line?.body).toContain("nothing else waits for X1");
    expect(x1Line(gate([true, false]))).toBeNull();
    expect(x1Line({ ...gate([true, true]), open: true, message: null })).toBeNull();
    expect(x1Line(null)).toBeNull();
  });

  test("an extra gym session from Today takes the next GYM.nn and today's warm-up", () => {
    const plan = fixturePlan({
      alternatives: [
        { kind: "studio", mapItemId: null, title: "Studio" },
        { kind: "gym", mapItemId: "GYM.03" as never, title: "Transcription Gym" },
      ],
    });
    const extra = extraGym(plan);
    expect(extra).toEqual({ mapItemId: "GYM.03", title: "An extra gym session" });
    const p = alternativePlan(plan, { kind: "gym", mapItemId: extra?.mapItemId ?? null, title: "x" });
    expect(p).toMatchObject({ kind: "gym", mapItemId: "GYM.03", returning: null });
    expect(p.warmup).toBe(plan.warmup);
    expect(p.alternatives.some((a) => a.kind === "gym")).toBe(false);
    expect(extraGym(fixturePlan({ kind: "gym", alternatives: plan.alternatives }))).toBeNull();
    expect(extraGym(fixturePlan())).toBeNull();
  });

  test("the Coda: a realism change announced once, a level-up offered", () => {
    const h = (realism: number, score: number) => ({
      level: 1 as const,
      realism,
      score,
      passed: score >= 0.85,
      day: DAY,
      gymId: "GYM.05",
    });
    const up = ladderCoda(ladder({ realism: 2, history: [h(1, 0.95)] }), DAY);
    expect(up?.realism).toMatchObject({ from: 1, to: 2 });
    expect(up?.realism?.line).toContain("now plays at R2");
    const down = ladderCoda(ladder({ realism: 0, history: [h(1, 0.4)] }), DAY);
    expect(down?.realism?.line).toContain("steps back to R0");
    // Another day's session is not today's news.
    expect(
      ladderCoda(ladder({ realism: 2, history: [{ ...h(1, 0.95), day: "2026-11-01" }] }), DAY),
    ).toBeNull();
    const offer = ladderCoda(
      ladder({ level: 2, realism: 2, levelUp: { to: 3, reason: "Two graded passes at R2 on two days." } }),
      DAY,
    );
    expect(offer?.levelUp).toMatchObject({ from: 2, to: 3, title: "Level 3 is open: four-chord loops" });
    expect(offer?.levelUp?.body).toContain("starts clean, at R0");
    expect(levelName(2)).toBe("bass lines");
    expect(ladderCoda(null, DAY)).toBeNull();
  });
});

describe("the end of the written course moves to after X1 / U08.L01", () => {
  const syllabus = {
    units: [
      { id: "U07", title: "Melody", track: "core", lessons: [{ id: "U07.L10" }] },
      { id: "U08", title: "Bass Lines", track: "core", lessons: [{ id: "U08.L01" }, { id: "U08.L02" }] },
    ],
  } as unknown as SyllabusDef;
  const authored = new Set(["U07.L10", "U07.L08"]);

  test("the default order puts U08.L01 before U07.CP: while U08 is unwritten, U07.CP is offered, not the edge", () => {
    const plan = fixturePlan({ kind: "checkpoint", mapItemId: "U07.CP" as never, title: "U07 checkpoint" });
    expect(courseEdge({ next: "U08.L01" as never }, syllabus, authored, plan)).toBeNull();
    expect(mapNextId("U08.L01", "U07.CP", authored)).toBe("U07.CP");
    const v = todayView({ plan, boot: fixtureBootstrap({ day: DAY }), lastEnded: null, titleOf: (id) => id });
    expect(v.state).toBe("checkpoint");
    expect(v.primary?.action).toBe("start");
  });

  test("a slot as the order's next item is read past: the edge after U07.L03 is U07.L04, not GYM.01", () => {
    const order = ["U07.L03", "GYM.01", "U07.L04", "U07.CP", "GYM.02", "CF-T.S1"];
    expect(pastSlots("GYM.01", order)).toBe("U07.L04");
    expect(pastSlots("GYM.02", order)).toBeNull();
    expect(pastSlots("U07.L03", order)).toBe("U07.L03");
    expect(mapNextId("GYM.01", null, authored, order)).toBe("U07.L04");
    const review = fixturePlan({ kind: "review", mapItemId: null, main: null });
    const syl = {
      units: [{ id: "U07", title: "Melody", track: "core", lessons: [{ id: "U07.L03" }, { id: "U07.L04" }] }],
      defaultOrder: order,
    } as unknown as SyllabusDef;
    const edge = courseEdge({ next: "GYM.01" as never }, syl, new Set(["U07.L03"]), review);
    expect(edge).toMatchObject({ nextId: "U07.L04", nextUnit: { title: "Melody" }, partial: true });
    if (edge) expect(edgeLead(edge)).toContain("The rest of Melody is still being written.");
  });

  test("a gym slot is not the map's next item; a written next item stays next", () => {
    expect(mapNextId("U08.L01", "GYM.03", authored)).toBe("U08.L01");
    expect(mapNextId("U07.L10", "GYM.03", authored)).toBe("U07.L10");
    expect(mapNextId(null, null, authored)).toBeNull();
  });

  test("past X1: a review day with Studio and the gym, and the note that the next lessons are being written", () => {
    const plan = fixturePlan({
      kind: "review",
      mapItemId: null,
      title: "Review",
      note: "The next lessons are still being written. Today: a review, then Studio.",
      main: null,
      alternatives: [
        { kind: "studio", mapItemId: null, title: "Studio" },
        { kind: "gym", mapItemId: "GYM.04" as never, title: "Transcription Gym" },
      ],
    });
    // A learner who never saw U08.L01 (it is not written): the next unit, after Melody.
    const edge = courseEdge({ next: "U08.L01" as never }, syllabus, authored, plan);
    expect(edge).toMatchObject({
      nextId: "U08.L01",
      nextUnit: { id: "U08", title: "Bass Lines" },
      doneUnit: { id: "U07" },
    });
    // A learner past U08.L01 (the seed completes it as a stand-in): the rest of the unit.
    const later = courseEdge({ next: "U08.L02" as never }, syllabus, authored, plan);
    expect(later?.partial).toBe(true);
    if (later) expect(edgeLead(later)).toContain("The rest of Bass Lines is still being written.");
    const v = todayView({
      plan,
      boot: fixtureBootstrap({ day: DAY }),
      lastEnded: null,
      titleOf: (id) => id,
      edge,
      gymOpen: true,
    });
    expect(v.state).toBe("edge");
    expect(v.primary).toEqual({ action: "start", label: "Start session" });
    expect(v.lead).toContain("through Melody");
    expect(v.lead).toContain("Bass Lines, the next unit, is still being written");
    expect(v.lead).toContain("Studio and the Transcription Gym are yours");
    expect(extraGym(plan)).toEqual({ mapItemId: "GYM.04", title: "An extra gym session" });
    // Before the gym opens, the edge names Studio alone.
    if (edge) expect(edgeLead(edge)).toContain("and Studio is yours");
  });
});
