// The per-lesson checks of AUTHORING §12.1, as one function both the validation suite
// (content/validate/lessons.test.ts) and `bun run content:check <id>` run. Each check returns its issues;
// an empty list is a pass. Grading and notation go through the adapters of ./harness.ts.
import {
  checkLessonAuthoring,
  type Exercise,
  flattenExercise,
  type LessonDef,
  type SessionId,
  stripMarkers,
  type UnlockableId,
  unimplementedInLesson,
} from "@oak/content-kit";
import { exerciseCode } from "../../scripts/content/generate.ts";
import { bandById, bandMeter } from "../bands/index.ts";
import { candoById } from "../candos.ts";
import { catalogByName } from "../catalog/index.ts";
import { familyById } from "../families.ts";
import { flavourById } from "../flavours.ts";
import { registries } from "../index.ts";
import type { LoadedLesson } from "../lib/load.bun.ts";
import { checkMdx, parseMdx } from "../lib/mdx.ts";
import { unitSpecs } from "../specs/index.ts";
import { termById } from "../terms.ts";
import { toolboxById } from "../toolbox.ts";
import { lessonAuthoring } from "./authoring.ts";
import {
  BAD_LOG,
  evaluate,
  grade,
  lint,
  notateCode,
  ONBOARDING_PREVIEW,
  SAMPLE_CONTEXT,
  unlockedFor,
} from "./harness.ts";

export interface CheckSection {
  /** AUTHORING §12.1 numbering. */
  n: number;
  name: string;
  issues: string[];
  /** Things no backend could decide yet (reported, never counted as a pass or a failure). */
  pending?: string[];
  /** Advice: printed, never counted as a failure (a word that may be a later lesson's term, …). */
  warnings?: string[];
  /** Detail for `content:check --verbose` (every test's outcome and feedback). */
  notes?: string[];
}

export const sessionOf = (l: LoadedLesson): SessionId => (l.sample ? SAMPLE_CONTEXT : l.def.id);
const meta = () =>
  new Map(registries.syllabus.units.flatMap((u) => u.lessons.map((x) => [x.id as string, x] as const)));
const exercisesOf = (def: LessonDef) =>
  def.steps.flatMap((s) => (s.exercise ? flattenExercise(s.exercise).map((e) => ({ step: s, e })) : []));

export function checkSchema(l: LoadedLesson): CheckSection {
  const issues: string[] = [];
  if (!l.sample && l.folderId !== l.def.id)
    issues.push(`folder says ${l.folderId}, lesson.ts says ${l.def.id}`);
  if (!l.mdxSource) issues.push("lesson.mdx is missing");
  else {
    const def = l.def;
    const parsed = parseMdx(l.mdxSource);
    const sounds = new Set(
      [...toolboxById.keys()]
        .filter((id) => id.startsWith("snd."))
        .map((id) => id.split(".").pop() as string),
    );
    for (const i of checkMdx(parsed, {
      step: new Set(def.steps.map((s) => s.id)),
      example: new Set(def.steps.flatMap((s) => (s.example ? [s.example.id] : []))),
      exercise: new Set(exercisesOf(def).map((x) => x.e.id)),
      family: new Set(registries.families.map((f) => f.id as string)),
      term: new Set(def.terms.map((t) => t.id as string)),
      fn: new Set(catalogByName.keys()),
      sound: sounds,
      cando: new Set(def.canDo as string[]),
    }))
      issues.push(`lesson.mdx:${i.line} ${i.rule}: ${i.message}`);
  }
  return { n: 1, name: "Schema and MDX", issues };
}

/** Toolbox IDs a rubric names: `uses` tools and `sounds` rules' sound IDs (both are toolbox rows). */
export function rubricToolIds(e: object): string[] {
  const rubric = "rubric" in e && Array.isArray(e.rubric) ? (e.rubric as Record<string, unknown>[]) : [];
  return rubric.flatMap((r) => {
    if (r.rule === "uses") return (Array.isArray(r.tool) ? r.tool : [r.tool]).map(String);
    if (r.rule === "sounds") return (r.contains as string[] | undefined) ?? [];
    return [];
  });
}

