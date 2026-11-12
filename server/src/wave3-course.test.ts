// Wave 3 on the real course, over HTTP: the dev seeds other areas' e2e start from (wave3.md §5.5), U03–U04
// server-side (contracts §3 rule 12's silent fallback, family seeding, U03.CP after U04.L01), what Today offers
// when the course runs out of authored lessons (review, Studio, the checkpoint that is due; never an error), and
// voice evidence never gating.
import { beforeAll, describe, expect, test } from "bun:test";
import {
  type DevSeedResult,
  type SessionPlan,
  type SrsCard,
  type Unlock,
  type VoiceState,
  WAVE3_SEED_POINTS,
} from "@oak/api";
import { loadContent } from "./content/loader.ts";
import type { ContentSource } from "./content/types.ts";
import { CONTENT_DIR, realCourse } from "./testing/course.ts";
import { type Harness, harness } from "./testing/harness.ts";
import { SimLearner } from "./testing/learner.ts";

let real: ContentSource;
let course: ContentSource;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
  course = await realCourse();
});

const NOW = "2026-11-11T12:00:00.000Z";
const DAY = 86_400_000;

async function learner(content: ContentSource): Promise<{ h: Harness; me: SimLearner }> {
  const h = await harness({ dev: true, content, now: NOW });
  const me = new SimLearner(h, content);
  await me.api("PUT", "/api/profile", { timezone: "UTC" });
  return { h, me };
}
const written = (c: ContentSource, id: string) => c.lessons.some((l) => l.id === id);

