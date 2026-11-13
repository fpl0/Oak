// Wave 5 through the HTTP API on the real course (lessons not written yet stand in, as in Waves 3–4): simulated
// learners take Today's plan every day through session 129 of the default order (X2.S2), and take the optional side
// lessons A1.L01–L04 at random legal points — instead of the day's session (the chip) or after it ("one more").
// Checked every day, against the server's own answers and an independent model of contracts §2.5, §2.6, §9.1, §9.6:
//  - the warm-up stays within the budget of the day's kind (lesson 5, checkpoint and capstone 3, gym 4 minutes);
//  - nothing is scheduled before it opens: a lesson after the lessons before it, a checkpoint after its units'
//    lessons and on a later day (U09.CP after U10.L01, U10.CP after U11.L01, U11.CP with U12.L01 unwritten), C3
//    after U09.CP, C4 after U10.CP, C5 after U11.CP, X2 once C5 is released, capstone sessions in order;
//  - gym slots exactly per the rule (4 core sessions since the last transcription session, never inside a capstone,
//    an X# session takes the slot, ordinals of the learner's own history); the ladder levels up only when offered
//    (L5 after two graded L4 passes at R2+, L6 after two graded L5 songs once U11.L05 is done);
//  - a side lesson is never the New block, never offered on a checkpoint or capstone day or during a return warm-up,
//    at most once a day, never displaces or completes a core lesson (the core item stays, the map count stays) and
//    counts in track A;
//  - after X2: review days ("The next lessons are still being written"), never an error;
//  - backup → import into a fresh server → the same plan, gym, ladder, side lessons, capstones and progress.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  CapstoneGate,
  CapstoneSessions,
  CourseProgress,
  GymPlan,
  GymSession,
  LadderItem,
  LadderState,
  SessionPlan,
  SideLessons,
} from "@oak/api";
import type { ContentSource } from "./content/types.ts";
import { realCourse } from "./testing/course.ts";
import { gradeResult, type Harness, harness } from "./testing/harness.ts";
import { rng, SimLearner } from "./testing/learner.ts";
import { withX2 } from "./testing/wave5.ts";

