// Wave 6 through the HTTP API on the real course (lessons not written yet stand in; CF-T's standards are test
// renditions until the repertoire author writes them): simulated learners take Today's plan every day from X2 through
// U12–U17, the checkpoints U13.CP, U14.CP and U17.CP, the capstones C6, C7 and CF-A, CF-T in the gym slots, the end
// of the core at session 185 (CF-A.S4), and sixty days beyond it. Checked every day, against the server's own answers
// and an independent model of contracts §2.4, §2.5, §2.6, §4.3, §9.1 and wave6.md §5:
//  - the warm-up stays within the budget of the day's kind (lesson 4/5/6 minutes by target, checkpoint, capstone
//    and CF-T 3, gym 4);
//  - nothing is scheduled before it opens: a lesson after the lessons before it, a checkpoint after its units'
//    lessons and on a later day, C6 after U14.CP, C7 after U17.CP, CF-A once C7 is released, CF-T once U15.L01 is
//    completed, capstone sessions in order;
//  - CF-T only in a transcription slot (4 sessions since the last transcription session, reviews-only sessions
//    counted, d19), never while a core capstone is in progress; a gym slot only when CF-T has nothing to do;
//  - a core capstone in progress is never interrupted; C6, C7, CF-A and CF-T have exactly their 2, 3, 4 and 4
//    sessions and release at the last;
//  - each track gate is announced once (J/R at U13.CP, J.chord-scales at U14.CP, J.forms at U15.L06,
//    J.reharmonization at U17.CP) and never in a later session;
//  - `plan.core` moves in-progress → lessons-done → complete and never back; the session that completes the core
//    carries `coreComplete` once; after it Today is a review, gym, keep-alive, Studio or open-capstone day with
//    `plan.tracks` set, never an error, and the gym slot keeps its every-5th-session rhythm on review days (d19);
//  - backup → import into a fresh server → the same plan, gym, ladder, tracks, completion, capstones and progress.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  CapstoneSessions,
  CoreCompletion,
  CourseProgress,
  GymPlan,
  GymSession,
  LadderItem,
  LadderState,
  SessionPlan,
  SessionSummary,
} from "@oak/api";
import type { ContentSource } from "./content/types.ts";
import { realCourse } from "./testing/course.ts";
import { gradeResult, type Harness, harness } from "./testing/harness.ts";
import { rng, SimLearner } from "./testing/learner.ts";
import { withX2 } from "./testing/wave5.ts";
import { withCft } from "./testing/wave6.ts";

