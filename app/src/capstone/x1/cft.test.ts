// CF-T in the capstone workspace, on a small AABA song of the test's own (the three standards' answer keys are
// author:repertoire's): the form map's grade and feedback (which section, what to compare, never the answer), the
// map as a check the bass waits for, the bare starter and the skeleton written from a passed map, and the last
// session's rubric (the four roles, the song's own sections) graded with the real grader.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { CapstoneDef, PhraseCheck, RubricRule, SongDef } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { STANDARD_LADDER_MATCHERS } from "@oak/grader";
import type { FormMap } from "../../transcribe/form-map.ts";
import { isBareDraft, skeletonOfForm } from "../../transcribe/standard.ts";
import { checklistOf, readiness } from "../checklist.ts";
import { ensureRealm, unlockedFor } from "../test-support.ts";
import {
  capstoneStarter,
  FORM_MAP_NAME,
  formMapGrade,
  formMapMessages,
  formMapOf,
  formMapSettled,
  formMapState,
  sessionRubric,
  sessionRubricRequest,
  songFormMap,
} from "./cft.ts";
import { capstoneRows, songGivenFromDef } from "./phrases.ts";

setDefaultTimeout(120_000);

const SONG = {
  id: "song.test-aaba",
  title: "Test Standard",
  year: 1925,
  bpm: 120,
  meter: "4/4",
  key: { tonic: "C", mode: "major" },
  form: "AABA",
  answerKey: {
    bars: 32,
    code: "",
    layers: {},
    phrases: [
      [1, 8],
      [9, 16],
      [17, 24],
      [25, 32],
    ],
    sections: [
      { label: "A", bars: [1, 8] },
      { label: "A", bars: [9, 16] },
      { label: "B", bars: [17, 24] },
      { label: "A", bars: [25, 32] },
    ],
  },
} as unknown as SongDef;

const map = (cuts: number[], labels: string[]): FormMap => ({ bars: 32, cuts, labels });
const CHECK = { id: "form-map", vocabulary: "letters", boundaries: "asked", pass: 1 } as const;
const bass = (n: number): PhraseCheck =>
  ({
    id: `bass-${n}`,
    phrase: n,
    layer: "bass",
    matcher: STANDARD_LADDER_MATCHERS.bass,
    pass: 0.9,
    after: ["form-map"],
  }) as unknown as PhraseCheck;
const RUBRIC: RubricRule[] = [
  {
    id: "roles",
    label: "Drums, bass, chords and melody",
    required: true,
    skills: [],
    rule: "tracks",
    min: 4,
    roles: ["drums", "bass", "chords", "melody"],
  } as unknown as RubricRule,
  {
    id: "form",
    label: "The song's own sections, in order",
    required: true,
    skills: [],
    rule: "form",
    pattern: "@song",
    extra: ["intro", "outro"],
  } as unknown as RubricRule,
];
const DEF = {
  id: "CF-T",
  sessionDefs: [
    {
      id: "CF-T.S1",
      title: "Form & bass",
      goal: "",
      formMap: CHECK,
      checks: [bass(1), bass(2), bass(3), bass(4)],
    },
    { id: "CF-T.S2", title: "Changes", goal: "", checks: [] },
    { id: "CF-T.S3", title: "Melody", goal: "", checks: [] },
    { id: "CF-T.S4", title: "Arrange", goal: "", rubric: RUBRIC, review: true, release: true },
  ],
} as unknown as CapstoneDef;

const grade = (m: FormMap, o: { attemptNo?: number; reveal?: boolean } = {}) =>
  formMapGrade({ capstoneId: "CF-T", check: CHECK, song: SONG, map: m, attemptNo: o.attemptNo ?? 1, ...o });

