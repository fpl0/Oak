// Wave 7 review (review:journey), the lesson's own grading path against the real grader and the authored lessons:
// R3.L02 S2's son clave tapped from its other side (2-3 for 3-2), five times running, is said as that
// (`tap.clave-direction` of @oak/pitch `gradeClaveTaps`, which no host called), alone: before, the take read as
// eight missed rimshots, eight taps where it is quiet and, falsely, "All 2 of your pushes landed on the beat". The
// verdict never changes; the authored taps grade as authored, and right answers played other ways still pass.
// R2.L04 S2's 3 against 2 tapped one hand at a time: the silent hand is said once, in words ("No taps on J: that
// hand plays the three while the other plays the two."), not under twelve "No tap for note n of the rhythm" lines
// and the whole lane label ("plays the three, with the cowbell while the other plays the two, with the kick").
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import type { Exercise, LessonDef, SessionId } from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm, renderFeedback } from "@oak/grader";
import r2l04 from "../../../content/advanced/R2/L04/lesson.ts";
import r3l02 from "../../../content/advanced/R3/L02/lesson.ts";
import u13l01 from "../../../content/core/U13/L01/lesson.ts";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import { issueLines, renderer, shapeOf, summaryOf, viewFor } from "./feedback.ts";
import {
  claveAsked,
  type GradeEnv,
  type GraderDeps,
  gradeStep,
  laneName,
  NEUTRAL_PROFILE,
} from "./grading.ts";

setDefaultTimeout(60_000);

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};
beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

const envOf = (def: LessonDef): GradeEnv => ({
  ownerId: def.id,
  key: def.key,
  meter: def.meter,
  bpm: def.bpm,
  unlocked: unlockedAt(courseGraph(), toolbox, def.id as SessionId),
  allowPreview: false,
  profile: NEUTRAL_PROFILE,
});
type Tested = Exercise & { tests: { name: string; response: { taps: number[] }; expect: string }[] };
const exOf = (def: LessonDef, stepId: string) => def.steps.find((s) => s.id === stepId)?.exercise as Tested;
const OPTS = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };

// R3.L02 runs at 104 BPM: an eighth is 30/104 s. Son 3-2 over two bars is eighths 0 3 6 | 10 12; 2-3 swaps them.
const EIGHTH = 30 / 104;
const at = (eighths: readonly number[], nudge = 0) => eighths.map((e) => e * EIGHTH + nudge);
const THREE_TWO = [0, 3, 6, 10, 12, 16, 19, 22, 26, 28];
const TWO_THREE = [2, 4, 8, 11, 14, 18, 20, 24, 27, 30];

