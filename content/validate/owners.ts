// Checks for the two other things authors write besides lessons (AUTHORING §10, §11):
//   - checkpoint items, content/core/Uxx/CP/checkpoint.ts (`defineCheckpoint`), against the checkpoint
//     map of content/checkpoints.ts and the pass rules of contracts §7.6;
//   - capstone briefs in content/capstones.ts (`compose(...)`), against §2.4 and §6.6.
// Both reuse the lesson machinery: the content-profile lint in the session's unlock context (every legal
// order), headless evaluation, the real grader on every test, the hint and test-shape rules.
import {
  type CapstoneDef,
  type CheckpointDef,
  type Exercise,
  flattenExercise,
  type KeySpec,
  type MeterId,
  type SessionId,
  stripMarkers,
  type UnlockableId,
  unimplementedIn,
} from "@oak/content-kit";
import { exerciseCode } from "../../scripts/content/generate.ts";
import { CHECKPOINT_RULES, checkpointMetas } from "../checkpoints.ts";
import { familyById } from "../families.ts";
import { courseGraph, registries } from "../index.ts";
import { atOrBefore } from "../lib/course.ts";
import { toolboxById } from "../toolbox.ts";
import { exerciseTexts, testShapeIssues, voiceIssues } from "./authoring.ts";
import { type CheckSection, describeOutcome, rubricToolIds } from "./checks.ts";
import { BAD_LOG, evaluate, grade, lint, unlockedFor } from "./harness.ts";

interface Owner {
  id: string;
  session: SessionId;
  key: KeySpec;
  meter: MeterId;
  bpm: number;
  mode: "lesson" | "capstone";
}
type Item = { where: string; e: Exercise };

const DEFAULT_KEY: KeySpec = { tonic: "C", mode: "major" };

/** IDs, lint/unlocks, evaluation, grading and hints over a set of exercises in one session's context. */
async function exerciseSections(owner: Owner, items: Item[], evalBars: number): Promise<CheckSection[]> {
  const ids: string[] = [];
  const lints: string[] = [];
  const evals: string[] = [];
  const grading: string[] = [];
  const pending: string[] = [];
  const notes: string[] = [];
  const hints: string[] = [];
  const unlocked = unlockedFor(owner.session);
  const flat = items.flatMap(({ where, e }) =>
    flattenExercise(e).map((x) => ({ where: x === e ? where : `${where}/${x.id}`, e: x })),
  );
  for (const { where, e } of flat) {
    for (const sk of e.skills)
      if (!registries.skills.some((x) => x.id === sk.skill.split("/")[0]))
        ids.push(`${where}: skill ${sk.skill}`);
    for (const link of e.srs ?? [])
      if (link.family && !familyById.has(link.family)) ids.push(`${where}: family ${link.family}`);
    if ("stimulus" in e && e.stimulus?.src === "generator" && !familyById.has(e.stimulus.family))
      ids.push(`${where}: family ${e.stimulus.family}`);
    for (const u of unimplementedIn(e))
      ids.push(`${where}: uses ${u.what} "${u.name}", which the platform does not implement yet`);
    for (const c of exerciseCode(e)) {
      if (c.what.startsWith("test:")) continue;
      for (const d of lint(c.code, { session: owner.session, meter: e.meter ?? owner.meter, key: owner.key })
        .diagnostics)
        if (d.severity === "error") lints.push(`${where}#${c.what}:${d.line} ${d.id}: ${d.message}`);
      const r = await evaluate(c.code, Math.max(c.bars, evalBars));
      if (!r.ok) evals.push(`${where}#${c.what}: ${r.error}`);
      else if (r.events.length === 0) evals.push(`${where}#${c.what}: silent`);
      else if (!r.cpsSet) evals.push(`${where}#${c.what}: no tempo line`);
      else if (r.logs.some((x) => BAD_LOG.test(x))) evals.push(`${where}#${c.what}: ${r.logs.join(" | ")}`);
    }
    for (const rule of "rubric" in e ? e.rubric : [])
      for (const t of rubricToolIds({ rubric: [rule] }))
        if (!toolboxById.has(t)) ids.push(`${where}/${rule.id}: no tool ${t}`);
        else if (!unlocked.has(t as UnlockableId))
          lints.push(
            `${where}/${rule.id}: ${rule.required ? "the required" : "the suggested"} ${t} is locked here`,
          );
    const lessonLike = {
      id: owner.id as never,
      key: owner.key,
      meter: owner.meter,
      bpm: owner.bpm,
    };
    for (const t of e.tests) {
      const r = await grade(e, t, lessonLike, owner.session, owner.mode);
      if (!r.decided) {
        pending.push(`${where}/${t.name}: ${r.note}`);
        continue;
      }
      notes.push(describeOutcome(`${where}/${t.name}`, t.expect, r));
      const ok = t.expect === "pass" ? r.passed : !r.passed;
      if (!ok)
        grading.push(
          `${where}/${t.name}: expected ${t.expect}, got ${r.passed ? "pass" : "fail"} ${r.feedback.join(",")} ${r.note ?? ""}`.trim(),
        );
      else
        for (const f of t.feedback ?? [])
          if (!r.feedback.includes(f))
            grading.push(`${where}/${t.name}: expected feedback ${f}, got ${r.feedback.join(",") || "none"}`);
    }
    if ("reference" in e && e.reference)
      for (const [i, sol] of e.reference.solutions.entries()) {
        const r = await grade(
          e,
          { name: `solution ${i}`, response: { code: sol }, expect: "pass" },
          lessonLike,
          owner.session,
          owner.mode,
        );
        if (r.decided && !r.passed) grading.push(`${where}: reference solution ${i} does not pass`);
      }
    if (e.hints !== null) {
      if (e.hints.length !== 4) hints.push(`${where}: ${e.hints.length} rungs`);
      const solution =
        "reference" in e && e.reference ? stripMarkers(e.reference.solutions[0] ?? "").code : null;
      e.hints.slice(0, 3).forEach((h, i) => {
        if (typeof h === "object" && solution && h.text.includes(solution))
          hints.push(`${where}: rung ${i + 1} contains the solution`);
      });
    }
  }
  return [
    { n: 2, name: "IDs", issues: ids },
    { n: 4, name: "STYLE lint and unlock-before-use", issues: lints },
    { n: 6, name: "Evaluation", issues: evals },
    { n: 7, name: "Grading", issues: grading, pending, notes },
    { n: 8, name: "Hints", issues: hints },
  ];
}

