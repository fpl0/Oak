// Wave 6 of the lesson and checkpoint players, against the real grader and the authored lessons: every authored
// test of every U12–U17 lesson through the player's own grading path (the exemplars, and each further lesson as it
// is authored: the list is read from content/core), a verdict that names the part of a several-answer step,
// chromatic degrees printed with their signs, what an ear step offers after its answer (d16), where a Make starts
// (d15), unchecked answers kept over a reload and the disabled Check's reason (d4), what the host passes for
// sevenths, key changes and modal signatures, and what a checkpoint pass says about the tracks it opened.
import { beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { existsSync } from "node:fs";
import type {
  AttemptResponse,
  CheckpointOutcome,
  Exercise,
  GradeResult,
  LessonDef,
  LessonSketch,
  SessionId,
  TestCase,
} from "@oak/api";
import { evaluateForGrading, gradeExercise, initRealm } from "@oak/grader";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import type { AnswerSpec } from "../answers/types.ts";
import { answerBegun, checkReason } from "./check-reason.ts";
import { drillAnswer, familyResponse, tracksOpenedCopy } from "./checkpoint/model.ts";
import {
  clearStepDrafts,
  type DraftStore,
  draftFits,
  draftKey,
  keepsDraft,
  loadDraft,
  saveDraft,
} from "./drafts.ts";
import { earAfterPlan, earAfterShown, isEarAnswer } from "./ear-after.ts";
import { degreeSigns, issueLines, shapeOf, summaryOf, viewFor } from "./feedback.ts";
import {
  type GradeEnv,
  type GraderDeps,
  gradeStep,
  isAnswerAll,
  NEUTRAL_PROFILE,
  withPartSlots,
} from "./grading.ts";
import { fromSketchOf, makeStart, makeStartNote, ownSketchOf } from "./make-start.ts";
import { partsOf } from "./model.ts";
import {
  guideChordOf,
  guideToneFallback,
  isCompound,
  keyChangeOf,
  modalSignatureStyleOf,
  scalesInCode,
  seventhsTaught,
  singHowText,
  stepMusicLenses,
} from "./wave6.ts";

setDefaultTimeout(60_000);

/** The 33 lessons of Wave 6 (contracts §2.3: U12 6, U13 6, U14 6, U15 6, U16 5, U17 4). */
const W6_IDS: readonly string[] = (
  [
    ["U12", 6],
    ["U13", 6],
    ["U14", 6],
    ["U15", 6],
    ["U16", 5],
    ["U17", 4],
  ] as const
).flatMap(([u, n]) => Array.from({ length: n }, (_, i) => `${u}.L${String(i + 1).padStart(2, "0")}`));
const EXEMPLARS = ["U12.L01", "U13.L01", "U14.L01", "U15.L02", "U16.L01", "U17.L02"];

const fileOf = (id: string) => {
  const [unit, lesson] = id.split(".") as [string, string];
  return new URL(`../../../content/core/${unit}/${lesson}/lesson.ts`, import.meta.url);
};
/** Every Wave 6 lesson that is authored today (the exemplars always; the rest as their authors land them). */
const AUTHORED = W6_IDS.filter((id) => existsSync(fileOf(id)));
const LESSONS: LessonDef[] = (
  await Promise.all(
    AUTHORED.map(async (id) => {
      try {
        return ((await import(fileOf(id).href)) as { default: LessonDef }).default;
      } catch {
        // A lesson its author is still writing (it does not parse yet) is not this suite's to fail on.
        return null;
      }
    }),
  )
).filter((d): d is LessonDef => d !== null);
const lesson = (id: string) => LESSONS.find((d) => d.id === id) as LessonDef;
const stepEx = (id: string, step: string) =>
  lesson(id).steps.find((s) => s.id === step)?.exercise as Exercise;

const deps: GraderDeps = {
  grade: (req) => gradeExercise(req),
  evaluate: (code, bars, meter) => evaluateForGrading(code, { mode: "lesson", bars, lint: null, meter }),
};

beforeAll(async () => {
  await initRealm({ toolbox: [...toolbox], lockdown: false });
});

function envOf(def: LessonDef): GradeEnv {
  return {
    ownerId: def.id,
    key: def.key,
    meter: def.meter,
    bpm: def.bpm,
    ...(def.swing ? { swing: def.swing } : {}),
    ...(def.pickup ? { pickup: def.pickup } : {}),
    unlocked: unlockedAt(courseGraph(), toolbox, def.id as SessionId),
    allowPreview: false,
    profile: NEUTRAL_PROFILE,
  };
}
const OPTS = { params: {}, attemptNo: 1, rung: 0 as const, extraReplays: 0 };

describe("Wave 6: every lesson is here", () => {
  test("all 33 lessons load, the exemplars among them", () => {
    expect(LESSONS.map((d) => d.id)).toEqual([...W6_IDS]);
    for (const id of EXEMPLARS) expect(LESSONS.map((d) => d.id)).toContain(id);
  });
});

// Every authored test of all 33 lessons goes through the player's grading path in grading.test.ts.

/** An `all` step answered with part `wrongAt`'s own pinned mistake and every other part right. */
function allResponse(ex: Exercise, wrongAt: readonly number[]): AttemptResponse {
  const parts = partsOf(ex);
  return {
    parts: parts.map((p, i) => {
      const want = wrongAt.includes(i) ? "fail" : "pass";
      return (p.tests.find((t) => t.expect === want) as TestCase).response;
    }),
  } as AttemptResponse;
}
const render = (d: { id: string }) => `[${d.id}]`;

describe("several answers checked together: the verdict names the part (U12.L01 S6, U15.L02 S4)", () => {
  test("the ear steps of the exemplars are several-answer steps", () => {
    expect(isAnswerAll(stepEx("U12.L01", "S6"))).toBe(true);
    expect(isAnswerAll(stepEx("U15.L02", "S4"))).toBe(true);
    // One answer, a code step and a sung step are not.
    expect(isAnswerAll(stepEx("U16.L01", "S5"))).toBe(false);
    expect(isAnswerAll(stepEx("U12.L01", "S5"))).toBe(false);
    expect(isAnswerAll(stepEx("U15.L02", "S7"))).toBe(false);
  });

  test("one chord misheard: 'Part 1 is not right yet.', never 'notes differ'", async () => {
    const ex = stepEx("U12.L01", "S6");
    const r = await gradeStep(deps, envOf(lesson("U12.L01")), ex, allResponse(ex, [0]), OPTS);
    expect(r.status).toBe("fail");
    expect(r.diagnostics.filter((d) => d.severity === "error").map((d) => d.where?.slot)).toEqual([1]);
    const view = viewFor(r, 0, false, render as never);
    expect(summaryOf(view, r, shapeOf(ex))).toBe("Part 1 is not right yet.");
  });

  test("two of four: both are named, and the score is the whole step's", async () => {
    const ex = stepEx("U12.L01", "S6");
    const r = await gradeStep(deps, envOf(lesson("U12.L01")), ex, allResponse(ex, [1, 3]), OPTS);
    expect(r.status).toBe("fail");
    expect(r.score).toBeCloseTo(0.5, 5);
    const view = viewFor(r, 0, false, render as never);
    expect(summaryOf(view, r, shapeOf(ex))).toBe("Parts 2 and 4 are not right yet.");
    // From rung 2 (contracts §10.5) each line says what, under the part's own name.
    expect(issueLines(view, shapeOf(ex))).toEqual([]);
    const told = issueLines(viewFor(r, 2, false, render as never), shapeOf(ex));
    expect(told.map((l) => l.where)).toEqual(["Part 2", "Part 4"]);
  });

  test("every part right passes, with nothing placed", async () => {
    const ex = stepEx("U15.L02", "S4");
    const r = await gradeStep(deps, envOf(lesson("U15.L02")), ex, allResponse(ex, []), OPTS);
    expect(r.status).toBe("pass");
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  test("the pinned feedback codes survive the placing", async () => {
    const ex = stepEx("U15.L02", "S4");
    const first = partsOf(ex)[0] as Exercise;
    const wrong = first.tests.find((t) => t.expect === "fail") as TestCase;
    const r = await gradeStep(deps, envOf(lesson("U15.L02")), ex, allResponse(ex, [0]), OPTS);
    for (const code of wrong.feedback ?? []) expect(r.diagnostics.map((d) => d.id)).toContain(code);
  });

  test("findings that are not the step's own are never placed", () => {
    const d = (id: string, slot?: number) => ({
      id,
      severity: "error" as const,
      params: {},
      ...(slot ? { where: { slot } } : {}),
    });
    const whole = { status: "fail", score: 0.5, diagnostics: [d("id.wrong")] } as unknown as GradeResult;
    const part = (ids: string[]) => ({ status: "fail", diagnostics: ids.map((i) => d(i)) }) as never;
    // Another code, another count, or a part that could not be graded: the whole result, untouched.
    expect(withPartSlots(whole, [part(["id.quality"]), part([])])).toBe(whole);
    expect(withPartSlots(whole, [part(["id.wrong"]), part(["id.wrong"])])).toBe(whole);
    expect(withPartSlots(whole, [part(["id.wrong"]), null])).toBe(whole);
    const placed = withPartSlots(whole, [part([]), part(["id.wrong"])]);
    expect(placed.diagnostics.map((x) => x.where?.slot)).toEqual([2]);
    expect(placed.score).toBe(0.5);
  });

  test("a code step in parts keeps its own wording", () => {
    expect(shapeOf(stepEx("U12.L01", "S5")).kind).toBe("code");
    expect(shapeOf(stepEx("U12.L01", "S6"))).toEqual({
      kind: "answer",
      listen: true,
      slotted: true,
      slotNoun: "part",
    });
  });
});

describe("chromatic degrees are printed with their signs", () => {
  test("an accidental in front of a degree becomes its sign", () => {
    expect(degreeSigns("Note 2: you sang la (6); the pattern has fi (#4) here.")).toBe(
      "Note 2: you sang la (6); the pattern has fi (♯4) here.",
    );
    expect(degreeSigns("you have b6 (le); the melody has #4 (fi)")).toBe(
      "you have ♭6 (le); the melody has ♯4 (fi)",
    );
    expect(degreeSigns("That was b7, not 7.")).toBe("That was ♭7, not 7.");
  });
  test("chord names, Strudel steps and code keep their spelling", () => {
    for (const s of [
      "Bb7 is the V7 of Eb.",
      "F#7 leans into B.",
      'Try `n("3# 6b")` here.',
      "In code that is `#4`.",
      "Gb7 and Ab6",
      "bar 4, beat 2",
      "b12 is not a degree",
    ])
      expect(degreeSigns(s)).toBe(s);
  });
});

describe("after an ear step is answered: the thing alone and in context (d16)", () => {
  const none = { trial: null, tracks: [] as string[], trialAlone: false };
  test("a tune over a bass: the tune alone", () => {
    const part = partsOf(stepEx("U14.L01", "S6"))[0] as Exercise;
    expect(isEarAnswer(part)).toBe(true);
    expect(earAfterPlan(part, { ...none, tracks: ["mel", "bass"] })).toEqual({
      aloneLabel: "The tune alone",
      alone: { from: "code", tracks: ["mel"] },
    });
  });
  test("chords with a bass and drums, asked by bar: the chords alone", () => {
    const part = partsOf(stepEx("U15.L02", "S4"))[0] as Exercise;
    const plan = earAfterPlan(part, { ...none, tracks: ["chords", "bass"] });
    expect(plan?.alone).toEqual({ from: "code", tracks: ["chords"] });
    expect(plan?.aloneLabel).toMatch(/^The chords? alone$/);
  });
  test("one chord with nothing around it offers nothing: Play already is the chord alone", () => {
    const part = partsOf(stepEx("U12.L01", "S6"))[0] as Exercise;
    expect(earAfterPlan(part, { ...none, tracks: ["chords"] })).toBeNull();
  });
  test("a drawn trial uses the drill's own 'alone', when the drill has one", () => {
    const ex = {
      kind: "identify",
      id: "x",
      prompt: "Which degree?",
      stimulus: { src: "generator", family: "fam.deg.fet", level: 1 },
      cue: { context: "cadence", countInBars: 0, click: false, replays: -1 },
      answer: { ui: "degree-pad", set: ["1", "3", "5"], syllables: false },
      correct: { degrees: ["5"] },
    } as unknown as Exercise;
    const trial = { family: "fam.deg.fet", expected: { degrees: ["5"] }, params: {} } as never;
    expect(earAfterPlan(ex, { trial, tracks: [], trialAlone: true })).toEqual({
      aloneLabel: "The note alone",
      alone: { from: "trial" },
    });
    expect(earAfterPlan(ex, { trial, tracks: [], trialAlone: false })).toBeNull();
    expect(earAfterPlan(ex, { trial: null, tracks: [], trialAlone: true })).toBeNull();
  });
  test("code, sung and tapped steps are not ear answers", () => {
    expect(isEarAnswer(stepEx("U12.L01", "S5"))).toBe(false);
    expect(isEarAnswer(stepEx("U15.L02", "S7"))).toBe(false);
    expect(isEarAnswer(stepEx("U13.L01", "S2"))).toBe(false);
    expect(isEarAnswer(undefined)).toBe(false);
  });
  test("only after an answer, only in a lesson, never while checking", () => {
    expect(earAfterShown({ mode: "lesson", answered: true, checking: false })).toBe(true);
    expect(earAfterShown({ mode: "lesson", answered: false, checking: false })).toBe(false);
    expect(earAfterShown({ mode: "lesson", answered: true, checking: true })).toBe(false);
    expect(earAfterShown({ mode: "checkpoint", answered: true, checking: false })).toBe(false);
  });
});

describe("where a Make starts (d15)", () => {
  const starter = 'setcpm(90/4)\n\nmel: n("0 2 4").scale("C4:major")';
  const sketch = (versions: { version: number; code: string }[]): LessonSketch =>
    ({
      lessonId: "U11.L06",
      sketch: { id: "sk_1", title: "My blues", versions },
    }) as unknown as LessonSketch;
  test("only a Make that names a lesson builds on a sketch", () => {
    expect(fromSketchOf(stepEx("U12.L01", "S7"))).toBeNull();
    expect(fromSketchOf(stepEx("U12.L01", "S5"))).toBeNull();
    expect(fromSketchOf({ kind: "code-make", fromSketch: "U11.L06" } as unknown as Exercise)).toBe("U11.L06");
    expect(fromSketchOf(undefined)).toBeNull();
  });
  test("the newest version of the learner's sketch; none when there is none", () => {
    const own = ownSketchOf(
      sketch([
        { version: 1, code: "one" },
        { version: 3, code: "three" },
        { version: 2, code: "two" },
      ]),
    );
    expect(own).toEqual({ sketchId: "sk_1", title: "My blues", code: "three" });
    expect(ownSketchOf({ lessonId: "U11.L06", sketch: null } as LessonSketch)).toBeNull();
    expect(ownSketchOf(sketch([]))).toBeNull();
    expect(ownSketchOf(sketch([{ version: 1, code: "  " }]))).toBeNull();
    expect(ownSketchOf(undefined)).toBeNull();
  });
  test("with a sketch the Make opens with it, and offers Oak's copy; without one, Oak's copy as before", () => {
    const own = { sketchId: "sk_1", title: "My blues", code: "mine" };
    expect(makeStart({ starter, own, current: null })).toEqual({
      code: "mine",
      source: "sketch",
      choice: true,
    });
    expect(makeStart({ starter, own: null, current: null })).toEqual({
      code: starter,
      source: "oak",
      choice: false,
    });
  });
  test("code the step already holds always wins", () => {
    const own = { sketchId: "sk_1", title: "My blues", code: "mine" };
    expect(makeStart({ starter, own, current: "edited" }).code).toBe("edited");
    expect(makeStart({ starter, own, current: starter }).source).toBe("oak");
    expect(makeStart({ starter, own: null, current: "edited" })).toEqual({
      code: "edited",
      source: "oak",
      choice: false,
    });
  });
  test("the note names the lesson by title, never by ID", () => {
    const own = { sketchId: "sk_1", title: "My blues", code: "mine" };
    expect(makeStartNote("sketch", own, "Turnarounds")).toBe(
      "This opens with your own sketch from “Turnarounds”, “My blues”.",
    );
    expect(makeStartNote("oak", own, null)).toBe(
      "This is Oak's copy. Your sketch, “My blues”, is kept as it is.",
    );
    expect(makeStartNote("sketch", own, "Turnarounds")).not.toMatch(/U\d\d\.L\d\d/);
  });
});

function memoryStore(): DraftStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
  };
}

describe("an unchecked answer survives a reload (d4)", () => {
  const rn: AnswerSpec = { ui: "rn-palette", slots: 4, allow: ["triads"] } as AnswerSpec;
  const key = draftKey({ ownerId: "U15.L02", stepId: "S6", seriesNo: 0, exerciseId: "name-it" });
  const empty = ["", "", "", ""];
  test("the kinds built from several picks are kept; a choice or a text field is not", () => {
    for (const ui of ["form", "scale-builder", "bar-grid", "rn-palette", "staff-input"])
      expect(keepsDraft({ ui } as AnswerSpec)).toBe(true);
    for (const ui of ["choice", "text", "number", "degree-pad", "mic", "tap"])
      expect(keepsDraft({ ui } as AnswerSpec)).toBe(false);
    expect(keepsDraft(null)).toBe(false);
  });
  test("kept as entered, restored, and gone once it equals the empty answer", () => {
    const s = memoryStore();
    saveDraft(key, ["IV", "V7/V", "", ""], empty, s);
    expect(loadDraft(key, rn, empty, s)).toEqual(["IV", "V7/V", "", ""]);
    saveDraft(key, empty, empty, s);
    expect(s.data.size).toBe(0);
    expect(loadDraft(key, rn, empty, s)).toBeNull();
  });
  test("a draft of another shape is dropped, not shown half-right", () => {
    const s = memoryStore();
    s.setItem(key, JSON.stringify({ v: ["IV", "V"] }));
    expect(loadDraft(key, rn, empty, s)).toBeNull();
    expect(s.data.size).toBe(0);
    s.setItem(key, "not json");
    expect(loadDraft(key, rn, empty, s)).toBeNull();
    expect(draftFits(rn, empty, ["I", 4, "", ""])).toBe(false);
    expect(draftFits({ ui: "scale-builder" } as AnswerSpec, [], ["1", "2", "b3"])).toBe(true);
    expect(draftFits({ ui: "scale-builder" } as AnswerSpec, [], [60, 62, 63])).toBe(true);
    expect(draftFits({ ui: "form", input: "map" } as AnswerSpec, ["1:"], ["1:A", "9:B"])).toBe(true);
    expect(draftFits({ ui: "form", input: "map" } as AnswerSpec, ["1:"], [])).toBe(false);
  });
  test("leaving the step forgets every series and part of it, and nothing of another step", () => {
    const s = memoryStore();
    const other = draftKey({ ownerId: "U15.L02", stepId: "S4", seriesNo: 0, exerciseId: "lean" });
    const second = draftKey({ ownerId: "U15.L02", stepId: "S6", seriesNo: 1, exerciseId: "name-it" });
    for (const k of [key, other, second]) saveDraft(k, ["I", "", "", ""], empty, s);
    clearStepDrafts("U15.L02", "S6", s);
    expect([...s.data.keys()]).toEqual([other]);
  });
  test("no storage: nothing is kept and nothing throws", () => {
    expect(loadDraft(key, rn, empty, null)).toBeNull();
    saveDraft(key, ["I", "", "", ""], empty, null);
    clearStepDrafts("U15.L02", "S6", null);
    const broken: DraftStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {},
      length: 0,
      key: () => null,
    };
    expect(loadDraft(key, rn, empty, broken)).toBeNull();
    saveDraft(key, ["I", "", "", ""], empty, broken);
  });
});

