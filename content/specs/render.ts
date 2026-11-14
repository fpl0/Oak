// Renders a unit spec (content/specs/Uxx.ts) to the Markdown document authors read (content/specs/Uxx.md).
// Facts that live in the registries (objectives, skills and their prerequisites, unlocks, term wording,
// can-do statements, capstone rubrics) are read from there, so the document cannot disagree with them.
import { BEGINNER_FACTOR, type LessonMeta, lessonBudget } from "@oak/content-kit";
import { candoById } from "../candos.ts";
import { capstones } from "../capstones.ts";
import { checkpointMetas } from "../checkpoints.ts";
import { ladder as ladderLevels } from "../gym/ladder.ts";
import { GYM_SLOT_RULE, gymSlotKind, LADDER_OPENS } from "../gym/slots.ts";
import { registries } from "../index.ts";
import { termById } from "../terms.ts";
import type { CapstoneSpec, EndOfCoreSpec, GymSpec, LessonSpec, StepSpec, UnitSpec } from "./types.ts";

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
  out.push(
    `Author: **${l.author}**. Key ${l.key.tonic} ${l.key.mode}, ${l.meter}, ${l.bpm} BPM.${m?.side ? " A side lesson: outside the default order, offered from its gate on, written for a learner at the gate." : ""}`,
    "",
  );
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
    const kind = s.exercise ? (s.parts ? `${s.exercise} (${s.parts.join(", ")})` : s.exercise) : "—";
    const w3 = s.wave3?.length ? `; Wave 3: ${s.wave3.join(", ")}` : "";
    const w4 = s.features?.length ? `; Wave 4: ${s.features.join(", ")}` : "";
    const panels = s.panels?.length ? `; opens ${s.panels.join(", ")}` : "";
    const ex = `${kind}${w3}${w4}${panels}`;
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
                `${r.family ? code(r.family) : code(r.deck ?? "")}${r.cards ? ` cards ${list(r.cards)}` : ""} (${r.mode}${r.level ? `, level ${r.level}` : ""})`,
            )
            .join("; ")
        : "none"
    }. Fact cards: ${l.srs.flatMap((r) => r.cards ?? []).length || "none"}.`,
    "",
  );
  if (l.singOn)
    out.push(
      `**Singing.** On ${l.singOn}${l.singOn === "numbers" ? " (syllables arrive in U03.L08)" : ", numbers still shown and accepted"}.`,
      "",
    );
  for (const r of l.repertoire ?? []) {
    out.push(
      `**Repertoire: ${r.song}**, ${r.fragment} (${r.bars} bars). Setting: ${r.setting}`,
      "",
      "```js",
      `// as degrees, in ${r.key}`,
      `n("${r.degrees}").scale("${r.key}")`,
      `// the same notes in the source's key, ${r.sourceKey}`,
      `note("${r.letters}")`,
      "```",
      "",
    );
  }
  if (l.epr)
    out.push(
      `**Enjoyment.** ${l.epr.enjoyment}`,
      "",
      `**Pace.** ${l.epr.pace}`,
      "",
      `**Return.** ${l.epr.return}`,
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

/** Wave 4: when a capstone opens, its Band, its sessions, its liner notes and its tests (CapstoneSpec). */
function capstoneDetail(c: CapstoneSpec): string {
  const out: string[] = [];
  const def = capstones.find((x) => x.id === c.id);
  if (c.opens) out.push(`**Opens.** ${c.opens}`, "");
  if (c.band) out.push(`**Band.** ${c.band}`, "");
  for (const x of c.sections ?? []) {
    out.push(`**${x.title}.**${x.lead ? ` ${x.lead}` : ""}`, "");
    for (const i of x.items) out.push(`- ${i}`);
    out.push("");
  }
  for (const s of c.sessions ?? []) {
    const sd = def?.sessionDefs.find((x) => x.id === s.id);
    const flags = sd ? [sd.review ? "review" : "", sd.release ? "release" : ""].filter(Boolean) : [];
    out.push(`### ${s.id}: ${s.goal}${flags.length ? ` (${flags.join(", ")})` : ""}`, "");
    if (sd && sd.goal !== s.goal) out.push(`> content/capstones.ts says: "${sd.goal}"`, "");
    out.push(`- **Opens with.** ${s.opens}`);
    out.push(`- **Hears.** ${s.hear}`);
    out.push(`- **Sees.** ${s.see}`);
    out.push("- **Work.**");
    for (const [i, w] of s.work.entries()) out.push(`  ${i + 1}. ${w}`);
    out.push("- **Checks.**");
    for (const x of s.checks) out.push(`  - ${x}`);
    out.push(`- **Ends.** ${s.ends}`);
    if (s.epr)
      out.push(
        `- **Enjoyment.** ${s.epr.enjoyment}`,
        `- **Pace.** ${s.epr.pace}`,
        `- **Return.** ${s.epr.return}`,
      );
    out.push("");
  }
  if (c.linerNotes?.length) {
    out.push("**Liner notes.**", "");
    for (const x of c.linerNotes) out.push(`- ${x}`);
    out.push("");
  }
  if (c.tests?.length) {
    out.push("**Tests the brief or the checks must carry.**", "");
    for (const x of c.tests) out.push(`- ${x}`);
    out.push("");
  }
  return out.join("\n");
}

/** Wave 4: the Transcription Gym. The slot rule, the default-order slots and the ladder are read from content/gym. */
function gymSection(g: GymSpec): string {
  const order = registries.syllabus.defaultOrder as readonly string[];
  const slots = order
    .map((id, i) => ({ id, i }))
    .filter((x) => x.id.startsWith("GYM."))
    .map((x) => `${x.id} (session ${x.i + 1}, after ${order[x.i - 1]}; ${gymSlotKind(x.id)})`);
  const out: string[] = ["## Transcription Gym", "", g.summary, ""];
  out.push(
    `**The slot rule (content/gym/slots.ts).** From ${GYM_SLOT_RULE.startsAt}, after ${GYM_SLOT_RULE.afterCoreSessions} completed core sessions since the last transcription session, the next session's New block is a transcription slot.`,
    "",
  );
  for (const x of g.slots) out.push(`- ${x}`);
  out.push("", `**Slots in the default order.** ${slots.join("; ")}.`, "");
  out.push(
    "**A gym session (contracts §9.1).**",
    "",
    "| Target | Transcription minutes | What it contains |",
    "|---|---|---|",
  );
  for (const b of g.budget) out.push(`| ${b.target} | ${b.minutes} | ${cell(b.contains)} |`);
  out.push("", "**The ladder (contracts §2.9; content/gym/ladder.ts).**", "");
  out.push(
    "| Level | Title | First available | Material | Source | Given | Grading |",
    "|---|---|---|---|---|---|---|",
  );
  for (const l of g.ladder) {
    const def = ladderLevels.find((x) => x.level === l.level);
    const opens = LADDER_OPENS[l.level as keyof typeof LADDER_OPENS] ?? "?";
    out.push(
      `| L${l.level} | ${def?.title ?? "?"} | ${opens} | ${cell(l.material)} | ${cell(l.source)} | ${cell(l.given)} | ${cell(l.grading)}${def?.grading === "auto" ? ` (pass ${def.pass})` : ""} |`,
    );
  }
  out.push("", "**Realism.**", "");
  for (const x of g.realism) out.push(`- ${x}`);
  out.push("", "**Moving up the ladder.**", "");
  for (const x of g.levelUp) out.push(`- ${x}`);
  out.push("", "**Own audio (even slots).**", "");
  for (const x of g.ownAudio) out.push(`- ${x}`);
  out.push("", "**Notes.**", "");
  for (const x of g.notes) out.push(`- ${x}`);
  out.push("");
  return out.join("\n");
}

/** Wave 6: the end of the core (EndOfCoreSpec): when it happens, each surface as its owner builds it, the server's part. */
function endSection(e: EndOfCoreSpec): string {
  const out: string[] = ["## The end of the core", "", e.summary, ""];
  const bullets = (title: string, xs: readonly string[]) => {
    if (xs.length === 0) return;
    out.push(`**${title}.**`, "");
    for (const x of xs) out.push(`- ${x}`);
    out.push("");
  };
  bullets("When", e.when);
  bullets("What every surface is judged by", e.principles);
  out.push(
    `**Enjoyment.** ${e.epr.enjoyment}`,
    "",
    `**Pace.** ${e.epr.pace}`,
    "",
    `**Return.** ${e.epr.return}`,
    "",
  );
  for (const s of e.surfaces) {
    out.push(`### ${s.title} (\`${s.id}\`)`, "");
    out.push(`Owner: **${s.owner}**. Where: ${s.where}`, "", s.purpose, "");
    out.push("- **Sees.**");
    for (const [i, x] of s.sees.entries()) out.push(`  ${i + 1}. ${x}`);
    if (s.hears) out.push(`- **Hears.** ${s.hears}`);
    out.push("- **Can do.**");
    for (const x of s.actions) out.push(`  - ${x}`);
    out.push("- **Data.**");
    for (const x of s.data) out.push(`  - ${x}`);
    out.push("- **States.**");
    for (const x of s.states) out.push(`  - ${x}`);
    out.push("");
    if (s.copy.length) {
      out.push("| Copy: where | Text |", "|---|---|");
      for (const c of s.copy) out.push(`| ${cell(c.where)} | ${cell(c.text)} |`);
      out.push("");
    }
  }
  bullets("The server's part", e.server);
  bullets("Never", e.never);
  bullets("Acceptance", e.acceptance);
  bullets("Dev seeds", e.seeds);
  bullets("Notes", e.notes);
  return out.join("\n");
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
    u.lessons.length
      ? "Checked by `bun test content/validate/specs.test.ts`: every skill's prerequisites come earlier in every legal order, every tool a lesson's code uses is unlocked at or before it, every term and can-do exists and belongs to its lesson, budgets hold, the Band fits the meter, and the hook code evaluates and lints in its lesson."
      : "This spec has no lessons. `bun test content/validate/specs.test.ts` checks that this document is the current rendering of its source; the capstone rubrics, session flags, slots and ladder titles it prints are read from the registries.",
    "",
    "## Conventions for this unit",
    "",
    ...u.conventions.map((c) => `- ${c}`),
    "",
    ...(u.lessons.length ? ["## Overview", "", overview(u), ""] : []),
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
    out.push(capstoneDetail(c));
    for (const n of c.notes) out.push(`- ${n}`);
    out.push("");
  }
  if (u.gym) out.push(gymSection(u.gym));
  if (u.ending) out.push(endSection(u.ending));
  return `${out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}
