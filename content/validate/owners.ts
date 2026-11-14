// Checks for the two other things authors write besides lessons (AUTHORING §10, §11):
//   - checkpoint items, content/core/Uxx/CP/checkpoint.ts (`defineCheckpoint`), against the checkpoint
//     map of content/checkpoints.ts and the pass rules of contracts §7.6;
//   - capstone briefs in content/capstones.ts (`compose(...)`), against §2.4 and §6.6.
// Both reuse the lesson machinery: the content-profile lint in the session's unlock context (every legal
// order), headless evaluation, the real grader on every test, the hint and test-shape rules.
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  type CapstoneDef,
  type CheckpointDef,
  type Exercise,
  flattenExercise,
  type KeySpec,
  type Matcher,
  type MeterId,
  type SessionId,
  type SongDef,
  stripMarkers,
  type UnlockableId,
  unimplementedIn,
  unimplementedInCapstoneSessions,
} from "@oak/content-kit";
import { exerciseCode } from "../../scripts/content/generate.ts";
import { CHECKPOINT_RULES, checkpointMetas } from "../checkpoints.ts";
import { familyById } from "../families.ts";
import { courseGraph, registries } from "../index.ts";
import { atOrBefore } from "../lib/course.ts";
import { songById } from "../repertoire/index.ts";
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
  /**
   * A capstone without a key grades each test in the key its code states, as the capstone workspace does
   * (app/src/capstone/engine.ts reads the stated key of a key-less brief): the first `.scale("D4:dorian")` of the
   * piece, else `key`.
   */
  statedKey?: boolean;
}