describe("a disabled Check says which slot is still empty (d4)", () => {
  test("U15.L02 S6: three of four numerals in", () => {
    const ex = stepEx("U15.L02", "S6") as Exclude<Exercise, { kind: "all" }>;
    const initial = ["", "", "", ""];
    // Not begun: an untouched palette needs no reminder.
    expect(checkReason(ex, initial, initial)).toBeNull();
    expect(checkReason(ex, ["IV", "V7/V", "", "I"], initial)).toBe("Bar 3 is still empty.");
    expect(checkReason(ex, ["IV", "V7/V", "V7", "I"], initial)).toBeNull();
    expect(answerBegun(["IV", "", "", ""], initial)).toBe(true);
  });
});

describe("what the host passes for sevenths, key changes and modes", () => {
  test("sevenths are offered from U12.L01 and never before", () => {
    for (const id of ["U12.L01", "U13.CP", "U17.L04", "J1.L01", "R2.L03"])
      expect(seventhsTaught(id)).toBe(true);
    for (const id of ["U05.L09", "U11.L08", "U11.CP", "U05.CP", "A1.L02", "U00.L01"])
      expect(seventhsTaught(id)).toBe(false);
  });
  test("a key change is read from the exercise's own key plan", () => {
    const C = { tonic: "C", mode: "major" } as const;
    const D = { tonic: "D", mode: "major" } as const;
    expect(
      keyChangeOf({
        keyPlan: [
          { bar: 1, key: C },
          { bar: 9, key: D },
        ],
      } as unknown as Exercise),
    ).toEqual({ from: C, to: D, atBar: 9 });
    expect(keyChangeOf({ keyPlan: [{ bar: 1, key: C }] } as unknown as Exercise)).toBeNull();
    expect(
      keyChangeOf({
        keyPlan: [
          { bar: 1, key: C },
          { bar: 5, key: C },
        ],
      } as unknown as Exercise),
    ).toBeNull();
    expect(keyChangeOf(stepEx("U12.L01", "S5"))).toBeNull();
    expect(keyChangeOf(undefined)).toBeNull();
  });
  test("the scales a piece of code names, patterned or not", () => {
    expect(scalesInCode('n("0 1").scale("<G4:major G4:mixolydian>").s("piano")')).toEqual([
      { tonic: "G", mode: "major" },
      { tonic: "G", mode: "mixolydian" },
    ]);
    expect(scalesInCode('n("0").scale("<C2:major!4 D2:major!4>")\nmel: n("1").scale("Bb4:minor")')).toEqual([
      { tonic: "C", mode: "major" },
      { tonic: "D", mode: "major" },
      { tonic: "Bb", mode: "minor" },
    ]);
    expect(scalesInCode('note("c e g")')).toEqual([]);
  });
  test("U14.L01 S3 compares G Mixolydian with G major: the staff keeps G major's signature", () => {
    const def = lesson("U14.L01");
    const s3 = stepEx("U14.L01", "S3") as { code: { starter: string } };
    expect(modalSignatureStyleOf(s3.code.starter, def.key)).toBe("parallel");
    // A piece that is simply in the mode is signed as the mode (the folk tunes of U14.L02 and L03).
    const dorian = 'mel: n("0 1 2").scale("D4:dorian")';
    expect(modalSignatureStyleOf(dorian, { tonic: "D", mode: "dorian" })).toBe("mode");
    expect(modalSignatureStyleOf(dorian, { tonic: "D", mode: "minor" })).toBe("mode");
    // A direct modulation (C to D, both major) is a key change, not a mode beside its parent.
    const lift = 'mel: n("0").scale("<C4:major!4 D4:major!4>")';
    expect(modalSignatureStyleOf(lift, { tonic: "C", mode: "major" })).toBe("mode");
    expect(modalSignatureStyleOf(lift, null)).toBe("mode");
  });
});

