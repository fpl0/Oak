// The generated ladder (L1–L4, @oak/drills `generateLadderPiece`) through the grader's ladder entry point
// (`gradeLadder`, contracts §6.12): every item's answer key is graded exactly right (pass, score 1, a graded
// pass), at every level, realism and L3 stage, and the same answer with one note or one onset changed is not
// (score below 1, with a diagnostic that names it). Also: the vocabulary gates name real lessons, and the
// default vocabulary is what the learner has at GYM.01 in the default order.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { SessionId, UnlockableId } from "@oak/content-kit";
import {
  DEFAULT_PROFILE,
  generateLadderPiece,
  LADDER_FEATURE_GATES,
  type LadderLevelNo,
  type LadderPiece,
  type LadderRealism,
  type LadderStageId,
  ladderItemOf,
} from "@oak/drills";
import * as grader from "@oak/grader";
import { courseGraph } from "../index.ts";
import { atOrBefore } from "../lib/course.ts";
import { defaultOrder } from "../syllabus.ts";
import { toolbox } from "../toolbox.ts";
import { ladder } from "./ladder.ts";
import { LADDER_OPENS } from "./slots.ts";

setDefaultTimeout(120_000);
await grader.initRealm({ toolbox: [...toolbox], lockdown: false });
const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set(toolbox.map((t) => t.id)) as Set<UnlockableId>,
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const grade = (p: LadderPiece, code: string, stage?: LadderStageId) =>
  grader.gradeLadder({ item: ladderItemOf(p, stage), code, ctx });

/** Number atoms of one labelled `n("…")` line (not `@` weights or `*` repeats), with their offsets. */
function numbers(code: string, label: string, inAdd = false): { at: number; text: string }[] {
  const line = code.split("\n").find((l) => l.startsWith(`${label}:`)) as string;
  const lineAt = code.indexOf(line);
  const from = inAdd ? line.indexOf(".add(n(") + 7 : line.indexOf('n("') + 2;
  const to = line.indexOf('")', from);
  const out: { at: number; text: string }[] = [];
  for (const m of line.slice(from, to).matchAll(/(?<=[\s[<",])-?\d+/g))
    out.push({ at: lineAt + from + (m.index as number), text: m[0] });
  return out;
}
const splice = (code: string, at: number, len: number, text: string) =>
  `${code.slice(0, at)}${text}${code.slice(at + len)}`;
/** One note a step higher (a different degree), and one note turned into a rest (an onset gone). */
function mutations(code: string, label: string, inAdd = false): { what: string; code: string }[] {
  const nums = numbers(code, label, inAdd);
  const mid = nums[Math.floor(nums.length / 2)] as { at: number; text: string };
  const out = [
    {
      what: "one note a step higher",
      code: splice(code, mid.at, mid.text.length, String(Number(mid.text) + 1)),
    },
  ];
  if (!inAdd) out.push({ what: "one onset removed", code: splice(code, mid.at, mid.text.length, "~") });
  return out;
}
/** Drums: one kick taken out, one snare added where there was a rest. */
function drumMutations(code: string): { what: string; code: string }[] {
  const kickLine = code.indexOf("kick:");
  const bd = code.indexOf("bd", code.indexOf('s("', kickLine) + 4);
  const snareLine = code.indexOf("snare:");
  const restAt = code.indexOf("~", snareLine);
  return [
    { what: "one kick removed", code: splice(code, bd, 2, "~") },
    { what: "one snare added", code: splice(code, restAt, 1, "sd") },
  ];
}

const LEVELS: LadderLevelNo[] = [1, 2, 3, 4];
const REALISM: LadderRealism[] = [0, 1, 2, 3, 4];
const AFTER_PICKUPS = { completed: new Set<string>([LADDER_FEATURE_GATES.pickup]) };

describe("gradeLadder marks every answer key exactly right, and a one-note or one-onset change wrong", () => {
  for (const level of LEVELS)
    for (const realism of REALISM)
      test(`L${level} R${realism}`, async () => {
        for (const seed of [3, 17, 4242]) {
          const p = generateLadderPiece(level, realism, seed, DEFAULT_PROFILE, AFTER_PICKUPS);
          const stages: (LadderStageId | undefined)[] = p.stages ?? [undefined];
          for (const stage of stages) {
            const answer = stage ? (p.stageAnswers as Record<LadderStageId, string>)[stage] : p.answer;
            const ok = await grade(p, answer, stage);
            expect([seed, stage, ok.status, ok.score, grader.ladderGradedPass(ok)]).toEqual([
              seed,
              stage,
              "pass",
              1,
              true,
            ]);
            const wrong =
              level === 1
                ? drumMutations(answer)
                : stage === "quality" || stage === "rn"
                  ? mutations(answer, "chords", true)
                  : mutations(answer, level === 4 ? "mel" : "bass");
            for (const m of wrong) {
              const r = await grade(p, m.code, stage);
              expect([seed, stage, m.what, r.score < 1]).toEqual([seed, stage, m.what, true]);
              // A diagnostic names what is wrong (rhythm.*, melody.*, harmony.*), never only a "pass.*" line.
              expect([m.what, r.diagnostics.some((d) => !d.id.startsWith("pass."))]).toEqual([m.what, true]);
            }
          }
        }
      });
});

describe("a whole wrong answer fails", () => {
  test("the bass of another loop, a melody a step off throughout", async () => {
    const p = generateLadderPiece(2, 0, 3, DEFAULT_PROFILE);
    const r = await grade(
      p,
      p.answer.replace(
        /n\("<([^>]*)>"\)/,
        (_m, inner: string) =>
          `n("<${inner
            .split(" ")
            .map((t) => String(Number(t) + 2))
            .join(" ")}>")`,
      ),
    );
    expect(r.status).toBe("fail");
    const m = generateLadderPiece(4, 1, 3, DEFAULT_PROFILE);
    const shifted = m.answer.replace(/(?<=[\s[<"])(-?\d+)(?=[\s\]>@])/g, (t) => String(Number(t) + 1));
    expect((await grade(m, shifted)).status).toBe("fail");
  });
});

describe("vocabulary gates", () => {
  const g = courseGraph();
  test("every feature gate is a lesson, at or after the level's first gym session", () => {
    for (const [, lesson] of Object.entries(LADDER_FEATURE_GATES)) {
      expect(defaultOrder.includes(lesson as SessionId)).toBe(true);
      expect(atOrBefore(g, LADDER_OPENS[4], lesson as SessionId)).toBe(true);
    }
  });
  test("the default vocabulary (no `completed`) is GYM.01's: U07.L08 comes after it, so no pickups", () => {
    const gym1 = defaultOrder.indexOf("GYM.01" as SessionId);
    expect(gym1).toBeGreaterThan(0);
    expect(defaultOrder.indexOf(LADDER_FEATURE_GATES.pickup as SessionId)).toBeGreaterThan(gym1);
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8])
      expect(generateLadderPiece(4, 4, seed, DEFAULT_PROFILE).pickup).toBeNull();
  });
  test("L1–L4 in content/gym/ladder.ts are generated (their generator names) and auto-graded", () => {
    for (const l of ladder.filter((x) => x.level <= 4)) {
      expect(l.grading).toBe("auto");
      expect(l.generator).toBeDefined();
    }
  });
});