const voiceAndShape = (items: Item[]): CheckSection => {
  const issues: string[] = [];
  for (const { where, e } of items) {
    issues.push(...voiceIssues(exerciseTexts(e, where)));
    for (const x of flattenExercise(e))
      issues.push(...testShapeIssues(x, x === e ? where : `${where}/${x.id}`));
  }
  return { n: 14, name: "Voice, terms and test shape", issues };
};

/** content/core/Uxx/CP/checkpoint.ts against contracts §7.6 and the checkpoint map. */
export async function checkCheckpoint(def: CheckpointDef): Promise<CheckSection[]> {
  const meta = checkpointMetas.find((c) => c.id === def.id);
  const map: string[] = [];
  const g = courseGraph();
  if (!meta) map.push(`${def.id} is not in content/checkpoints.ts`);
  else {
    const same = (a: readonly string[], b: readonly string[]) => a.join(" ") === b.join(" ");
    if (!same(def.covers, meta.covers)) map.push(`covers [${def.covers}] ≠ registry [${meta.covers}]`);
    if (!same(def.gated, meta.gated)) map.push(`gated [${def.gated}] ≠ registry [${meta.gated}]`);
    if (!same(def.levelSetting, meta.levelSetting))
      map.push(`levelSetting [${def.levelSetting}] ≠ registry [${meta.levelSetting}]`);
    if (def.title !== meta.title) map.push(`title "${def.title}" ≠ registry "${meta.title}"`);
  }
  const [aMin, aMax] = CHECKPOINT_RULES.authoredItems;
  if (def.authored.length < aMin || def.authored.length > aMax)
    map.push(`${def.authored.length} authored items; a checkpoint has ${aMin} to ${aMax}`);
  const [iMin, iMax] = CHECKPOINT_RULES.items;
  if (def.recipe.items[0] < iMin || def.recipe.items[1] > iMax)
    map.push(`recipe.items [${def.recipe.items}] must lie within [${iMin}, ${iMax}]`);
  if (def.recipe.perSkillMin < CHECKPOINT_RULES.perSkillMin)
    map.push(`recipe.perSkillMin is at least ${CHECKPOINT_RULES.perSkillMin}`);
  const skills = new Set<string>([...def.gated, ...def.levelSetting]);
  for (const [skill, fams] of Object.entries(def.recipe.families)) {
    if (!skills.has(skill)) map.push(`recipe.families: ${skill} is not a skill of ${def.id}`);
    for (const f of fams ?? []) {
      const fam = familyById.get(f);
      if (!fam) map.push(`recipe.families.${skill}: no family ${f}`);
      else if (!atOrBefore(g, fam.unlock.lesson, def.id as SessionId))
        map.push(`recipe.families.${skill}: ${f} unlocks at ${fam.unlock.lesson}, after ${def.id}`);
      else if (!fam.skills.some((s) => s.skill.split("/")[0] === skill))
        map.push(`recipe.families.${skill}: ${f} gives no evidence for ${skill}`);
    }
  }
  // Every gated skill is measured: by an authored item, the Make, or a recipe family.
  const measured = new Set<string>([
    ...def.authored.flatMap((e) =>
      flattenExercise(e).flatMap((x) => x.skills.map((s) => s.skill.split("/")[0])),
    ),
    ...def.make.rubric.flatMap((r) => r.skills.map((s) => s.split("/")[0])),
    ...Object.entries(def.recipe.families)
      .filter(([, f]) => (f ?? []).length > 0)
      .map(([s]) => s),
  ] as string[]);
  for (const s of def.gated)
    if (!measured.has(s)) map.push(`gated skill ${s} has no authored item, Make rule or recipe family`);
  const make: string[] = [];
  if (def.make.rubric.filter((r) => r.required).length !== 1)
    make.push("the checkpoint Make has exactly one required rule");
  const meter = def.make.meter ?? "4/4";
  const owner: Owner = {
    id: def.id,
    session: def.id as SessionId,
    key: def.make.key ?? DEFAULT_KEY,
    meter,
    bpm: def.make.bpm && typeof def.make.bpm === "number" ? def.make.bpm : 96,
    mode: "lesson",
  };
  const items: Item[] = [
    ...def.authored.map((e, i) => ({ where: `authored[${i}] ${e.id}`, e })),
    { where: `make ${def.make.id}`, e: def.make },
  ];
  return [
    { n: 3, name: "Checkpoint map (contracts §7.6)", issues: map },
    ...(await exerciseSections(owner, items, 1)),
    { n: 12, name: "Make", issues: make },
    voiceAndShape(items),
  ];
}