describe("what a checkpoint pass says about the tracks it opened", () => {
  const titles = new Map([
    ["J", "Jazz Harmony"],
    ["R", "Advanced Rhythm"],
  ]);
  const gate = (gateId: string, trackId: "J" | "R", lessonsAuthored = 0) =>
    ({
      gateId,
      trackId,
      opens: "J1, J2.L01–L03, J3",
      requires: [],
      open: true,
      openedAt: "2026-11-13T10:00:00.000Z",
      lessonsAuthored,
      lessonsTotal: 9,
    }) as NonNullable<CheckpointOutcome["gatesOpened"]>[number];
  test("U13.CP: both tracks, by title, open and still being written", () => {
    const c = tracksOpenedCopy([gate("J.main", "J"), gate("R.main", "R")], titles);
    expect(c?.title).toBe("The Jazz Harmony and Advanced Rhythm tracks are open");
    expect(c?.body).toContain("optional");
    expect(c?.body).toContain("still being written");
    expect(c?.body).toContain("the core goes on");
    expect(c?.authored).toBe(false);
    // Never an ID, never what it "opens" as the contracts list it.
    expect(`${c?.title} ${c?.body}`).not.toMatch(/\b[JR]\d|\bJ\.|\bR\.|U\d\d/);
  });
  test("U14.CP and U17.CP: a further part of one track", () => {
    const c = tracksOpenedCopy([gate("J.chord-scales", "J")], titles);
    expect(c?.title).toBe("More of the Jazz Harmony track is open");
    expect(c?.body).toContain("its first lessons are still being written");
  });
  test("once a track has lessons it points at the map, and the core still comes first", () => {
    const c = tracksOpenedCopy([gate("J.main", "J", 3)], titles);
    expect(c?.authored).toBe(true);
    expect(c?.body).toContain("course map");
    expect(c?.body).toContain("stays on the core");
    expect(c?.body).not.toContain("still being written");
  });
  test("nothing opened says nothing; a track the syllabus does not name is not printed as an ID", () => {
    expect(tracksOpenedCopy([], titles)).toBeNull();
    expect(tracksOpenedCopy(undefined, titles)).toBeNull();
    expect(tracksOpenedCopy([{ ...gate("J.main", "J"), open: false }], titles)).toBeNull();
    const c = tracksOpenedCopy([gate("J.main", "J")], new Map());
    expect(c?.title).toBe("New optional lessons are open");
    expect(`${c?.title} ${c?.body}`).not.toMatch(/\bJ\b/);
  });
});

