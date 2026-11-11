// Renders a unit spec (content/specs/Uxx.ts) to the Markdown document authors read (content/specs/Uxx.md).
// Facts that live in the registries (objectives, skills and their prerequisites, unlocks, term wording,
// can-do statements, capstone rubrics) are read from there, so the document cannot disagree with them.
import { BEGINNER_FACTOR, type LessonMeta, lessonBudget } from "@oak/content-kit";
import { candoById } from "../candos.ts";
import { capstones } from "../capstones.ts";
import { checkpointMetas } from "../checkpoints.ts";
import { registries } from "../index.ts";
import { termById } from "../terms.ts";
import type { LessonSpec, StepSpec, UnitSpec } from "./types.ts";

const skillName = new Map(registries.skills.map((s) => [s.id as string, s] as const));
const metaOf = (id: string): LessonMeta | undefined =>
  registries.syllabus.units.flatMap((u) => u.lessons).find((l) => l.id === id);
const unlocksAt = (session: string): string[] =>
  registries.toolbox
    .filter((t) => (Array.isArray(t.unlock.at) ? t.unlock.at : [t.unlock.at]).includes(session as never))
    .map((t) => `${t.id}${t.unlock.when === "start" ? " (at the start)" : ""}`);

const code = (c: string) => `\`${c.replace(/`/g, "\\`")}\``;
const list = (xs: readonly string[]) => (xs.length ? xs.map(code).join(" ") : "none");
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const termsOf = (s: StepSpec): string[] =>
  s.term === undefined ? [] : Array.isArray(s.term) ? s.term : [s.term];
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/** The budget of a spec, computed the way content CI computes a lesson's. */
export function specBudget(l: LessonSpec) {
  const steps = l.steps.map((s, i) => ({
    id: `S${i + 1}` as const,
    minutes: s.minutes,
    ...(s.optional ? { optional: true } : {}),
    ...(s.graded ? { graded: true } : {}),
  }));
  return lessonBudget({ steps: steps as never, wrapAt: `S${l.wrapAt}` as never });
}

function skills(ids: readonly string[]): string {
  if (ids.length === 0) return "none";
  return ids
    .map((id) => {
      const s = skillName.get(id);
      const pre = s?.prerequisites.length ? ` (needs ${s.prerequisites.join(", ")})` : "";
      return `${id} ${s?.name ?? "?"}${pre}`;
    })
    .join("; ");
}

function lesson(l: LessonSpec): string {
  const m = metaOf(l.id);
  const b = specBudget(l);
  const out: string[] = [];
  out.push(`## ${l.id} ${m?.title ?? ""}`, "");
  out.push(`Author: **${l.author}**. Key ${l.key.tonic} ${l.key.mode}, ${l.meter}, ${l.bpm} BPM.`, "");
  out.push(`**Objective (syllabus).** ${m?.objective ?? "?"}`, "");
  out.push(`**The one idea.** ${l.idea}`, "");
  out.push(`**Sound first.** ${l.hook.hear}${l.hook.preview ? " (a `preview: true` example)" : ""}`, "");
  out.push("```js", l.hook.code, "```", "");
  out.push(
    `**Skills.** Introduces: ${skills(m?.introduces ?? [])}. Practises: ${skills(m?.practises ?? [])}.`,
    "",
  );
  const terms = l.steps.flatMap((s, i) => termsOf(s).map((t) => ({ t, step: `S${i + 1}` })));
  out.push(
    `**Terms (≤ 3, a pair counts once).** ${
      terms.length
        ? terms
            .map(({ t, step }) => {
              const e = termById.get(t);
              const pair = e?.pairedWith
                ? ` + ${code(e.pairedWith)} "${termById.get(e.pairedWith)?.term}"`
                : "";
              return `${code(t)} "${e?.term}"${pair} in ${step}: ${e?.definition}`;
            })
            .join(" ")
        : "none"
    }`,
    "",
  );
  out.push(
    `**Can-do.** ${l.canDo.map((c) => `${code(c)} "${candoById.get(c)?.statement ?? "?"}"`).join("; ") || "none"}`,
    "",
  );
  out.push(`**Unlocked here (content/toolbox.ts).** ${list(unlocksAt(l.id))}`, "");
  out.push(`**Tools the learner's code uses.** ${list(l.uses)}`, "");
  out.push("**Steps.**", "");
  out.push(
    "| Step | Kind | Exercise | Answer | Min | Graded | What | Term |",
    "|---|---|---|---|---|---|---|---|",
  );
  l.steps.forEach((s, i) => {
    const ex = s.exercise ? (s.parts ? `${s.exercise} (${s.parts.join(", ")})` : s.exercise) : "—";
    out.push(
      `| S${i + 1}${i + 1 === l.wrapAt ? " (wrap)" : ""} | ${s.kind}${s.optional ? " (optional)" : ""} | ${ex} | ${(s.answer ?? []).join(", ") || "—"} | ${fmt(s.minutes)} | ${s.graded ? "yes" : ""} | ${cell(s.what)} | ${termsOf(s).join(", ")} |`,
    );
  });
  out.push("");
  out.push(
    `**Budget (§9.2).** ${b.steps} steps, ${b.gradedChecks} graded; expert ${fmt(b.expertMinutes)} min × ${BEGINNER_FACTOR} = ${b.scaledMinutes.toFixed(2)} scaled (cap 13). Split at S${l.wrapAt}: part A ${b.partAScaled.toFixed(2)} (cap 8.5), part B ${b.partBScaled.toFixed(2)} (cap 9.5).`,
    "",
  );
  out.push(`**Make.** ${l.make.brief}`, "");
  out.push(
    `- Required rule (exactly one): \`${l.make.required.rule}\`, "${l.make.required.label}". ${l.make.required.why}`,
  );
  out.push(`- Suggestions: ${l.make.suggestions.join("; ") || "none"}.`);
  out.push(
    `- Band: ${l.make.band === false ? "`false` (no Band)" : `${code(l.make.band)}${l.make.tracks ? `, tracks ${l.make.tracks.map(code).join(" ")}` : ", all tracks"}`}. Flavours: ${l.make.flavours}`,
  );
  out.push("");
  out.push(
    `**SRS.** ${
      l.srs.length
        ? l.srs
            .map(
              (r) =>
                `${r.family ? code(r.family) : code(r.deck ?? "")}${r.cards ? ` cards ${list(r.cards)}` : ""} (${r.mode})`,
            )
            .join("; ")
        : "none"
    }. Fact cards: ${l.srs.flatMap((r) => r.cards ?? []).length || "none"}.`,
    "",
  );
  out.push("**Mistakes the tests must pin (feedback codes as the grader emits them).**", "");
  for (const x of l.mistakes) out.push(`- ${x}`);
  out.push("");
  out.push(`**Connects.** Back: ${l.connects.back} Forward: ${l.connects.forward}`, "");
  if (l.notes?.length) {
    out.push("**Notes.**", "");
    for (const n of l.notes) out.push(`- ${n}`);
    out.push("");
  }
  return out.join("\n");
}