/** A compose capstone's brief: starter, rubric tests, unlocks at its first session in every legal order. */
export async function checkCapstone(c: CapstoneDef): Promise<CheckSection[]> {
  const brief: string[] = [];
  if (c.kind === "compose" && !c.brief) brief.push("a compose capstone has a brief");
  if (!c.brief) return [{ n: 1, name: "Brief", issues: brief }];
  const b = c.brief;
  if (!b.rubric.some((r) => r.required)) brief.push("the rubric has no required rule");
  const starter = stripMarkers(b.code.starter).code;
  const passes = b.tests.filter((t) => t.expect === "pass").length;
  const fails = b.tests.filter((t) => t.expect === "fail").length;
  if (passes < 2 || fails < 2)
    brief.push(
      `tests: a brief needs at least two passing pieces (a minimal one and one beyond the brief) and two failing ones (found ${passes} and ${fails})`,
    );
  if (!b.tests.some((t) => "code" in t.response && t.response.code === starter))
    brief.push("tests: grade the starter itself (it usually fails: the brief asks for more than it has)");
  const owner: Owner = {
    id: c.id,
    session: c.sessionDefs[0]?.id as SessionId,
    key: c.key ?? DEFAULT_KEY,
    meter: c.meter,
    bpm: c.bpm ? Math.round((c.bpm[0] + c.bpm[1]) / 2) : 100,
    mode: "capstone",
  };
  const items: Item[] = [{ where: "brief", e: b }];
  return [
    { n: 1, name: "Brief and tests", issues: brief },
    ...(await exerciseSections(owner, items, 4)),
    voiceAndShape(items),
  ];
}
