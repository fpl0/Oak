// The SRS and planning endpoints over the SRS engineer's real `SrsService` and `SessionPlanService`,
// wired to SQLite by srs-wiring.ts, on the fixture course.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { gradeResult, type Harness, harness } from "../testing/harness.ts";

let h: Harness;
beforeEach(async () => {
  h = await harness({ now: "2026-11-11T12:00:00.000Z" });
  h.server.deps.repos.profile.patch({ timezone: "UTC" });
});
afterEach(async () => {
  await h.close();
});

async function completeLesson(id: string) {
  const sk = await h.json<{ sketch: { id: string } }>("POST", "/api/sketches", {
    title: "Make",
    originKind: "lesson-make",
    originId: id,
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
  });
  return h.json<{ seeded: { cardId: string; status: string }[]; opened: string[] }>(
    "POST",
    `/api/lessons/${id}/complete`,
    {
      sessionId: null,
      sketchId: sk.body.sketch.id,
      lessonVersion: 1,
      contentHash: "h",
      splitPart: null,
    },
  );
}

describe("seeding and families", () => {
  test("completing a lesson seeds the families it unlocks", async () => {
    await completeLesson("U01.L01");
    await h.server.deps.services.course.attempt("U01.L02", "S2", {
      sessionId: null,
      exerciseId: "rest-on-three",
      exerciseVersion: 1,
      seriesNo: 0,
      params: null,
      response: { code: "x" },
      result: gradeResult({ exerciseId: "U01.L02/rest-on-three", score: 0.9 }),
      extraReplays: 0,
      activeMs: 1,
      tutorAssisted: false,
    });
    const done = await completeLesson("U01.L02");
    expect(done.status).toBe(200);
    expect(done.body.seeded.map((s) => s.cardId).sort()).toEqual(["fam.ear.pulse", "fam.rhy.read"]);
    const fams = await h.json<{
      families: { familyId: string }[];
      cards: { cardId: string; status: string; retrievability: number }[];
    }>("GET", "/api/drills/families");
    expect(fams.status).toBe(200);
    expect(fams.body.cards.map((c) => c.cardId).sort()).toEqual(["fam.ear.pulse", "fam.rhy.read"]);
    const st = await h.json<{
      familyId: string;
      level: number;
      openCategories: string[];
      maxOpenLevel: number;
    }>("GET", "/api/drills/difficulty/fam.rhy.read");
    // Category `basic` opens at U01.L02; `dotted` waits for U03.L01, so level 2 (basic + dotted) is open
    // only on its basic category.
    expect(st.body).toMatchObject({ familyId: "fam.rhy.read", level: 1, openCategories: ["basic"] });
    expect((await h.json("GET", "/api/drills/difficulty/fam.nope.nope")).status).toBe(404);
  });
});

describe("a drill set", () => {
  test("start, trials, finish: stats, confusion, evidence, review and the streak", async () => {
    await completeLesson("U01.L01");
    await completeLesson("U01.L02");
    const start = await h.json<{
      id: string;
      levels: Record<string, number>;
      trialsPlanned: number;
      openCategories: Record<string, string[]>;
    }>("POST", "/api/drills/sessions", {
      sessionId: null,
      purpose: "srs",
      familyIds: ["fam.ear.pulse"],
      warmupItemId: null,
    });
    expect(start.status).toBe(200);
    expect(start.body.trialsPlanned).toBe(6);
    expect(start.body.levels["fam.ear.pulse"]).toBe(1);
    const trial = (idx: number, credit: number, confusion: [string, string] | null = null) => ({
      idx,
      familyId: "fam.ear.pulse",
      seed: 1000 + idx,
      level: 1,
      category: "basic",
      params: {},
      response: { answer: null, taps: null, sung: null, skipped: false },
      credit,
      correct: credit >= 1,
      rtMs: 2000 + idx * 100,
      replays: 0,
      confusion,
      centsError: null,
      at: "2026-11-11T12:01:00.000Z",
    });
    const trials = [trial(0, 1), trial(1, 1), trial(2, 0, ["3", "4"]), trial(3, 1), trial(4, 1), trial(5, 1)];
    expect((await h.json("POST", `/api/drills/sessions/${start.body.id}/trials`, { trials })).status).toBe(
      200,
    );
    // A trial of another family is refused.
    expect(
      (
        await h.json("POST", `/api/drills/sessions/${start.body.id}/trials`, {
          trials: [{ ...trial(6, 1), familyId: "fam.rhy.read" }],
        })
      ).status,
    ).toBe(400);
    const fin = await h.json<{
      meanCredit: number;
      medianRtMs: number;
      reviews: { cardId: string; rating: string }[];
      evidence: { skillId: string; sourceKind: string; weight: number }[];
      streak: { todayQualified: boolean };
      session: { finishedAt: string };
    }>("POST", `/api/drills/sessions/${start.body.id}/finish`);
    expect(fin.status).toBe(200);
    expect(fin.body.meanCredit).toBeCloseTo(5 / 6, 10);
    expect(fin.body.medianRtMs).toBe(2250);
    expect(fin.body.session.finishedAt).not.toBeNull();
    // Mean credit 5/6 ≈ 0.83: ≥ 0.80 and < 0.95, so Good (contracts §7.2).
    expect(fin.body.reviews).toEqual([expect.objectContaining({ cardId: "fam.ear.pulse", rating: "Good" })]);
    expect(fin.body.evidence).toEqual([
      expect.objectContaining({ skillId: "E01", sourceKind: "srs-set", weight: 1.5 }),
    ]);
    expect(fin.body.streak.todayQualified).toBe(true);
    const fam = h.server.deps.repos.srs.family("fam.ear.pulse");
    expect(fam?.categoryStats.basic).toEqual({ n: 6, hits: 5, lastAt: "2026-11-11T12:01:00.000Z" });
    expect(fam?.confusion).toEqual({ "3|4": 1 });
    // Finishing twice changes nothing; more trials are refused.
    const again = await h.json<{ reviews: unknown[] }>(
      "POST",
      `/api/drills/sessions/${start.body.id}/finish`,
    );
    expect(again.body.reviews).toEqual([]);
    expect((await h.json("POST", `/api/drills/sessions/${start.body.id}/trials`, { trials })).status).toBe(
      409,
    );
  });
});

