// The transcription ladder L1–L4 graded on GENERATED items (contracts §2.9, §6.12): every item that
// `@oak/drills` `generateLadderPiece` makes, at every realism level, passes with its own answer key (the
// learner's code is the target layer only, written in degrees), and known-wrong answers fail. Realism never
// changes a tolerance: the answers stay on the grid and the same matcher grades R0 and R4.
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import type { GradeResult } from "@oak/content-kit";
import { DEFAULT_PROFILE, generateLadderPiece, type LadderPiece, ladderItemOf } from "@oak/drills";
import { headlessDeps, hits, norm } from "../analyze/__support__/fixtures.ts";
import { rhythmMatch } from "../match/rhythm.ts";
import { gradeWith } from "./index.ts";
import { LADDER_PASS, type LadderStage, ladderGradedPass, ladderGradeRequest } from "./ladder.ts";

setDefaultTimeout(120_000);
const deps = headlessDeps();
const ctx = {
  params: {},
  attemptNo: 1,
  firstAttempt: true,
  rung: 0 as const,
  tutorHints: 0,
  extraReplays: 0,
  lint: {
    profile: "graded" as const,
    unlocked: new Set<never>(),
    allowPreview: false,
    meter: "4/4" as const,
    key: null,
  },
};
const REALISM = [0, 1, 2, 3, 4] as const;
const SEEDS = [1, 2, 3, 4, 5];
const opts = { completed: new Set(["U07.L08"]) };
const piece = (level: 1 | 2 | 3 | 4, realism: (typeof REALISM)[number], seed: number): LadderPiece =>
  generateLadderPiece(level, realism, seed, DEFAULT_PROFILE, opts);
const grade = (p: LadderPiece, code: string, stage?: LadderStage): Promise<GradeResult> =>
  gradeWith(ladderGradeRequest({ item: ladderItemOf(p, stage), code, ctx }), deps);

/** Adds `k` to every number of a track line's n-pattern (a transposition by degrees). */
const shiftDegrees = (code: string, label: string, k: number): string =>
  code.replace(
    new RegExp(`(${label}: n\\(")([^"]*)(")`),
    (_m, a: string, body: string, b: string) =>
      `${a}${body.replace(/(?<![@*/!.\d])-?\d+/g, (x) => String(Number(x) + k))}${b}`,
  );

describe("every generated item passes with its own answer key, R0 to R4", () => {
  for (const level of [1, 2, 4] as const)
    test(`L${level}: ${REALISM.length * SEEDS.length} items`, async () => {
      for (const r of REALISM)
        for (const s of SEEDS) {
          const p = piece(level, r, s);
          const res = await grade(p, p.answer);
          if (res.status !== "pass" || res.score < 1 - 1e-9)
            throw new Error(
              `L${level} R${r} seed ${s}: ${res.status} ${res.score} ${res.diagnostics.map((d) => d.id)}`,
            );
          expect(ladderGradedPass(res)).toBe(true);
        }
    });
  test(`L3: every stage of ${REALISM.length * SEEDS.length} items, bass first`, async () => {
    for (const r of REALISM)
      for (const s of SEEDS) {
        const p = piece(3, r, s);
        expect(p.stages).toEqual(["bass", "quality", "rn"]);
        for (const stage of ["bass", "quality", "rn"] as const) {
          const res = await grade(p, p.stageAnswers?.[stage] ?? "", stage);
          if (res.status !== "pass")
            throw new Error(`L3 R${r} seed ${s} ${stage}: ${res.score} ${res.diagnostics.map((d) => d.id)}`);
        }
      }
  });
});