describe("the form map's grade", () => {
  test("the right cuts with the right shape pass, whatever the names: A A B A, verse verse bridge verse", () => {
    for (const labels of [
      ["A", "A", "B", "A"],
      ["verse", "verse", "bridge", "verse"],
      ["X", "X", "Y", "X"],
    ]) {
      const g = grade(map([1, 9, 17, 25], labels));
      expect({ passed: g.passed, status: g.result.status, score: g.result.score }).toEqual({
        passed: true,
        status: "pass",
        score: 1,
      });
      expect(g.result.messages).toEqual([]);
    }
    expect(grade(map([1, 9, 17, 25], ["A", "A", "B", "A"])).result).toMatchObject({
      exerciseId: "CF-T/form-map",
      mode: "capstone",
      assist: { rung: 0, revealed: false },
    });
  });

  test("a wrong name says which section to listen to, against which bars, and never the answer", () => {
    const g = grade(map([1, 9, 17, 25], ["A", "B", "A", "B"]));
    expect(g.passed).toBe(false);
    expect(g.result.status).toBe("fail");
    expect(g.result.score).toBeLessThan(1);
    const texts = g.result.messages.map((m) => m.text);
    expect(texts[0]).toMatch(
      /^Section \d starts in the right place\. Its name: listen to bars \d+–\d+ against bars 1–2\.$/,
    );
    for (const t of texts) {
      expect(t).not.toMatch(/\bAABA\b|is an? [AB]\b|should be/);
      expect(t).not.toContain("!");
    }
    expect(g.result.messages.every((m) => typeof m.where?.bar === "number")).toBe(true);
  });

  test("a cut where the tune has no new section names the bars that are one; a missing cut asks to listen for it", () => {
    const extra = grade(map([1, 9, 17, 21, 25], ["A", "A", "B", "C", "A"]));
    expect(extra.passed).toBe(false);
    expect(formMapMessages(extra.detail).map((m) => m.text)).toContain(
      "There is no new section at bar 21: bars 17–24 are one.",
    );
    const halves = grade(map([1, 17], ["A", "B"]));
    expect(halves.passed).toBe(false);
    expect(
      formMapMessages(halves.detail).some((m) => /Something new starts between bars \d+–\d+/.test(m.text)),
    ).toBe(true);
  });

  test("a revealed map earns nothing, is marked revealed and shows the song's own sections", () => {
    const g = grade(map([1, 17], ["A", "B"]), { attemptNo: 3, reveal: true });
    expect(g.passed).toBe(false);
    expect(g.result).toMatchObject({ score: 0, adjustedScore: 0, assist: { rung: 4, revealed: true } });
    expect(songFormMap(SONG)).toEqual({ bars: 32, cuts: [1, 9, 17, 25], labels: ["A", "A", "B", "A"] });
    expect(songFormMap({ answerKey: { bars: 12, code: "", layers: {} } } as never)).toBeNull();
  });
});

describe("the map as the first check", () => {
  test("only CF-T opens with a form map", () => {
    expect(formMapOf(DEF)).toEqual({ sessionIndex: 0, check: CHECK });
    expect(
      formMapOf({ sessionDefs: [{ id: "X2.S1", title: "", goal: "", checks: [] }] } as never),
    ).toBeNull();
  });

  test("the bass checks wait for it, by name, until it has passed or been shown", () => {
    const sessions = DEF.sessionDefs.map((sd) => ({ checks: sd.checks ?? [], server: [] }));
    const open = formMapState(CHECK, [], {});
    expect(open).toEqual({ score: null, passed: false, revealed: false, attempts: 0 });
    const waiting = capstoneRows(sessions, {}, formMapSettled(CHECK, open))[0] ?? [];
    expect(waiting.map((r) => r.open)).toEqual([false, false, false, false]);
    expect(waiting[0]?.waitsFor).toBe(FORM_MAP_NAME);
    // The server's row (layer "form") settles it; so does a pass graded here before the server stored it.
    const server = [{ checkId: "form-map", score: 1, passed: true, revealed: false, attempts: 2 }];
    const done = formMapState(CHECK, server, {});
    expect(done).toMatchObject({ passed: true, attempts: 2, score: 1 });
    expect((capstoneRows(sessions, {}, formMapSettled(CHECK, done))[0] ?? []).every((r) => r.open)).toBe(
      true,
    );
    const local = formMapState(CHECK, [], {
      "form-map": { score: 0.5, passed: false, revealed: true, attempts: 3 },
    });
    expect((capstoneRows(sessions, {}, formMapSettled(CHECK, local))[0] ?? []).every((r) => r.open)).toBe(
      true,
    );
    // X1 and X2 pass no map: nothing waits for one.
    expect(
      capstoneRows([{ checks: [{ ...bass(1), after: [] } as PhraseCheck], server: [] }], {})[0]?.[0]?.open,
    ).toBe(true);
  });

  test("the draft starts bare and is written from the passed map: one const per distinct section and track", () => {
    const starter = capstoneStarter(DEF, SONG);
    expect(isBareDraft(starter)).toBe(true);
    expect(starter).toContain("First the form");
    const skeleton = skeletonOfForm(songGivenFromDef(SONG), map([1, 9, 17, 25], ["A", "A", "B", "A"]));
    expect(isBareDraft(skeleton)).toBe(false);
    expect(skeleton.match(/^const bass[AB] = /gm)).toHaveLength(2);
    expect(skeleton).toMatch(/bass: arrange\(\[8, bassA\], \[8, bassA\], \[8, bassB\], \[8, bassA\]\)/);
  });
});

