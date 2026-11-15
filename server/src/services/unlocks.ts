// The single unlock table at run time (contracts §3.1, §11.7 rule 5): grants on session complete and
// on session start, the silent fallback of START rows, the conditional voicing gate, and the backfill
// pass at start-up. Rows are never revoked.
import { CAPSTONE_SESSION_SOUNDS, type NextUnlock, type Unlock } from "@oak/api";
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
    return this.gateAttempts(c).some((a) => a.qualifies);
  }

  /**
   * Every graded attempt of the gate exercise or one of its regenerated variants (Wave 4: U05.L08's `gateCheck`
   * step) typed by the learner, oldest first, and whether it qualifies (score ≥ `minScore`, unrevealed). Disputed
   * and tutor-assisted attempts are left out: an applied tutor card gives no evidence (contracts §3.1 rule 6).
   */
  gateAttempts(c: Condition): {
    at: string;
    score: number;
    revealed: boolean;
    qualifies: boolean;
    code: string | null;
    imported: boolean;
  }[] {
    const ids = [c.exercise as string, ...((c.variants ?? []) as string[])];
    const lessons = [...new Set(ids.map((id) => id.slice(0, id.indexOf("/"))))];
    const out: {
      at: string;
      score: number;
      revealed: boolean;
      qualifies: boolean;
      code: string | null;
      imported: boolean;
    }[] = [];
    for (const lessonId of lessons)
      for (const a of this.ctx.repos.lessons.attemptsOfLesson(lessonId)) {
        if (!ids.includes(`${a.lessonId}/${a.exerciseId}`)) continue;
        if (a.disputed || a.tutorAssisted || a.result === null || a.result.status === "error") continue;
        const revealed = a.result.assist.revealed === true || a.hintRung >= 4;
        // The evidence is the learner's own hand voicing (rule 6): code that reaches the gated helpers
        // (`voicing()`, `chord()`, or a method named at run time) never opens the gate, whatever it scored.
        const own = a.code === null || !reachesGatedHelpers(a.code);
        out.push({
          at: a.at,
          score: a.score,
          revealed,
          qualifies: own && !revealed && a.score >= c.minScore - 1e-9,
          code: a.code,
          imported: a.imported,
        });
      }
    return out.sort((x, y) => x.at.localeCompare(y.at));
  }

  /** The conditional rows (the voicing gate's holds) and their one condition, if the table has any. */
  gatedRows(): { condition: Condition; rows: ToolEntry[] } | null {
    const rows = this.ctx.content.toolbox().filter((t) => t.unlock.condition !== undefined);
    const condition = rows[0]?.unlock.condition;
    return condition === undefined ? null : { condition, rows };
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
    // Wave 7 (contracts §3.2 rule 11; wave7.md §5.4): a sound that arrives when a capstone session STARTS — horns at
    // RC1.S2 for a learner U15.L05 has not given them yet, choir at AC2.S1 — is granted as the session begins.
    out.push(...this.#grant(this.#sessionSounds(sessionId), "session-start", sessionId));
    return out;
  }

  /** The toolbox rows of `CAPSTONE_SESSION_SOUNDS` granted when `sessionId` starts. */
  #sessionSounds(sessionId: string): ToolEntry[] {
    const ids = new Set<string>(
      CAPSTONE_SESSION_SOUNDS.filter((s) => s.capstoneSessionId === sessionId).map((s) => s.sound),
    );
    return this.ctx.content
      .toolbox()
      .filter((t) => ids.has(t.id) && t.unlock.when !== "start" && this.ctx.repos.unlocks.get(t.id) === null);
  }

  /**
   * The gate exercise was just passed. Rows whose site is already completed are granted now; rows whose
   * site is the lesson in progress become usable inside it (returned, not stored: rule 2 grants on completion).
   */
  onGateAttempt(exerciseGlobalId: string, currentLessonId: string | null): Unlock[] {
    const rows = this.ctx.content
      .toolbox()
      .filter(
        (t) =>
          t.unlock.condition !== undefined &&
          (t.unlock.condition.exercise === exerciseGlobalId ||
            (t.unlock.condition.variants ?? []).includes(exerciseGlobalId as never)) &&
          this.conditionMet(t.unlock.condition),
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
      ...this.#sessionSounds(sessionId),
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
      // Wave 7: a capstone-session sound (horns at RC1.S2) counts as granted once that session was started.
      const startSounds = CAPSTONE_SESSION_SOUNDS.filter((x) => x.sound === t.id).map(
        (x) => x.capstoneSessionId as string,
      );
      const done =
        (t.unlock.when === "complete"
          ? sites.find((s) => this.gates.sessionDone(s))
          : sites.find((s) => this.#started(s))) ?? startSounds.find((s) => this.#started(s));
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

  /**
   * The goal-gradient line (wave2 §4 `unlocks.next`, ux §1.4): the nearest tools not yet granted and how many
   * map sessions of the default order are still to complete to reach them, counting the granting session
   * itself (for a START row, starting it). Nearest first, at most `limit`. Track sessions are left out.
   */
  next(limit = 3): NextUnlock[] {
    const order = this.ctx.content.defaultOrder();
    const pending = order.filter((id) => !this.gates.sessionDone(id));
    const pos = new Map(pending.map((id, i) => [id, i]));
    const kindOf = (id: string): NextUnlock["remainingKind"] => {
      if (this.ctx.content.lessonSite(id) !== null) return "lesson";
      if (this.ctx.content.checkpointMeta(id) !== null) return "checkpoint";
      if (/\.S\d+$/.test(id) && !id.startsWith("GYM.")) return "capstone";
      return "session";
    };
    const out: (NextUnlock & { at: number })[] = [];
    for (const t of this.ctx.content.toolbox()) {
      if (this.ctx.repos.unlocks.get(t.id) !== null) continue;
      const sites = [
        ...this.ctx.content.unlockSites(t),
        ...(t.unlock.fallbackAt ? [t.unlock.fallbackAt] : []),
      ];
      let best: string | null = null;
      for (const site of sites) {
        const i = pos.get(site);
        if (i !== undefined && (best === null || i < (pos.get(best) as number))) best = site;
      }
      if (best === null) continue;
      const at = pos.get(best) as number;
      const span = pending.slice(0, at + 1).map(kindOf);
      const kinds = new Set(span);
      out.push({
        itemId: t.id,
        kind: unlockKind(t),
        grantedBy: best as NextUnlock["grantedBy"],
        remaining: at + 1,
        remainingKind: kinds.size === 1 ? (span[0] as NextUnlock["remainingKind"]) : "session",
        at,
      });
    }
    return out
      .sort((a, b) => a.at - b.at || a.itemId.localeCompare(b.itemId))
      .slice(0, limit)
      .map(({ at: _at, ...n }) => n);
  }

  markSeen(itemId: string): boolean {
    return this.ctx.repos.unlocks.markSeen(itemId);
  }
}

/**
 * Does this code call a gated voicing helper (contracts §3.1 rule 6)? Comments are dropped and string
 * contents blanked first (a mini-notation string or a comment may say "chord"), then the code is refused
 * when it calls `voicing`, `voicings` or `chord`, or calls a method through a computed key (`p["voi"+"cing"]()`,
 * `p[k]()`), which the browser lint refuses in a graded step. The server's own check, independent of the
 * client that graded the attempt.
 */
export function reachesGatedHelpers(code: string): boolean {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const ch = code[i] as string;
    const next = code[i + 1];
    if (ch === "/" && next === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end < 0 ? code.length : end + 2;
      out += " ";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      out += `${ch}${ch}`;
      i++;
      while (i < code.length && code[i] !== ch) i += code[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return /\b(?:voicings?|chord)\s*\(|\]\s*\(/.test(out);
}
