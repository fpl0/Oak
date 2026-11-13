// The learner of a walk suite (walk-*.pw.ts): each lesson's test starts from the dev seed just before it in the
// default order, unless the test before it in the same serial file has just completed the very lesson that seed
// point ends on. Then the learner is already there (one lesson short of it, the lesson itself not begun) and the
// seed, which replays every earlier session one simulated day at a time, is not built again. A test run on its
// own, after a failure, or after a checkpoint or a gym session in the order always seeds.
import type { Page } from "@playwright/test";
import { api, seed } from "./w3support.ts";

type Progress = { lessons: { lessonId: string; status: string }[] };

/** The lesson a seed point `after <lesson>` ends on (`null` for a checkpoint, a gym session or a named point). */
export function lessonBefore(point: string): string | null {
  const m = /^after ((?:U\d\d|A\d)\.L\d\d)$/.exec(point);
  return m ? (m[1] as string) : null;
}

/**
 * Seeds `point` for lesson `id`, or keeps the learner the previous test left when that test (`prev`, the lesson
 * before `id` in the same file) is the lesson `point` ends on (`chainFrom` for a named point such as the side
 * lessons' "A1.L02 done"), it is completed on the server and `id` is not begun. Returns whether it seeded.
 */
export async function seedOrChain(
  page: Page,
  id: string,
  point: string,
  prev: string | null,
  chainFrom: string | null = lessonBefore(point),
): Promise<boolean> {
  if (prev !== null && chainFrom === prev) {
    const p = await api<Progress>(page, "GET", "/lessons/progress");
    const status = (l: string) => p.body?.lessons.find((x) => x.lessonId === l)?.status;
    const now = status(id);
    if (status(prev) === "completed" && now !== "completed" && now !== "in_progress") {
      console.log(`[chain] ${id}: the learner ${prev} left (no seed of "${point}")`);
      return false;
    }
  }
  await seed(page, point);
  return true;
}