export function checkIds(l: LoadedLesson): CheckSection {
  const def = l.def;
  const issues: string[] = [];
  for (const t of def.terms) if (!termById.has(t.id)) issues.push(`term ${t.id} is not in content/terms.ts`);
  for (const c of def.canDo) if (!candoById.has(c)) issues.push(`can-do ${c} is not in content/candos.ts`);
  for (const f of Object.keys(def.flavours ?? {})) if (!flavourById.has(f)) issues.push(`flavour ${f}`);
  for (const s of def.steps)
    if (s.ui.band && !bandById.has(s.ui.band.band)) issues.push(`${s.id}: band ${s.ui.band.band}`);
  for (const { step, e } of exercisesOf(def)) {
    for (const link of e.srs ?? [])
      if (link.family && !familyById.has(link.family))
        issues.push(`${step.id}/${e.id}: family ${link.family}`);
    if ("stimulus" in e && e.stimulus?.src === "generator" && !familyById.has(e.stimulus.family))
      issues.push(`${step.id}/${e.id}: family ${e.stimulus.family}`);
    for (const sk of e.skills)
      if (!registries.skills.some((x) => x.id === sk.skill.split("/")[0]))
        issues.push(`${step.id}/${e.id}: skill ${sk.skill}`);
    for (const id of rubricToolIds(e))
      if (!toolboxById.has(id)) issues.push(`${step.id}/${e.id}: no tool ${id}`);
  }
  // A real lesson may not use what the platform does not implement (contracts IMPLEMENTED); the gate
  // sample uses every kind on purpose, so for it these are reported, not failed.
  const unimplemented = unimplementedInLesson(def).map(
    (u) => `uses ${u.what} "${u.name}" (${u.exercise}), which the platform does not implement yet`,
  );
  if (l.sample) return { n: 2, name: "IDs", issues, pending: unimplemented };
  return { n: 2, name: "IDs", issues: [...issues, ...unimplemented] };
}

export function checkMap(l: LoadedLesson): CheckSection {
  if (l.sample) return { n: 3, name: "Map", issues: [] };
  const m = meta().get(l.def.id);
  const issues: string[] = [];
  if (!m) issues.push(`${l.def.id} is not in content/syllabus.ts`);
  else {
    if (m.title !== l.def.title) issues.push(`title "${l.def.title}" ≠ syllabus "${m.title}"`);
    if (m.introduces.join(" ") !== l.def.introduces.join(" "))
      issues.push(`introduces [${l.def.introduces}] ≠ syllabus [${m.introduces}]`);
    if (m.practises.join(" ") !== l.def.practises.join(" "))
      issues.push(`practises [${l.def.practises}] ≠ syllabus [${m.practises}]`);
  }
  return { n: 3, name: "Map", issues };
}

/** §9.1 items 4 and 5: the content-profile lint over every authored code string, in this session's context. */
export function checkLint(l: LoadedLesson): CheckSection {
  const def = l.def;
  const session = sessionOf(l);
  const issues: string[] = [];
  const unlocked = unlockedFor(session);
  for (const s of def.steps) {
    if (s.example)
      for (const d of lint(s.example.code, {
        session,
        meter: def.meter,
        key: def.key,
        allowPreview: Boolean(s.example.preview) || ONBOARDING_PREVIEW.has(def.id),
      }).diagnostics)
        if (d.severity === "error") issues.push(`${s.id}@${s.example.id}:${d.line} ${d.id}: ${d.message}`);
    for (const e of s.exercise ? flattenExercise(s.exercise) : []) {
      for (const c of exerciseCode(e)) {
        if (c.what.startsWith("test:")) continue; // wrong variants may be wrong
        for (const d of lint(c.code, {
          session,
          meter: e.meter ?? def.meter,
          key: e.key ?? def.key,
          allowPreview: ONBOARDING_PREVIEW.has(def.id),
        }).diagnostics)
          if (d.severity === "error")
            issues.push(`${s.id}/${e.id}#${c.what}:${d.line} ${d.id}: ${d.message}`);
      }
      // Every rule that names a tool or a sound, required or a suggestion: a suggestion the learner can only
      // meet with a locked tool would be refused by the Make's own lint.
      for (const rule of "rubric" in e ? e.rubric : [])
        for (const t of rubricToolIds({ rubric: [rule] }))
          if (!toolboxById.has(t)) issues.push(`${s.id}/${e.id}/${rule.id}: no tool ${t}`);
          else if (!unlocked.has(t as UnlockableId))
            issues.push(
              `${s.id}/${e.id}/${rule.id}: ${rule.required ? "the required" : "the suggested"} ${t} is locked here`,
            );
    }
  }
  for (const [f, swap] of Object.entries(def.flavours ?? {}))
    for (const snd of Object.values(swap?.sounds ?? {}))
      if (!unlocked.has(snd)) issues.push(`flavour ${f}: starter sound ${snd} is locked at ${session}`);
  return { n: 4, name: "STYLE lint and unlock-before-use", issues };
}