describe("the music lenses a step shows because they are its subject", () => {
  test("a compound meter always shows its beat grid; a simple one leaves it to the learner", () => {
    expect(stepMusicLenses({ lessonId: "U13.L04", meter: "6/8" })).toEqual({ beatGrid: true });
    expect(stepMusicLenses({ lessonId: "U13.L06", meter: "12/8" })).toEqual({ beatGrid: true });
    expect(stepMusicLenses({ lessonId: "U13.L04", meter: "4/4" })).toEqual({});
    expect(stepMusicLenses({ lessonId: "U09.L03", meter: "3/4" })).toEqual({});
    expect(isCompound("9/8")).toBe(true);
    // 9/8 counted in nine eighths (3+2+2+2) is not compound.
    expect(isCompound("9/8i")).toBe(false);
    expect(isCompound("5/4")).toBe(false);
  });
  test("the key ribbon through U17; the guide-tone lens is never forced", () => {
    for (const id of ["U17.L01", "U17.L02", "U17.L04"])
      expect(stepMusicLenses({ lessonId: id, meter: "4/4" })).toEqual({ keyPlan: true });
    for (const id of ["U12.L05", "U12.L06", "U16.L05", "U03.L05", "U17.CP", "A1.L01"])
      expect(stepMusicLenses({ lessonId: id, meter: "4/4" })).toEqual({});
    // Sevenths open the lens's switch at U12.L01, but guide tones are taught in U12.L05: not drawn before it.
    for (const id of ["U12.L01", "U12.L02", "U12.L03", "U12.L04"])
      expect(stepMusicLenses({ lessonId: id, meter: "4/4" })).toEqual({ guideTones: false });
  });
});

