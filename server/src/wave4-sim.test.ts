// Wave 4 through the HTTP API on the real course (U05–U07 authored or stood in; U08 not written, as in Wave 4):
// simulated learners take Today's plan every day from "after U04.CP" until X1 is released and review days follow.
// Checked every day, against the server's own answers and an independent model of contracts §2.5 / §9.1:
//  - the warm-up stays within the budget of the day's kind (lesson 5, checkpoint and capstone 3, gym 4 minutes);
//  - nothing is scheduled before it opens: no gym before U07.L01, a checkpoint only after its unit's lessons and on a
//    later day, C2 only after U07.CP, X1 only once its gate is open (C2 released, fam.mel.dictation at 4);
//  - the transcription slot exactly per the rule: due after 4 core sessions since the last transcription session,
//    never interrupting a capstone in progress, ordinals GYM.01, GYM.02, … of the learner's own history, odd ladder,
//    even own audio or (without a project) a ladder one realism level up; "Two more gym sets open X1" schedules gym
//    days until the family reaches its level;
//  - U07.CP is still offered with U08.L01 unwritten, then C2, then X1, then review days, never an error;
//  - backup → import into a fresh server → the same plan, gym plan, ladder and capstone sessions.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  CapstoneGate,
  CapstoneSessions,
  GymPlan,
  GymSession,
  LadderItem,
  LadderState,
  SessionPlan,
} from "@oak/api";
import type { ContentSource } from "./content/types.ts";
import { realCourse, wave4Course } from "./testing/course.ts";
import { gradeResult, type Harness, harness } from "./testing/harness.ts";
import { rng, SimLearner } from "./testing/learner.ts";

