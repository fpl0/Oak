import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { CheckpointItemSpec } from "@oak/api";
import { GATE_EXERCISE } from "../content/fixture.ts";
import { ApiError } from "../errors.ts";
import { gradeResult, type Harness, harness } from "../testing/harness.ts";
import { GatesService, interleave, softPassOffered } from "./gates.ts";
import type { Services } from "./index.ts";

let h: Harness;
let s: Services;
beforeEach(async () => {
  h = await harness();
  // A learner whose mic works (onboarding's mic step): without one Quiet mode skips the sing items (§8.5).
  h.server.deps.repos.profile.patch({ timezone: "UTC", inputKind: "builtin" });
  s = h.server.deps.services;
});
afterEach(async () => {
  await h.close();
});

function sketch(): string {
  return s.library.createSketch({
    title: "Make",
    originKind: "lesson-make",
    originId: null,
    sessionId: null,
    code: 's("bd ~ sd hh")',
    bpm: 96,
    meter: "4/4",
    key: null,
    analysis: null,
    note: null,
    tutorAssisted: false,
    band: null,
    flags: { lockedTools: [], previewTools: [] },
    ranOk: true,
  }).sketch.id;
}
async function complete(...ids: string[]) {
  for (const id of ids)
    await s.course.complete(id, {
      sessionId: null,
      sketchId: sketch(),
      lessonVersion: 1,
      contentHash: "h",
      splitPart: null,
    });
}
async function attempt(
  lessonId: string,
  stepId: string,
  exerciseId: string,
  score: number,
  revealed = false,
) {
  return s.course.attempt(lessonId, stepId, {
    sessionId: null,
    exerciseId,
    exerciseVersion: 1,
    seriesNo: 0,
    params: null,
    response: { code: "x" },
    result: gradeResult({
      exerciseId: `${lessonId}/${exerciseId}`,
      score,
      assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed },
    }),
    extraReplays: 0,
    activeMs: 1000,
    tutorAssisted: false,
  });
}
function passCheckpoint(cpId: string, score = 1, accept = false) {
  const start = s.course.checkpointStart(cpId);
  return s.course.checkpointSubmit(cpId, {
    sessionId: null,
    attemptNo: start.attemptNo,
    items: start.items.map((i) => ({
      idx: i.idx,
      score,
      skipped: false,
      response: { skipped: true },
      result: null,
    })),
    makeSketchId: null,
    acceptSoftPass: accept,
  });
}
const status = (id: string) => s.gates.lessonStatus(id);

describe("legal orders (contracts §7.6)", () => {
  test("core lessons are linear across unit boundaries", async () => {
    expect([status("U01.L01"), status("U01.L02")]).toEqual(["available", "locked"]);
    await complete("U01.L01");
    expect([status("U01.L01"), status("U01.L02")]).toEqual(["completed", "available"]);
    await complete("U01.L02", "U01.L03");
    expect(status("U02.L01")).toBe("available");
  });

  test("L01 and L02 need nothing else; L03 needs the most recent checkpoint before the unit", async () => {
    await complete("U01.L01", "U01.L02", "U01.L03");
    await attempt("U02.L01", "S2", "hand-voiced-cadence", 1);
    await complete("U02.L01", "U02.L02");
    expect(status("U02.L03")).toBe("locked");
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("open");
    passCheckpoint("U01.CP");
    expect(status("U02.L03")).toBe("available");
  });

  test("a unit after one without its own checkpoint still needs the last checkpoint (U03 needs U01.CP)", () => {
    expect(h.server.deps.content.checkpointBefore("U03")).toBe("U01.CP");
    expect(h.server.deps.content.checkpointBefore("U02")).toBe("U01.CP");
    expect(h.server.deps.content.checkpointBefore("U01")).toBeNull();
  });

  test("a checkpoint opens when the last lesson it covers is completed", async () => {
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("locked");
    expect(() => s.course.checkpointStart("U01.CP")).toThrow(ApiError);
    await complete("U01.L01", "U01.L02");
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("locked");
    await complete("U01.L03");
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("open");
  });

  test("tracks: a gate plus the previous lesson; an optional lesson can be passed over", async () => {
    expect(status("J1.L01")).toBe("locked");
    await complete("U01.L01", "U01.L02", "U01.L03");
    passCheckpoint("U01.CP");
    expect(status("J1.L01")).toBe("available");
    await complete("J1.L01");
    expect(status("J1.L02")).toBe("locked"); // its own gate: U03.CP
    expect(status("J2.L01")).toBe("available"); // J1.L02 is optional
  });

  test("capstones open by their gates and never gate a lesson", async () => {
    expect(s.gates.capstoneStatus("C0").status).toBe("locked");
    await complete("U01.L01", "U01.L02", "U01.L03");
    passCheckpoint("U01.CP");
    expect(s.gates.capstoneStatus("C0").status).toBe("open");
    expect(s.gates.capstoneStatus("C1")).toMatchObject({ status: "locked" });
    expect(s.gates.capstoneStatus("C1").lockedReason).toContain("releasing First loop");
    expect(status("U02.L01")).toBe("available"); // C0 not started: lessons go on
  });

  test("the next map item follows the default order", async () => {
    expect(s.gates.nextMapItem()).toBe("U01.L01");
    await complete("U01.L01", "U01.L02", "U01.L03");
    expect(s.gates.nextMapItem()).toBe("U02.L01");
  });
});