describe("today", () => {
  test("session.today plans the next lesson with a warm-up label; srs.due answers the budget", async () => {
    const plan = await h.json<{
      kind: string;
      mapItemId: string;
      warmup: { label: string; budgetSec: number };
      targetMinutes: number;
    }>("GET", "/api/session/today?targetMinutes=15");
    expect(plan.status).toBe(200);
    expect(plan.body).toMatchObject({ kind: "lesson", mapItemId: "U01.L01", targetMinutes: 15 });
    expect(typeof plan.body.warmup.label).toBe("string");
    const due = await h.json<{ budgetSec: number; items: unknown[]; label: string }>("GET", "/api/srs/due");
    expect(due.status).toBe(200);
    expect(due.body.items).toEqual([]);
    expect(due.body.label).toBe("No review today");
  });

  test("the skill map shows every node with its level", async () => {
    await completeLesson("U01.L01");
    const map = await h.json<{
      nodes: { skillId: string; level: string; freshness: number }[];
      reviveSec: number;
    }>("GET", "/api/skills/map");
    expect(map.status).toBe(200);
    const level = Object.fromEntries(map.body.nodes.map((n) => [n.skillId, n.level]));
    expect(level.R03).toBe("learning"); // introduced by U01.L01, no evidence yet beyond completion
    expect(level.R06).toBe("available"); // U01.L02 is open
    expect(level.J01).toBe("new");
    expect(map.body.reviveSec).toBe(0);
  });

  test("progress page: can-dos, milestones, streak", async () => {
    await completeLesson("U01.L01");
    const p = await h.json<{
      canDo: { candoId: string }[];
      milestones: { id: string; title: string; description: string; reachedAt: string | null }[];
      paceEstimate: null;
    }>("GET", "/api/progress");
    expect(p.status).toBe(200);
    expect(p.body.canDo.map((c) => c.candoId)).toEqual(["cd.hear.pulse"]);
    expect(p.body.milestones).toEqual([
      { id: "ms.01", title: "First week", description: "Three lessons done.", reachedAt: null },
    ]);
  });
});

describe("adversarial: review writes are atomic", () => {
  test("a failure after the card is saved rolls the whole review back (no card without its revlog)", async () => {
    await completeLesson("U01.L01");
    await h.server.deps.services.course.attempt("U01.L02", "S2", {
      sessionId: null,
      exerciseId: "rest-on-three",
      exerciseVersion: 1,
      seriesNo: 0,
      params: null,
      response: { code: "x" },
      result: gradeResult({ exerciseId: "U01.L02/rest-on-three", score: 0.9 }),
      extraReplays: 0,
      activeMs: 1,
      tutorAssisted: false,
    });
    await completeLesson("U01.L02");
    const repo = h.server.deps.repos.srs;
    const before = JSON.stringify(repo.card("fam.rhy.read"));
    const body = {
      cardId: "fam.rhy.read",
      drillSessionId: null,
      outcome: {
        meanCredit: 0.95,
        medianRtMs: 1500,
        extraReplays: 0,
        hintRung: 0,
        revealed: false,
        playedLevel: 1,
        meanAbsCents: null,
      },
    };
    const real = repo.addRevlog.bind(repo);
    repo.addRevlog = () => {
      throw new Error("disk full");
    };
    try {
      expect((await h.req("POST", "/api/srs/review", body)).status).toBe(500);
    } finally {
      repo.addRevlog = real;
    }
    expect(JSON.stringify(repo.card("fam.rhy.read"))).toBe(before);
    // The same review goes through once the store works again.
    expect((await h.req("POST", "/api/srs/review", body)).status).toBe(200);
    expect(JSON.stringify(repo.card("fam.rhy.read"))).not.toBe(before);
  });
});
