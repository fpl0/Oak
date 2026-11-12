// skills map, SRS, drill families and sessions, unlocks, can-do ledger, progress page, streak.
import type { DrillFinish, DueBatch, ProgressReport, SrsReviewRequest, SrsReviewResult } from "@oak/api";
import { STREAK } from "@oak/srs";
import type { ContentSource } from "../content/types.ts";
import type { AppDeps } from "../deps.ts";
import { ApiError, notFound } from "../errors.ts";
import { idempotent } from "../idempotency.ts";
import { addDays, dayIndex } from "../lib/days.ts";
import type { SrsPort } from "../services/ports.ts";
import type { Mounter } from "./define.ts";

/** Purposes whose finished set is a review set for the streak (contracts §7.8 a). */
const REVIEW_PURPOSES = new Set(["srs", "practice", "gym", "anchor", "repair", "keepalive"]);

function needSrs(d: AppDeps): SrsPort {
  const srs = d.srs();
  if (srs === null) throw new ApiError("unavailable", "the review scheduler is not available yet");
  return srs;
}

export function progressReport(d: AppDeps): ProgressReport {
  const s = d.services;
  const today = s.streak.time.day();
  const lessonsDone = d.repos.lessons.allProgress().filter((p) => p.status === "completed");
  const doneAt = new Map<string, string>(lessonsDone.map((p) => [p.lessonId, p.completedAt ?? p.updatedAt]));
  for (const a of d.repos.checkpoints.allAttempts())
    if ((a.passed || a.softPass) && a.finishedAt !== null && !doneAt.has(a.cpId))
      doneAt.set(a.cpId, a.finishedAt);
  for (const c of d.repos.capstones.all()) {
    if (c.releasedAt !== null) doneAt.set(c.capstoneId, c.releasedAt);
    for (const sid of c.sessions) if (!doneAt.has(sid)) doneAt.set(sid, c.updatedAt);
  }
  for (const g of d.repos.gym.list()) doneAt.set(g.gymId, g.at);
  const canDo = d.repos.cando.current();
  const canDoAt = new Map(
    canDo.map((c) => [c.candoId as string, d.repos.cando.history(c.candoId)[0]?.at ?? c.at]),
  );
  // A graded transcription-ladder pass (gym, X1, X2, CF-T): a finished generated transcription, at its level.
  const ladderPasses = d.repos.transcriptions
    .list()
    .filter((t) => t.sourceKind === "generated" && t.status === "done" && t.ladderLevel !== null)
    .map((t) => ({ level: t.ladderLevel as number, at: t.updatedAt }));
  const milestones = d.content.source.milestones.map((m) => {
    const anyOf = m.when.anyOf ?? [];
    const at = conditionReachedAt(m.when, doneAt, canDoAt, ladderPasses);
    // `anyOf` (Wave 3): at least one of its condition sets holds too; the earliest one that does counts.
    const alt = anyOf
      .map((c) => conditionReachedAt(c, doneAt, canDoAt, ladderPasses))
      .filter((t): t is string => t !== null)
      .sort()[0];
    const own = hasCondition(m.when);
    const reachedAt =
      anyOf.length === 0
        ? at
        : alt === undefined || (own && at === null)
          ? null
          : own
            ? ([at as string, alt].sort().at(-1) ?? null)
            : alt;
    return { id: m.id as string, title: m.title, description: m.description, reachedAt };
  });
  // Pace: map sessions completed in the last 28 days, shown as a month, never as sessions behind.
  const course = s.gates.courseProgress();
  const recent = [...doneAt.values()].filter(
    (at) => dayIndex(s.streak.time.day(new Date(at))) > dayIndex(today) - 28,
  ).length;
  const perWeek = recent / 4;
  let paceEstimate: ProgressReport["paceEstimate"] = null;
  if (doneAt.size >= 3 && perWeek > 0) {
    const weeks = Math.max(0, course.mapTotal - course.mapDone) / perWeek;
    paceEstimate = {
      coreDoneBy: addDays(today, Math.ceil(weeks * 7)).slice(0, 7),
      sessionsPerWeek: Math.round(perWeek * 10) / 10,
    };
  }
  return { canDo, milestones, paceEstimate, streak: s.streak.summary(today) };
}

type MilestoneCondition = NonNullable<ContentSource["milestones"][number]["when"]>;

function hasCondition(c: MilestoneCondition): boolean {
  return (
    (c.sessions?.length ?? 0) + (c.capstones?.length ?? 0) + (c.canDos?.length ?? 0) > 0 ||
    c.ladder !== undefined
  );
}

/**
 * When one milestone condition set was reached (the latest of its parts), or `null`: sessions done,
 * capstones released, can-dos held, and (Wave 3) a ladder pass at `level` or higher, on or after the day
 * `after` was done when it is given. An empty set is never reached.
 */