describe("checkpoint scoring (pure)", () => {
  const items: CheckpointItemSpec[] = [
    { idx: 0, skillId: "R03", role: "gating", source: { kind: "make" }, debt: false },
    { idx: 1, skillId: "R03", role: "gating", source: { kind: "make" }, debt: false },
    { idx: 2, skillId: "R06", role: "gating", source: { kind: "make" }, debt: false },
    { idx: 3, skillId: "R06", role: "gating", source: { kind: "make" }, debt: false },
    { idx: 4, skillId: "E01", role: "level-setting", source: { kind: "make" }, debt: false },
  ];
  const run = (scores: number[], attemptNo = 1, skipped: number[] = []) =>
    GatesService.scoreCheckpoint(
      items,
      new Map(scores.map((sc, i) => [i, { score: sc, skipped: skipped.includes(i) }])),
      attemptNo,
    );

  test.each<[string, number[], number, { score: number; passed: boolean; softPassOffered: boolean }]>([
    ["all right", [1, 1, 1, 1, 0], 1, { score: 1, passed: true, softPassOffered: false }],
    [
      "level-setting items never block",
      [1, 1, 0.9, 0.9, 0],
      1,
      { score: 0.95, passed: true, softPassOffered: false },
    ],
    [
      "0.85 exactly passes",
      [1, 0.7, 0.85, 0.85, 1],
      1,
      { score: 0.85, passed: true, softPassOffered: false },
    ],
    ["below 0.85 fails", [1, 0.7, 0.8, 0.8, 1], 1, { score: 0.825, passed: false, softPassOffered: false }],
    [
      "a gated skill under 0.70 fails even at 0.85",
      [1, 1, 1, 0.38, 1],
      1,
      { score: 0.845, passed: false, softPassOffered: false },
    ],
    [
      "second attempt ≥ 0.75 offers Continue anyway",
      [1, 0.5, 0.8, 0.8, 1],
      2,
      { score: 0.775, passed: false, softPassOffered: true },
    ],
    [
      "second attempt < 0.75 does not",
      [0.5, 0.5, 0.8, 0.8, 1],
      2,
      { score: 0.65, passed: false, softPassOffered: false },
    ],
    [
      "third attempt offers it whatever the score",
      [0, 0, 0, 0, 0],
      3,
      { score: 0, passed: false, softPassOffered: true },
    ],
  ])("%s", (_n, scores, attemptNo, expected) => {
    const r = run(scores, attemptNo);
    expect(r.score).toBeCloseTo(expected.score, 10);
    expect({ passed: r.passed, softPassOffered: r.softPassOffered }).toEqual({
      passed: expected.passed,
      softPassOffered: expected.softPassOffered,
    });
  });

  test("a skipped level-setting item is left out; a skipped gating item scores 0", () => {
    const r = run([1, 1, 1, 1, 0], 1, [4]);
    expect(r.perSkill.find((p) => p.skillId === "E01")).toBeUndefined();
    const g = run([1, 1, 1, 1, 1], 1, [0]);
    expect(g.score).toBeCloseTo(0.75, 10);
  });

  test("softPassOffered and interleave", () => {
    expect([
      softPassOffered(1, 1),
      softPassOffered(2, 0.75),
      softPassOffered(2, 0.74),
      softPassOffered(3, 0),
    ]).toEqual([false, true, false, true]);
    const xs = ["a", "a", "a", "b", "b", "c"].map((skillId, i) => ({ skillId, i }));
    const out = interleave(xs, 7);
    expect(out).toHaveLength(6);
    expect(new Set(out.map((x) => x.i)).size).toBe(6);
    for (let i = 1; i < out.length; i++)
      if (out[i]?.skillId === out[i - 1]?.skillId)
        expect(out.slice(i).every((x) => x.skillId === out[i]?.skillId)).toBe(true);
    expect(interleave(xs, 7)).toEqual(out); // deterministic
  });

  test("the bar met exactly on every item of a real-sized checkpoint passes (floating-point sums, Wave 3 review)", () => {
    // 12–18 items at 0.85 sum to a mean of 0.8499999999999998: before the fix every one of these failed.
    for (let n = 12; n <= 18; n++) {
      const many: CheckpointItemSpec[] = Array.from({ length: n }, (_, idx) => ({
        idx,
        skillId: idx % 2 ? "R03" : "R06",
        role: "gating",
        source: { kind: "make" },
        debt: false,
      }));
      const at = (s: number, attemptNo = 1) =>
        GatesService.scoreCheckpoint(
          many,
          new Map(many.map((i) => [i.idx, { score: s, skipped: false }])),
          attemptNo,
        );
      expect({ n, passed: at(0.85).passed }).toEqual({ n, passed: true });
      expect({ n, passed: at(0.84).passed }).toEqual({ n, passed: false });
      expect({ n, offered: at(0.75, 2).softPassOffered }).toEqual({ n, offered: true });
    }
    // The per-skill bar too: 0.85 overall with one gated skill at exactly 0.70 on 15 items.
    const fifteen: CheckpointItemSpec[] = Array.from({ length: 30 }, (_, idx) => ({
      idx,
      skillId: idx < 15 ? "R03" : "R06",
      role: "gating",
      source: { kind: "make" },
      debt: false,
    }));
    const r = GatesService.scoreCheckpoint(
      fifteen,
      new Map(fifteen.map((i) => [i.idx, { score: i.idx < 15 ? 0.7 : 1, skipped: false }])),
      1,
    );
    expect(r.perSkill.find((p) => p.skillId === "R03")?.ok).toBe(true);
    expect(r.passed).toBe(true);
  });
});

