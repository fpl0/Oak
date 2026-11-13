// `bun scripts/content/spec.ts [--check]`: renders every unit spec (content/specs/Uxx.ts) to
// content/specs/Uxx.md. With --check it writes nothing and exits 1 when a document is out of date.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_ROOT } from "../../content/lib/load.bun.ts";
import { unitSpecs } from "../../content/specs/index.ts";
import { renderUnit } from "../../content/specs/render.ts";
import { atomicWrite } from "./generate.ts";

const check = process.argv.includes("--check");
let stale = 0;
/** Specs written before Wave 5; every later spec gives each lesson its enjoyment, pace and return lines. */
const BEFORE_EPR = new Set(["U00", "U01", "U02", "U03", "U04", "U05", "U06", "U07"]);
for (const u of unitSpecs)
  for (const l of BEFORE_EPR.has(u.unit) ? [] : u.lessons)
    if (!l.epr?.enjoyment.trim() || !l.epr.pace.trim() || !l.epr.return.trim()) {
      console.error(`content/specs/${u.unit}.ts: ${l.id} needs epr: { enjoyment, pace, return }`);
      stale++;
    }
for (const u of unitSpecs) {
  const file = join(CONTENT_ROOT, "specs", `${u.unit}.md`);
  const body = renderUnit(u);
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {}
  if (current === body) continue;
  if (check) {
    console.error(`content/specs/${u.unit}.md is out of date: run bun scripts/content/spec.ts`);
    stale++;
  } else {
    atomicWrite(file, body);
    console.log(`content:spec: wrote content/specs/${u.unit}.md`);
  }
}
process.exit(stale ? 1 : 0);
