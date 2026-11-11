// The single unlock table at run time (contracts §3.1, §11.7 rule 5): grants on session complete and
// on session start, the silent fallback of START rows, the conditional voicing gate, and the backfill
// pass at start-up. Rows are never revoked.
import type { Unlock } from "@oak/api";
import type { ToolEntry, UnlockableId } from "@oak/content-kit";
import { LearnerTime, type ServiceContext } from "./context.ts";
import type { GatesService } from "./gates.ts";

type Condition = NonNullable<ToolEntry["unlock"]["condition"]>;

/** `ToolEntry.kind` is the `unlocks.kind` column; IDs carry their prefix (`tb.`, `snd.`, `scale.`, `chord.`). */
function unlockKind(t: ToolEntry): Unlock["kind"] {
  return t.kind;
}

export class UnlocksService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly gates: GatesService,
  ) {
    this.time = new LearnerTime(ctx);
  }

  list(): Unlock[] {
    return this.ctx.repos.unlocks.list();
  }
  ids(): Set<string> {
    return this.ctx.repos.unlocks.ids();
  }

  /**
   * Rule 6: a graded attempt of the gate exercise with `score ≥ minScore` and `assist.revealed = false`,
   * from the learner's code only (any version of the exercise; disputed attempts do not count).
   */
  conditionMet(c: Condition): boolean {
    const slash = c.exercise.indexOf("/");
    const lessonId = c.exercise.slice(0, slash);
    return this.ctx.repos.lessons
      .attemptsOfLesson(lessonId)
      .some(
        (a) =>
          `${a.lessonId}/${a.exerciseId}` === c.exercise &&
          !a.disputed &&
          !a.tutorAssisted &&
          a.result !== null &&
          a.result.status !== "error" &&
          a.score >= c.minScore &&
          a.result.assist.revealed === false,
      );
  }

  #row(t: ToolEntry, sourceKind: Unlock["sourceKind"], sourceId: string): Unlock {
    return {
      itemId: t.id,
      kind: unlockKind(t),
      sourceKind,
      sourceId,
      unlockedAt: this.time.iso(),
      seen: sourceKind === "fallback" || sourceKind === "backfill",
    };
  }

  #grant(rows: readonly ToolEntry[], sourceKind: Unlock["sourceKind"], sourceId: string): Unlock[] {
    const out: Unlock[] = [];
    for (const t of rows) {
      if (t.unlock.condition !== undefined && !this.conditionMet(t.unlock.condition)) continue;
      const granted = this.ctx.repos.unlocks.grant(this.#row(t, sourceKind, sourceId));
      if (granted !== null) out.push(granted);
    }
    return out;
  }

  /** A session was completed (a lesson's Make saved, a checkpoint passed, a capstone session done). */
  onComplete(sessionId: string): Unlock[] {
    const granted = this.#grant(
      this.ctx.content.unlockRowsAt(sessionId, "complete"),
      "session-complete",
      sessionId,
    );
    // Rule 12: START rows granted silently when their fallback site completes before the START site started.
    const fallback = this.#grant(this.ctx.content.fallbackRowsAt(sessionId), "fallback", sessionId);
    return [...granted, ...fallback];
  }

  /** A session was started (START rows: `snd.ebass`, `tb.lpf` at C1.S1, `tb.feature.album` at any first capstone session). */
  onStart(sessionId: string): Unlock[] {
    const rows = this.ctx.content.unlockRowsAt(sessionId, "start");
    const out = this.#grant(rows, "session-start", sessionId);
    // `tb.feature.album` is granted at the first capstone session of any capstone.
    if (
      /^[A-Z][A-Z0-9-]*\.S1$/.test(sessionId) &&
      this.ctx.content.capstoneMeta(sessionId.replace(/\.S1$/, "")) !== null
    ) {
      const album = this.ctx.content.toolbox().filter((t) => t.id === "tb.feature.album");
      out.push(...this.#grant(album, "session-start", sessionId));
    }
    return out;
  }

  /**
   * The gate exercise was just passed. Rows whose site is already completed are granted now; rows whose
   * site is the lesson in progress become usable inside it (returned, not stored: rule 2 grants on completion).
   */
  onGateAttempt(exerciseGlobalId: string, currentLessonId: string | null): Unlock[] {
    const rows = this.ctx.content
      .toolbox()
      .filter(
        (t) => t.unlock.condition?.exercise === exerciseGlobalId && this.conditionMet(t.unlock.condition),
      );
    const out: Unlock[] = [];
    for (const t of rows) {
      if (this.ctx.repos.unlocks.get(t.id) !== null) continue;
      const sites = this.ctx.content.unlockSites(t);
      const done = sites.find((s) => this.gates.sessionDone(s));
      if (done !== undefined) {
        const g = this.ctx.repos.unlocks.grant(this.#row(t, "session-complete", done));
        if (g !== null) out.push(g);
      } else if (currentLessonId !== null && sites.includes(currentLessonId as never)) {
        out.push(this.#row(t, "session-complete", currentLessonId));
      }
    }
    return out;
  }

  /** Conditional rows of a session whose condition is not met yet: the session cannot complete (rule 6). */
  blockedAt(sessionId: string): ToolEntry[] {
    return this.ctx.content
      .unlockRowsAt(sessionId, "complete")
      .filter((t) => t.unlock.condition !== undefined && !this.conditionMet(t.unlock.condition));
  }

  /**
   * The lint's unlocked set for work inside `sessionId`: everything granted plus what this session
   * teaches (rule 2), minus conditional rows whose condition is not met yet.
   */
  usableIn(sessionId: string | null): Set<UnlockableId> {
    const out = new Set(this.ids()) as Set<UnlockableId>;
    if (sessionId === null) return out;
    for (const t of [
      ...this.ctx.content.unlockRowsAt(sessionId, "complete"),
      ...this.ctx.content.unlockRowsAt(sessionId, "start"),
    ]) {
      if (t.unlock.condition !== undefined && !this.conditionMet(t.unlock.condition)) continue;
      out.add(t.id as UnlockableId);
    }
    return out;
  }

  /** Rule 5 of §11.7: grant every row whose session is already completed (or started), silently. */
  backfill(): Unlock[] {
    const out: Unlock[] = [];
    for (const t of this.ctx.content.toolbox()) {
      if (this.ctx.repos.unlocks.get(t.id) !== null) continue;
      if (t.unlock.condition !== undefined && !this.conditionMet(t.unlock.condition)) continue;
      const sites = this.ctx.content.unlockSites(t);
      const done =
        t.unlock.when === "complete"
          ? sites.find((s) => this.gates.sessionDone(s))
          : sites.find((s) => this.#started(s));
      const fallback =
        t.unlock.fallbackAt !== undefined && this.gates.sessionDone(t.unlock.fallbackAt)
          ? t.unlock.fallbackAt
          : undefined;
      const site = done ?? fallback;
      if (site === undefined) continue;
      const g = this.ctx.repos.unlocks.grant(this.#row(t, "backfill", site));
      if (g !== null) out.push(g);
    }
    return out;
  }

  #started(sessionId: string): boolean {
    if (this.gates.sessionDone(sessionId)) return true;
    const m = /^(.+)\.S\d+$/.exec(sessionId);
    if (m !== null)
      return (
        (this.ctx.repos.capstones.get(m[1] as string)?.sessions.length ?? 0) > 0 ||
        this.#sessionStarted(sessionId)
      );
    return this.#sessionStarted(sessionId);
  }
  #sessionStarted(mapItemId: string): boolean {
    return (
      this.ctx.repos.db.query("SELECT 1 FROM sessions WHERE map_item_id = ? LIMIT 1").get(mapItemId) !== null
    );
  }

  markSeen(itemId: string): boolean {
    return this.ctx.repos.unlocks.markSeen(itemId);
  }
}