describe("checkpoint attempts", () => {
  beforeEach(async () => {
    await complete("U01.L01", "U01.L02", "U01.L03");
  });

  test("composition: 12 to 18 items, ≥ 2 per skill, authored items, the Make last", () => {
    const start = s.course.checkpointStart("U01.CP");
    expect(start.attemptNo).toBe(1);
    expect(start.items.length).toBeGreaterThanOrEqual(12);
    expect(start.items.length).toBeLessThanOrEqual(18);
    const per = new Map<string, number>();
    for (const i of start.items) per.set(i.skillId, (per.get(i.skillId) ?? 0) + 1);
    for (const skill of ["R03", "R06", "E01", "V01"]) expect(per.get(skill) ?? 0).toBeGreaterThanOrEqual(2);
    expect(
      start.items
        .filter((i) => i.source.kind === "authored")
        .map((i) => (i.source as { exerciseId: string }).exerciseId)
        .sort(),
    ).toEqual(["U01.CP/cp-pulse", "U01.CP/cp-rest"]);
    expect(start.items.at(-1)?.source.kind).toBe("make");
    expect(start.items.find((i) => i.skillId === "E01")?.role).toBe("level-setting");
    expect(start.items.find((i) => i.skillId === "R03")?.role).toBe("gating");
    // Resuming returns the same attempt.
    expect(s.course.checkpointStart("U01.CP")).toEqual(start);
  });

  test("Quiet mode leaves production items out", () => {
    h.server.deps.repos.profile.patch({ quiet: true });
    const start = s.course.checkpointStart("U01.CP");
    expect(start.items.some((i) => i.skillId === "V01")).toBe(false);
  });

  test("an unfinished attempt older than 3 days restarts with new items", () => {
    const first = s.course.checkpointStart("U01.CP");
    h.clock.advanceDays(4);
    const again = s.course.checkpointStart("U01.CP");
    expect(again.attemptNo).toBe(first.attemptNo);
    expect(again.startedAt).not.toBe(first.startedAt);
  });

  test("a pass opens the next lessons and the capstone, sets provisional on ear skills, clears repairs", () => {
    const out = passCheckpoint("U01.CP");
    expect(out.passed).toBe(true);
    expect(out.opened).toEqual(expect.arrayContaining(["C0", "J1.L01"]));
    expect(h.server.deps.repos.mastery.state("E01")?.provisional).toBe(true);
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("passed");
    expect(() => s.course.checkpointStart("U01.CP")).toThrow(ApiError);
    const ev = h.server.deps.repos.mastery.evidenceOf("R03").filter((e) => e.sourceKind === "checkpoint");
    expect(ev.length).toBeGreaterThan(0);
    expect(ev.every((e) => e.weight === 2)).toBe(true);
  });

  test("a fail queues 2 repair sets per failed gated skill; a retake offers Continue anyway; soft pass sets debt", () => {
    const fail = passCheckpoint("U01.CP", 0.5);
    expect(fail.passed).toBe(false);
    expect(fail.softPassOffered).toBe(false);
    expect(fail.repairQueue.map((r) => [r.skillId, r.sets]).sort()).toEqual([
      ["R03", 2],
      ["R06", 2],
    ]);
    expect(h.server.deps.repos.checkpoints.repairs()).toHaveLength(2);
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("failed");
    const soft = passCheckpoint("U01.CP", 0.5, true); // third attempt rule not yet: attempt 2 at 0.5 < 0.75
    expect(soft).toMatchObject({ passed: false, softPass: false, softPassOffered: false });
    const third = passCheckpoint("U01.CP", 0.5, true);
    expect(third).toMatchObject({ attemptNo: 3, passed: false, softPass: true, softPassOffered: true });
    expect(third.debts).toEqual(expect.arrayContaining(["R03", "R06"]));
    expect(h.server.deps.repos.mastery.state("R03")).toMatchObject({ debt: true, debtReason: "soft-pass" });
    expect(s.gates.checkpointStatus("U01.CP").status).toBe("soft-passed");
    expect(h.server.deps.repos.checkpoints.repairs()).toHaveLength(0);
    // A soft pass opens everything a pass opens.
    expect(status("J1.L01")).toBe("available");
  });
});

