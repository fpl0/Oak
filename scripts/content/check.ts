// `bun run content:check <id>`: the focused validation of AUTHORING §9.1 for one lesson, a unit (`U06`),
// a capstone or checkpoint, or `all`. Prints each check in order with its first problems, then a summary;
// exits 1 when anything fails. Things only an unfinished package can decide are listed as pending.
import { relative } from "node:path";
import { stripMarkers } from "@oak/content-kit";
import { capstones } from "../../content/capstones.ts";
import { checkpointMetas } from "../../content/checkpoints.ts";
import { type LoadedLesson, loadLessons } from "../../content/lib/load.bun.ts";
import { syllabus } from "../../content/syllabus.ts";
import { type CheckSection, checkLesson } from "../../content/validate/checks.ts";
import { backends, evaluate, lint } from "../../content/validate/harness.ts";

const MAX_SHOWN = 5;
const color = (code: number, s: string) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const PASS = color(32, "PASS");
const FAIL = color(31, "FAIL");
const WAIT = color(33, "PENDING");

function print(title: string, sections: CheckSection[]): boolean {
  console.log(`\n${title}`);
  let ok = true;
  for (const s of sections) {
    const failed = s.issues.length > 0;
    ok &&= !failed;
    const tag = failed ? FAIL : s.pending?.length ? WAIT : PASS;
    console.log(`  ${String(s.n).padStart(2)}. ${s.name.padEnd(34)} ${tag}`);
    for (const i of s.issues.slice(0, MAX_SHOWN)) console.log(`        ${i}`);
    if (s.issues.length > MAX_SHOWN) console.log(`        … and ${s.issues.length - MAX_SHOWN} more`);
    for (const p of (s.pending ?? []).slice(0, 3)) console.log(color(2, `        pending: ${p}`));
  }
  return ok;
}

async function checkCapstone(id: string): Promise<boolean> {
  const c = capstones.find((x) => x.id === id);
  if (!c) return false;
  const issues: string[] = [];
  if (c.brief) {
    const code = stripMarkers(c.brief.code.starter).code;
    const r = await evaluate(code, 4);
    if (!r.ok) issues.push(`starter: ${r.error}`);
    else if (r.events.length === 0) issues.push("starter: silent");
    for (const d of lint(code, { session: c.sessionDefs[0]?.id as never, meter: c.meter }).diagnostics)
      if (d.severity === "error") issues.push(`starter:${d.line} ${d.id}: ${d.message}`);
  }
  return print(`${c.id} ${c.title} (${c.kind}, ${c.sessions} sessions)`, [
    { n: 1, name: "Brief and starter", issues },
  ]);
}

const arg = process.argv[2];
if (!arg) {
  console.error("usage: bun run content:check <lessonId | unitId | capstoneId | checkpointId | all>");
  process.exit(2);
}
const { lessons, errors } = await loadLessons();
for (const e of errors) console.error(`${FAIL} ${e.file}: ${e.error}`);

let targets: LoadedLesson[] = [];
let ok = errors.length === 0;
if (arg === "all") targets = lessons;
else if (syllabus.units.some((u) => u.id === arg))
  targets = lessons.filter((l) => l.def.id.startsWith(`${arg}.`) && !l.sample);
else if (capstones.some((c) => c.id === arg)) ok = (await checkCapstone(arg)) && ok;
else if (checkpointMetas.some((c) => c.id === arg)) {
  const cp = checkpointMetas.find((c) => c.id === arg);
  console.log(
    `\n${arg}: authored items are not written yet (content/core/${arg.split(".")[0]}/CP/checkpoint.ts); covers ${cp?.covers.join(" ")}`,
  );
} else {
  targets = lessons.filter((l) => l.def.id === arg || relative(process.cwd(), l.dir).includes(arg));
  if (targets.length === 0) {
    console.error(
      `${FAIL} no lesson, unit, capstone or checkpoint "${arg}" (authored lessons: ${lessons.map((l) => l.def.id).join(" ") || "none"})`,
    );
    process.exit(1);
  }
}
if (arg === "all") for (const c of capstones) ok = (await checkCapstone(c.id)) && ok;
for (const l of targets)
  ok =
    print(
      `${l.def.id} ${l.def.title}${l.sample ? " (sample)" : ""}  ${relative(process.cwd(), l.file)}`,
      await checkLesson(l),
    ) && ok;
console.log(`\n${ok ? PASS : FAIL}  backends: ${JSON.stringify(backends())}`);
process.exit(ok ? 0 : 1);