function overview(u: UnitSpec): string {
  const rows = u.lessons.map((l) => {
    const m = metaOf(l.id);
    const b = specBudget(l);
    const terms = l.steps.flatMap(termsOf);
    return `| ${l.id} | ${m?.title} | ${l.author} | ${(m?.introduces ?? []).join(" ") || "—"} | ${(m?.practises ?? []).join(" ") || "—"} | ${terms.map((t) => termById.get(t)?.term).join(", ") || "—"} | ${fmt(b.expertMinutes)} / ${b.scaledMinutes.toFixed(1)} |`;
  });
  return [
    "| Lesson | Title | Author | Introduces | Practises | New terms | Minutes (expert / scaled) |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function rubricTable(id: string): string {
  const c = capstones.find((x) => x.id === id);
  if (!c?.brief) return "";
  const rows = c.brief.rubric.map((r) => {
    const { id: rid, label, required, skills: sk, rule, ...rest } = r;
    return `| ${rid} | ${cell(label)} | ${required ? "yes" : ""} | \`${rule}\` | ${cell(JSON.stringify(rest))} | ${sk.join(" ")} |`;
  });
  return [
    `Opens after: ${JSON.stringify(c.opensAfter)}. Meter ${c.meter}${c.bpm ? `, ${c.bpm[0]}–${c.bpm[1]} BPM` : ""}. Brief: "${c.brief.brief}"`,
    "",
    "Starter:",
    "",
    "```js",
    c.brief.code.starter,
    "```",
    "",
    "| Rule | Label | Required | Rule kind | Parameters | Skills |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
    `Tests in the brief: ${c.brief.tests.map((t) => `"${t.name}" (${t.expect})`).join(", ") || "none yet"}.`,
  ].join("\n");
}

export function renderUnit(u: UnitSpec): string {
  const unit = registries.syllabus.units.find((x) => x.id === u.unit);
  const out: string[] = [
    `# ${u.unit} ${unit?.title ?? u.title}: unit spec`,
    "",
    `<!-- GENERATED from content/specs/${u.unit}.ts by \`bun scripts/content/spec.ts\`. Edit the .ts, never this file; content/validate/specs.test.ts fails when they differ. -->`,
    "",
    u.summary,
    "",
    "Checked by `bun test content/validate/specs.test.ts`: every skill's prerequisites come earlier in every legal order, every tool a lesson's code uses is unlocked at or before it, every term and can-do exists and belongs to its lesson, budgets hold, the Band fits the meter, and the hook code evaluates and lints in its lesson.",
    "",
    "## Conventions for this unit",
    "",
    ...u.conventions.map((c) => `- ${c}`),
    "",
    "## Overview",
    "",
    overview(u),
    "",
    ...u.lessons.map(lesson),
  ];
  if (u.checkpoint) {
    const cp = u.checkpoint;
    const meta = checkpointMetas.find((c) => c.id === cp.id);
    out.push(`## ${cp.id} ${meta?.title ?? ""}`, "");
    out.push(
      `Author: **${cp.author}**. Gated (counted in the pass score): ${(meta?.gated ?? []).join(" ")}. Level-setting (never block): ${(meta?.levelSetting ?? []).join(" ") || "none"}.`,
      "",
    );
    out.push("| Authored item | Kind | Skills | What |", "|---|---|---|---|");
    for (const a of cp.authored)
      out.push(`| ${a.id} | ${a.kind} | ${a.skills.join(" ")} | ${cell(a.what)} |`);
    out.push("");
    out.push(
      `**Recipe.** ${cp.recipe.items[0]}–${cp.recipe.items[1]} items, at least 2 per skill. Families: ${Object.entries(
        cp.recipe.families,
      )
        .map(([s, f]) => `${s} → ${(f ?? []).map(code).join(", ")}`)
        .join("; ")}. ${cp.recipe.why}`,
      "",
    );
    out.push(`**Make.** ${cp.make.brief} Required: ${cp.make.required}`, "");
    for (const n of cp.notes) out.push(`- ${n}`);
    out.push("");
  }
  for (const c of u.capstones) {
    const def = capstones.find((x) => x.id === c.id);
    out.push(`## ${c.id} ${def?.title.replace(/^\S+\s/, "") ?? ""}`, "");
    out.push(`Author: **${c.author}**. ${c.intent}`, "");
    out.push(rubricTable(c.id), "");
    for (const n of c.notes) out.push(`- ${n}`);
    out.push("");
  }
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}