describe("a tap step in 6/8 is counted on the dotted quarter (U13.L04)", () => {
  // Two bars of 6/8 at 60 to the dotted quarter: a bar lasts two seconds, its beats fall on 0 and 1.
  const tap = {
    kind: "tap",
    id: "two-in-a-bar",
    version: 1,
    role: "practice",
    prompt: "Tap the beat.",
    skills: [{ skill: "R11", w: 1 }],
    hints: null,
    tests: [],
    meter: "6/8",
    bpm: 60,
    mode: "along",
    stimulus: {
      src: "code",
      code: 'setcpm(60/2)\n\nhats: s("hh*6")\nkick: s("bd ~ ~ bd ~ ~")',
      bars: 2,
      showCode: false,
    },
    cue: { context: "none", countInBars: 1, click: true, replays: -1 },
    bars: 2,
    target: "beat",
    tol: { windowMs: "auto", tempo: "locked", forgiveOffset: true, passF1: 0.8, passTiming: 0.7 },
  } as unknown as Exercise;
  const env: GradeEnv = {
    ownerId: "U13.L04",
    key: { tonic: "C", mode: "major" },
    meter: "6/8",
    bpm: 60,
    unlocked: new Set(),
    allowPreview: true,
    profile: NEUTRAL_PROFILE,
  };
  test("two taps a bar pass; three (the quarter notes of 3/4) do not", async () => {
    const two = await gradeStep(deps, env, tap, { taps: [0, 1, 2, 3] }, OPTS);
    expect(two.status).toBe("pass");
    const three = await gradeStep(deps, env, tap, { taps: [0, 0.667, 1.333, 2, 2.667, 3.333] }, OPTS);
    expect(three.status).not.toBe("pass");
  });
});