let course: ContentSource;
beforeAll(async () => {
  const units = ["U00", "U01", "U02", "U03", "U04", "U05", "U06", "U07", "U08", "U09", "U10", "U11"];
  const real = await realCourse({
    standInUnits: [...units, "U12", "U13", "U14", "U15", "U16", "U17", "A1"],
  });
  // A1.L05–L07 are track lessons for a later wave: not stood in.
  const lessons = real.lessons.filter(
    (l) => !/^A1\.L0[5-7]$/.test(l.id) || l.title.indexOf("(stand-in)") < 0,
  );
  course = withCft(withX2({ ...real, lessons }));
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const START = Date.parse("2026-11-14T17:00:00.000Z");
const BUDGET = { lesson: { 15: 240, 20: 300, 25: 360 }, checkpoint: 180, capstone: 180, gym: 240 } as const;
const DAYS_AFTER_CORE = 60;

interface Profile {
  name: string;
  seed: number;
  target: 15 | 20 | 25;
  from: string;
  skip: number;
  backupEvery: number;
}
const PROFILES: Profile[] = [
  { name: "whole-way", seed: 61, target: 20, from: "after X2 (U12.L02 next)", skip: 0.06, backupEvery: 41 },
  {
    name: "short-days",
    seed: 62,
    target: 15,
    from: "tracks open (after U13.CP)",
    skip: 0.18,
    backupEvery: 29,
  },
  // integrate:server: the whole default order of contracts 1.6 from U05 on — U05.L09 (d17), the four-session C3
  // (d13), X1's gym sets, X2, every checkpoint and capstone — to session 185 and sixty days beyond.
  { name: "from-U05", seed: 63, target: 25, from: "after U05.L04", skip: 0.1, backupEvery: 67 },
];

const isTranscription = (id: string) =>
  id.startsWith("GYM.") || /^X\d+\.S\d+$/.test(id) || id.startsWith("CF-T.");
const isCore = (id: string) => /^U\d+\./.test(id) || /^(C\d+|X\d+|CF-A)\.S\d+$/.test(id);
/** What opens each Wave 6 capstone (contracts §2.4; wave6.md §5.1). */
const CAPSTONE_GATE: Record<string, string> = {
  C6: "U14.CP",
  C7: "U17.CP",
  "CF-A": "C7.S3",
  "CF-T": "U15.L01",
};
const SESSIONS: Record<string, number> = { C6: 2, C7: 3, "CF-A": 4, "CF-T": 4 };
/** The track gates and what meets each (contracts §4.3). */
const GATE_SOURCE: Record<string, string> = {
  "J.main": "U13.CP",
  "R.main": "U13.CP",
  "J.chord-scales": "U14.CP",
  "J.forms": "U15.L06",
  "J.reharmonization": "U17.CP",
};
const CORE_RANK = { "in-progress": 0, "lessons-done": 1, complete: 2 } as const;

class Sim {
  readonly me: SimLearner;
  readonly r: () => number;
  readonly failures: string[] = [];
  readonly history: string[] = [];
  readonly lessonDay = new Map<string, string>();
  readonly kinds = new Map<string, number>();
  readonly announced = new Map<string, string>();
  gyms = 0;
  cftSlots = 0;
  gymsAfterCore = 0;
  backups = 0;
  coreRank = 0;
  coreCompleteSeen = 0;
  coreDay: string | null = null;
  daysAfterCore = 0;
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
  /** Sessions since the last transcription session: core sessions until the core is complete, and reviews-only ones. */
  sinceLast(): number | null {
    const start = this.history.indexOf("U07.L01");
    if (start < 0) return null;
    let n = 0;
    for (let i = this.history.length - 1; i >= start; i--) {
      const id = this.history[i] as string;
      if (isTranscription(id) || id === "CORE") break;
      if (isCore(id) || id.startsWith("review:")) n++;
    }
    return n;
  }
  /** A core capstone in progress (CF-T is not one: its sessions run in the slots), and its next session. */
  inProgress(): string | null {
    for (const c of course.capstones) {
      if (c.id === "CF-T") continue;
      const n = c.sessions;
      if (this.done(`${c.id}.S1`) && !this.done(`${c.id}.S${n}`))
        for (let k = 2; k <= n; k++) if (!this.done(`${c.id}.S${k}`)) return `${c.id}.S${k}`;
    }
    return null;
  }
  cftNext(): string | null {
    if (!this.done("U15.L01")) return null;
    for (let k = 1; k <= 4; k++) if (!this.done(`CF-T.S${k}`)) return `CF-T.S${k}`;
    return null;
  }
  coreItemsDone(): boolean {
    const order = course.syllabus.defaultOrder as readonly string[];
    return order.filter((x) => /^U\d+\.(L\d+|CP)$/.test(x)).every((x) => this.done(x));
  }

  check(day: string, plan: SessionPlan): void {
    const budget =
      plan.kind === "lesson" || plan.kind === "review" || plan.kind === "light"
        ? BUDGET.lesson[this.p.target]
        : plan.kind === "checkpoint"
          ? BUDGET.checkpoint
          : plan.kind === "capstone"
            ? BUDGET.capstone
            : plan.kind === "gym"
              ? BUDGET.gym
              : null;
    if (budget !== null && plan.warmup.budgetSec !== budget)
      this.fail(day, `${plan.kind} warm-up budget ${plan.warmup.budgetSec}, want ${budget}`);
    if (plan.warmup.plannedSec > plan.warmup.budgetSec)
      this.fail(day, `warm-up ${plan.warmup.plannedSec}s over the ${plan.warmup.budgetSec}s budget`);
    const id = plan.mapItemId as string | null;
    const since = this.sinceLast();
    const inProgress = this.inProgress();
    const cft = this.cftNext();

    // The core's stage never goes back; `complete` only once every lesson, checkpoint and capstone is done.
    const rank = CORE_RANK[plan.core ?? "in-progress"];
    if (rank < this.coreRank) this.fail(day, `plan.core went back to ${plan.core}`);
    this.coreRank = Math.max(this.coreRank, rank);
    if (plan.core === "complete" && !(this.done("CF-A.S4") && this.done("CF-T.S4") && this.done("C7.S3")))
      this.fail(day, "core complete before CF-A, CF-T and C7 are released");
    if (plan.core === "lessons-done" && !this.coreItemsDone())
      this.fail(day, "lessons-done with lessons left");

    if (plan.kind === "gym") {
      const want = `GYM.${String(this.gyms + 1).padStart(2, "0")}`;
      if (id !== want) this.fail(day, `gym ${id}, want ${want}`);
      if ((since ?? 0) < 4) this.fail(day, `a gym slot after ${since} sessions`);
      if (inProgress !== null) this.fail(day, `a gym slot interrupted ${inProgress}`);
      if (cft !== null) this.fail(day, `a gym session in the slot while CF-T has ${cft} to do`);
      if (plan.slot?.fills !== "gym") this.fail(day, `gym day with slot ${JSON.stringify(plan.slot)}`);
    }
    if (id?.startsWith("CF-T.")) {
      if (!this.done("U15.L01")) this.fail(day, `${id} before U15.L01`);
      if (id !== cft) this.fail(day, `${id}, want ${cft}`);
      if (inProgress !== null) this.fail(day, `${id} interrupted ${inProgress}`);
      const lastResort = this.coreItemsDone();
      if ((since ?? 0) < 4 && !lastResort) this.fail(day, `${id} outside a slot (${since} sessions)`);
      if (plan.slot?.fills !== "cf-t") this.fail(day, `${id} with slot ${JSON.stringify(plan.slot)}`);
      if (plan.kind !== "capstone") this.fail(day, `${id} as a ${plan.kind} day`);
    } else if (
      (since ?? 0) >= 4 &&
      inProgress === null &&
      plan.kind !== "gym" &&
      !(id !== null && /^X\d+\.S/.test(id))
    )
      this.fail(day, `slot due (${since} sessions) but Today offers ${plan.kind} ${id}`);

    if (plan.kind === "lesson" && id !== null) {
      const order = course.syllabus.defaultOrder as readonly string[];
      for (const l of order.slice(0, order.indexOf(id)))
        if (/^U\d+\.L\d+$/.test(l) && course.lessons.some((x) => x.id === l) && !this.done(l))
          this.fail(day, `${id} before ${l}`);
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
      const cap = id.replace(/\.S\d+$/, "");
      const gate = CAPSTONE_GATE[cap];
      if (gate !== undefined && !this.done(gate)) this.fail(day, `${id} before ${gate}`);
      const n = Number(id.split(".S")[1]);
      if (n > 1 && !this.done(id.replace(/S\d+$/, `S${n - 1}`)))
        this.fail(day, `${id} before the session before`);
      if (SESSIONS[cap] !== undefined && n > (SESSIONS[cap] as number))
        this.fail(day, `${id}: too many sessions`);
    }
    if (inProgress !== null && id !== inProgress)
      this.fail(day, `capstone in progress: Today offers ${plan.kind} ${id}, want ${inProgress}`);
    if (this.coreDay !== null) {
      if (!["review", "gym", "keepalive", "studio", "capstone", "light"].includes(plan.kind))
        this.fail(day, `after the core Today is ${plan.kind}`);
      if (plan.kind === "lesson" || plan.kind === "checkpoint")
        this.fail(day, `after the core: ${plan.kind} ${id}`);
      if (plan.tracks === null || plan.tracks === undefined)
        this.fail(day, "after the core plan.tracks is null");
    }
  }

  summary(day: string, s: SessionSummary): void {
    for (const g of s.gatesOpened ?? []) {
      if (this.announced.has(g.gateId)) this.fail(day, `${g.gateId} announced twice`);
      this.announced.set(g.gateId, day);
      const need = GATE_SOURCE[g.gateId];
      if (need !== undefined && !this.done(need)) this.fail(day, `${g.gateId} announced before ${need}`);
    }
    if ((s.coreComplete ?? null) !== null) {
      this.coreCompleteSeen++;
      if (s.coreComplete?.stage !== "complete")
        this.fail(day, `coreComplete with stage ${s.coreComplete?.stage}`);
      if (!this.done("CF-A.S4")) this.fail(day, "coreComplete before CF-A.S4");
      this.coreDay = day;
      this.history.push("CORE");
    }
  }

  async day(): Promise<void> {
    const plan = await this.me.today();
    const day = plan.day;
    this.kinds.set(plan.kind, (this.kinds.get(plan.kind) ?? 0) + 1);
    this.check(day, plan);
    const gym = await this.me.api<GymPlan>("GET", "/api/gym");
    if (gym.active !== this.done("U07.L01")) this.fail(day, `gym.active ${gym.active}`);
    const cftDay = (plan.mapItemId as string | null)?.startsWith("CF-T.") === true;
    if (cftDay && gym.cfT?.takesSlot !== true)
      this.fail(day, `CF-T day but gym.cfT ${JSON.stringify(gym.cfT)}`);
    if (cftDay && gym.next !== null) this.fail(day, "CF-T day but gym.next is set");

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
        const gates = (outcome.gatesOpened ?? []).map((g) => g.gateId).sort();
        const want = Object.entries(GATE_SOURCE)
          .filter(([, src]) => src === id)
          .map(([g]) => g)
          .sort();
        if (JSON.stringify(gates) !== JSON.stringify(want))
          this.fail(day, `${id} opened ${gates.join(" ") || "nothing"}, want ${want.join(" ") || "nothing"}`);
        break;
      }
      case "capstone":
        if (id === null) break;
        if (id.startsWith("CF-T.")) this.cftSlots++;
        await this.capstone(day, id, ses.id);
        break;
      case "gym":
        await this.gymDay(day, id as string, ses.id);
        if (this.coreDay !== null) this.gymsAfterCore++;
        break;
      default:
        if (plan.kind === "review" && this.done("U07.L01")) this.history.push(`review:${day}`);
        break;
    }
    const summary = await this.me.endSession(ses.id);
    this.summary(day, summary);
    if (this.coreDay !== null && this.coreDay !== day) this.daysAfterCore++;
  }

  async capstone(day: string, sessionId: string, oakSession: string): Promise<void> {
    const cap = sessionId.replace(/\.S\d+$/, "");
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
    // Checks in order (CF-T: the form map, then the bass section by section; the changes; the melody). A check whose
    // `after` is not cleared is closed and refused.
    for (const c of mine?.checks ?? []) {
      const now = await this.me.api<CapstoneSessions>("GET", `/api/capstones/${cap}/sessions`);
      const st = now.sessions
        .flatMap((s) => s.checks)
        .find((x) => x.checkId === c.checkId && x.stage === c.stage);
      const r = await this.h.json("POST", `/api/capstones/${cap}/checks/${c.checkId}`, {
        capstoneSessionId: sessionId,
        stage: c.stage,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        result: gradeResult({ exerciseId: `${cap}/${c.checkId}`, score: 1, mode: "capstone" }),
      });
      if (st?.open !== true) {
        if (r.status !== 409) this.fail(day, `${cap} ${c.checkId} recorded while closed (${r.status})`);
      } else if (r.status !== 200) this.fail(day, `${cap} ${c.checkId} → ${r.status}`);
    }
    if (last) {
      const hasRubric =
        def?.kind !== "transcribe" || (def.sessionDefs ?? []).some((s) => (s.rubric ?? []).length > 0);
      if (hasRubric)
        await this.me.api("POST", `/api/capstones/${cap}/checks`, {
          sessionId: oakSession,
          sketchId: sk.id,
          sketchVersion: sk.currentVersion,
          result: gradeResult({ exerciseId: `${cap}/brief`, score: 0.95, mode: "capstone" }),
        });
      const rel = await this.h.json("POST", `/api/capstones/${cap}/release`, {
        sessionId: oakSession,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        title: cap,
        flavour: null,
        linerNotesMd: `${cap}, first take.`,
        theoryTags: [],
        includeReviewNote: false,
      });
      if (rel.status !== 200) this.fail(day, `${cap} release → ${rel.status} ${JSON.stringify(rel.body)}`);
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

  async gymDay(day: string, gymId: string, oakSession: string): Promise<void> {
    const before = await this.me.api<LadderState>("GET", "/api/ladder");
    if (before.levelUp !== null) {
      const to = before.levelUp.to;
      if (to === 7) this.fail(day, "L7 offered as a ladder level (own audio is never an item)");
      if (to === 8 && !this.done("CF-T.S4")) this.fail(day, "L8 offered before CF-T is released");
      await this.me.api("PUT", "/api/ladder", { level: to });
      this.levelUps.push(to);
    }
    const g = await this.me.api<GymSession>("POST", "/api/gym/sessions", {
      sessionId: oakSession,
      kind: "ladder",
      transcriptionId: null,
    });
    if (g.gymId !== gymId) this.fail(day, `gym.start gave ${g.gymId}, Today said ${gymId}`);
    const item = await this.me.api<LadderItem>("POST", "/api/ladder/items", { sessionId: oakSession, gymId });
    const submit = (extra: Record<string, unknown>) =>
      this.h.json("POST", `/api/ladder/items/${item.itemId}/submissions`, {
        sessionId: oakSession,
        code: 'drums: s("bd sd")',
        rung: 0,
        ...extra,
      });
    if (item.level === 8) {
      const song = course.songs.find((s) => s.id === item.song?.songId);
      const sections = song?.answerKey.sections ?? [];
      const r = await submit({
        stage: "form",
        formMap: { sections: sections.map((s) => s.label), bars: sections.map((s) => s.bars[0]) },
      });
      if (r.status !== 200) this.fail(day, `L8 form map → ${r.status}`);
    } else if (item.level === 5)
      for (let k = 1; k <= (item.phrases?.length ?? 0); k++) await submit({ phrase: k });
    else if (item.level === 6) {
      await submit({ stage: "bass" });
      await submit({ stage: "changes" });
    } else if (item.stages === null) await submit({});
    else for (const stage of item.stages) await submit({ stage });
    this.gyms++;
    this.history.push(g.gymId);
  }

  async views(h: Harness) {
    const get = async (path: string) => (await h.json("GET", path)).body;
    return {
      today: await get("/api/session/today"),
      gym: await get("/api/gym"),
      ladder: await get("/api/ladder"),
      songs: await get("/api/ladder/songs"),
      progress: await get("/api/lessons/progress"),
      tracks: await get("/api/tracks"),
      completion: await get("/api/course/completion"),
      c6: await get("/api/capstones/C6/sessions"),
      c7: await get("/api/capstones/C7/sessions"),
      cfa: await get("/api/capstones/CF-A/sessions"),
      cft: await get("/api/capstones/CF-T/sessions"),
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

describe("Wave 6 simulation: through session 185 (CF-A.S4) and sixty days beyond, over HTTP", () => {
  for (const p of PROFILES)
    test(`${p.name}: every day per the rules, CF-T in the slots, the core completed once, then review days`, async () => {
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
        for (const [g, src] of Object.entries(GATE_SOURCE)) if (sim.done(src)) sim.announced.set(g, "seed");
        let t = START;
        for (let d = 0; d < 420 && sim.daysAfterCore < DAYS_AFTER_CORE; d++) {
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
          `CF-T slots ${sim.cftSlots}`,
          `gyms ${sim.gyms} (after the core ${sim.gymsAfterCore})`,
          `levels ${sim.levelUps.join(" ")}`,
          `core ${sim.coreDay}`,
          `backups ${sim.backups}`,
        );
        expect(sim.failures.slice(0, 30)).toEqual([]);
        const order = (id: string) => sim.history.indexOf(id);
        for (const id of ["U13.CP", "U14.CP", "U17.CP", "C6.S2", "C7.S3", "CF-T.S4", "CF-A.S4"])
          expect({ id, done: sim.done(id) }).toEqual({ id, done: true });
        expect(order("U14.CP")).toBeLessThan(order("C6.S1"));
        expect(order("U17.CP")).toBeLessThan(order("C7.S1"));
        expect(order("C7.S3")).toBeLessThan(order("CF-A.S1"));
        expect(order("U15.L01")).toBeLessThan(order("CF-T.S1"));
        expect(sim.cftSlots).toBe(4);
        expect(sim.coreCompleteSeen).toBe(1);
        expect(sim.daysAfterCore).toBeGreaterThanOrEqual(DAYS_AFTER_CORE);
        for (const g of Object.keys(GATE_SOURCE))
          expect({ g, announced: sim.announced.has(g) }).toEqual({ g, announced: true });
        const completion = await sim.me.api<CoreCompletion>("GET", "/api/course/completion");
        expect(completion.stage).toBe("complete");
        expect(completion.completedAt).not.toBeNull();
        expect(completion.remaining).toEqual([]);
        const progress = await sim.me.api<CourseProgress>("GET", "/api/lessons/progress");
        expect(progress.core).toBe("complete");
        expect(sim.gymsAfterCore).toBeGreaterThan(0);
        expect(sim.backups).toBeGreaterThanOrEqual(2);
      } finally {
        await h.close();
      }
    }, 900_000);
});
