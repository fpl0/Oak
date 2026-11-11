// Progress fixture for the map and dev-page browser suites (app/src/map/e2e): run before the Oak server starts
// on a fresh OAK_DATA_DIR. It writes through the server's own repositories (migrations included), so every row
// has the shape the server writes itself:
//   - U00.L01 to U01.L03 completed, U01.L04 in progress (so "what's next" is U01.L04);
//   - evidence on several days for R01 R02 R03 E01 (practising), a little for R06 R04 D01 V01 (introduced);
//   - two family cards: fam.rhy.echo on schedule, fam.rhy.pulse two weeks overdue (a paler, drying leaf);
//   - a week of session telemetry.
// Usage: OAK_DATA_DIR=<dir> bun app/src/routes/dev/-lib/seed.bun.ts
import type { Evidence, LessonProgress, SessionTelemetry } from "@oak/api";
import { dataPaths } from "../../../../../server/src/config.ts";
import { openDb } from "../../../../../server/src/db/index.ts";
import { createRepos } from "../../../../../server/src/db/repos/index.ts";

const DAY = 86_400_000;
const dir = process.env.OAK_DATA_DIR;
if (!dir) throw new Error("seed: OAK_DATA_DIR is not set");
const db = openDb(dataPaths(dir).dbPath);
const now = Date.now();
const repos = createRepos(db, { timezone: "UTC", now: () => new Date(now) });
const iso = (daysAgo: number, hour = 18) => {
  const d = new Date(now - daysAgo * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};
const day = (daysAgo: number) => iso(daysAgo).slice(0, 10);

const lesson = (lessonId: string, daysAgo: number, done: boolean): LessonProgress => ({
  lessonId: lessonId as LessonProgress["lessonId"],
  status: done ? "completed" : "in_progress",
  currentStep: done ? null : "S3",
  splitPart: null,
  startedAt: iso(daysAgo, 17),
  completedAt: done ? iso(daysAgo) : null,
  bestScore: done ? 0.9 : null,
  completedVersion: done ? 1 : null,
  contentHash: null,
  updatedAt: iso(daysAgo),
});
const lessons: [string, number, boolean][] = [
  ["U00.L01", 16, true],
  ["U00.L02", 15, true],
  ["U01.L01", 14, true],
  ["U01.L02", 9, true],
  ["U01.L03", 5, true],
  ["U01.L04", 0, false],
];
for (const [id, ago, done] of lessons) repos.lessons.saveProgress(lesson(id, ago, done));

const ev = (skillId: string, daysAgo: number, score: number, n = 0): Evidence => ({
  skillId: skillId as Evidence["skillId"],
  category: null,
  at: iso(daysAgo, 18 + (n % 4)),
  day: day(daysAgo),
  score,
  weight: 1,
  sourceKind: "step",
  sourceId: `seed/${skillId}#${daysAgo}.${n}`,
});
const solid: [string, number[]][] = [
  ["R01", [14, 12, 10, 9, 7, 5, 3, 1]],
  ["R02", [14, 11, 9, 6, 4, 2]],
  ["R03", [14, 12, 9, 7, 5, 2]],
  ["E01", [14, 10, 8, 5, 3]],
];
for (const [skill, days] of solid)
  days.forEach((d, i) => {
    for (let k = 0; k < 3; k++) repos.mastery.addEvidence(ev(skill, d, 0.95, i * 3 + k));
  });
const light: [string, number, number][] = [
  ["R06", 9, 0.7],
  ["R04", 5, 0.6],
  ["D01", 16, 0.8],
  ["V01", 15, 0.75],
];
for (const [skill, d, score] of light) repos.mastery.addEvidence(ev(skill, d, score));

const card = (id: string, stability: number, reviewedDaysAgo: number) => {
  const last = iso(reviewedDaysAgo);
  repos.srs.saveCard(
    {
      id,
      kind: "family",
      status: "active",
      model: "fsrs-7",
      stability,
      stabilityFast: stability,
      difficulty: 5,
      state: 2,
      scheduleStatus: "review",
      dueAt: new Date(Date.parse(last) + Math.round(stability) * DAY).toISOString(),
      lastReviewAt: last,
      reps: 4,
      lapses: 0,
      scheduledDays: Math.round(stability),
      learningStep: 0,
      lastRatings: [3, 3],
    },
    { desiredRetention: 0.85, introducedBy: "U01.L01" },
    last,
  );
  repos.srs.saveFamily({
    familyId: id,
    level: 1,
    promoDay: day(reviewedDaysAgo),
    categoryStats: {},
    confusion: {},
    blockedRemaining: 0,
    compositeId: null,
    graduatedAt: null,
    updatedAt: last,
  });
};
card("fam.rhy.echo", 30, 1);
card("fam.rhy.pulse", 2, 14);

const session = (daysAgo: number, total: number, warm: number, target: 15 | 20 | 25): SessionTelemetry => ({
  sessionId: `seed-${daysAgo}`,
  day: day(daysAgo),
  targetMinutes: target,
  kind: "lesson",
  warmupMs: warm * 60_000,
  newMs: (total - warm - 3) * 60_000,
  makeMs: 2 * 60_000,
  codaMs: 60_000,
  totalActiveMs: total * 60_000,
  warmupSets: Math.max(1, Math.round(warm / 2)),
  warmupPlannedSec: 300,
  dueSecBefore: warm * 60 + 60,
  dueSecAfter: 60,
  deferredCards: 0,
  overflowSec: Math.max(0, warm * 60 - 300),
  wrappedEarly: false,
  split: false,
});
const sessions: [number, number, number, 15 | 20 | 25][] = [
  [16, 14, 0, 20],
  [15, 19, 2, 20],
  [14, 22, 3, 20],
  [9, 24, 5, 20],
  [5, 21, 6, 20],
  [2, 18, 4, 15],
];
for (const [d, t, w, target] of sessions) repos.ops.saveSessionTelemetry(session(d, t, w, target));

db.close();
console.log(`seed: wrote progress fixtures to ${dir}`);
