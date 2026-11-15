// Every authored lesson (and the Wave 1 gate sample) against the per-lesson suite of architecture §3.7 as
// amended by contracts, in the order of AUTHORING §12.1 (content/validate/checks.ts, shared with
// `bun run content:check`). Grading and notation go through content/validate/harness.ts.
import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { EXERCISE_KINDS, flattenExercise } from "@oak/content-kit";
import { type LoadedLesson, loadLessons } from "../lib/load.bun.ts";
import { MDX_COMPONENTS, parseMdx } from "../lib/mdx.ts";
import {
  checkAuthoring,
  checkBudget,
  checkEvaluation,
  checkGrading,
  checkHints,
  checkIds,
  checkLint,
  checkMake,
  checkMap,
  checkNotation,
  checkSchema,
  checkSounds,
  checkStandard,
  checkTheory,
} from "./checks.ts";
import { backends } from "./harness.ts";
import { isTrackLesson } from "./standard.ts";

setDefaultTimeout(120_000);
const { lessons, errors } = await loadLessons();
const pending: string[] = [];

test("every lesson file loads (defineLesson validates schema and structure)", () => {
  expect(errors).toEqual([]);
  expect(lessons.some((l) => l.sample)).toBe(true);
});

test("the sample uses every exercise kind and every MDX component (the Wave 1 gate fixture)", () => {
  const sample = lessons.find((l) => l.sample) as LoadedLesson;
  const kinds = new Set(
    sample.def.steps.flatMap((s) =>
      s.exercise ? [s.exercise.kind, ...flattenExercise(s.exercise).map((e) => e.kind)] : [],
    ),
  );
  expect(EXERCISE_KINDS.filter((k) => !kinds.has(k))).toEqual([]);
  const used = new Set(parseMdx(sample.mdxSource ?? "").elements.map((e) => e.name));
  expect(Object.keys(MDX_COMPONENTS).filter((c) => !used.has(c))).toEqual([]);
});

for (const l of lessons)
  describe(`${l.def.id}${l.sample ? " (sample)" : ""}`, () => {
    const sync = [
      checkSchema,
      checkIds,
      checkMap,
      checkLint,
      checkHints,
      checkSounds,
      checkBudget,
      checkMake,
      checkTheory,
      checkAuthoring,
    ];
    for (const check of sync)
      test(check.name.replace(/^check/, ""), () => {
        const r = check(l);
        pending.push(...(r.pending ?? []).map((p) => `${l.def.id} ${r.name}: ${p}`));
        expect(r.issues).toEqual([]);
      });
    // The corrections-pass standard (decision 71) binds the advanced tracks' lessons (./standard.ts).
    const standard = isTrackLesson(l.def.id) && !l.sample ? [checkStandard] : [];
    for (const check of [checkEvaluation, checkGrading, checkNotation, ...standard])
      test(check.name.replace(/^check/, ""), async () => {
        const r = await check(l);
        pending.push(...(r.pending ?? []).map((p) => `${l.def.id} ${r.name}: ${p}`));
        expect(r.issues).toEqual([]);
      });
  });

afterAll(() => {
  console.info(`content/validate backends: ${JSON.stringify(backends())}`);
  if (pending.length)
    console.info(`pending (needs a package that is not finished yet):\n  ${pending.join("\n  ")}`);
});
