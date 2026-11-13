// The ports the tutor reads for Wave 4 content (wave4.md §5.6): the step's key, how the learner answers a step, all
// introduced terms, and a review of one album or transcription version with Oak's analysed facts of that version —
// evaluated on a real learner host, so the chords, numerals and cadences are the grader's, not this file's.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { DevSeedResult } from "@oak/api";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";
import type { GraderHosts } from "../deps.ts";
import { createGraderHosts } from "../grader/host.ts";
import { C2_SONG } from "../services/dev-seed.ts";
import { CONTENT_DIR } from "../testing/course.ts";
import { harness } from "../testing/harness.ts";
import { LessonContextAdapter } from "./lessons.ts";
import { ProgressAdapter } from "./progress.ts";
import { reviewFactsPort } from "./review-facts.ts";

setDefaultTimeout(90_000);

let real: ContentSource;
let hosts: ReturnType<typeof createGraderHosts>;
beforeAll(async () => {
  real = await loadContent({ contentDir: CONTENT_DIR });
  hosts = createGraderHosts({ toolbox: real.toolbox, spare: false });
});
afterAll(async () => {
  await hosts.dispose();
});

const stepWith = (pred: (ex: unknown) => boolean) => {
  for (const l of real.lessons)
    for (const st of l.steps)
      if (st.exercise !== undefined && pred(st.exercise)) return { lesson: l, step: st };
  return null;
};

describe("step sources (wave4.md §5.6)", () => {
  test("the step's own key, else the lesson's; how the learner answers it", async () => {
    const h = await harness({ dev: true, content: real });
    try {
      const { ContentIndex } = await import("../content/index.ts");
      const adapter = new LessonContextAdapter(new ContentIndex(real), h.server.deps.repos);
      const keyed = stepWith((ex) => {
        const k = (ex as { key?: { tonic: string } }).key;
        return k !== undefined && k.tonic !== "C";
      });
      if (keyed === null) throw new Error("no step with its own key in the course");
      const ex = keyed.step.exercise as { key: { tonic: string; mode: string } };
      const src = await adapter.step(keyed.lesson.id, keyed.step.id);
      expect(src?.key).toBe(`${ex.key.tonic} ${ex.key.mode}`);
      const plain = keyed.lesson.steps.find((s) => s.exercise !== undefined && s.exercise.key === undefined);
      if (plain !== undefined)
        expect((await adapter.step(keyed.lesson.id, plain.id))?.key).toBe(
          `${keyed.lesson.key.tonic} ${keyed.lesson.key.mode}`,
        );
      const palette = stepWith((e) => (e as { answer?: { ui?: string } }).answer?.ui === "rn-palette");
      if (palette !== null)
        expect((await adapter.step(palette.lesson.id, palette.step.id))?.answerKind).toBe("rn-palette");
      const make = real.lessons[0]?.steps.find((s) => s.kind === "make");
      if (make !== undefined)
        expect((await adapter.step(real.lessons[0]?.id as string, make.id))?.answerKind ?? null).toBeNull();
      const gate = stepWith((e) => (e as { id?: string }).id === "hand-voiced-cadence-again");
      if (gate !== null)
        expect((await adapter.step(gate.lesson.id, gate.step.id))?.answerKind).toBe("voice-leading");
      // Staged chord dictation: the answer guard gets each stage's answer as the learner would give it.
      const staged = stepWith((e) => (e as { stageAnswers?: unknown }).stageAnswers !== undefined);
      if (staged === null) throw new Error("no staged chord dictation in the course");
      const right = (
        staged.step.exercise as unknown as {
          tests: { expect: string; response: { answer?: { stages?: Record<string, string[]> } } }[];
        }
      ).tests.find((t) => t.expect === "pass")?.response.answer?.stages as Record<string, string[]>;
      const stagedSrc = await adapter.step(staged.lesson.id, staged.step.id);
      expect(stagedSrc?.answerKind).toBe("chord-dictation");
      for (const stage of ["bass", "quality", "rn"])
        if (right[stage] !== undefined)
          expect(stagedSrc?.solutions).toContain((right[stage] as string[]).join(" "));
    } finally {
      await h.close();
    }
  });

  test("every introduced term, not only the 30 most recent", async () => {
    const h = await harness({ dev: true, content: real, now: "2026-11-11T12:00:00.000Z" });
    try {
      await h.json("POST", "/api/dev/seed", { point: "after U06.L05" });
      const s = h.server.deps.services;
      const { ContentIndex } = await import("../content/index.ts");
      const progress = new ProgressAdapter(h.server.deps.repos, new ContentIndex(real), {
        course: s.course,
        gates: s.gates,
        streak: s.streak,
        voice: s.voice,
      });
      const t = await progress.termsIntroduced();
      expect(t.all?.length).toBe(t.count);
      expect(t.count).toBeGreaterThan(t.recent.length);
      expect(t.all).toContain("term.solfege");
    } finally {
      await h.close();
    }
  });
});