describe("a guide-tone line (sing.guide-tones, U12.L05)", () => {
  test("what Sing does is said for each way a sung step runs", () => {
    expect(singHowText({ mode: "echo", countIn: true, labels: "syllables" })).toBe(
      "Press Sing: Oak plays it once, then you sing it back.",
    );
    expect(singHowText({ mode: "degree", countIn: true, labels: "numbers" })).toBe(
      "Press Sing: the chords set home, a bar of clicks counts you in, then you sing, on the numbers or any vowel.",
    );
    const guide = singHowText({ mode: "guide-tones", countIn: false, labels: "syllables" });
    expect(guide).toContain("one long note for each chord");
    expect(guide).toContain("the syllables (the numbers work too)");
    expect(guide).not.toContain("clicks");
  });
  test("in Quiet mode the line read from music is picked as degrees of the key, on the key's own pad", () => {
    // Dm7 G7 Cmaj7 in C: the thread F (7th of Dm7 → 4) → F (7th of G7) → E (3rd of Cmaj7).
    const C = { tonic: "C", mode: "major" } as const;
    expect(guideToneFallback([{ midi: 65 }, { midi: 65 }, { midi: 64 }], C, 0)).toEqual({
      degrees: ["4", "4", "3"],
      set: ["1", "2", "3", "4", "5", "6", "7"],
    });
    // A chromatic note of the line joins the pad in its place; the pad never shows only the answer.
    const withFi = guideToneFallback([{ midi: 65 }, { midi: 66 }, { midi: 67 }], C, 0);
    expect(withFi?.degrees).toEqual(["4", "#4", "5"]);
    expect(withFi?.set).toEqual(["1", "2", "3", "4", "#4", "5", "6", "7"]);
    // In a minor key the key's own lowered degrees are the pad.
    const Am = { tonic: "A", mode: "minor" } as const;
    expect(guideToneFallback([{ midi: 60 }, { midi: 59 }], Am, 9)?.degrees).toEqual(["b3", "2"]);
    expect(guideToneFallback([], C, 0)).toBeNull();
  });
});