export function conditionReachedAt(
  c: MilestoneCondition,
  doneAt: ReadonlyMap<string, string>,
  canDoAt: ReadonlyMap<string, string>,
  ladderPasses: readonly { level: number; at: string }[],
): string | null {
  if (!hasCondition(c)) return null;
  const times: (string | null)[] = [
    ...[...(c.sessions ?? []), ...(c.capstones ?? [])].map((id) => doneAt.get(id) ?? null),
    ...(c.canDos ?? []).map((id) => canDoAt.get(id) ?? null),
  ];
  if (c.ladder !== undefined) {
    const { level, after } = c.ladder;
    const from = after === undefined ? "" : (doneAt.get(after) ?? null);
    const pass =
      from === null
        ? undefined
        : ladderPasses
            .filter((p) => p.level >= level && p.at >= from)
            .map((p) => p.at)
            .sort()[0];
    times.push(pass ?? null);
  }
  return times.every((t) => t !== null) ? ((times as string[]).sort().at(-1) ?? null) : null;
}

/** `POST /srs/review`: one fact card answered on its own counts towards a review set (contracts §7.8 a). */
export async function reviewCard(d: AppDeps, body: SrsReviewRequest): Promise<SrsReviewResult> {
  const result = await needSrs(d).review(body);
  // Fact cards answered on their own make a review set every 5 cards of the day (contracts §7.8 a: "≥ 5
  // fact cards"). Each card arrives in its own request, so the day's count comes from the revlog; passing
  // a count of 1 per card (as before) never reached 5 and never qualified the day.
  if (body.drillSessionId === null && result.rating !== null) {
    const time = d.services.streak.time;
    const today = time.day();
    const since = new Date(d.clock.now().getTime() - 36 * 3_600_000).toISOString();
    const rows = d.repos.db
      .query("SELECT reviewed_at FROM srs_revlog WHERE drill_session_id IS NULL AND reviewed_at >= ?")
      .all(since) as { reviewed_at: string }[];
    const n = rows.filter((r) => time.day(new Date(r.reviewed_at)) === today).length;
    if (n > 0 && n % STREAK.factCards === 0) d.services.streak.reviewSet(n, { facts: true });
  }
  return result;
}

/** `POST /drills/sessions/:id/finish`: the set's reviews, the repair queue, and the streak's review set. */
/**
 * Finishes of one set run one at a time: `already` is read before the SRS call, which awaits a re-zone after a
 * time-zone change, so two raced finishes (a retried request, a second tab) both counted the set for the
 * streak and both consumed a repair item. The second now waits and sees the set finished.
 */
const finishing = new WeakMap<AppDeps["repos"]["db"], Map<string, Promise<unknown>>>();
export async function finishDrill(d: AppDeps, id: string): Promise<DrillFinish> {
  let running = finishing.get(d.repos.db);
  if (running === undefined) {
    running = new Map();
    finishing.set(d.repos.db, running);
  }
  for (;;) {
    const pending = running.get(id);
    if (pending === undefined) break;
    await pending.catch(() => {});
  }
  const run = finishDrillOnce(d, id);
  running.set(id, run);
  try {
    return await run;
  } finally {
    if (running.get(id) === run) running.delete(id);
  }
}
async function finishDrillOnce(d: AppDeps, id: string): Promise<DrillFinish> {
  const drill = d.repos.srs.drill(id);
  if (drill === null) throw notFound(`drill session ${id}`);
  const already = drill.finishedAt !== null;
  const finished = await needSrs(d).finishDrill(id);
  const trials = d.repos.srs.trials(id).filter((t) => !t.response.skipped).length;
  // A set finished twice (a retried request) counts once.
  if (!already && drill.purpose === "repair")
    for (const f of drill.familyIds) d.repos.checkpoints.consumeRepair(f);
  const streak =
    !already && REVIEW_PURPOSES.has(drill.purpose)
      ? d.services.streak.reviewSet(trials)
      : d.services.streak.summary();
  return { ...finished, streak };
}

/**
 * The map's "Revive" (contracts §7.10, wave2 §4 `skills.revive`): the planned warm-up sets of drying nodes,
 * never more than the day's budget. With `skillId`, that node's sets only (404 for an unknown skill).
 * `more` ("Revive more") is the explicit opt-in: the next budget-sized block, restricted to stale nodes.
 */