describe("unlocks (contracts §3.1, §11.7)", () => {
  const ids = () => [...s.unlocks.ids()].sort();

  test("rows are granted when their session completes, never twice", async () => {
    await complete("U01.L01");
    expect(ids()).toEqual(["snd.piano", "tb.mini.rest"]);
    const u = h.server.deps.repos.unlocks.get("tb.mini.rest");
    expect(u).toMatchObject({ sourceKind: "session-complete", sourceId: "U01.L01", seen: false });
    expect(s.unlocks.onComplete("U01.L01")).toEqual([]);
  });

  test("a START row is granted at session start; its fallback grants it silently when the start site has not happened", async () => {
    await complete("U01.L01", "U01.L02");
    expect(s.unlocks.ids().has("tb.lpf")).toBe(false);
    await complete("U01.L03"); // fallbackAt U01.L03, C0.S1 not started
    expect(h.server.deps.repos.unlocks.get("tb.lpf")).toMatchObject({ sourceKind: "fallback", seen: true });
  });

  test("starting the first capstone session grants START rows and the album", async () => {
    await complete("U01.L01", "U01.L02", "U01.L03");
    passCheckpoint("U01.CP");
    s.sessions.start({ kind: "capstone", mapItemId: "C0.S1", targetMinutes: 20 });
    expect(h.server.deps.repos.unlocks.get("tb.feature.album")).toMatchObject({
      sourceKind: "session-start",
      sourceId: "C0.S1",
    });
    expect(h.server.deps.repos.capstones.get("C0")?.status).toBe("in_progress");
  });

  test("alternative sites: whichever completes first grants the tool", async () => {
    await complete("U01.L01", "U01.L02", "U01.L03");
    passCheckpoint("U01.CP");
    await complete("J1.L01");
    expect(h.server.deps.repos.unlocks.get("tb.fast")).toMatchObject({ sourceId: "J1.L01" });
  });

  test("the voicing gate: no grant and no completion without a ≥ 0.9 unrevealed attempt", async () => {
    await complete("U01.L01", "U01.L02", "U01.L03");
    await attempt("U02.L01", "S2", "hand-voiced-cadence", 0.85);
    await attempt("U02.L01", "S2", "hand-voiced-cadence", 0.95, true); // revealed: does not count
    await complete("U02.L01");
    expect(
      s.unlocks.conditionMet({ exercise: GATE_EXERCISE as never, minScore: 0.9, unrevealed: true }),
    ).toBe(false);
    expect(
      s.unlocks
        .blockedAt("U02.L02")
        .map((t) => t.id)
        .sort(),
    ).toEqual(["chord.triad", "tb.voicing"]);
    expect(s.unlocks.usableIn("U02.L02").has("tb.voicing" as never)).toBe(false);
    await expect(complete("U02.L02")).rejects.toThrow(/gate check/);
    // Lesson attempts are open again in a replay of U02.L01: the gate passes at 0.9.
    const r = await attempt("U02.L01", "S2", "hand-voiced-cadence", 0.9);
    expect(r.unlocked).toEqual([]); // U02.L02 is neither done nor the lesson of this attempt
    expect(s.unlocks.usableIn("U02.L02").has("tb.voicing" as never)).toBe(true);
    await complete("U02.L02");
    expect(ids()).toEqual(expect.arrayContaining(["chord.triad", "tb.voicing"]));
  });

  test("backfill grants rows of completed sessions silently; rows are never deleted", () => {
    h.server.deps.repos.lessons.saveProgress({
      lessonId: "U01.L01" as never,
      status: "completed",
      currentStep: null,
      splitPart: null,
      startedAt: null,
      completedAt: "2026-11-01T10:00:00.000Z",
      bestScore: 1,
      completedVersion: 1,
      contentHash: null,
      updatedAt: "2026-11-01T10:00:00.000Z",
    });
    const granted = s.unlocks.backfill();
    expect(granted.map((u) => u.itemId).sort()).toEqual(["snd.piano", "tb.mini.rest"]);
    expect(granted.every((u) => u.sourceKind === "backfill" && u.seen)).toBe(true);
    expect(() => h.server.deps.db.run("DELETE FROM unlocks")).toThrow(/never deleted/);
  });
});

