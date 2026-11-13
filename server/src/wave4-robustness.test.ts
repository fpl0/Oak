// Adversarial review of Wave 4 data and scheduling (review:robustness): learners with random behaviour walk the
// real course through the HTTP API from "after U04.CP", through U05–U07, three checkpoints, the gym, C2 and X1, and
// on for weeks past the end of written content. Besides taking Today's plan, they retry and misbehave:
//  - every lesson attempt may be sent twice with its idempotency key (it must count once);
//  - before the voicing gate, they try to open it with tutor code, with a revealed answer and with `voicing()`
//    itself at 0.95 (none may open it; only their own typed hand voicing does);
//  - a capstone session completed out of order is refused; a retried check counts once; a gym start retried in the
//    same Oak session keeps its ordinal;
//  - they import their own audio (an own-audio project the even gym slots continue) and record the album.
// Checked every day: the warm-up within its budget, nothing scheduled before it opens, gym ordinals in order, the
// voicing gate opened only by a qualifying typed attempt; and every few days backup → import into a fresh server →
// the same plan, gym plan, ladder, capstone sessions, voicing gate and progress, with every audio file and album
// recording byte for byte.
import { beforeAll, describe, expect, test } from "bun:test";
import type {
  AlbumTrack,
  AudioFile,
  CapstoneSessions,
  GymPlan,
  GymSession,
  LadderItem,
  SessionPlan,
  StepState,
  TranscriptionDetail,
  VoicingGate,
} from "@oak/api";
import type { ContentSource } from "./content/types.ts";
import { reachesGatedHelpers } from "./services/unlocks.ts";
import { realCourse } from "./testing/course.ts";
import { gradeResult, type Harness, harness } from "./testing/harness.ts";
import { rng, SimLearner } from "./testing/learner.ts";

let course: ContentSource;
beforeAll(async () => {
  course = await realCourse({ standInUnits: ["U00", "U01", "U02", "U03", "U04", "U05", "U06", "U07"] });
});

const DAY = 86_400_000;
const START = Date.parse("2026-11-11T17:00:00.000Z");
const BUDGET = { lesson: { 15: 240, 20: 300, 25: 360 }, checkpoint: 180, capstone: 180, gym: 240 } as const;
const GATE = "U05.L07/hand-voiced-cadence";

/** A short mono 16-bit PCM WAV with a sine at `hz` (distinct bytes per call). */
function wav(seconds: number, hz: number): Uint8Array {
  const rate = 8000;
  const n = Math.round(seconds * rate);
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++)
    v.setInt16(44 + i * 2, Math.round(8000 * Math.sin((2 * Math.PI * hz * i) / rate)), true);
  return new Uint8Array(buf);
}

interface Profile {
  name: string;
  seed: number;
  target: 15 | 20 | 25;
  skip: number;
  backupEvery: number;
}
const PROFILES: Profile[] = [
  { name: "restless", seed: 1201, target: 25, skip: 0.15, backupEvery: 17 },
  { name: "irregular", seed: 1202, target: 15, skip: 0.3, backupEvery: 23 },
];

class Robust {
  readonly me: SimLearner;
  readonly r: () => number;
  readonly failures: string[] = [];
  readonly done = new Set<string>();
  gyms = 0;
  audioProject: string | null = null;
  recordings = 0;
  retriedAttempts = 0;
  hostileGateTries = 0;
  outOfOrderRefused = 0;
  reviewDaysPastContent = 0;
  backups = 0;

  constructor(
    readonly h: Harness,
    readonly p: Profile,
  ) {
    this.me = new SimLearner(h, course, p.seed);
    this.r = rng(p.seed * 31);
  }
  fail(day: string, what: string): void {
    if (this.failures.length < 40) this.failures.push(`[${this.p.name} ${day}] ${what}`);
  }