describe("reviews of one version, with analysed facts (contracts §10.6)", () => {
  test("C2's album version 1: its code, its chords I–V–vi–IV with numerals, the plagal landing, the target", async () => {
    const h = await harness({ dev: true, content: real, now: "2026-11-11T12:00:00.000Z" });
    try {
      const seed = (await h.json<DevSeedResult>("POST", "/api/dev/seed", { point: "C2 released" })).body;
      const { ContentIndex } = await import("../content/index.ts");
      const graders: GraderHosts = { learner: () => hosts.learner, tutor: () => hosts.tutor };
      const adapter = new LessonContextAdapter(
        new ContentIndex(real),
        h.server.deps.repos,
        reviewFactsPort(graders, h.server.deps.repos),
      );
      const trackId = seed.trackId as string;
      const r = await adapter.review(
        { subjectKind: "capstone", subjectId: "C2" },
        { kind: "album", trackId, version: 1 },
      );
      expect(r?.code).toBe(C2_SONG);
      expect(r?.target).toEqual({ kind: "album", trackId, version: 1 });
      const facts = r?.facts;
      expect(facts).not.toBeNull();
      expect(facts?.key).toBe("C major");
      expect(facts?.chords.slice(0, 4).map((c) => [c.bar, c.symbol, c.rn])).toEqual([
        [1, "C", "I"],
        [2, "G", "V"],
        [3, "Am", "vi"],
        [4, "F", "IV"],
      ]);
      expect(facts?.chords.at(-1)).toMatchObject({ bar: 8, symbol: "C", rn: "I" });
      expect(facts?.ranges.find((x) => x.track === "melody")).toMatchObject({
        low: "C4",
        high: "E5",
        semitones: 16,
      });
      // A version that does not exist, or a track of another capstone: no review source.
      expect(
        await adapter.review(
          { subjectKind: "capstone", subjectId: "C2" },
          { kind: "album", trackId, version: 9 },
        ),
      ).toBeNull();
      expect(
        await adapter.review(
          { subjectKind: "capstone", subjectId: "C1" },
          { kind: "album", trackId, version: 1 },
        ),
      ).toBeNull();
    } finally {
      await h.close();
    }
  });

  test("a transcription: the named version, the reference only after a graded pass, never for own audio", async () => {
    const h = await harness({ dev: true, content: real, now: "2026-11-11T12:00:00.000Z" });
    try {
      await h.json("POST", "/api/dev/seed", { point: "after U07.L07" });
      const { ContentIndex } = await import("../content/index.ts");
      const adapter = new LessonContextAdapter(new ContentIndex(real), h.server.deps.repos);
      const ladder = h.server.deps.repos.transcriptions
        .list()
        .find((t) => t.sourceKind === "generated" && t.gradedPass);
      if (ladder === undefined) throw new Error("no graded ladder item");
      const r = await adapter.review(
        { subjectKind: "transcription", subjectId: ladder.id },
        { kind: "transcription", version: 1 },
      );
      expect(r?.target).toEqual({ kind: "transcription", version: 1 });
      expect(r?.reference).toBe(ladder.hiddenCode);
      await h.json("POST", "/api/dev/seed", { point: "own-audio project" });
      const own = h.server.deps.repos.transcriptions.list().find((t) => t.sourceKind === "own-audio");
      const o = await adapter.review({ subjectKind: "transcription", subjectId: own?.id as string });
      expect(o?.reference).toBeNull();
      expect(o?.checklist).toEqual(["contour: 2/2", "rhythm: 1/2", "landing: 1/2"]);
    } finally {
      await h.close();
    }
  });
});
