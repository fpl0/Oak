// Test support (not a test file): grades and analyses capstone pieces with the real headless grader, the way
// the browser grader host does in capstone mode, so the capstone tests check music against Strudel itself.
import type { CapstoneDef, GradeResult, KeySpec, UnlockableId } from "@oak/content-kit";
import * as grader from "@oak/grader";
import { capstones } from "../../../content/capstones.ts";
import { courseGraph } from "../../../content/index.ts";
import { unlockedAt } from "../../../content/lib/course.ts";
import { toolbox } from "../../../content/toolbox.ts";
import { MAX_CAPSTONE_BARS, pieceAnalysis, pieceBars, truncate } from "./piece.ts";

let realm: Promise<unknown> | null = null;
export function ensureRealm(): Promise<unknown> {
  realm ??= grader.initRealm({ toolbox: [...toolbox], lockdown: false });
  return realm;
}

export function capstone(id: string): CapstoneDef {
  const c = capstones.find((x) => x.id === id);
  if (!c?.brief) throw new Error(`no compose capstone ${id}`);
  return c;
}

/** The brief's authored test piece by name. */
export function testPiece(id: string, name: string): string {
  const t = capstone(id).brief?.tests.find((x) => x.name === name);
  if (!t || !("code" in t.response)) throw new Error(`no test "${name}" in ${id}`);
  return t.response.code;
}

export function unlockedFor(id: string): Set<UnlockableId> {
  return unlockedAt(courseGraph(), toolbox, `${id}.S1` as never) as Set<UnlockableId>;
}

export async function gradePiece(id: string, code: string, key: KeySpec | null = null): Promise<GradeResult> {
  await ensureRealm();
  const c = capstone(id);
  return grader.gradeExercise({
    exercise: c.brief as NonNullable<CapstoneDef["brief"]>,
    response: { code },
    ctx: {
      exerciseGlobalId: `${id}/brief`,
      mode: "capstone",
      key: key ?? c.key ?? { tonic: "C", mode: "major" },
      meter: c.meter,
      bpm: 100,
      ...(c.swing ? { swing: c.swing } : {}),
      params: {},
      attemptNo: 1,
      firstAttempt: true,
      rung: 0,
      tutorHints: 0,
      extraReplays: 0,
      lint: { profile: "graded", unlocked: unlockedFor(id), allowPreview: false, meter: c.meter, key: null },
    },
  });
}

export async function analysePiece(id: string, code: string) {
  await ensureRealm();
  const c = capstone(id);
  const ev = await grader.evaluateForGrading(code, {
    mode: "capstone",
    bars: MAX_CAPSTONE_BARS,
    lint: null,
    meter: c.meter,
  });
  if (!ev.ok) throw new Error(`does not evaluate: ${ev.error.message}`);
  const full = grader.normalize(ev, { meter: c.meter });
  const bars = pieceBars(code, full.all);
  const n = truncate(full, bars);
  return { n, bars, analysis: pieceAnalysis(n, { code, meter: c.meter, key: c.key ?? null, bars }) };
}