  async check(day: string, plan: SessionPlan): Promise<void> {
    const budget =
      plan.kind === "checkpoint"
        ? BUDGET.checkpoint
        : plan.kind === "capstone"
          ? BUDGET.capstone
          : plan.kind === "gym"
            ? BUDGET.gym
            : BUDGET.lesson[this.p.target];
    if (plan.warmup.plannedSec > plan.warmup.budgetSec || plan.warmup.budgetSec > budget)
      this.fail(day, `warm-up ${plan.warmup.plannedSec}/${plan.warmup.budgetSec}s for a ${plan.kind} day`);
    const id = plan.mapItemId as string | null;
    if (plan.kind === "gym") {
      if (!this.done.has("U07.L01")) this.fail(day, "a gym day before U07.L01");
      const want = `GYM.${String(this.gyms + 1).padStart(2, "0")}`;
      if (id !== want) this.fail(day, `gym ${id}, want ${want}`);
    }
    if (plan.kind === "lesson" && id !== null) {
      const order = course.syllabus.defaultOrder as readonly string[];
      for (const l of order.slice(0, order.indexOf(id)))
        if (/^U\d+\.L\d+$/.test(l) && course.lessons.some((x) => x.id === l) && !this.done.has(l))
          this.fail(day, `${id} offered before ${l}`);
    }
    if (plan.kind === "checkpoint" && id !== null) {
      const unit = id.replace(".CP", "");
      for (const l of course.lessons.filter((x) => x.id.startsWith(`${unit}.`)))
        if (!this.done.has(l.id)) this.fail(day, `${id} offered before ${l.id}`);
    }
    if (plan.kind === "capstone" && id !== null) {
      if (id.startsWith("C2.") && !this.done.has("U07.CP")) this.fail(day, `${id} before U07.CP`);
      if (id.startsWith("X1.") && !this.done.has("C2.S2")) this.fail(day, `${id} before C2 is released`);
      const n = Number(id.split(".S")[1]);
      if (n > 1 && !this.done.has(id.replace(/S\d+$/, `S${n - 1}`))) this.fail(day, `${id} before S${n - 1}`);
    }
    // The voicing gate: open only through a qualifying typed attempt, never through code that reaches the helpers.
    const gate = await this.me.api<VoicingGate>("GET", "/api/gates/voicing");
    if (gate.passed && (gate.passedCode === null || reachesGatedHelpers(gate.passedCode ?? "")))
      this.fail(day, `the voicing gate opened on ${JSON.stringify(gate.passedCode)}`);
    if (gate.passed && !this.done.has("U05.L07") && !this.done.has("U05.L08"))
      this.fail(day, "the voicing gate opened before its lesson");
  }

