// The course's own feedback texts (Wave 4 integration). Every `feedbackText` override in a lesson, checkpoint
// or capstone replaces a catalog entry, so it must name a code the grader emits (else it is dead text) and use
// only the slots that code's diagnostics fill: the catalog template's own slots and the position slots
// `renderFeedback` reads from `where`. A slot outside both renders as a hole ("the chord has ; it should…").
import { describe, expect, test } from "bun:test";
import type { Exercise } from "@oak/content-kit";
import { flattenExercise } from "@oak/content-kit";
import { capstones } from "../../../../content/capstones.ts";
import { loadCheckpointFiles, loadLessons } from "../../../../content/lib/load.bun.ts";
import { FEEDBACK_CATALOG } from "./catalog.ts";

const WHERE_SLOTS = new Set(["bar", "beat", "beatLabel", "track", "slot", "rule", "blank"]);

async function courseExercises(): Promise<[string, Exercise][]> {
  const out: [string, Exercise][] = [];
  const { lessons, errors } = await loadLessons();
  expect(errors).toEqual([]);
  for (const l of lessons)
    for (const s of l.def.steps) if (s.exercise) out.push([`${l.def.id} ${s.id}`, s.exercise]);
  const { defs } = await loadCheckpointFiles();
  for (const d of defs) {
    for (const e of d.authored) out.push([`${d.id} ${e.id}`, e]);
    out.push([`${d.id} make`, d.make]);
  }
  for (const c of capstones) if (c.brief) out.push([`${c.id} brief`, c.brief]);
  return out;
}

describe("feedback overrides in the course", () => {
  test("every override names a catalog code and fills only that code's slots", async () => {
    const exercises = await courseExercises();
    expect(exercises.length).toBeGreaterThan(300);
    const bad: string[] = [];
    let n = 0;
    for (const [where, e] of exercises)
      for (const x of flattenExercise(e))
        for (const [code, text] of Object.entries(x.feedbackText ?? {})) {
          n++;
          const entry = FEEDBACK_CATALOG[code];
          if (!entry) {
            bad.push(`${where} ${x.id}: "${code}" is not a feedback code`);
            continue;
          }
          const own = new Set([...entry.template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string));
          for (const m of String(text).matchAll(/\{(\w+)\}/g)) {
            const slot = m[1] as string;
            if (!own.has(slot) && !WHERE_SLOTS.has(slot))
              bad.push(`${where} ${x.id}: ${code} uses {${slot}}, which "${entry.template}" never fills`);
          }
        }
    expect(n).toBeGreaterThan(200);
    expect(bad).toEqual([]);
  });
});
