// The voice, term and test-shape rules of content/validate/authoring.ts on small known inputs: each rule
// fires on the mistake it exists for and stays quiet on the exemplar's correct form.
import { describe, expect, test } from "bun:test";
import type { Exercise, LessonDef } from "@oak/content-kit";
import { loadLessons } from "../lib/load.bun.ts";
import { degreeWordIssues, lessonAuthoring, mdxSteps, testShapeIssues, voiceIssues } from "./authoring.ts";

const T = 'setcpm(92/4)\n\nmel: note("';
const modify = (over: Partial<Exercise> = {}): Exercise =>
  ({
    kind: "code-modify",
    id: "lift",
    version: 1,
    role: "check",
    prompt: "Lift the line.",
    skills: [{ skill: "P01", w: 1 }],
    hints: [{ text: "a" }, { text: "b" }, { text: "c" }, "auto"],
    code: { starter: `${T}⟪c2 c3⟫").s("piano")` },
    reference: { solutions: [`${T}c3 c4").s("piano")`], bars: 1 },
    matcher: { m: "events", pitch: "absolute", rhythm: "onsets", durations: false },
    target: { audible: true },
    tests: [
      {
        name: "unchanged",
        response: { code: `${T}c2 c3").s("piano")` },
        expect: "fail",
        feedback: ["code.unchanged"],
      },
    ],
    ...over,
  }) as Exercise;

describe("voice", () => {
  test("exclamation marks, hype and blame fail; code inside backticks is ignored", () => {
    const w = (text: string) => voiceIssues([{ where: "S1 prompt", text, before: true }]);
    expect(w("Great job! You did it.").length).toBeGreaterThan(1);
    expect(w("Simply change the number.")).toHaveLength(1);
    expect(w("Let's dive in.").length).toBeGreaterThan(0);
    expect(w("Write `c4!2` to repeat a note.")).toEqual([]);
    expect(w("Press Play and nod along.")).toEqual([]);
  });
  test("a prompt over 60 words fails", () => {
    const long = Array.from({ length: 61 }, () => "beat").join(" ");
    expect(voiceIssues([{ where: "S2 prompt", text: long, before: true }])).toHaveLength(1);
  });
});

describe("terms", () => {
  test("a term used in an earlier title or prompt fails, and so does one never bolded in its pass text", async () => {
    const { lessons } = await loadLessons();
    const l = lessons.find((x) => x.def.id === "U01.L01");
    expect(l).toBeDefined();
    const def = l?.def as LessonDef;
    expect(lessonAuthoring(def, l?.mdxSource ?? null).issues).toEqual([]);
    const renamed = {
      ...def,
      steps: def.steps.map((s, i) => (i === 1 ? { ...s, title: "Tap the bar" } : s)),
    };
    expect(lessonAuthoring(renamed, l?.mdxSource ?? null).issues.join("\n")).toContain(
      'S2 title: uses "bar" before S5',
    );
    const noBold = (l?.mdxSource ?? "").replace("**pulse**", "pulse");
    expect(lessonAuthoring(def, noBold).issues.join("\n")).toContain("term.pulse: bold");
  });
  test("mdxSteps splits prose from pass text", () => {
    const m = mdxSteps('<Step id="S1">\nHello.\n<OnPass>A **pulse**.</OnPass>\n</Step>');
    expect(m.get("S1")?.onPass).toBe("A **pulse**.");
    expect(m.get("S1")?.prose).not.toContain("pulse");
  });
});

describe("test shape", () => {
  test("the unchanged starter must fail with code.unchanged", () => {
    expect(testShapeIssues(modify(), "S5/lift")).toEqual([]);
    expect(testShapeIssues(modify({ tests: [] }), "S5/lift")).toHaveLength(1);
  });
  test("before U03.L02 degree-worded feedback is overridden on pitched note steps", () => {
    expect(degreeWordIssues(modify(), "S5/lift")).toHaveLength(1);
    const ok = modify({
      feedbackText: {
        "melody.wrong-degree": "Bar {bar}: a different note.",
        "melody.missing-note": "Bar {bar}: a note is missing.",
        "melody.extra-note": "Bar {bar}: one note too many.",
      },
    });
    expect(degreeWordIssues(ok, "S5/lift")).toEqual([]);
  });
});