  /** Each graded step once, sometimes sent twice with its idempotency key; the gate step is attacked first. */
  async lesson(day: string, lessonId: string, sessionId: string): Promise<void> {
    const def = this.me.lesson(lessonId);
    for (const step of def.steps) {
      await this.me.api("PUT", `/api/lessons/${lessonId}/position`, {
        sessionId,
        stepId: step.id,
        splitPart: null,
        wrapped: false,
      });
      const ex = step.exercise;
      if (ex === undefined) continue;
      const global = `${lessonId}/${ex.id}`;
      const post = (score: number, code: string, over: { tutorAssisted?: boolean; key?: string } = {}) =>
        this.h.json("POST", `/api/lessons/${lessonId}/steps/${step.id}/attempts`, {
          sessionId,
          exerciseId: ex.id,
          exerciseVersion: ex.version,
          seriesNo: 0,
          params: null,
          response: { code },
          result: gradeResult({ exerciseId: global, score }),
          extraReplays: 0,
          activeMs: 20_000,
          tutorAssisted: over.tutorAssisted ?? false,
          ...(over.key ? { idempotencyKey: over.key } : {}),
        });
      if (global === GATE) {
        // Code the learner did not type, and code that reaches voicing() itself: never the gate.
        await post(0.97, 'chords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>")', {
          tutorAssisted: true,
        });
        await post(0.95, 'chords: n("0").chord("<C F G C>")["voi" + "cing"]()');
        await post(0.95, 'chords: chord("<C F G C>").voicing()');
        this.hostileGateTries += 3;
        const g = await this.me.api<VoicingGate>("GET", "/api/gates/voicing");
        if (g.passed) this.fail(day, "the voicing gate opened on tutor code or voicing()");
      }
      const before = await this.me.api<StepState>("GET", `/api/lessons/${lessonId}/steps/${step.id}`);
      const key = `${this.p.name}-${day}-${lessonId}-${step.id}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64);
      const code = 'chords: note("<[c4,e4,g4] [c4,f4,a4] [b3,d4,g4] [c4,e4,g4]>")';
      const first = await post(0.9 + this.r() * 0.1, code, { key });
      if (first.status !== 200) this.fail(day, `${global} attempt ${first.status}`);
      if (this.r() < 0.3) {
        const again = await post(0.9, code, { key }).catch(() => null);
        // The same key with a different body is a conflict; the same body would be the stored answer.
        if (again === null || (again.status !== 200 && again.status !== 409))
          this.fail(day, `${global} retry ${again?.status}`);
        this.retriedAttempts++;
      }
      const after = await this.me.api<StepState>("GET", `/api/lessons/${lessonId}/steps/${step.id}`);
      if (after.seriesNo === before.seriesNo && after.attempts > before.attempts + 1)
        this.fail(day, `${global}: a retried attempt counted twice (${before.attempts} → ${after.attempts})`);
    }
  }

  async capstone(day: string, sessionId: string, oakSession: string): Promise<void> {
    const cap = sessionId.split(".")[0] as string;
    const def = course.capstones.find((c) => c.id === cap);
    const total = def?.sessions ?? 1;
    const n = Number(sessionId.split(".S")[1]);
    const last = n === total;
    const sk = await this.me.sketch(`${cap} draft`, "capstone", cap, oakSession);
    // Out of order: the session after this one cannot be completed first.
    if (n < total) {
      const skip = await this.h.json("POST", `/api/capstones/${cap}/sessions`, {
        sessionId: oakSession,
        capstoneSessionId: `${cap}.S${n + 1}`,
        sketchId: sk.id,
        flavour: null,
      });
      if (skip.status !== 409)
        this.fail(day, `${cap}.S${n + 1} completed before ${sessionId}: ${skip.status}`);
      else this.outOfOrderRefused++;
    }
    const ss = await this.me.api<CapstoneSessions>("POST", `/api/capstones/${cap}/drafts`, {
      capstoneSessionId: sessionId,
      sessionId: oakSession,
      sketchId: sk.id,
      sketchVersion: sk.currentVersion,
    });
    const mine = ss.sessions.find((s) => s.capstoneSessionId === sessionId);
    for (const c of mine?.checks ?? []) {
      const body = {
        capstoneSessionId: sessionId,
        stage: c.stage,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        result: gradeResult({ exerciseId: `${cap}/${c.checkId}`, score: 0.93, mode: "capstone" }),
        idempotencyKey: `${this.p.name}-${sessionId}-${c.checkId}-${c.stage ?? "x"}`
          .replace(/[^A-Za-z0-9_-]/g, "_")
          .slice(0, 64),
      };
      await this.me.api("POST", `/api/capstones/${cap}/checks/${c.checkId}`, body);
      const twice = await this.me.api<CapstoneSessions>(
        "POST",
        `/api/capstones/${cap}/checks/${c.checkId}`,
        body,
      );
      const row = twice.sessions
        .find((s) => s.capstoneSessionId === sessionId)
        ?.checks.find((x) => x.checkId === c.checkId && x.stage === c.stage);
      if (row?.attempts !== 1)
        this.fail(day, `${cap}/${c.checkId}.${c.stage}: a retried check counted ${row?.attempts}`);
    }
    if (last) {
      await this.me.api("POST", `/api/capstones/${cap}/checks`, {
        sessionId: oakSession,
        sketchId: sk.id,
        sketchVersion: sk.currentVersion,
        result: gradeResult({ exerciseId: `${cap}/brief`, score: 0.95, mode: "capstone" }),
      });
      const rel = await this.me.api<{ track: { id: string; currentVersion: number } }>(
        "POST",
        `/api/capstones/${cap}/release`,
        {
          sessionId: oakSession,
          sketchId: sk.id,
          sketchVersion: sk.currentVersion,
          title: cap,
          flavour: null,
          linerNotesMd: `${cap}, first take.`,
          theoryTags: [],
          includeReviewNote: false,
        },
      );
      // The release's recording, as the app uploads it after rendering.
      const rec = await this.h.req(
        "PUT",
        `/api/album/tracks/${rel.track.id}/versions/${rel.track.currentVersion}/audio`,
        wav(1 + this.recordings, 330 + 10 * this.recordings),
        { "content-type": "audio/wav" },
      );
      if (rec.status !== 200) this.fail(day, `album recording ${rec.status}`);
      else this.recordings++;
      for (let k = 1; k <= total; k++) this.done.add(`${cap}.S${k}`);
    } else {
      await this.me.api("POST", `/api/capstones/${cap}/sessions`, {
        sessionId: oakSession,
        capstoneSessionId: sessionId,
        sketchId: sk.id,
        flavour: null,
      });
      this.done.add(sessionId);
    }
  }

  async gym(day: string, plan: SessionPlan, oakSession: string): Promise<void> {
    const gymPlan = await this.me.api<GymPlan>("GET", "/api/gym");
    const next = gymPlan.next;
    const ownAudio = next?.kind === "own-audio" && next.transcriptionId !== null && !next.ownAudioFallback;
    const body = {
      sessionId: oakSession,
      kind: ownAudio ? ("own-audio" as const) : ("ladder" as const),
      transcriptionId: ownAudio ? next.transcriptionId : null,
    };
    const g = await this.me.api<GymSession>("POST", "/api/gym/sessions", body);
    // A retried start in the same Oak session keeps the ordinal.
    const again = await this.me.api<GymSession>("POST", "/api/gym/sessions", body);
    if (again.gymId !== g.gymId) this.fail(day, `a retried gym start took ${again.gymId} after ${g.gymId}`);
    if (g.gymId !== plan.mapItemId) this.fail(day, `gym.start gave ${g.gymId}, Today said ${plan.mapItemId}`);
    if (ownAudio && this.audioProject !== null) {
      await this.me.api("PATCH", `/api/transcriptions/${this.audioProject}`, {
        checklist: { contour: 1 + Math.round(this.r()), rhythm: 1, landing: 1 },
      });
      await this.me.api("POST", `/api/transcriptions/${this.audioProject}/versions`, {
        sessionId: oakSession,
        code: 'mel: n("0 2 4 2").scale("C4:major").s("piano")',
        result: null,
        ranOk: true,
      });
    } else {
      const item = await this.me.api<LadderItem>("POST", "/api/ladder/items", {
        sessionId: oakSession,
        gymId: g.gymId,
      });
      await this.me.api("POST", `/api/ladder/items/${item.itemId}/submissions`, {
        sessionId: oakSession,
        code: 'drums: s("bd sd")',
        rung: 0,
        ...(item.stages === null ? {} : { stage: item.stages[0] }),
      });
    }
    if (plan.note !== null && /X1/.test(plan.note))
      await this.me.strongSet(oakSession, "fam.mel.dictation", "gym");
    // Once the gym runs, the learner brings a recording of their own: the even slots continue it.
    if (this.audioProject === null && this.gyms >= 1) {
      const up = await this.h.req(
        "POST",
        `/api/audio?name=${encodeURIComponent("my song.wav")}`,
        wav(2, 220),
        {
          "content-type": "audio/wav",
        },
      );
      const file = (await up.json()) as AudioFile;
      const t = await this.me.api<TranscriptionDetail>("POST", "/api/transcriptions", {
        sourceKind: "own-audio",
        audioId: file.id,
        songId: null,
        title: "My song",
        artist: null,
        ladderLevel: null,
        templateId: null,
      });
      await this.h.req("PUT", `/api/audio/${file.id}/peaks`, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
      this.audioProject = t.id;
    }
    this.gyms++;
  }

  async day(): Promise<void> {
    const plan = await this.me.today();
    const day = plan.day;
    await this.check(day, plan);
    const ses = await this.me.startSession(plan);
    for (const item of plan.warmup.items) await this.me.doItem(ses.id, item);
    const id = plan.mapItemId as string | null;
    switch (plan.kind) {
      case "lesson":
        await this.lesson(day, id as string, ses.id);
        await this.me.completeLesson(id as string, ses.id);
        this.done.add(id as string);
        break;
      case "checkpoint": {
        const { outcome } = await this.me.checkpoint(id as string, ses.id, {
          gating: 0.95,
          levelSetting: 0.9,
        });
        if (outcome.passed) this.done.add(id as string);
        else this.fail(day, `${id} failed at 0.95`);
        break;
      }
      case "capstone":
        await this.capstone(day, id as string, ses.id);
        break;
      case "gym":
        await this.gym(day, plan, ses.id);
        break;
      default:
        if (this.done.has("X1.S3")) this.reviewDaysPastContent++;
    }
    await this.me.endSession(ses.id);
  }

  /** Export, import into a fresh server: the same views, and every recording byte for byte. */
  async backupRoundTrip(day: string): Promise<void> {
    const media = async (h: Harness): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      const items = (await h.json<{ items: { audioId: string | null }[] }>("GET", "/api/transcriptions")).body
        .items;
      for (const id of new Set(items.map((x) => x.audioId).filter((x): x is string => x !== null))) {
        const res = await h.req("GET", `/api/audio/${id}`);
        out[`audio/${id}`] = `${res.status}:${Bun.hash(new Uint8Array(await res.arrayBuffer()))}`;
        const pk = await h.req("GET", `/api/audio/${id}/peaks`);
        out[`peaks/${id}`] = `${pk.status}:${Bun.hash(new Uint8Array(await pk.arrayBuffer()))}`;
      }
      const album = (await h.json<{ tracks: AlbumTrack[] }>("GET", "/api/album")).body.tracks;
      for (const t of album)
        for (let v = 1; v <= t.currentVersion; v++) {
          const res = await h.req("GET", `/api/album/tracks/${t.id}/versions/${v}/audio`);
          out[`album/${t.capstoneId}/v${v}`] =
            `${res.status}:${Bun.hash(new Uint8Array(await res.arrayBuffer()))}`;
        }
      return out;
    };
    const views = async (h: Harness) => {
      const get = async (path: string) => (await h.json("GET", path)).body;
      return {
        today: await get("/api/session/today"),
        gym: await get("/api/gym"),
        ladder: await get("/api/ladder"),
        c2: await get("/api/capstones/C2/sessions"),
        x1: await get("/api/capstones/X1/sessions"),
        voicing: await get("/api/gates/voicing"),
        progress: await get("/api/lessons/progress"),
        transcriptions: await get("/api/transcriptions"),
        // The learner's own audio and the album's recordings as Settings › Data counts them (sizes of the
        // database itself differ: the fresh server prepares its own day).
        audioInfo: await get("/api/backup").then((b) => {
          const { ownAudio, albumAudioBytes } = b as { ownAudio: unknown; albumAudioBytes: unknown };
          return { ownAudio, albumAudioBytes };
        }),
        media: await media(h),
      };
    };
    const before = await views(this.h);
    const exp = await this.h.req("GET", "/api/backup/export");
    const archive = new Uint8Array(await exp.arrayBuffer());
    const fresh = await harness({ dev: true, content: course, now: this.h.clock.now().toISOString() });
    try {
      const imp = await fresh.destructive("POST", "/api/backup/import", "backup.import", "*", archive);
      if (imp.status !== 200) this.fail(day, `import ${imp.status} ${await imp.text()}`);
      const after = await views(fresh);
      for (const k of Object.keys(before) as (keyof typeof before)[])
        if (JSON.stringify(after[k]) !== JSON.stringify(before[k]))
          this.fail(
            day,
            `after restore, ${k} differs: ${JSON.stringify(before[k]).slice(0, 200)} → ${JSON.stringify(after[k]).slice(0, 200)}`,
          );
      this.backups++;
    } finally {
      await fresh.close();
    }
  }
}

describe("Wave 4 robustness: random learners through U07, C2, X1, the gym and past the written course", () => {
  for (const p of PROFILES)
    test(`${p.name}: retries, hostile gate attempts, own audio and recordings, backups`, async () => {
      const h = await harness({ dev: true, content: course, now: new Date(START).toISOString() });
      const sim = new Robust(h, p);
      try {
        await sim.me.api("PUT", "/api/profile", { timezone: "UTC", targetMinutes: p.target });
        const seed = await sim.me.api<{ done: string[] }>("POST", "/api/dev/seed", {
          point: "after U04.CP",
          targetMinutes: p.target,
        });
        for (const id of seed.done) sim.done.add(id);
        let t = START;
        for (let d = 0; d < 260 && sim.reviewDaysPastContent < 40; d++) {
          t += DAY;
          h.clock.set(new Date(t).toISOString());
          if (sim.r() < p.skip) continue;
          await sim.day();
          if (d % p.backupEvery === p.backupEvery - 1) await sim.backupRoundTrip(`day ${d}`);
        }
        await sim.backupRoundTrip("end");
        expect(sim.failures).toEqual([]);
        for (const id of ["U05.L08", "U05.CP", "U06.CP", "U07.CP", "C2.S2", "X1.S3"])
          expect({ id, done: sim.done.has(id) }).toEqual({ id, done: true });
        const gate = await sim.me.api<VoicingGate>("GET", "/api/gates/voicing");
        expect(gate.passed).toBe(true);
        expect(sim.hostileGateTries).toBeGreaterThanOrEqual(3);
        expect(sim.retriedAttempts).toBeGreaterThan(10);
        expect(sim.outOfOrderRefused).toBeGreaterThanOrEqual(2);
        expect(sim.gyms).toBeGreaterThanOrEqual(3);
        expect(sim.recordings).toBe(2);
        expect(sim.reviewDaysPastContent).toBeGreaterThanOrEqual(20);
        expect(sim.backups).toBeGreaterThanOrEqual(4);
        console.log(
          `${p.name}: ${sim.done.size} sessions done, ${sim.gyms} gym days, ${sim.reviewDaysPastContent} review days past the course, ${sim.retriedAttempts} retried attempts, ${sim.backups} backups`,
        );
      } finally {
        await h.close();
      }
    }, 900_000);
});