let course: ContentSource;
beforeAll(async () => {
  const real = await realCourse({
    standInUnits: ["U00", "U01", "U02", "U03", "U04", "U05", "U06", "U07", "U08", "U09", "U10", "U11", "A1"],
  });
  // A1.L05–L07 are track lessons for a later wave: not stood in.
  const lessons = real.lessons.filter(
    (l) => !/^A1\.L0[5-7]$/.test(l.id) || l.title.indexOf("(stand-in)") < 0,
  );
  course = withX2({ ...real, lessons });
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-11-13T17:00:00.000Z");
const BUDGET = { lesson: { 15: 240, 20: 300, 25: 360 }, checkpoint: 180, capstone: 180, gym: 240 } as const;
const LAST = "X2.S2";

interface Profile {
  name: string;
  seed: number;
  target: 15 | 20 | 25;
  from: string;
  skip: number;
  /** Chance to take an offered side lesson in place of the day's session, and after it. */
  sideInstead: number;
  sideAfter: number;
  backupEvery: number;
}
const PROFILES: Profile[] = [
  {
    name: "whole-way",
    seed: 51,
    target: 20,
    from: "after U03.L02",
    skip: 0.08,
    sideInstead: 0.06,
    sideAfter: 0.08,
    backupEvery: 37,
  },
  {
    name: "short-days",
    seed: 52,
    target: 15,
    // Through U09.L04 with L5 offered: the ladder runs its song levels (L5 per phrase, then L6 staged).
    from: "ladder level-up due",
    skip: 0.2,
    sideInstead: 0.15,
    sideAfter: 0.15,
    backupEvery: 23,
  },
];

const isTranscription = (id: string) =>
  id.startsWith("GYM.") || /^X\d+\.S\d+$/.test(id) || id.startsWith("CF-T.");
const isCore = (id: string) => /^U\d+\./.test(id) || /^(C\d+|X\d+)\.S\d+$/.test(id);
const SIDE = ["A1.L01", "A1.L02", "A1.L03", "A1.L04"];
const CAPSTONE_GATE: Record<string, string> = { C3: "U09.CP", C4: "U10.CP", C5: "U11.CP", X2: "C5.S2" };

class Sim {
  readonly me: SimLearner;
  readonly r: () => number;
  readonly failures: string[] = [];
  readonly history: string[] = [];
  readonly lessonDay = new Map<string, string>();
  readonly sideDone: string[] = [];
  gyms = 0;
  reviewDaysAfter = 0;
  readonly kinds = new Map<string, number>();
  backups = 0;
  levelUps: number[] = [];

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
  capstoneInProgress(): string | null {
    for (const c of course.capstones) {
      const n = c.sessions;
      if (this.done(`${c.id}.S1`) && !this.done(`${c.id}.S${n}`)) {
        for (let k = 2; k <= n; k++) if (!this.done(`${c.id}.S${k}`)) return `${c.id}.S${k}`;
      }
    }
    return null;
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
    const id = plan.mapItemId as string | null;
    // Side lessons: never the New block, never beside a checkpoint or capstone, never in a return warm-up.
    if (id !== null && SIDE.includes(id)) this.fail(day, `a side lesson ${id} is the New block`);
    const side = plan.sideLesson ?? null;
    if (side !== null) {
      if (plan.kind === "checkpoint" || plan.kind === "capstone" || plan.kind === "light")
        this.fail(day, `side lesson offered on a ${plan.kind} day`);
      if (plan.returning !== null) this.fail(day, "side lesson offered during a return warm-up");
      if (!this.done("U03.L02")) this.fail(day, "side lesson offered before U03.L02");
      const want = SIDE.find((s) => !this.sideDone.includes(s));
      if (side.lessonId !== want) this.fail(day, `side lesson ${side.lessonId}, want ${want}`);
    }
    const since = this.sinceLast();
    const inProgress = this.capstoneInProgress();
    if (plan.kind === "gym") {
      if (!this.done("U07.L01")) this.fail(day, "a gym session before U07.L01");
      const want = `GYM.${String(this.gyms + 1).padStart(2, "0")}`;
      if (id !== want) this.fail(day, `gym ${id}, want ${want}`);
      const x1Sets = plan.note !== null && /gym sets? opens? X1/.test(plan.note);
      if ((since ?? 0) < 4 && !x1Sets) this.fail(day, `a gym slot after ${since} core sessions`);
      if (inProgress !== null) this.fail(day, `a gym slot interrupted ${inProgress}`);
    } else if ((since ?? 0) >= 4 && inProgress === null && !(id !== null && /^X\d+\.S/.test(id)))
      this.fail(day, `slot due (${since} sessions) but Today offers ${plan.kind} ${id}`);
    if (plan.kind === "lesson" && id !== null) {
      const order = course.syllabus.defaultOrder;
      const before = order
        .slice(0, order.indexOf(id as never))
        .filter((x) => /^U\d+\.L\d+$/.test(x) && course.lessons.some((l) => l.id === x));
      for (const l of before) if (!this.done(l)) this.fail(day, `${id} before ${l}`);
    }
    if (plan.kind === "checkpoint" && id !== null) {
      const meta = course.syllabus.checkpoints.find((c) => c.id === id);
      const lessons = course.syllabus.units
        .filter((u) => meta?.covers.includes(u.id))
        .flatMap((u) => u.lessons.map((l) => l.id as string));
      for (const l of lessons) {
        if (!this.done(l)) this.fail(day, `${id} before ${l}`);
        if (this.lessonDay.get(l) === day) this.fail(day, `${id} on the day ${l} was completed`);
      }
    }
    if (plan.kind === "capstone" && id !== null) {
      const cap = id.split(".")[0] as string;
      const gate = CAPSTONE_GATE[cap];
      if (gate !== undefined && !this.done(gate)) this.fail(day, `${id} before ${gate}`);
      const n = Number(id.split(".S")[1]);
      if (n > 1 && !this.done(id.replace(/S\d+$/, `S${n - 1}`)))
        this.fail(day, `${id} before the session before`);
    }
    if (inProgress !== null && id !== inProgress)
      this.fail(day, `capstone in progress: Today offers ${plan.kind} ${id}, want ${inProgress}`);
  }

  async day(): Promise<void> {
    let plan = await this.me.today();
    const day = plan.day;
    this.kinds.set(plan.kind, (this.kinds.get(plan.kind) ?? 0) + 1);
    this.check(day, plan);
    const gym = await this.me.api<GymPlan>("GET", "/api/gym");
    if (gym.active !== this.done("U07.L01")) this.fail(day, `gym.active ${gym.active}`);
    if ((plan.kind === "gym") !== gym.slotDue && !(plan.kind === "gym" && plan.note?.includes("X1")))
      this.fail(day, `gym.slotDue ${gym.slotDue} but Today is ${plan.kind}`);

    // The chip: an offered side lesson taken instead of the day's session. The core item stays where it was.
    if (plan.sideLesson?.placement === "alternative" && this.r() < this.p.sideInstead) {
      const before = await this.me.api<CourseProgress>("GET", "/api/lessons/progress");
      await this.side(day, plan.sideLesson.lessonId);
      const again = await this.me.today();
      if (again.mapItemId !== plan.mapItemId || again.kind !== plan.kind)
        this.fail(
          day,
          `a side lesson displaced ${plan.mapItemId}: Today now ${again.kind} ${again.mapItemId}`,
        );
      if ((again.sideLesson ?? null) !== null) this.fail(day, "a second side lesson offered the same day");
      const after = await this.me.api<CourseProgress>("GET", "/api/lessons/progress");
      if (after.mapDone !== before.mapDone)
        this.fail(day, `a side lesson moved the core map ${before.mapDone}→${after.mapDone}`);
      if ((after.sideLessons?.done ?? 0) !== (before.sideLessons?.done ?? 0) + 1)
        this.fail(day, "a side lesson was not counted in track A");
      return;
    }

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
        if (this.done(LAST)) {
          this.reviewDaysAfter++;
          if (
            plan.kind === "review" &&
            plan.note !== "The next lessons are still being written. Today: a review, then Studio."
          )
            this.fail(day, `review day after X2 says ${plan.note}`);
        }
        break;
    }
    const summary = await this.me.endSession(ses.id);
    if (plan.kind === "gym" && (summary.gym ?? null) === null)
      this.fail(day, "a gym day's Coda has no gym card");

    // "One more, if you like": the side lesson offered after the day's session.
    if (this.r() < this.p.sideAfter) {
      plan = await this.me.today();
      const side = plan.sideLesson ?? null;
      if (side !== null) {
        if (side.placement !== "after-core")
          this.fail(day, `after today's session the offer is ${side.placement}`);
        await this.side(day, side.lessonId);
      }
    }
  }

  async side(day: string, lessonId: string): Promise<void> {
    const ses = await this.me.api<{ id: string }>("POST", "/api/session/start", {
      kind: "lesson",
      mapItemId: lessonId,
      targetMinutes: this.p.target,
    });
    await this.me.doLesson(lessonId, ses.id);
    await this.me.completeLesson(lessonId, ses.id);
    await this.me.endSession(ses.id);
    this.sideDone.push(lessonId);
    const list = await this.me.api<SideLessons>("GET", "/api/side-lessons");
    if (list.items.find((i) => i.lessonId === lessonId)?.status !== "done")
      this.fail(day, `${lessonId} not done after completing it`);
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
    // Checks in order: a check whose `after` is not cleared is closed and refused (X2: bass → changes → melody).
    for (const c of mine?.checks ?? []) {
      const record = () =>
        this.h.json("POST", `/api/capstones/${cap}/checks/${c.checkId}`, {
          capstoneSessionId: sessionId,
          stage: c.stage,
          sketchId: sk.id,
          sketchVersion: sk.currentVersion,
          result: gradeResult({ exerciseId: `${cap}/${c.checkId}`, score: 0.92, mode: "capstone" }),
        });
      const now = await this.me.api<CapstoneSessions>("GET", `/api/capstones/${cap}/sessions`);
      const st = now.sessions
        .flatMap((s) => s.checks)
        .find((x) => x.checkId === c.checkId && x.stage === c.stage);
      if (st?.open !== true) {
        const r = await record();
        if (r.status !== 409) this.fail(day, `${cap} ${c.checkId} recorded while closed (${r.status})`);
        continue;
      }
      const r = await record();
      if (r.status !== 200) this.fail(day, `${cap} ${c.checkId} → ${r.status}`);
    }
    if (last) {
      if (def?.kind !== "transcribe")
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
      if (cap === "C2") {
        // X1 waits for melodic dictation at level 4 (contracts §6.6): a learner whose dictation lags gets gym days.
        const row = this.h.server.deps.repos.srs.family("fam.mel.dictation");
        if (row !== null && row.level < 4)
          this.h.server.deps.repos.srs.saveFamily({ ...row, level: 3, promoDay: null });
        const gate = await this.me.api<CapstoneGate>("GET", "/api/capstones/X1/gate");
        if (!gate.open && gate.message !== "Two more gym sets open X1")
          this.fail(day, `X1 gate: ${gate.message}`);
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
    // Take a level-up the ladder offers (contracts §2.9; wave5.md §5.3), and check it was earned.
    if (before.levelUp !== null) {
      const to = before.levelUp.to;
      if (to !== before.level + 1) this.fail(day, `level-up from L${before.level} to L${to}`);
      if (to === 6 && !this.done("U11.L05")) this.fail(day, "L6 offered before U11.L05");
      if (to === 6 && before.gradedPasses["5"] === 0 && !this.done("X1.S3"))
        this.fail(day, "L6 offered without L5 songs");
      await this.me.api("PUT", "/api/ladder", { level: to });
      this.levelUps.push(to);
    }
    const state = await this.me.api<LadderState>("GET", "/api/ladder");
    const n = this.gyms + 1;
    const g = await this.me.api<GymSession>("POST", "/api/gym/sessions", {
      sessionId: oakSession,
      kind: "ladder",
      transcriptionId: null,
    });
    if (g.gymId !== gymId) this.fail(day, `gym.start gave ${g.gymId}, Today said ${gymId}`);
    const want = Math.min(4, state.realism + (n % 2 === 0 ? 1 : 0));
    if (g.realism !== want) this.fail(day, `${gymId} realism ${g.realism}, want ${want}`);
    const item = await this.me.api<LadderItem>("POST", "/api/ladder/items", { sessionId: oakSession, gymId });
    if (item.level !== state.level)
      this.fail(day, `${gymId} item at L${item.level}, ladder at L${state.level}`);
    const submit = (extra: Record<string, unknown>) =>
      this.me.api("POST", `/api/ladder/items/${item.itemId}/submissions`, {
        sessionId: oakSession,
        code: 'drums: s("bd sd")',
        rung: 0,
        ...extra,
      });
    if (item.level === 5) for (let k = 1; k <= (item.phrases?.length ?? 0); k++) await submit({ phrase: k });
    else if (item.level === 6) {
      await submit({ stage: "bass" });
      await submit({ stage: "changes" });
      for (let k = 1; k <= (item.phrases?.length ?? 0); k++) await submit({ stage: "melody", phrase: k });
    } else if (item.stages === null) await submit({});
    else for (const stage of item.stages) await submit({ stage });
    if (plan.note !== null && /X1/.test(plan.note))
      await this.me.strongSet(oakSession, "fam.mel.dictation", "gym");
    this.gyms++;
    this.history.push(g.gymId);
  }

  async views(h: Harness) {
    const get = async (path: string) => (await h.json("GET", path)).body;
    const voicing = (await get("/api/gates/voicing")) as Record<string, unknown>;
    const { passedCodeImported: _imported, ...gate } = voicing;
    return {
      today: await get("/api/session/today"),
      gym: await get("/api/gym"),
      ladder: await get("/api/ladder"),
      songs: await get("/api/ladder/songs"),
      side: await get("/api/side-lessons"),
      progress: await get("/api/lessons/progress"),
      c3: await get("/api/capstones/C3/sessions"),
      c4: await get("/api/capstones/C4/sessions"),
      c5: await get("/api/capstones/C5/sessions"),
      x2: await get("/api/capstones/X2/sessions"),
      x2gate: await get("/api/capstones/X2/gate"),
      voicing: gate,
    };
  }

  async backupRoundTrip(day: string): Promise<void> {
    const before = await this.views(this.h);
    const exp = await this.h.req("GET", "/api/backup/export");
    const archive = new Uint8Array(await exp.arrayBuffer());
    const fresh = await harness({ dev: true, content: course, now: this.h.clock.now().toISOString() });
    try {
      const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
      if (imp.status !== 200) this.fail(day, `import ${imp.status}`);
      const after = await this.views(fresh);
      for (const k of Object.keys(before) as (keyof typeof before)[])
        if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
          this.fail(day, `after restore, ${k} differs`);
      this.backups++;
    } finally {
      await fresh.close();
    }
  }
}

describe("Wave 5 simulation: through session 129 (X2.S2) with side lessons, over HTTP", () => {
  for (const p of PROFILES)
    test(`${p.name}: every day per the rules, side lessons at random legal points, through X2 to review days`, async () => {
      const h = await harness({ dev: true, content: course, now: new Date(START).toISOString() });
      const sim = new Sim(h, p);
      try {
        await sim.me.api("PUT", "/api/profile", { timezone: "UTC", targetMinutes: p.target });
        const seed = await sim.me.api<{ done: string[] }>("POST", "/api/dev/seed", {
          point: p.from,
          targetMinutes: p.target,
        });
        sim.history.push(...seed.done);
        sim.gyms = seed.done.filter((id) => id.startsWith("GYM.")).length;
        let t = START;
        for (let d = 0; d < 260 && sim.reviewDaysAfter < 2; d++) {
          t += DAY;
          h.clock.set(new Date(t).toISOString());
          if (sim.r() < p.skip) continue;
          await sim.day();
          if (d % p.backupEvery === p.backupEvery - 1) await sim.backupRoundTrip(`day ${d}`);
        }
        await sim.backupRoundTrip("end");
        console.log(
          p.name,
          JSON.stringify([...sim.kinds]),
          `side ${sim.sideDone.join(" ")}`,
          `levels ${sim.levelUps.join(" ")}`,
          `gyms ${sim.gyms}`,
        );
        expect(sim.failures.slice(0, 30)).toEqual([]);
        const order = (id: string) => sim.history.indexOf(id);
        for (const id of ["U09.CP", "C3.S3", "U10.CP", "C4.S2", "U11.CP", "C5.S2", "X2.S1", "X2.S2"])
          expect({ id, done: sim.done(id) }).toEqual({ id, done: true });
        expect(order("U10.L01")).toBeLessThan(order("U09.CP"));
        expect(order("U09.CP")).toBeLessThan(order("C3.S1"));
        expect(order("U11.L01")).toBeLessThan(order("U10.CP"));
        expect(order("U10.CP")).toBeLessThan(order("C4.S1"));
        expect(order("U11.CP")).toBeLessThan(order("C5.S1"));
        expect(order("C5.S2")).toBeLessThan(order("X2.S1"));
        expect(sim.reviewDaysAfter).toBeGreaterThanOrEqual(2);
        expect(sim.sideDone.length).toBeGreaterThan(0);
        const progress = await sim.me.api<CourseProgress>("GET", "/api/lessons/progress");
        expect(progress.sideLessons?.done).toBe(sim.sideDone.length);
        expect(sim.backups).toBeGreaterThanOrEqual(2);
        if (p.from === "ladder level-up due") {
          // The song levels were reached in order and only when offered: L5 from the seed's offer, L6 after two songs.
          expect(sim.levelUps.slice(0, 2)).toEqual([5, 6]);
          const ladder = await sim.me.api<LadderState>("GET", "/api/ladder");
          expect(ladder.gradedPasses["5"]).toBeGreaterThanOrEqual(2);
          expect(ladder.gradedPasses["6"]).toBeGreaterThanOrEqual(1);
        }
      } finally {
        await h.close();
      }
    }, 600_000);
});