export async function reviveBatch(d: AppDeps, skillId: string | null, more: boolean): Promise<DueBatch> {
  if (skillId !== null && d.content.skill(skillId) === null) throw notFound(`skill ${skillId}`);
  const due = await needSrs(d).due({ budgetSec: null, more });
  const planned = new Set<string>();
  for (const item of due.items) {
    if (item.familyId !== null) planned.add(item.familyId);
    for (const id of [...item.members, ...item.cardIds]) planned.add(id);
  }
  const map = d.services.mastery.map(planned, 0);
  const stale = map.nodes.filter(
    (n) => (more ? n.freshness < 1 : n.drying) && (skillId === null || n.skillId === skillId),
  );
  const linked = new Set<string>();
  for (const n of stale) {
    for (const f of d.content.familiesOfSkill(n.skillId)) linked.add(f.id);
    for (const deck of d.content.source.decks)
      if (deck.unlock.skill === n.skillId) for (const c of deck.cards) linked.add(c.id);
  }
  const items = due.items.filter(
    (i) =>
      (i.familyId !== null && linked.has(i.familyId)) ||
      i.members.some((m) => linked.has(m)) ||
      i.cardIds.some((c) => linked.has(c)),
  );
  const plannedSec = items.reduce((sum, i) => sum + i.estSec, 0);
  return {
    budgetSec: due.budgetSec,
    plannedSec,
    items,
    label:
      items.length === 0
        ? "Nothing to revive today"
        : `Revive ≈ ${Math.max(1, Math.round(plannedSec / 60))} min`,
    moreAvailable: due.moreAvailable,
  };
}

export function practiceRoutes(mount: Mounter, d: AppDeps): void {
  const s = d.services;

  mount("skills.map", async () => {
    const srs = d.srs();
    const due = srs === null ? null : await srs.due({ budgetSec: null, more: false });
    const planned = new Set<string>();
    for (const item of due?.items ?? []) {
      if (item.familyId !== null) planned.add(item.familyId);
      for (const id of [...item.members, ...item.cardIds]) planned.add(id);
    }
    const map = s.mastery.map(planned, 0);
    const drying = new Set(map.nodes.filter((n) => n.drying).map((n) => n.skillId as string));
    const linked = new Set<string>();
    for (const skill of drying) {
      for (const f of d.content.familiesOfSkill(skill)) linked.add(f.id);
      for (const deck of d.content.source.decks)
        if (deck.unlock.skill === skill) for (const c of deck.cards) linked.add(c.id);
    }
    const reviveSec = (due?.items ?? [])
      .filter((i) => (i.familyId !== null && linked.has(i.familyId)) || i.cardIds.some((c) => linked.has(c)))
      .reduce((sum, i) => sum + i.estSec, 0);
    return { ...map, reviveSec };
  });

  mount("srs.due", async ({ query }) =>
    needSrs(d).due({
      budgetSec: query.budgetSec === undefined ? null : Number(query.budgetSec),
      more: query.more === "1",
    }),
  );
  // Wave 3 (wave3.md §5.2): a retried or double-submitted review with the same key is rated once.
  mount("srs.review", async ({ body }) => {
    const { idempotencyKey, ...rest } = body;
    return idempotent(d, "srs.review", idempotencyKey, rest, () => reviewCard(d, rest));
  });
  mount("families.list", async () => needSrs(d).families());
  mount("families.state", async ({ params }) => {
    const state = await needSrs(d).familyState(params.familyId);
    if (state === null) throw notFound(`family ${params.familyId}`);
    return state;
  });
  mount("drills.start", async ({ body }) => {
    for (const f of body.familyIds) if (d.content.family(f) === null) throw notFound(`family ${f}`);
    return needSrs(d).startDrill(body);
  });
  mount("drills.trials", async ({ params, body }) => {
    const drill = d.repos.srs.drill(params.id);
    if (drill === null) throw notFound(`drill session ${params.id}`);
    if (drill.finishedAt !== null) throw new ApiError("conflict", "this set is finished");
    await needSrs(d).recordTrials(params.id, body.trials);
    return { ok: true as const };
  });
  mount("drills.finish", async ({ params }) => finishDrill(d, params.id));

  mount("unlocks.list", () => ({ items: s.unlocks.list() }));
  mount("unlocks.seen", ({ params }) => {
    if (!s.unlocks.markSeen(params.id)) throw notFound(`unlock ${params.id}`);
    return { ok: true as const };
  });
  mount("cando.list", () => ({ items: s.cando.list() }));
  mount("progress.get", () => progressReport(d));
  mount("streak.get", ({ query }) =>
    s.streak.history(Math.min(104, Math.max(1, Number(query.weeks ?? "12")))),
  );

  // Wave 2 (docs/design/wave2.md §4).
  mount("unlocks.next", () => ({ items: s.unlocks.next() }));
  mount("skills.revive", ({ query }) => reviveBatch(d, query.skillId ?? null, query.more === "1"));

  // Wave 3 (docs/design/wave3.md §5): one set with its stored trials (resume after a reload, the summary).
  mount("drills.get", ({ params }) => {
    const drill = d.repos.srs.drill(params.id);
    if (drill === null) throw notFound(`drill session ${params.id}`);
    const { warmupItemId: _w, meanCredit: _m, ...session } = drill;
    return { session, trials: d.repos.srs.trials(params.id) };
  });
}