describe("the chord a guide-tone pick is about (U12.L05)", () => {
  const pick = (prompt: string, pcs: number[], mode = "chord") =>
    ({
      kind: "keyboard",
      id: "guide",
      prompt,
      answer: { ui: "keyboard", range: ["c3", "c5"], mode },
      expect: { pcs },
    }) as unknown as Exercise;
  test("named only when the answer is exactly the 3rd and 7th of a chord the prompt names", () => {
    expect(guideChordOf(pick("Play the guide tones of `G7`: its 3rd and its 7th.", [11, 5]))).toBe("G7");
    expect(guideChordOf(pick("Find the two guide tones of Dm7.", [5, 0]))).toBe("Dm7");
    expect(guideChordOf(pick("The guide tones of B♭7, on the keyboard.", [2, 8]))).toBe("Bb7");
    // The prompt names two chords: the one whose guide tones are the answer.
    expect(guideChordOf(pick("Dm7 goes to G7. Play the guide tones of G7.", [5, 11]))).toBe("G7");
  });
  test("never for another keyboard step", () => {
    // A whole chord (U12.L01 S4: Fmaj7), a triad's notes, another chord's notes, a single-note pick.
    expect(guideChordOf(stepEx("U12.L01", "S4"))).toBeNull();
    expect(guideChordOf(pick("Play the 3rd and the 5th of G7.", [11, 2]))).toBeNull();
    expect(guideChordOf(pick("Play the guide tones of G7.", [4, 10]))).toBeNull();
    expect(guideChordOf(pick("A chord with no seventh: G. Play its 3rd and root.", [11, 7]))).toBeNull();
    expect(guideChordOf(pick("Play the guide tones of G7.", [11, 5], "single"))).toBeNull();
    expect(guideChordOf(undefined)).toBeNull();
  });
});

