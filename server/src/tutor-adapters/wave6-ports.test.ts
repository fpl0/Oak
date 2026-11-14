// The ports the tutor reads for Wave 6 content (wave6.md §3.2; d2): a step's key plan and its own meter, the answer a
// form map holds back (labels and the bars each section starts on), and a review's analysed facts of the U12–U17
// views — evaluated on a real learner host, so the sevenths, outside chords, key plan, mode and devices are the
// grader's, not this file's.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Exercise, LessonDef } from "@oak/content-kit";
import { loadContent } from "../content/loader.ts";
import type { ContentSource } from "../content/types.ts";
import type { GraderHosts } from "../deps.ts";
import { createGraderHosts } from "../grader/host.ts";
import { C6_SONG, C7_SONG, CFA_SINGLE, PUSHED, SEVENTHS } from "../services/seed-wave6.ts";
import { CONTENT_DIR } from "../testing/course.ts";
import { harness } from "../testing/harness.ts";
import { referenceAnswers } from "./lessons.ts";
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

const C = { tonic: "C", mode: "major" } as const;

/** U12.L01 with its first exercise step carrying `ex` on top of its own exercise (test content only). */
function withStep(ex: Record<string, unknown>): { content: ContentSource; lessonId: string; stepId: string } {
  const base = real.lessons.find((l) => l.id === "U12.L01") ?? (real.lessons[0] as LessonDef);
  const step = base.steps.find((s) => s.exercise !== undefined);
  if (step === undefined) throw new Error(`${base.id} has no exercise step`);
  const lesson = {
    ...base,
    steps: base.steps.map((s) =>
      s.id === step.id ? { ...s, exercise: { ...(s.exercise as Exercise), ...ex } as Exercise } : s,
    ),
  } as LessonDef;
  return {
    content: { ...real, lessons: real.lessons.map((l) => (l.id === base.id ? lesson : l)) },
    lessonId: base.id,
    stepId: step.id,
  };
}

describe("step sources (wave6.md §3.2, contracts §6.8)", () => {
  test("a step that changes key carries its key plan; a step in its own meter says so", async () => {
    const { content, lessonId, stepId } = withStep({
      key: C,
      meter: "6/8",
      keyPlan: [
        { bar: 1, key: C },
        { bar: 9, key: { tonic: "D", mode: "major" } },
      ],
    });
    const h = await harness({ dev: true, content });
    try {
      const { ContentIndex } = await import("../content/index.ts");
      const { LessonContextAdapter } = await import("./lessons.ts");
      const adapter = new LessonContextAdapter(new ContentIndex(content), h.server.deps.repos);
      const src = await adapter.step(lessonId, stepId);
      expect(src?.key).toBe("C major");
      expect(src?.keyPlan).toEqual([
        { bar: 1, key: "C major" },
        { bar: 9, key: "D major" },
      ]);
      expect(src?.meter).toBe("6/8");
    } finally {
      await h.close();
    }
  });

  test("a step on a real course lesson keeps one key and no plan when its exercise has none", async () => {
    const h = await harness({ dev: true, content: real });
    try {
      const { ContentIndex } = await import("../content/index.ts");
      const { LessonContextAdapter } = await import("./lessons.ts");
      const adapter = new LessonContextAdapter(new ContentIndex(real), h.server.deps.repos);
      const lesson = real.lessons.find((l) => l.id === "U12.L01") ?? (real.lessons[0] as LessonDef);
      const step = lesson.steps.find((s) => s.exercise !== undefined);
      if (step === undefined) throw new Error(`${lesson.id} has no exercise step`);
      const src = await adapter.step(lesson.id, step.id);
      expect(src?.keyPlan).toBeUndefined();
      expect(src?.meter).toBeUndefined();
    } finally {
      await h.close();
    }
  });

  test("a form map holds back its labels and the bars each section starts on", () => {
    const ex = {
      kind: "identify",
      id: "form-map",
      answer: { ui: "form", sections: 4, vocabulary: "letters", input: "map" },
      correct: { sections: ["A", "A", "B", "A"], bars: [1, 9, 17, 25] },
    } as unknown as Exercise;
    const answers = referenceAnswers(ex);
    expect(answers).toContain("A A B A");
    expect(answers).toContain("1 9 17 25");
  });
});

describe("review facts of the Wave 6 views (wave6.md §3.2; d2)", () => {
  const facts = async (code: string, key: { tonic: string; mode: string } | null = C) => {
    const h = await harness({ dev: true, content: real });
    try {
      const graders: GraderHosts = { learner: () => hosts.learner, tutor: () => hosts.tutor };
      return await reviewFactsPort(graders, h.server.deps.repos)(code, { key: key as never, meter: "4/4" });
    } finally {
      await h.close();
    }
  };

  test("sevenths by quality and the guide-tone line (U12)", async () => {
    const f = await facts(SEVENTHS);
    expect(f).not.toBeNull();
    expect(f?.sevenths).toMatchObject({ maj7: 1, m7: 2, "7": 1 });
    expect((f?.guideLine ?? []).length).toBeGreaterThan(0);
  });

  test("the pushed chords of U13 are told per line", async () => {
    const f = await facts(PUSHED);
    const chords = f?.rhythm?.find((r) => r.track === "chords");
    expect(chords?.pushes ?? 0).toBeGreaterThan(0);
  });

  test("C6: the mode with its colour tone", async () => {
    const f = await facts(C6_SONG, { tonic: "G", mode: "mixolydian" });
    const whole = f?.modes?.[0];
    expect(whole?.stated ?? "").toMatch(/mixolydian/i);
    expect(whole?.tone?.degree).toBe("b7");
  });

  test("C7: the key plan of the lifted last chorus and the outside chords in the key in force", async () => {
    const f = await facts(C7_SONG);
    expect(f?.keyPlan?.map((k) => k.key)).toEqual(["C major", "D major"]);
    expect(f?.keyPlan?.[1]?.bars[0]).toBe(33);
    const kinds = new Set((f?.outside ?? []).map((o) => o.kind));
    expect(kinds.has("applied")).toBe(true);
    expect(kinds.has("borrowed")).toBe(true);
  });

  test("CF-A: the devices and one pass in seconds", async () => {
    const f = await facts(CFA_SINGLE);
    expect((f?.devices ?? []).length).toBeGreaterThanOrEqual(4);
    expect(f?.durationSec).toBeCloseTo(134.4, 0);
  });
});