const STATED_MODES = new Set(["major", "minor", "mixolydian", "dorian", "lydian", "phrygian"]);
/** The key a piece states: its first `.scale("<tonic><octave>:<mode>")`, or the first key of a key plan. */
function statedKeyOf(code: string): KeySpec | null {
  const m = /\.scale\("<?\s*([A-G][#b]?)-?\d*:([a-z]+)[\s!">]/.exec(code);
  if (!m || !STATED_MODES.has(m[2] as string)) return null;
  return { tonic: m[1] as string, mode: m[2] as KeySpec["mode"] };
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
      const stated = owner.statedKey && "code" in t.response ? statedKeyOf(t.response.code) : null;
      const r = await grade(
        e,
        t,
        stated ? { ...lessonLike, key: stated } : lessonLike,
        owner.session,
        owner.mode,
      );
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

/** The answer key of a repertoire song, if its `content/repertoire/<slug>/song.ts` is written. */
async function songDef(id: string): Promise<SongDef | null> {
  const file = join(import.meta.dir, "..", "repertoire", id.replace(/^song\./, ""), "song.ts");
  if (!existsSync(file)) return null;
  const mod = (await import(file)) as { default?: SongDef };
  return mod.default ?? null;
}
const pitchOf = (m: Matcher): string | null =>
  m.m === "melody" || m.m === "events"
    ? m.pitch
    : m.m === "all"
      ? (m.of.map(pitchOf).find(Boolean) ?? null)
      : null;

/**
 * Wave 4: the sessions of a capstone (contracts §2.4, §6.6). Every session's starter lints and plays in that
 * session's unlock context; only the last session releases; a transcribe capstone's phrase checks resolve
 * against every song the learner may pick (the phrase exists in the answer key, the layer is written, the
 * rhythm skeleton plays), melody checks compare key-relative (§6.6 X1), chord checks are staged bass first.
 * A song whose answer key is not written yet is pending, not a failure.
 */
export async function capstoneSessionSections(c: CapstoneDef): Promise<CheckSection> {
  const issues: string[] = [];
  const pending: string[] = [];
  const key = c.key ?? DEFAULT_KEY;
  const songs: { id: string; def: SongDef | null }[] = [];
  for (const id of c.song ?? []) {
    if (!songById.has(id)) issues.push(`song ${id} is not in content/repertoire/index.ts`);
    songs.push({ id, def: await songDef(id) });
  }
  for (const s of songs)
    if (!s.def && c.sessionDefs.some((x) => x.checks?.length))
      pending.push(`${s.id}: no answer key yet (content/repertoire/${s.id.replace(/^song\./, "")}/song.ts)`);
  for (const u of unimplementedInCapstoneSessions(c))
    issues.push(`${u.exercise}: uses ${u.what} "${u.name}", which the platform does not implement yet`);
  const last = c.sessionDefs.length - 1;
  for (const [i, s] of c.sessionDefs.entries()) {
    if (s.release && i !== last) issues.push(`${s.id}: only the last session releases the piece`);
    if (s.starter) {
      for (const d of lint(stripMarkers(s.starter).code, { session: s.id as SessionId, meter: c.meter, key })
        .diagnostics)
        if (d.severity === "error") issues.push(`${s.id} starter:${d.line} ${d.id}: ${d.message}`);
      const r = await evaluate(stripMarkers(s.starter).code, 4);
      if (!r.ok) issues.push(`${s.id} starter: ${r.error}`);
      else if (r.events.length === 0) issues.push(`${s.id} starter: silent`);
    }
    for (const x of s.checks ?? []) {
      const where = `${s.id}/${x.id}`;
      if (c.kind !== "transcribe") issues.push(`${where}: phrase checks belong to a transcribe capstone`);
      if (x.layer === "melody" && pitchOf(x.matcher) && pitchOf(x.matcher) !== "key-relative")
        issues.push(
          `${where}: a melody check compares key-relative (contracts §6.6 X1), not ${pitchOf(x.matcher)}`,
        );
      if (x.layer === "chords" && x.stages && x.stages[0] !== "bass")
        issues.push(`${where}: chords are taken down bass first`);
      const [from, to] = Array.isArray(x.phrase) ? x.phrase : [x.phrase, x.phrase];
      for (const song of songs) {
        if (!song.def) continue;
        const phrases = song.def.answerKey.phrases ?? [];
        if (to > phrases.length)
          issues.push(`${where}: ${song.id} has ${phrases.length} phrases, the check needs phrase ${to}`);
        if (!song.def.answerKey.layers[x.layer])
          issues.push(`${where}: ${song.id}'s answer key has no ${x.layer} layer`);
        if (from > to) issues.push(`${where}: phrase [${from}, ${to}]`);
      }
      const skeleton = x.given?.rhythmSkeleton;
      if (skeleton) {
        const r = await evaluate(skeleton, 4);
        if (!r.ok || r.events.length === 0) issues.push(`${where}: the rhythm skeleton does not play`);
      }
    }
  }
  // Wave 6: the form map and a session's own rubric (CF-T; AUTHORING §19.7) are read against each song's
  // sections; a song without them cannot be mapped, and `@song` has nothing to compare with.
  for (const s of c.sessionDefs) {
    const usesSong = (s.rubric ?? []).some((r) => r.rule === "form" && r.pattern === "@song");
    if (!s.formMap && !usesSong) continue;
    for (const song of songs) {
      if (!song.def) continue;
      const sections = song.def.answerKey.sections;
      if (!sections) {
        issues.push(
          `${s.id}: ${song.id}'s answer key has no sections; the form map and the \`@song\` form need \`answerKey.sections\``,
        );
        continue;
      }
      const vocabulary = s.formMap?.vocabulary;
      if (vocabulary === "letters" && sections.some((x) => !/^[A-Z]$/.test(x.label)))
        issues.push(
          `${s.id}/${s.formMap?.id}: ${song.id} labels its sections with names; the map asks for letters`,
        );
      if (Array.isArray(vocabulary))
        for (const x of sections)
          if (!(vocabulary as readonly string[]).includes(x.label.replace(/\d+$/, "")))
            issues.push(
              `${s.id}/${s.formMap?.id}: ${song.id}'s section "${x.label}" is not in the map's vocabulary`,
            );
    }
    if (s.rubric && !s.rubric.some((r) => r.required))
      issues.push(`${s.id}: a session rubric has at least one required rule`);
  }
  if (c.inGymSlots && c.kind !== "transcribe")
    issues.push("only a transcription capstone runs in gym slots (contracts §2.5)");
  if (
    c.kind === "transcribe" &&
    !c.sessionDefs.some((s) => s.checks?.length || s.stages?.length || s.formMap || s.rubric?.length)
  )
    pending.push("no phrase checks or stage exercises authored yet");
  return { n: 5, name: "Sessions (contracts §2.4, §6.6)", issues, pending };
}

/** A capstone: the brief (starter, rubric tests, unlocks at its first session in every legal order) and its sessions. */
export async function checkCapstone(c: CapstoneDef): Promise<CheckSection[]> {
  const brief: string[] = [];
  if (c.kind === "compose" && !c.brief) brief.push("a compose capstone has a brief");
  if (!c.brief) return [{ n: 1, name: "Brief", issues: brief }, await capstoneSessionSections(c)];
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
    statedKey: !c.key,
  };
  const items: Item[] = [{ where: "brief", e: b }];
  return [
    { n: 1, name: "Brief and tests", issues: brief },
    await capstoneSessionSections(c),
    ...(await exerciseSections(owner, items, 4)),
    voiceAndShape(items),
  ];
}