export async function checkEvaluation(l: LoadedLesson): Promise<CheckSection> {
  const issues: string[] = [];
  for (const s of l.def.steps) {
    const codes = [
      ...(s.example ? [{ what: `@${s.example.id}`, code: s.example.code, bars: s.example.bars }] : []),
      ...(s.exercise
        ? flattenExercise(s.exercise).flatMap((e) =>
            exerciseCode(e)
              .filter((c) => !c.what.startsWith("test:"))
              .map((c) => ({ ...c, what: `/${e.id}#${c.what}` })),
          )
        : []),
    ];
    for (const c of codes) {
      const r = await evaluate(c.code, c.bars);
      if (!r.ok) issues.push(`${s.id}${c.what}: ${r.error}`);
      else if (r.events.length === 0) issues.push(`${s.id}${c.what}: silent`);
      else if (!r.cpsSet) issues.push(`${s.id}${c.what}: no tempo line`);
      else if (r.logs.some((x) => BAD_LOG.test(x))) issues.push(`${s.id}${c.what}: ${r.logs.join(" | ")}`);
    }
  }
  return { n: 6, name: "Evaluation", issues };
}

export async function checkGrading(l: LoadedLesson): Promise<CheckSection> {
  const def = l.def;
  const session = sessionOf(l);
  const issues: string[] = [];
  const pending: string[] = [];
  const notes: string[] = [];
  for (const { step, e } of exercisesOf(def)) {
    for (const t of e.tests) {
      const r = await grade(e as Exercise, t, def, session);
      if (!r.decided) {
        pending.push(`${step.id}/${e.id}/${t.name}: ${r.note}`);
        continue;
      }
      notes.push(describeOutcome(`${step.id}/${e.id}/${t.name}`, t.expect, r));
      const ok = t.expect === "pass" ? r.passed : !r.passed;
      if (!ok)
        issues.push(
          `${step.id}/${e.id}/${t.name}: expected ${t.expect}, got ${r.passed ? "pass" : "fail"} ${r.feedback.join(",")} ${r.note ?? ""}`.trim(),
        );
      if (ok)
        for (const f of t.feedback ?? [])
          if (!r.feedback.includes(f))
            issues.push(
              `${step.id}/${e.id}/${t.name}: expected feedback ${f}, got ${r.feedback.join(",") || "none"}`,
            );
    }
    if ("reference" in e && e.reference)
      for (const [i, sol] of e.reference.solutions.entries()) {
        const r = await grade(
          e as Exercise,
          { name: `solution ${i}`, response: { code: sol }, expect: "pass" },
          def,
          session,
        );
        if (r.decided && !r.passed) issues.push(`${step.id}/${e.id}: reference solution ${i} does not pass`);
      }
  }
  return { n: 7, name: "Grading", issues, pending, notes };
}

/** One line per graded test for `--verbose`: what was expected, what the grader said, what the learner reads. */
export function describeOutcome(
  where: string,
  expect: string,
  r: { passed: boolean; score: number; feedback: string[]; messages?: string[] },
): string {
  const said = (r.messages ?? []).filter(Boolean).join(" / ");
  return `${where}: expect ${expect}, got ${r.passed ? "pass" : "fail"} ${r.score.toFixed(2)} [${r.feedback.join(", ")}]${said ? `  "${said}"` : ""}`;
}

export function checkHints(l: LoadedLesson): CheckSection {
  const issues: string[] = [];
  for (const { step, e } of exercisesOf(l.def)) {
    if (e.hints === null) continue;
    if (e.hints.length !== 4) issues.push(`${step.id}/${e.id}: ${e.hints.length} rungs`);
    const solution =
      "reference" in e && e.reference ? stripMarkers(e.reference.solutions[0] ?? "").code : null;
    e.hints.slice(0, 3).forEach((h, i) => {
      if (typeof h === "object" && solution && h.text.includes(solution))
        issues.push(`${step.id}/${e.id}: rung ${i + 1} contains the solution`);
    });
  }
  return { n: 8, name: "Hints", issues };
}

export async function checkNotation(l: LoadedLesson): Promise<CheckSection> {
  const def = l.def;
  const issues: string[] = [];
  const pending: string[] = [];
  for (const s of def.steps) {
    if (!s.example || s.ui.panels.staff === false) continue;
    const n = await notateCode(s.example.code, def.meter, def.key, s.example.bars, s.ui.panels.staff);
    if (n.error) issues.push(`${s.id}@${s.example.id}: ${n.error}`);
    else {
      if (n.approximate) issues.push(`${s.id}@${s.example.id}: renders approximately`);
      if ((n.warnings ?? 0) > 0) issues.push(`${s.id}@${s.example.id}: ${n.warnings} notation warnings`);
    }
  }
  return { n: 9, name: "Notation", issues, pending };
}

export function checkSounds(l: LoadedLesson): CheckSection {
  const issues: string[] = [];
  const used = new Set<string>();
  for (const s of l.def.steps) {
    if (s.example)
      for (const id of lint(s.example.code, { session: "A2.L06", meter: l.def.meter, allowPreview: true })
        .used)
        used.add(id);
    for (const e of s.exercise ? flattenExercise(s.exercise) : [])
      for (const c of exerciseCode(e))
        for (const id of lint(c.code, { session: "A2.L06", meter: l.def.meter, allowPreview: true }).used)
          used.add(id);
  }
  const pending = [...used]
    .filter((id) => toolboxById.get(id)?.group === "H" && toolboxById.get(id)?.audible !== true)
    .map((id) => `${id}: audibility not yet proven by the S3 harness`);
  return { n: 10, name: "Sounds", issues, pending };
}