describe("a checkpoint grades a family item as the drill runner does", () => {
  const push = {
    family: "fam.rhy.syncopation",
    params: { ui: "click-cell", stepsPerBar: 16 },
    expected: { choice: ["c14"] },
  } as never;
  test("the step marked on the grid of a 'find the push' trial is the family's own cell", () => {
    const r = familyResponse({ answer: { choice: ["14"] } }, 1200, 0, 0, { choice: ["c14"] }, push);
    expect(r).toMatchObject({ answer: { choice: ["c14"] } });
    // Already the family's cell (the dev hook answers with the expected value): unchanged.
    expect(drillAnswer({ choice: ["c14"] }, { choice: ["c14"] }, push)).toEqual({ choice: ["c14"] });
    // A choice of another family is left alone.
    const plain = { family: "fam.key.mode", params: {}, expected: { choice: ["dorian"] } } as never;
    expect(drillAnswer({ choice: ["dorian"] }, { choice: ["dorian"] }, plain)).toEqual({
      choice: ["dorian"],
    });
    expect(drillAnswer({ choice: ["14"] })).toEqual({ choice: ["14"] });
  });
  test("a chromatic degree picked on its pad key is the asked spelling of that pitch", () => {
    const fet = { family: "fam.deg.fet-chromatic", params: {}, expected: { degrees: ["b6"] } } as never;
    expect(drillAnswer({ degrees: ["#5"] }, { degrees: ["b6"] }, fet)).toEqual({ degrees: ["b6"] });
    expect(drillAnswer({ degrees: ["5"] }, { degrees: ["b6"] }, fet)).toEqual({ degrees: ["5"] });
  });
});

describe("a chromatic degree item in a checkpoint (U17.CP, fam.deg.fet-chromatic)", () => {
  test("the pad is the drill runner's: one key per pitch, spelled ♯4 / ♭6, never a category ID", async () => {
    const { FAMILIES } = await import("@oak/drills");
    const { familyAnswerSpec } = await import("./checkpoint/model.ts");
    const { familyTrial } = await import("./grading.ts");
    const def = (
      FAMILIES as unknown as { def: { id: string; answer: string; categories: { id: string }[] } }[]
    )
      .map((f) => f.def ?? f)
      .find((f) => f.id === "fam.deg.fet-chromatic");
    expect(def).toBeDefined();
    const cats = (def?.categories ?? []).map((c) => c.id);
    for (const level of [1, 2, 3]) {
      for (let seed = 0; seed < 8; seed++) {
        const t = familyTrial("fam.deg.fet-chromatic", level, null, seed * 31 + 7, NEUTRAL_PROFILE);
        const spec = familyAnswerSpec(def?.answer ?? "degree-pad", t, cats, def as never) as {
          ui: string;
          set: string[];
        };
        expect(spec.ui).toBe("degree-pad");
        expect(spec.set.some((d) => /^s\d/.test(d))).toBe(false);
        // The asked pitch has a key: its own spelling, or the one key of that pitch.
        const asked = (t.expected.degrees ?? [])[0] as string;
        const semis = (d: string) =>
          ((([0, 2, 4, 5, 7, 9, 11][Number(d.replace(/^[#b]/, "")) - 1] ?? 0) +
            (d.startsWith("#") ? 1 : d.startsWith("b") ? -1 : 0) +
            12) %
            12) as number;
        expect(spec.set.some((d) => semis(d) === semis(asked))).toBe(true);
      }
    }
  });
});