describe("L1 drum loops: onset F1 per drum role", () => {
  test("a missing snare part fails; the score is the mean onset F1 of the roles", async () => {
    const p = piece(1, 0, 3);
    const noSnare = p.answer.replace(/\nsnare: [^\n]*/, "");
    const res = await grade(p, noSnare);
    expect(res.status).toBe("fail");
    expect(res.score).toBeLessThan(LADDER_PASS);
  });
  test("one hi-hat left out of sixteen: F1 = 2·15/31 ≈ 0.97 on that role, still a pass", async () => {
    const p = piece(1, 0, 3);
    const fewer = p.answer.replace('hats: s("hh*8")', 'hats: s("hh*8").mask("<1 [1 1 1 1 1 1 1 0]>")');
    const res = await grade(p, fewer);
    expect(res.status).toBe("pass");
    expect(res.score).toBeLessThan(1);
  });
  test("the matcher is F1 on onsets: 8 hats against 16 played = 2·8/24 on that role", () => {
    const ref = norm(hits("hats", "hatClosed", ["0", "1/8", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8"]));
    const ans = norm(
      hits(
        "hats",
        "hatClosed",
        Array.from({ length: 16 }, (_, i) => `${i}/16`),
      ),
    );
    const m = rhythmMatch(
      ref,
      ans,
      { m: "rhythm", tol: [1, 32], durations: false, perRole: true, displacementCredit: 0.5 },
      { meter: "4/4" },
    );
    expect(m.score).toBeCloseTo((2 * 8) / 24, 5);
  });
});

describe("L2 bass lines and L4 melodies", () => {
  test("L2: a wrong note in every bar fails; the same line an octave down passes (octave-free)", async () => {
    const p = piece(2, 0, 4);
    const wrong = shiftDegrees(p.answer, "bass", 1);
    expect((await grade(p, wrong)).status).toBe("fail");
    const octave = p.answer.replace(/\.scale\("([A-G][#b]?)2:/, '.scale("$13:');
    expect(octave).not.toBe(p.answer);
    expect((await grade(p, octave)).status).toBe("pass");
  });
  test("L4: the melody a step higher fails; an octave higher passes", async () => {
    const p = piece(4, 0, 2);
    expect((await grade(p, shiftDegrees(p.answer, "mel", 1))).status).toBe("fail");
    expect((await grade(p, shiftDegrees(p.answer, "mel", 7))).status).toBe("pass");
  });
  test("L4 with a pickup (R2+, after U07.L08): the pickup is given; landing it on the downbeat fails", async () => {
    let p: LadderPiece | null = null;
    for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      const x = piece(4, 2, s);
      if (x.pickup) {
        p = x;
        break;
      }
    }
    if (!p) throw new Error("no generated L4 item with a pickup in seeds 1–12");
    const ok = await grade(p, p.answer);
    expect(ok.status).toBe("pass");
    // The same tune with no rest before the pickup: everything a beat early.
    // The same tune moved so that the pickup lands on the downbeat (everything three beats early):
    // `rhythm.pickup-missing` with the displacement credit, a fail.
    const early = p.answer.replace(/(mel: [^\n]*)/, "$1.early(3/4)");
    const res = await grade(p, early);
    expect(res.status).toBe("fail");
    expect(res.diagnostics.map((d) => d.id)).toContain("rhythm.pickup-missing");
  });
});

describe("L3 four-chord loops, staged bass first", () => {
  test("the rn stage fails a rotated loop and names the numerals; the quality stage fails a wrong quality", async () => {
    const p = piece(3, 0, 6);
    const answer = p.stageAnswers?.rn ?? "";
    const m = /add\(n\("<(\d) (\d) (\d) (\d)>"\)\)/.exec(answer);
    expect(m).not.toBeNull();
    const [a, b, c, d] = (m as RegExpExecArray).slice(1);
    const rotated = answer.replace(`<${a} ${b} ${c} ${d}>`, `<${b} ${c} ${d} ${a}>`);
    const res = await grade(p, rotated, "rn");
    expect(res.status).toBe("fail");
    expect(res.diagnostics.some((x) => x.id === "harmony.rn" || x.id === "harmony.bass")).toBe(true);
  });
  test("the bass stage grades the bass only: the right bass with no chords passes", async () => {
    const p = piece(3, 1, 2);
    const res = await grade(p, p.stageAnswers?.bass ?? "", "bass");
    expect(res.status).toBe("pass");
    const wrong = await grade(p, shiftDegrees(p.stageAnswers?.bass ?? "", "bass", 2), "bass");
    expect(wrong.status).toBe("fail");
  });
});