/** What a seeded learner looks like: Today offers only open, written items; every sketch lints clean. */
async function checkSeeded(me: SimLearner, content: ContentSource): Promise<SessionPlan> {
  const { lintOak } = await import("@oak/grader");
  const plan = await me.today();
  if (plan.kind === "lesson") expect(written(content, plan.mapItemId as string)).toBe(true);
  expect(plan.warmup.plannedSec).toBeLessThanOrEqual(plan.warmup.budgetSec);
  const unlocked = new Set(
    (await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items.map((u) => u.itemId as string),
  );
  const sketches = (
    await me.api<{ items: { id: string; originKind: string; originId: string | null }[] }>(
      "GET",
      "/api/sketches",
    )
  ).items.filter((s) => !(s.originKind === "lesson-make" && s.originId?.startsWith("U00")));
  for (const sk of sketches) {
    const versions = (
      await me.api<{ versions: { code: string; version: number }[] }>("GET", `/api/sketches/${sk.id}`)
    ).versions;
    const code = [...versions].sort((a, b) => a.version - b.version).at(-1)?.code ?? "";
    const lint = lintOak(
      code,
      // biome-ignore lint/suspicious/noExplicitAny: the lint's id set is branded
      { profile: "graded", unlocked: unlocked as any, allowPreview: false, meter: "4/4", key: null },
      content.toolbox,
    );
    expect({
      sketch: sk.originId,
      errors: lint.diagnostics.filter((d) => d.severity === "error").map((d) => d.id),
    }).toEqual({
      sketch: sk.originId,
      errors: [],
    });
  }
  // Honest SRS state: every card was seeded by a completed lesson (or a deck it opened), nothing is paused.
  const { cards } = await me.api<{ cards: SrsCard[] }>("GET", "/api/drills/families");
  expect(cards.filter((c) => c.status === "paused")).toEqual([]);
  return plan;
}

describe("the Wave 3 dev seeds on the real content (wave3.md §5.5)", () => {
  test("GET /dev/seed lists every Wave 3 point", async () => {
    const { h, me } = await learner(real);
    try {
      const points = (await me.api<{ items: { point: string }[] }>("GET", "/api/dev/seed")).items.map(
        (p) => p.point,
      );
      for (const p of WAVE3_SEED_POINTS) expect(points).toContain(p);
    } finally {
      await h.close();
    }
  });

  for (const point of WAVE3_SEED_POINTS)
    test(`"${point}": the state its description promises, real course code, a learner with a mic`, async () => {
      const { h, me } = await learner(real);
      try {
        const t0 = performance.now();
        const seeded = await me.api<DevSeedResult>("POST", "/api/dev/seed", { point });
        expect(performance.now() - t0).toBeLessThan(15_000);
        expect(seeded.gapDays).toBe(0);
        expect(seeded.lastActiveDay).toBe("2026-11-10");
        const plan = await checkSeeded(me, real);
        const voice = await me.api<VoiceState>("GET", "/api/voice");
        expect(voice).toMatchObject({ quiet: false, quietReason: null, range: { low: 48, high: 69 } });
        const done = new Set(seeded.done);
        switch (point) {
          case "after U02.CP":
            expect(seeded.done.at(-1)).toBe("U02.CP");
            expect(plan).toMatchObject({ kind: "capstone", mapItemId: "C1.S1" });
            break;
          case "C1 released":
            expect(seeded.done.at(-1)).toBe("C1.S1");
            expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U03.L02" });
            break;
          case "after U03.L02": {
            expect(seeded.done.at(-1)).toBe("U03.L02");
            // The tutor's introduced-terms list (contracts §10.8) holds the terms of the lessons done.
            const terms = (
              await me.api<{ items: { termId: string }[] }>("GET", "/api/terms/introduced")
            ).items.map((t) => t.termId);
            for (const t of real.lessons.find((l) => l.id === "U03.L02")?.terms ?? [])
              expect(terms).toContain(t.id as string);
            const ids = (await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items.map((u) => u.itemId);
            expect(ids).toEqual(expect.arrayContaining(["tb.feature.degree-labels", "tb.n", "tb.scale"]));
            if (written(real, "U03.L03"))
              expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U03.L03" });
            else expect(plan.kind).toBe("review");
            break;
          }
          case "U03.CP due":
            for (let n = 1; n <= 11; n++) expect(done.has(`U03.L${String(n).padStart(2, "0")}`)).toBe(true);
            expect(done.has("U04.L01")).toBe(written(real, "U04.L01"));
            expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U03.CP" });
            break;
          case "after U03.CP":
            expect(done.has("U03.CP")).toBe(true);
            expect(seeded.done.at(-1)).toBe("U03.CP");
            if (plan.kind === "review") expect(plan.alternatives.some((a) => a.kind === "studio")).toBe(true);
            else expect(plan.mapItemId).toMatch(/^U04\.L0[1-4]$/);
            break;
          case "U04.CP due":
            for (let n = 1; n <= 4; n++) expect(done.has(`U04.L0${n}`)).toBe(true);
            expect(done.has("U05.L01")).toBe(false);
            expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U04.CP" });
            break;
          case "after U04.CP": {
            // The end of the authored course: review sets and practice, a clear note, never an error and
            // never a repeat of the last lesson.
            expect(seeded.done.at(-1)).toBe("U04.CP");
            for (let n = 1; n <= 4; n++) expect(done.has(`U04.L0${n}`)).toBe(true);
            expect(done.has("U05.L01")).toBe(false);
            expect(plan).toMatchObject({ kind: "review", mapItemId: null, main: null });
            expect(plan.note).toBe("The next lessons are still being written. Today: a review, then Studio.");
            expect(plan.alternatives).toContainEqual({ kind: "studio", mapItemId: null, title: "Studio" });
            expect(plan.warmup.items.length).toBeGreaterThan(0);
            const progress = await me.api<{ next: string | null }>("GET", "/api/lessons/progress");
            expect(progress.next === null || !written(real, progress.next)).toBe(true);
            // The day can be played: a review session with its sets, then "a little more", then done.
            const ses = await me.api<{ id: string }>("POST", "/api/session/start", {
              kind: "review",
              mapItemId: null,
              targetMinutes: 20,
            });
            for (const item of plan.warmup.items) await me.doItem(ses.id, item);
            const more = await me.api<{ items: unknown[]; plannedSec: number }>("GET", "/api/srs/due?more=1");
            expect(more.plannedSec).toBeGreaterThanOrEqual(0);
            await me.endSession(ses.id);
            const day = await me.api<{ doneForToday: boolean }>("GET", "/api/session/day");
            expect(day.doneForToday).toBe(true);
            expect((await me.today()).kind).toBe("review");
            break;
          }
        }
      } finally {
        await h.close();
      }
    }, 60_000);

  test("`mic: false` seeds a learner without a microphone: Quiet mode, no mic sets, sing cards paused", async () => {
    const { h, me } = await learner(real);
    try {
      await me.api("POST", "/api/dev/seed", { point: "after U03.L02", mic: false });
      const voice = await me.api<VoiceState>("GET", "/api/voice");
      expect(voice).toMatchObject({ quiet: true, quietReason: "no-mic", range: null });
      const plan = await me.today();
      expect(plan.warmup.items.some((i) => i.mic)).toBe(false);
      const sing = real.families.filter(
        (f) => f.mic && f.unlock.lesson <= "U03.L02" && f.unlock.lesson >= "U03",
      );
      const { cards } = await me.api<{ cards: SrsCard[] }>("GET", "/api/drills/families");
      for (const f of sing) expect(cards.find((c) => c.cardId === f.id)?.status).toBe("paused");
    } finally {
      await h.close();
    }
  }, 60_000);
});

describe("sung lesson steps feed the ladder (contracts §8.2)", () => {
  test("U03.L02's sing step: voiced notes are evidence; a Quiet-mode fallback and a tutor-typed attempt are not", async () => {
    const { h, me } = await learner(real);
    try {
      await me.api("POST", "/api/dev/seed", { point: "C1 released" });
      const def = real.lessons.find((l) => l.id === "U03.L02");
      const step = def?.steps.find((st) => st.exercise?.kind === "sing");
      if (def === undefined || step?.exercise === undefined) throw new Error("U03.L02 has no sing step");
      const ex = step.exercise;
      const send = (over: { modality?: "fallback"; tutorAssisted?: boolean } = {}) =>
        me.api("POST", `/api/lessons/U03.L02/steps/${step.id}/attempts`, {
          sessionId: null,
          exerciseId: ex.id,
          exerciseVersion: ex.version,
          seriesNo: 0,
          params: null,
          response: {
            sung: [
              { midi: 48, cents: 12, credit: 1 },
              { midi: 52, cents: -30, credit: 1 },
              { midi: 55, cents: null, credit: 0 },
            ],
          },
          result: {
            exerciseId: `U03.L02/${ex.id}`,
            exerciseVersion: ex.version,
            attemptNo: 1,
            firstAttempt: true,
            mode: "lesson",
            status: "pass",
            score: 0.9,
            adjustedScore: 0.9,
            dims: {},
            constraints: [],
            diagnostics: [],
            messages: [],
            assist: { rung: 0, tutorHints: 0, extraReplays: 0, revealed: false },
            ...(over.modality === undefined ? {} : { modality: over.modality }),
          },
          extraReplays: 0,
          activeMs: 5000,
          tutorAssisted: over.tutorAssisted ?? false,
        });
      await send();
      await send({ modality: "fallback" });
      await send({ tutorAssisted: true });
      const v = await me.api<VoiceState>("GET", "/api/voice");
      expect(v.ladder.days.map((d) => [d.notes, d.medianAbsCents])).toEqual([[2, 21]]);
    } finally {
      await h.close();
    }
  }, 60_000);
});

describe("U03–U04 on the server (real course, stand-ins for lessons still being written)", () => {
  test("rule 12: ebass and .lpf() are granted silently on completing U03.L03 when C1 has not started", async () => {
    const { h, me } = await learner(course);
    try {
      await me.api("POST", "/api/dev/seed", { point: "after U02.CP" });
      for (const id of ["U03.L02", "U03.L03"]) {
        h.clock.advance(DAY);
        const ses = await me.api<{ id: string }>("POST", "/api/session/start", {
          kind: "lesson",
          mapItemId: id,
          targetMinutes: 20,
        });
        await me.completeLesson(id, ses.id);
        await me.endSession(ses.id);
      }
      const unlocks = (await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items;
      for (const id of ["snd.ebass", "tb.lpf"])
        expect(unlocks.find((u) => u.itemId === id)).toMatchObject({
          sourceKind: "fallback",
          sourceId: "U03.L03",
          seen: true,
        });
      // C1 later: no second row; the ceremony is the app's.
      h.clock.advance(DAY);
      await me.api("POST", "/api/session/start", { kind: "capstone", mapItemId: "C1.S1", targetMinutes: 20 });
      const after = (await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items.map((u) => u.itemId);
      expect(after.filter((x) => x === "snd.ebass")).toHaveLength(1);
    } finally {
      await h.close();
    }
  }, 60_000);

  test("when C1 starts first, ebass and .lpf() come from its start; the families U03.L02 and U04.L01 seed exist", async () => {
    const { h, me } = await learner(course);
    try {
      await me.api("POST", "/api/dev/seed", { point: "after U04.L01" });
      const unlocks = (await me.api<{ items: Unlock[] }>("GET", "/api/unlocks")).items;
      expect(unlocks.find((u) => u.itemId === "snd.ebass")).toMatchObject({
        sourceKind: "session-start",
        sourceId: "C1.S1",
      });
      const { cards } = await me.api<{ cards: SrsCard[] }>("GET", "/api/drills/families");
      const ids = new Set(cards.map((c) => c.cardId));
      for (const f of course.families)
        if (["U03.L02", "U03.L03", "U04.L01"].includes(f.unlock.lesson) && !f.id.startsWith("fam.mix."))
          expect({ family: f.id, seeded: ids.has(f.id) }).toEqual({ family: f.id, seeded: true });
      // U03.CP comes after U04.L01 in the default order.
      expect(await me.today()).toMatchObject({ kind: "checkpoint", mapItemId: "U03.CP" });
    } finally {
      await h.close();
    }
  }, 60_000);

  test("Quiet mode never gates: U03.CP leaves the sung skills out, passes, and the course goes on", async () => {
    const { h, me } = await learner(course);
    try {
      await me.api("POST", "/api/dev/seed", { point: "U03.CP due" });
      await me.api("PUT", "/api/voice/quiet", { quiet: true, scope: "always" });
      const plan = await me.today();
      expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U03.CP" });
      expect(plan.warmup.items.some((i) => i.mic)).toBe(false);
      const ses = await me.startSession(plan);
      const cp = await me.checkpoint("U03.CP", ses.id, { gating: 0.95, levelSetting: 0.95 });
      const voiceSkills = new Set(
        real.skills.filter((s) => s.category === "voice").map((s) => s.id as string),
      );
      expect(cp.start.items.filter((i) => voiceSkills.has(i.skillId))).toEqual([]);
      expect(cp.outcome.passed).toBe(true);
      await me.endSession(ses.id);
      h.clock.advance(DAY);
      expect(await me.today()).toMatchObject({ kind: "lesson", mapItemId: "U04.L02" });
    } finally {
      await h.close();
    }
  }, 60_000);
});

describe("repertoire whose answer key is unchecked", () => {
  test("a pd-song transcription of a song verified 'pending…' is refused (409); the song stays unknown otherwise", async () => {
    const { h, me } = await learner(real);
    try {
      const pending = real.songs.filter((s) => s.verifiedBy.startsWith("pending"));
      expect(pending.length).toBeGreaterThan(0);
      for (const song of pending) {
        const r = await h.json("POST", "/api/transcriptions", {
          sourceKind: "pd-song",
          audioId: null,
          songId: song.id,
          title: song.title,
          artist: null,
          ladderLevel: null,
          templateId: null,
        });
        expect(r.status).toBe(409);
      }
      expect((await me.api<{ items: unknown[] }>("GET", "/api/transcriptions")).items).toEqual([]);
    } finally {
      await h.close();
    }
  }, 60_000);
});

describe("when the course runs out of authored lessons", () => {
  test("U04.CP waits for the day after U04.L04, then comes; afterwards review days with Studio, never an error", async () => {
    const { h, me } = await learner(course);
    try {
      await me.api("POST", "/api/dev/seed", { point: "after U04.L03" });
      let plan = await me.today();
      expect(plan).toMatchObject({ kind: "lesson", mapItemId: "U04.L04" });
      const ses = await me.startSession(plan);
      await me.completeLesson("U04.L04", ses.id);
      await me.endSession(ses.id);
      // More practice the same day: U05.L01 is not written and U04.CP is for tomorrow.
      plan = await me.today();
      expect(plan).toMatchObject({ kind: "review", mapItemId: null, main: null });
      expect(plan.note).toBe("Interval checkpoint is ready tomorrow. Today: a review, then Studio.");
      expect(plan.alternatives).toContainEqual({ kind: "studio", mapItemId: null, title: "Studio" });
      const review = await me.api<{ id: string }>("POST", "/api/session/start", {
        kind: "review",
        mapItemId: null,
        targetMinutes: 20,
      });
      for (const item of plan.warmup.items) await me.doItem(review.id, item);
      await me.endSession(review.id);

      h.clock.advance(DAY);
      plan = await me.today();
      expect(plan).toMatchObject({ kind: "checkpoint", mapItemId: "U04.CP" });
      const cpSes = await me.startSession(plan);
      expect(
        (await me.checkpoint("U04.CP", cpSes.id, { gating: 0.95, levelSetting: 0.95 })).outcome.passed,
      ).toBe(true);
      await me.endSession(cpSes.id);

      for (let d = 0; d < 5; d++) {
        h.clock.advance(DAY);
        plan = await me.today();
        expect(plan).toMatchObject({ kind: "review", mapItemId: null });
        expect(plan.note).toBe("The next lessons are still being written. Today: a review, then Studio.");
        expect(plan.warmup.plannedSec).toBeLessThanOrEqual(plan.warmup.budgetSec);
        const s = await me.api<{ id: string }>("POST", "/api/session/start", {
          kind: "review",
          mapItemId: null,
          targetMinutes: 20,
        });
        for (const item of plan.warmup.items) await me.doItem(s.id, item);
        await me.endSession(s.id);
        const day = await me.api<{ doneForToday: boolean }>("GET", "/api/session/day");
        expect(day.doneForToday).toBe(true);
      }
    } finally {
      await h.close();
    }
  }, 120_000);
});