export function checkBudget(l: LoadedLesson): CheckSection {
  return {
    n: 11,
    name: "Budget",
    issues: checkLessonAuthoring(l.def, registries.terms).map((i) => `${i.path} ${i.rule}: ${i.message}`),
  };
}

export function checkMake(l: LoadedLesson): CheckSection {
  const issues: string[] = [];
  const make = l.def.steps[l.def.steps.length - 1];
  if (make?.kind !== "make") issues.push("the last step is not a make");
  const ex = make?.exercise;
  if (ex?.kind === "code-make" && ex.rubric.filter((r) => r.required).length !== 1)
    issues.push("a lesson Make has exactly one required rule");
  if ((!l.def.id.startsWith("U00") || l.sample) && !make?.ui.band && make?.ui.band !== false)
    issues.push("from U01 every Make declares a Band (ui.band)");
  for (const s of l.def.steps)
    if (s.ui.band && bandMeter(s.ui.band.band) !== l.def.meter)
      issues.push(
        `${s.id}: ${s.ui.band.band} is written in ${bandMeter(s.ui.band.band)}; this lesson is in ${l.def.meter}`,
      );
  return { n: 12, name: "Make", issues };
}

export function checkTheory(l: LoadedLesson): CheckSection {
  const issues: string[] = [];
  for (const { step, e } of exercisesOf(l.def))
    for (const c of exerciseCode(e)) {
      if (c.what.startsWith("test:")) continue;
      const key = e.key ?? l.def.key;
      for (const m of c.code.matchAll(/\.scale\("([A-G][#b]?)\d:([a-z:]+)"\)/g))
        if (m[1] !== key.tonic || (m[2] as string).replace(/:/g, " ") !== key.mode)
          issues.push(
            `${step.id}/${e.id}#${c.what}: .scale("${m[1]}…:${m[2]}") but the key is ${key.tonic} ${key.mode}`,
          );
    }
  return { n: 13, name: "Theory", issues };
}

/** AUTHORING §5, §7, §9: voice, terms, test shape (content/validate/authoring.ts). */
export function checkAuthoring(l: LoadedLesson): CheckSection {
  const r = lessonAuthoring(l.def, l.mdxSource, l.sample);
  return {
    n: 14,
    name: "Voice, terms and test shape",
    issues: r.issues,
    warnings: [...r.warnings, ...specDrift(l.def)],
  };
}

/** Where an authored lesson departs from its unit spec (content/specs): advice, since a spec can be wrong. */
export function specDrift(def: LessonDef): string[] {
  const spec = unitSpecs.flatMap((u) => u.lessons).find((x) => x.id === def.id);
  if (!spec) return [];
  const out: string[] = [];
  const specTerms = spec.steps.flatMap((s) =>
    s.term === undefined ? [] : Array.isArray(s.term) ? s.term : [s.term],
  );
  const terms = def.terms.map((t) => t.id as string);
  if ([...specTerms].sort().join() !== [...terms].sort().join())
    out.push(`spec: terms [${specTerms.join(" ")}], lesson: [${terms.join(" ")}]`);
  for (const c of spec.canDo) if (!def.canDo.includes(c)) out.push(`spec: can-do ${c} is missing`);
  const make = def.steps[def.steps.length - 1];
  const band = make?.ui.band === undefined ? undefined : make.ui.band === false ? false : make.ui.band.band;
  if (band !== spec.make.band)
    out.push(`spec: the Make's Band is ${String(spec.make.band)}, lesson: ${String(band)}`);
  const ex = make?.exercise;
  const req = ex?.kind === "code-make" ? ex.rubric.find((r) => r.required)?.rule : undefined;
  if (req && req !== spec.make.required.rule)
    out.push(`spec: the Make's required rule is \`${spec.make.required.rule}\`, lesson: \`${req}\``);
  if (def.meter !== spec.meter) out.push(`spec: meter ${spec.meter}, lesson: ${def.meter}`);
  return out;
}

/** All checks in AUTHORING §12.1 order. */
export async function checkLesson(l: LoadedLesson): Promise<CheckSection[]> {
  return [
    checkSchema(l),
    checkIds(l),
    checkMap(l),
    checkLint(l),
    await checkEvaluation(l),
    await checkGrading(l),
    checkHints(l),
    await checkNotation(l),
    checkSounds(l),
    checkBudget(l),
    checkMake(l),
    checkTheory(l),
    checkAuthoring(l),
  ];
}
