// Seeds a throwaway Oak data dir for the capstone e2e (run by bun before the server starts): every lesson up to
// the U02 checkpoint completed and the U01 and U02 checkpoints passed, so C0 and C1 are open. The server's start-up
// backfill then grants the unlocks of those sessions (contracts §11.7 rule 5). Usage: bun seed.bun.ts <dataDir>
// Run by Bun (it imports the server's Bun-only db modules; *.bun.ts is outside every app typecheck project).
import { join } from "node:path";
import { syllabus } from "../../../../content/syllabus.ts";
import { openDb } from "../../../../server/src/db/index.ts";
import { createRepos } from "../../../../server/src/db/repos/index.ts";

const dataDir = process.argv[2];
if (!dataDir) throw new Error("usage: bun seed.bun.ts <dataDir>");
const db = openDb(join(dataDir, "oak.db"));
const repos = createRepos(db, { timezone: "UTC", now: () => new Date() });
const at = new Date(Date.now() - 86_400_000).toISOString();
const stop = syllabus.defaultOrder.indexOf("U02.CP");
for (const id of syllabus.defaultOrder.slice(0, stop + 1)) {
  if (/^U\d\d\.L\d\d$/.test(id))
    repos.lessons.saveProgress({
      lessonId: id,
      status: "completed",
      currentStep: null,
      splitPart: null,
      startedAt: at,
      completedAt: at,
      bestScore: 1,
      completedVersion: 1,
      contentHash: null,
      updatedAt: at,
    });
  else if (/^U\d\d\.CP$/.test(id)) {
    repos.checkpoints.start(id, 1, at, []);
    repos.checkpoints.finish(id, 1, {
      finishedAt: at,
      score: 0.95,
      passed: true,
      softPass: false,
      perSkill: [],
      detail: null,
    });
  }
}
db.close();
console.log(`seeded ${dataDir}: lessons and checkpoints through U02.CP`);