describe("R3.L02 S2: the son clave tapped from its other side", () => {
  const def = r3l02 as LessonDef;
  const ex = exOf(def, "S2");
  const env = envOf(def);

  test("2-3 for 3-2, five times with a little jitter: named as the other direction, alone, and still a fail", async () => {
    for (const nudge of [-0.01, 0.01, 0, 0.02, -0.015]) {
      const r = await gradeStep(deps, env, ex, { taps: at(TWO_THREE, nudge) }, OPTS);
      expect(r.status).toBe("fail");
      const ids = r.diagnostics.map((d) => d.id as string);
      expect(ids[0]).toBe("tap.clave-direction");
      expect(r.diagnostics[0]?.params).toMatchObject({ got: "2-3", exp: "3-2" });
      expect(ids).not.toContain("tap.push-on-beat");
      expect(ids).not.toContain("tap.missed");
      expect(ids).not.toContain("tap.extra");
    }
  });

  test("what the learner reads at rung 0: one line that says which way round, no false push", async () => {
    const r = await gradeStep(deps, env, ex, { taps: at(TWO_THREE) }, OPTS);
    const view = viewFor(r, 0, false, renderer(null, r, ex));
    expect(summaryOf(view, r, shapeOf(ex))).toBe("Not in time yet. Listen, then tap along again.");
    const lines = issueLines(view, shapeOf(ex)).map((l) => l.what ?? "");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("2-3");
    expect(lines[0]).toContain("3-2");
    expect(lines.join(" ")).not.toMatch(/push/i);
  });

  test("the authored taps grade as authored", async () => {
    for (const t of ex.tests) {
      const r = await gradeStep(deps, env, ex, t.response, OPTS);
      expect(`${t.name}: ${r.status}`).toBe(`${t.name}: ${t.expect}`);
    }
  });

  test("right answers played other ways still pass, with nothing named", async () => {
    const ways = [
      at(THREE_TWO),
      at(THREE_TWO, 0.03), // a little late throughout (the shared offset is forgiven)
      at(THREE_TWO, -0.02), // a little early throughout
      at(THREE_TWO).map((t, i) => t + (i % 2 ? 0.012 : -0.012)), // uneven by a few ms
    ];
    for (const taps of ways) {
      const r = await gradeStep(deps, env, ex, { taps }, OPTS);
      expect(r.status).toBe("pass");
      expect(r.diagnostics.map((d) => d.id as string)).not.toContain("tap.clave-direction");
    }
  });

  test("a wrong take that is not a clave (a tap on every beat) is not called a clave", async () => {
    const every = at([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
    const r = await gradeStep(deps, env, ex, { taps: every }, OPTS);
    expect(r.status).toBe("fail");
    const ids = r.diagnostics.map((d) => d.id as string);
    expect(ids).not.toContain("tap.clave-direction");
    expect(ids).not.toContain("tap.clave-type");
  });
});

describe("claveAsked: only a clave step is read as one", () => {
  const bpm = 104;
  test("son 3-2 over four bars", () => {
    expect(claveAsked(at(THREE_TWO), bpm, "4/4", 4)).toEqual({ type: "son", direction: "3-2" });
  });
  test("2-3 too, and rumba", () => {
    expect(claveAsked(at(TWO_THREE), bpm, "4/4", 4)).toEqual({ type: "son", direction: "2-3" });
    expect(claveAsked(at([0, 3, 7, 10, 12]), bpm, "4/4", 2)).toEqual({ type: "rumba", direction: "3-2" });
  });
  test("not a clave: a backbeat, an odd bar count, another meter, a cycle that changes", () => {
    expect(claveAsked(at([2, 6, 10, 14]), bpm, "4/4", 2)).toBeNull();
    expect(claveAsked(at([0, 3, 6, 10, 12]), bpm, "4/4", 3)).toBeNull();
    expect(claveAsked(at([0, 3, 6, 10, 12]), bpm, "6/8", 2)).toBeNull();
    expect(claveAsked(at([0, 3, 6, 10, 12, 18, 20, 24, 27, 30]), bpm, "4/4", 4)).toBeNull();
  });
  test("U13.L01's pushes are still read as pushes (no clave there)", async () => {
    const def = u13l01 as LessonDef;
    const r = await gradeStep(deps, envOf(def), exOf(def, "S2"), { taps: [2.5, 5, 7.5, 10] }, OPTS);
    expect(r.diagnostics[0]?.id as string).toBe("tap.push-on-beat");
  });
});

describe("R2.L04 S2: the polyrhythm tapped one hand at a time", () => {
  const def = r2l04 as LessonDef;
  const ex = def.steps.find((s) => s.id === "S2")?.exercise as Exercise & {
    tests: { name: string; response: { lanes: number[][] }; expect: string; feedback?: string[] }[];
  };
  const env = envOf(def);
  const both = (ex.tests.find((t) => t.expect === "pass") as { response: { lanes: number[][] } }).response
    .lanes;
  const [two, three] = both as [number[], number[]];
  const said = async (lanes: number[][]) => {
    const r = await gradeStep(deps, env, ex, { lanes } as never, OPTS);
    const view = viewFor(
      r,
      0,
      false,
      renderer((d, o) => renderFeedback(d as never, o as never) as string, r, ex),
    );
    return {
      r,
      summary: summaryOf(view, r, shapeOf(ex)),
      lines: issueLines(view, shapeOf(ex)).map((l) => l.what),
    };
  };

  test("the left hand alone, then the right hand alone: one line each, naming the silent hand in words", async () => {
    const left = await said([two, []]);
    expect(left.r.status).toBe("fail");
    expect(left.summary).toBe("Not in time yet. Listen, then tap along again.");
    expect(left.lines).toEqual(["No taps on J: that hand plays the three while the other plays the two."]);
    const right = await said([[], three]);
    expect(right.r.status).toBe("fail");
    expect(right.lines).toEqual(["No taps on F: that hand plays the two while the other plays the three."]);
  });

  test("both pulses on one hand: the silent hand is said, not the other hand's taps as one too many", async () => {
    const one = await said([[...two, ...three].sort((a, b) => a - b), []]);
    expect(one.r.status).toBe("fail");
    expect(one.lines).toEqual(["No taps on J: that hand plays the three while the other plays the two."]);
  });

  test("the authored takes grade as authored, the swapped hands still named; other right takes pass", async () => {
    for (const t of ex.tests) {
      const r = await gradeStep(deps, env, ex, t.response as never, OPTS);
      expect(`${t.name}: ${r.status}`).toBe(`${t.name}: ${t.expect}`);
      for (const f of t.feedback ?? []) expect(r.diagnostics.map((d) => d.id as string)).toContain(f);
    }
    for (const lanes of [
      [two.map((t) => t - 0.02), three.map((t) => t - 0.02)],
      [two.map((t, i) => t + (i % 2 ? 0.01 : -0.01)), three],
      [two, three.map((t, i) => t + (i % 2 ? -0.012 : 0.008))],
    ]) {
      const r = await gradeStep(deps, env, ex, { lanes } as never, OPTS);
      expect(r.status).toBe("pass");
    }
  });

  test("laneName: the pulse in a sentence", () => {
    expect(laneName("Left hand: the two, with the kick")).toBe("two");
    expect(laneName("Right hand: the three, with the cowbell")).toBe("three");
    expect(laneName("Kick")).toBe("kick");
  });
});

describe("drafts: the track widgets built from several picks come back after a reload", () => {
  test("keyboard, grouping, euclid and slot-choice are kept; their shapes are checked", async () => {
    const { draftFits, keepsDraft, loadDraft, saveDraft } = await import("./drafts.ts");
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      get length() {
        return map.size;
      },
      key: (i: number) => [...map.keys()][i] ?? null,
    };
    const kb = { ui: "keyboard" } as never;
    expect(keepsDraft(kb)).toBe(true);
    expect(keepsDraft({ ui: "grouping" } as never)).toBe(true);
    expect(keepsDraft({ ui: "euclid" } as never)).toBe(true);
    expect(keepsDraft({ ui: "slot-choice" } as never)).toBe(true);
    // A3 C4 E4 picked on J3.L01's keyboard, then the page reloads.
    saveDraft("k", [57, 60, 64], [], store);
    expect(loadDraft("k", kb, [], store)).toEqual([57, 60, 64]);
    expect(draftFits(kb, [], [57.5])).toBe(false);
    expect(draftFits(kb, [], ["a"])).toBe(false);
    expect(draftFits({ ui: "grouping" } as never, [], [2, 2, 3])).toBe(true);
    expect(draftFits({ ui: "grouping" } as never, [], [9])).toBe(false);
    expect(draftFits({ ui: "euclid" } as never, [], [5, 16, 2])).toBe(true);
    expect(draftFits({ ui: "euclid" } as never, [], [5])).toBe(false);
    expect(draftFits({ ui: "slot-choice", slots: 3 } as never, ["", "", ""], ["bass", "", "lead"])).toBe(
      true,
    );
    expect(draftFits({ ui: "slot-choice", slots: 3 } as never, ["", "", ""], ["bass"])).toBe(false);
  });
});

describe("rung 2 says the kind of a keyboard mistake in words, never the notes", () => {
  test("kb.bass is a sentence, not the bare code 'bass'", async () => {
    const { describeIssue, viewFor } = await import("./feedback.ts");
    expect(describeIssue({ id: "kb.bass" } as never)).toBe(
      "The lowest note is not the one this chord stands on.",
    );
    const result = {
      status: "fail",
      score: 0,
      dims: {},
      messages: [],
      diagnostics: [{ id: "kb.bass", severity: "error", params: { exp: "A", got: "E" } }],
    } as never;
    const at2 = viewFor(result, 2, false, () => "The lowest note should be A, not E.");
    expect(at2.issues[0]?.what).toBe("The lowest note is not the one this chord stands on.");
    expect(at2.issues[0]?.fix).toBeUndefined();
    const at0 = viewFor(result, 0, false, () => "x");
    expect(at0.issues[0]?.what).toBeUndefined();
    // A finding with no words of its own keeps content-kit's reading of its code.
    const other = viewFor(
      { ...(result as object), diagnostics: [{ id: "id.wrong", severity: "error", params: {} }] } as never,
      2,
      false,
      () => "x",
    );
    expect(other.issues[0]?.what).toBe("wrong");
  });
});