describe("can-do ledger", () => {
  test("a lesson's can-do is emerging on completion and solid after ≥ 0.85 on two days", async () => {
    await complete("U01.L01");
    expect(s.cando.list()).toEqual([
      expect.objectContaining({ candoId: "cd.hear.pulse", status: "emerging" }),
    ]);
    h.server.deps.services.mastery.addEvidence([
      { skillId: "R03", category: null, score: 0.9, weight: 1, sourceKind: "step", sourceId: "a#1" },
    ]);
    h.clock.advanceDays(1);
    h.server.deps.services.mastery.addEvidence([
      { skillId: "R03", category: null, score: 0.95, weight: 1, sourceKind: "step", sourceId: "a#2" },
    ]);
    s.cando.evaluate({ skills: ["R03"], evidence: { kind: "set", id: "x" } });
    expect(s.cando.list()[0]?.status).toBe("solid");
    expect(h.server.deps.repos.cando.history("cd.hear.pulse").map((r) => r.status)).toEqual([
      "emerging",
      "solid",
    ]);
  });
});

describe("QA disputes", () => {
  test("a disputed attempt loses its evidence", async () => {
    await complete("U01.L01");
    const r = await attempt("U01.L02", "S2", "rest-on-three", 1);
    expect(h.server.deps.repos.mastery.evidenceOf("R06")).toHaveLength(1);
    s.ops.addQa({
      kind: "lesson-step",
      lessonId: "U01.L02",
      stepId: "S2",
      exerciseId: "rest-on-three",
      exerciseVersion: 1,
      familyId: null,
      trialSeed: null,
      params: null,
      response: { code: "x" },
      gradeResult: null,
      hintRung: 0,
      note: null,
      attemptId: r.attempt.id,
    });
    expect(h.server.deps.repos.mastery.evidenceOf("R06")).toHaveLength(0);
    expect(h.server.deps.repos.lessons.attempt(r.attempt.id)?.disputed).toBe(true);
  });
});