describe("CF-T.S4: the session's rubric on the whole arrangement", () => {
  const arrangement = (order: string[], drums = true) => `setcpm(120/4)

const bassA = n("<0 3 4 0>").scale("C2:major").s("ebass")
const bassB = n("<3 3 4 4>").scale("C2:major").s("ebass")
const chordsA = chord("<C F G C>").voicing().s("piano")
const chordsB = chord("<F F G G>").voicing().s("piano")
const melA = n("<[0 2 4 2] [3 ~ 2 ~] [4 3 2 1] [0 ~ ~ ~]>").scale("C4:major").s("piano")
const melB = n("<[5 ~ 5 3] [5 ~ ~ ~] [4 ~ 4 2] [4 ~ ~ ~]>").scale("C4:major").s("piano")
${drums ? 'const drumsA = s("bd ~ sd ~, hh*8")\nconst drumsB = s("bd bd sd ~, hh*8")' : ""}

bass: arrange(${order.map((x) => `[8, bass${x}]`).join(", ")})
chords: arrange(${order.map((x) => `[8, chords${x}]`).join(", ")})
mel: arrange(${order.map((x) => `[8, mel${x}]`).join(", ")})
${drums ? `drums: arrange(${order.map((x) => `[8, drums${x}]`).join(", ")})` : ""}`;

  const run = async (code: string) => {
    await ensureRealm();
    const result = await grader.gradeExercise(
      sessionRubricRequest({
        capstoneId: "CF-T",
        sessionId: "CF-T.S4",
        rubric: sessionRubric(DEF.sessionDefs[3]),
        song: SONG,
        code,
        lint: {
          profile: "graded",
          unlocked: unlockedFor("CF-A"),
          allowPreview: false,
          meter: "4/4",
          key: null,
        },
      }),
    );
    const rows = checklistOf(RUBRIC, result, {}, [], true);
    return { result, rows, ready: readiness(rows).ready };
  };

  test("only the last session has a rubric", () => {
    expect(sessionRubric(DEF.sessionDefs[0])).toEqual([]);
    expect(sessionRubric(DEF.sessionDefs[3]).map((r) => r.id)).toEqual(["roles", "form"]);
    expect(sessionRubric(undefined)).toEqual([]);
  });

  test("the song's sections in order with all four roles: both lines met, ready to release", async () => {
    const r = await run(arrangement(["A", "A", "B", "A"]));
    expect(r.result.mode).toBe("capstone");
    expect(r.rows.map((x) => [x.id, x.state])).toEqual([
      ["roles", "met"],
      ["form", "met"],
    ]);
    expect(r.ready).toBe(true);
  });

  test("the sections in another order leave the form line open; no drums leave the roles line open", async () => {
    const order = await run(arrangement(["A", "B", "A", "A"]));
    expect(order.rows.find((x) => x.id === "form")?.state).toBe("open");
    expect(order.ready).toBe(false);
    const quiet = await run(arrangement(["A", "A", "B", "A"], false));
    expect(quiet.rows.find((x) => x.id === "roles")?.state).toBe("open");
    expect(quiet.ready).toBe(false);
  });
});
