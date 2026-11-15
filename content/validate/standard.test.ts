// The corrections-pass standard (./standard.ts) is a check that can fail: each of its four rules is shown failing on
// a step written to break it, and passing on the same step written to the standard. The whole-track run is in
// lessons.test.ts / owners.test.ts (content:check section 15).
import { describe, expect, test } from "bun:test";
import type { Exercise, TestCase } from "@oak/content-kit";
import { answerSnippet, callsOf, isTrackLesson, matcherHeard, standardIssues } from "./standard.ts";

const STARTER = 'setcpm(120/4)\n\nhats: s("hh*8")';
const ANSWER = 'setcpm(120/4)\n\nhats: s("hh*8").swingBy(1/3, 4)';
const t = (name: string, code: string, expect: "pass" | "fail"): TestCase => ({
  name,
  response: { code },
  expect,
});
const RIGHT = [
  t("reference", ANSWER, "pass"),
  t("swing on 4, another sound", 'setcpm(120/4)\n\nhats: s("rd*8").swingBy(1/3, 4)', "pass"),
  t("a lighter swing", 'setcpm(120/4)\n\nhats: s("hh*8").swingBy(.25, 4)', "pass"),
  t("swing and a gain", 'setcpm(120/4)\n\nhats: s("hh*8").swingBy(1/3, 4).gain(.6)', "pass"),
];
const WRONG = [
  t("unchanged", STARTER, "fail"),
  t(
    "the right call, nothing moves: swingBy(1/3, 8)",
    'setcpm(120/4)\n\nhats: s("hh*8").swingBy(1/3, 8)',
    "fail",
  ),
];
const modify = (o: {
  tests?: TestCase[];
  hints?: string[];
  matcher?: unknown;
  feedbackText?: object;
}): Exercise =>
  ({
    kind: "code-modify",
    id: "swing-it",
    version: 1,
    role: "check",
    prompt: "Swing the hats.",
    skills: [],
    hints: [
      ...(o.hints ?? ["Which notes move?", "The off-beats.", "A call on the hats line."]).map((text) => ({
        text,
      })),
      "auto",
    ],
    code: { starter: STARTER },
    reference: { solutions: [ANSWER], bars: 2 },
    matcher: o.matcher ?? {
      m: "rubric",
      rules: [
        {
          id: "sw",
          label: "swing",
          required: true,
          skills: [],
          rule: "swing",
          track: "hats",
          ratio: [1.4, 2.4],
        },
      ],
    },
    target: { audible: true },
    ...(o.feedbackText ? { feedbackText: o.feedbackText } : {}),
    tests: o.tests ?? [...RIGHT, ...WRONG],
  }) as unknown as Exercise;
const quiet = async () => ({ passed: false, messages: ["Not yet: the off-beats sit in the middle."] });
const run = (e: Exercise, grade = quiet) => standardIssues({ where: "X.L01 S1", e }, grade);

describe("the corrections standard as a check", () => {
  test("a step written to the standard has no issue", async () => {
    expect(await run(modify({}))).toEqual([]);
  });
  test("(a) a matcher that only reads the code's shape is refused", async () => {
    const m = {
      m: "rubric",
      rules: [{ id: "u", label: "uses", required: true, skills: [], rule: "uses", tool: "tb.swingBy" }],
    };
    expect(await run(modify({ matcher: m }))).toEqual([
      expect.stringContaining("checks only the code's shape"),
    ]);
    expect(matcherHeard({ m: "all", of: [m, { m: "rhythm" }] } as never)).toBe(true);
  });
  test("(b) without a wrong answer that uses the right function, the step fails the check", async () => {
    const tests = [...RIGHT, t("unchanged", STARTER, "fail"), t("hats removed", "setcpm(120/4)", "fail")];
    expect(await run(modify({ tests }))).toEqual([
      expect.stringContaining("uses the right function (swingBy)"),
    ]);
  });
  test("(c) fewer than three other right answers fail the check", async () => {
    const tests = [...RIGHT.slice(0, 3), ...WRONG];
    expect(await run(modify({ tests }))).toEqual([expect.stringContaining("2 right answers")]);
  });
  test("(d) a low rung, an override or a line the learner reads that quotes the answer fails the check", async () => {
    expect(await run(modify({ hints: ["a", "b", "Write `.swingBy(1/3, 4)` on the hats."] }))).toEqual([
      expect.stringContaining("rung 3 names the answer `.swingBy(1/3, 4)`"),
    ]);
    expect(await run(modify({ feedbackText: { "rubric.unmet": "add .swingBy(1/3, 4)" } }))).toEqual([
      expect.stringContaining("a feedback override names the answer"),
    ]);
    const says = async () => ({ passed: false, messages: ["Swing: not yet (add `.swingBy(1/3, 4)`)"] });
    expect(await run(modify({}), says)).toEqual([
      expect.stringContaining("the learner reads the answer `.swingBy(1/3, 4)`"),
    ]);
  });
  test("the answer is read as the whole call it sits in, whole tokens, never a fragment", () => {
    expect(answerSnippet(STARTER, ANSWER)).toBe(".swingBy(1/3, 4)");
    expect(answerSnippet('x: s("hh").swingBy(1/3, 4)', 'x: s("hh").swingBy(1/3, 8)')).toBe(
      ".swingBy(1/3, 8)",
    );
    expect(answerSnippet('const c = "<Dm7 G7 Am7>"', 'const c = "<Dm7 G7 Ebm7b5>"')).toBe("Ebm7b5");
    // Too small to quote: a one-letter change says nothing about the answer on its own.
    expect(answerSnippet('const c = "<Dm7 G7 C^7 C>"', 'const c = "<Dm7 G7 C^7 C^7>"')).toBeNull();
    expect(answerSnippet("a", "a")).toBeNull();
    expect([...callsOf('note("c").s("piano").gain(.5)')]).toEqual(["note", "s", "gain"]);
  });
  test("the tracks it binds: J1–J5, R1–R3, A1 from L05, A2", () => {
    expect(["J1.L01", "J5.L05", "R3.L05", "A1.L05", "A1.L07", "A2.L06"].every(isTrackLesson)).toBe(true);
    expect(["A1.L04", "U17.L04", "J.CP1", "JC1"].some(isTrackLesson)).toBe(false);
  });
});