let course: ContentSource;
beforeAll(async () => {
  // Pinned to the course as Wave 4 shipped it: Wave 5 lessons authored now would replace its review days.
  course = wave4Course(
    await realCourse({ standInUnits: ["U00", "U01", "U02", "U03", "U04", "U05", "U06", "U07"] }),
  );
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-11-11T17:00:00.000Z");
const BUDGET = { lesson: { 15: 240, 20: 300, 25: 360 }, checkpoint: 180, capstone: 180, gym: 240 } as const;

interface Profile {
  name: string;
  seed: number;
  target: 15 | 20 | 25;
  skip: number;
  /** After C2's release the learner's melodic dictation is at this level (X1 needs 4). */
  dictationAfterC2: number | null;
  backupEvery: number;
}
const PROFILES: Profile[] = [
  { name: "steady", seed: 41, target: 20, skip: 0.1, dictationAfterC2: 3, backupEvery: 9 },
  { name: "short-days", seed: 42, target: 15, skip: 0.25, dictationAfterC2: null, backupEvery: 13 },
];

const isTranscription = (id: string) =>
  id.startsWith("GYM.") || /^X\d+\.S\d+$/.test(id) || id.startsWith("CF-T.");
const isCore = (id: string) => /^U\d+\./.test(id) || /^(C\d+|X\d+)\.S\d+$/.test(id);

class Sim {
  readonly me: SimLearner;
  readonly r: () => number;
  readonly failures: string[] = [];
  /** Map items done, in order (the model's own history). */
  readonly history: string[] = [];
  /** Learner day each lesson was completed (a checkpoint falls on a later day). */
  readonly lessonDay = new Map<string, string>();
  gyms = 0;
  reviewDaysAfterX1 = 0;
  readonly kinds = new Map<string, number>();
  backups = 0;

  constructor(
    readonly h: Harness,
    readonly p: Profile,
  ) {
    this.me = new SimLearner(h, course, p.seed);
    this.r = rng(p.seed * 7919);
  }
  fail(day: string, what: string): void {
    this.failures.push(`[${this.p.name} ${day}] ${what}`);
  }
  done(id: string): boolean {
    return this.history.includes(id);
  }
  sinceLast(): number | null {
    const start = this.history.indexOf("U07.L01");
    if (start < 0) return null;
    let n = 0;
    for (let i = this.history.length - 1; i >= start; i--) {
      const id = this.history[i] as string;
      if (isTranscription(id)) break;
      if (isCore(id)) n++;
    }
    return n;
  }

  check(day: string, plan: SessionPlan): void {
    const budget =
      plan.kind === "lesson" || plan.kind === "review" || plan.kind === "light"
        ? BUDGET.lesson[this.p.target]
        : plan.kind === "checkpoint"
          ? BUDGET.checkpoint
          : plan.kind === "capstone"
            ? BUDGET.capstone
            : BUDGET.gym;
    if (plan.warmup.budgetSec !== budget)
      this.fail(day, `${plan.kind} warm-up budget ${plan.warmup.budgetSec}, want ${budget}`);
    if (plan.warmup.plannedSec > plan.warmup.budgetSec)
      this.fail(day, `warm-up ${plan.warmup.plannedSec}s over the ${plan.warmup.budgetSec}s budget`);
    const since = this.sinceLast();
    const id = plan.mapItemId as string | null;
    const capstoneInProgress = ["C2", "X1"].some(
      (c) =>
        this.done(`${c}.S1`) && course.capstones.some((x) => x.id === c && !this.done(`${c}.S${x.sessions}`)),
    );
    if (plan.kind === "gym") {
      if (!this.done("U07.L01")) this.fail(day, "a gym session before U07.L01");
      const want = `GYM.${String(this.gyms + 1).padStart(2, "0")}`;
      if (id !== want) this.fail(day, `gym ${id}, want ${want}`);
      const x1Sets = plan.note !== null && /gym sets? opens? X1/.test(plan.note);
      if ((since ?? 0) < 4 && !x1Sets) this.fail(day, `a gym slot after ${since} core sessions`);
      if (capstoneInProgress) this.fail(day, "a gym slot interrupted a capstone in progress");
    } else if ((since ?? 0) >= 4 && !capstoneInProgress && !(id !== null && /^X\d+\.S/.test(id)))
      this.fail(day, `slot due (${since} sessions) but Today offers ${plan.kind} ${id}`);
    if (plan.kind === "lesson" && id !== null) {
      const i = course.syllabus.defaultOrder.indexOf(id as never);
      const before = course.syllabus.defaultOrder
        .slice(0, i)
        .filter((x) => /^U\d+\.L\d+$/.test(x) && course.lessons.some((l) => l.id === x));
      for (const l of before) if (!this.done(l)) this.fail(day, `${id} before ${l}`);
    }
    if (plan.kind === "checkpoint" && id !== null) {
      const unit = id.replace(".CP", "");
      const lessons = course.lessons.filter((l) => l.id.startsWith(`${unit}.`)).map((l) => l.id);
      for (const l of lessons) {
        if (!this.done(l)) this.fail(day, `${id} before ${l}`);
        if (this.lessonDay.get(l) === day) this.fail(day, `${id} on the day ${l} was completed`);
      }
    }
    if (plan.kind === "capstone" && id !== null) {
      if (id.startsWith("C2.") && !this.done("U07.CP")) this.fail(day, `${id} before U07.CP`);
      if (id.startsWith("X1.") && !(this.done("C2.S2") && this.done("U07.CP")))
        this.fail(day, `${id} before C2 and U07.CP`);
      const n = Number(id.split(".S")[1]);
      if (n > 1 && !this.done(id.replace(/S\d+$/, `S${n - 1}`)))
        this.fail(day, `${id} before the session before it`);
    }
    if (capstoneInProgress) {
      const next = ["C2", "X1"]
        .flatMap((c) => [1, 2, 3].map((n) => `${c}.S${n}`))
        .find(
          (s) =>
            !this.done(s) &&
            course.capstones.some((x) => x.id === s.split(".")[0] && Number(s.split(".S")[1]) <= x.sessions),
        );
      if (next !== undefined && id !== next)
        this.fail(day, `capstone in progress: Today offers ${plan.kind} ${id}, want ${next}`);
    }
  }

  async day(): Promise<void> {
    const plan = await this.me.today();
    const day = plan.day;
    this.kinds.set(plan.kind, (this.kinds.get(plan.kind) ?? 0) + 1);
    this.check(day, plan);
    const gym = await this.me.api<GymPlan>("GET", "/api/gym");
    if (gym.active !== this.done("U07.L01")) this.fail(day, `gym.active ${gym.active}`);
    if (gym.active && gym.sinceLast !== this.sinceLast())
      this.fail(day, `gym.sinceLast ${gym.sinceLast}, model ${this.sinceLast()}`);
    if ((plan.kind === "gym") !== gym.slotDue && !(plan.kind === "gym" && plan.note?.includes("X1")))
      this.fail(day, `gym.slotDue ${gym.slotDue} but Today is ${plan.kind}`);
    const ses = await this.me.startSession(plan);
    for (const item of plan.warmup.items) await this.me.doItem(ses.id, item);
    const id = plan.mapItemId as string | null;
    switch (plan.kind) {
      case "lesson": {
        await this.me.doLesson(id as string, ses.id);
        await this.me.completeLesson(id as string, ses.id);
        this.history.push(id as string);
        this.lessonDay.set(id as string, day);
        break;
      }
      case "checkpoint": {
        const { outcome } = await this.me.checkpoint(id as string, ses.id, {
          gating: 0.95,
          levelSetting: 0.9,
        });
        if (!outcome.passed) this.fail(day, `${id} failed at 0.95`);
        else this.history.push(id as string);
        break;
      }
      case "capstone":
        await this.capstone(day, id as string, ses.id);
        break;
      case "gym":
        await this.gymDay(day, plan, id as string, ses.id);
        break;
      default:
        if (this.done("X1.S3")) this.reviewDaysAfterX1++;
        break;
    }
    await this.me.endSession(ses.id);
  }

  async capstone(day: string, sessionId: string, oakSession: string): Promise<void> {
    const cap = sessionId.split(".")[0] as string;
    const def = course.capstones.find((c) => c.id === cap);
    const last = sessionId === `${cap}.S${def?.sessions}`;
    const sk = await this.me.sketch(`${cap} draft`, "capstone", cap, oakSession);
    const ss = await this.me.api<CapstoneSessions>("POST", `/api/capstones/${cap}/drafts`, {
      capstoneSessionId: sessionId,
      sessionId: oakSession,
      sketchId: sk.id,
      sketchVersion: sk.currentVersion,
    });
    const mine = ss.sessions.find((s) => s.capstoneSessionId === sessionId);
    if (mine?.status !== "in_progress") this.fail(day, `${sessionId} after its draft: ${mine?.status}`);
    for (const c of mine?.checks ?? [])
      await this.me.api("POST", `/api/capstones/${cap}/checks/${c.checkId}`, {
        capstoneSessionId: sessionId,
        stage: c.stage,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        result: gradeResult({ exerciseId: `${cap}/${c.checkId}`, score: 0.92, mode: "capstone" }),
        idempotencyKey: `${this.p.name}-${sessionId}-${c.checkId}-${c.stage ?? "x"}`
          .replace(/[^A-Za-z0-9_-]/g, "_")
          .slice(0, 64),
      });
    if (last) {
      await this.me.api("POST", `/api/capstones/${cap}/checks`, {
        sessionId: oakSession,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        result: gradeResult({ exerciseId: `${cap}/brief`, score: 0.95, mode: "capstone" }),
      });
      await this.me.api("POST", `/api/capstones/${cap}/release`, {
        sessionId: oakSession,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        title: cap,
        flavour: null,
        linerNotesMd: `${cap}, first take.`,
        theoryTags: [],
        includeReviewNote: false,
      });
      if (cap === "C2" && this.p.dictationAfterC2 !== null) {
        // A learner whose melodic dictation lags: X1 waits for its gym sets.
        const row = this.h.server.deps.repos.srs.family("fam.mel.dictation");
        if (row !== null)
          this.h.server.deps.repos.srs.saveFamily({ ...row, level: this.p.dictationAfterC2, promoDay: null });
        const gate = await this.me.api<CapstoneGate>("GET", "/api/capstones/X1/gate");
        if (gate.message !== "Two more gym sets open X1") this.fail(day, `X1 gate after C2: ${gate.message}`);
      }
    } else
      await this.me.api("POST", `/api/capstones/${cap}/sessions`, {
        sessionId: oakSession,
        capstoneSessionId: sessionId,
        sketchId: sk.id,
        flavour: null,
      });
    for (let n = 1; n <= (def?.sessions ?? 1); n++) {
      const sid = `${cap}.S${n}`;
      if (!this.done(sid) && (sid === sessionId || (last && n < (def?.sessions ?? 1))))
        this.history.push(sid);
    }
  }

  async gymDay(day: string, plan: SessionPlan, gymId: string, oakSession: string): Promise<void> {
    const before = await this.me.api<LadderState>("GET", "/api/ladder");
    const n = this.gyms + 1;
    const g = await this.me.api<GymSession>("POST", "/api/gym/sessions", {
      sessionId: oakSession,
      kind: "ladder",
      transcriptionId: null,
    });
    if (g.gymId !== gymId) this.fail(day, `gym.start gave ${g.gymId}, Today said ${gymId}`);
    // An even slot without an audio project: a ladder session one realism level up (contracts §2.5).
    const want = Math.min(4, before.realism + (n % 2 === 0 ? 1 : 0));
    if (g.realism !== want) this.fail(day, `${gymId} realism ${g.realism}, want ${want}`);
    if (n % 2 === 0 && plan.title !== "Transcription Gym: ladder")
      this.fail(day, `${gymId} titled ${plan.title}`);
    const item = await this.me.api<LadderItem>("POST", "/api/ladder/items", { sessionId: oakSession, gymId });
    if (item.realism !== g.realism) this.fail(day, `${gymId} item realism ${item.realism}`);
    await this.me.api("POST", `/api/ladder/items/${item.itemId}/submissions`, {
      sessionId: oakSession,
      code: 'drums: s("bd sd")',
      rung: 0,
      ...(item.stages === null ? {} : { stage: item.stages[0] }),
    });
    // X1 waits for melodic dictation: the gym day's strong dictation set.
    if (plan.note !== null && /X1/.test(plan.note))
      await this.me.strongSet(oakSession, "fam.mel.dictation", "gym");
    this.gyms++;
    this.history.push(g.gymId);
  }

  /** Export, import into a fresh server, and compare what Today and the Wave 4 surfaces say. */
  async backupRoundTrip(day: string): Promise<void> {
    const views = async (h: Harness) => {
      const get = async (path: string) => (await h.json("GET", path)).body;
      return {
        today: await get("/api/session/today"),
        gym: await get("/api/gym"),
        ladder: await get("/api/ladder"),
        c2: await get("/api/capstones/C2/sessions"),
        x1: await get("/api/capstones/X1/sessions"),
        x1gate: await get("/api/capstones/X1/gate"),
        // c2 (Wave 5): the imported gate attempt's code runs after the strict lint; the gate is otherwise the same.
        voicing: (({ passedCodeImported: _i, ...g }) => g)(
          (await get("/api/gates/voicing")) as Record<string, unknown>,
        ),
        progress: await get("/api/lessons/progress"),
      };
    };
    const before = await views(this.h);
    const exp = await this.h.req("GET", "/api/backup/export");
    const archive = new Uint8Array(await exp.arrayBuffer());
    const fresh = await harness({ dev: true, content: course, now: this.h.clock.now().toISOString() });
    try {
      const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
      if (imp.status !== 200) this.fail(day, `import ${imp.status}`);
      const after = await views(fresh);
      for (const k of Object.keys(before) as (keyof typeof before)[])
        if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
          this.fail(day, `after restore, ${k} differs`);
      this.backups++;
    } finally {
      await fresh.close();
    }
  }
}

describe("Wave 4 simulation: U05 to X1 and the gym, over HTTP", () => {
  for (const p of PROFILES)
    test(`${p.name}: every day per the rules, through C2 and X1 to review days`, async () => {
      const h = await harness({ dev: true, content: course, now: new Date(START).toISOString() });
      const sim = new Sim(h, p);
      try {
        await sim.me.api("PUT", "/api/profile", { timezone: "UTC", targetMinutes: p.target });
        const seed = await sim.me.api<{ done: string[] }>("POST", "/api/dev/seed", {
          point: "after U04.CP",
          targetMinutes: p.target,
        });
        sim.history.push(...seed.done);
        let t = START;
        for (let d = 0; d < 140 && sim.reviewDaysAfterX1 < 3; d++) {
          t += DAY;
          h.clock.set(new Date(t).toISOString());
          if (sim.r() < p.skip) continue;
          await sim.day();
          if (d % p.backupEvery === p.backupEvery - 1) await sim.backupRoundTrip(`day ${d}`);
        }
        await sim.backupRoundTrip("end");
        expect(sim.failures).toEqual([]);
        for (const id of ["U05.CP", "U06.CP", "U07.CP", "C2.S1", "C2.S2", "X1.S1", "X1.S2", "X1.S3"])
          expect({ id, done: sim.done(id) }).toEqual({ id, done: true });
        const order = (id: string) => sim.history.indexOf(id);
        expect(order("U07.CP")).toBeLessThan(order("C2.S1"));
        expect(order("C2.S2")).toBeLessThan(order("X1.S1"));
        expect(sim.gyms).toBeGreaterThanOrEqual(3);
        expect(sim.reviewDaysAfterX1).toBeGreaterThanOrEqual(3);
        const ladder = await sim.me.api<LadderState>("GET", "/api/ladder");
        expect(ladder.gradedPasses["1"]).toBeGreaterThan(0);
        const x1 = await sim.me.api<CapstoneGate>("GET", "/api/capstones/X1/gate");
        expect(x1.open).toBe(true);
        if (p.dictationAfterC2 !== null) expect(sim.kinds.get("gym")).toBeGreaterThanOrEqual(4);
        expect(sim.backups).toBeGreaterThan(2);
      } finally {
        await h.close();
      }
    }, 600_000);
});
