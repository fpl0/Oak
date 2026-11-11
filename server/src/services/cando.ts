// The can-do ledger (contracts §7.10 last bullet): `emerging` = first evidence; `solid` = ≥ 0.85 on 2
// days; `strong` = solid and F ≥ 0.9 for 30 days; `fading` = F < 0.5. Status changes are history rows.
import type { CanDoEntry } from "@oak/api";
import type { CanDoDef } from "@oak/content-kit";
import { SHADING } from "@oak/srs";
import { dayIndex } from "../lib/days.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";

export interface CanDoFacts {
  /** The can-do's source (lesson, capstone, checkpoint) is done. */
  sourceDone: boolean;
  /** Days with an evidence item ≥ 0.85 on any of its skills. */
  solidDays: number;
  anyEvidence: boolean;
  /** Mean freshness of its skills, 0 to 1. */
  freshness: number;
  /** Day the status first became solid (from history), or null. */
  solidSince: string | null;
  today: string;
  previous: CanDoEntry["status"] | null;
}

export function canDoStatus(f: CanDoFacts): CanDoEntry["status"] | null {
  // A can-do is a claim about the learner ("I can transcribe a standard"): it first appears when its
  // source (lesson, checkpoint, capstone) is done, never from stray evidence on a shared skill weeks
  // before (cd.transcribe.standard showed as "emerging" after three lessons). Once shown it is never revoked.
  if (!f.sourceDone && f.previous === null) return null;
  const wasSolid = f.previous === "solid" || f.previous === "strong" || f.previous === "fading";
  if ((wasSolid || f.solidDays >= 2) && f.freshness < SHADING.canDoFadingF) return "fading";
  if (f.solidDays >= 2 || wasSolid) {
    const since = f.solidSince;
    if (
      since !== null &&
      f.freshness >= SHADING.canDoStrongF &&
      dayIndex(f.today) - dayIndex(since) >= SHADING.canDoStrongDays
    )
      return "strong";
    return "solid";
  }
  return "emerging";
}

export class CanDoService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly deps: { sourceDone: (id: string) => boolean; freshness: (skillId: string) => number },
  ) {
    this.time = new LearnerTime(ctx);
  }

  list(): CanDoEntry[] {
    return this.ctx.repos.cando.current();
  }

  #facts(def: CanDoDef): CanDoFacts {
    const solid = new Set<string>();
    let any = false;
    for (const skill of def.skills) {
      for (const e of this.ctx.repos.mastery.evidenceOf(skill)) {
        any = true;
        if (e.score >= SHADING.canDoSolid) solid.add(e.day);
      }
    }
    const history = this.ctx.repos.cando.history(def.id);
    const firstSolid = history.find((h) => h.status === "solid" || h.status === "strong");
    const fresh =
      def.skills.length === 0
        ? 1
        : def.skills.reduce((s, k) => s + this.deps.freshness(k), 0) / def.skills.length;
    return {
      sourceDone: this.deps.sourceDone(def.source),
      solidDays: solid.size,
      anyEvidence: any,
      freshness: fresh,
      solidSince: firstSolid === undefined ? null : this.time.day(new Date(firstSolid.at)),
      today: this.time.day(),
      previous: history.at(-1)?.status ?? null,
    };
  }

  /**
   * Re-evaluates can-dos (all, or those touching `skills`, or sourced from `sourceId`) and appends a
   * history row for each status change. Returns the new rows.
   */
  evaluate(opts: {
    skills?: readonly string[];
    sourceId?: string;
    evidence: { kind: CanDoEntry["evidenceKind"]; id: string };
  }): CanDoEntry[] {
    const touched = new Set(opts.skills ?? []);
    const out: CanDoEntry[] = [];
    for (const def of this.ctx.content.source.canDos) {
      const relevant =
        (opts.skills === undefined && opts.sourceId === undefined) ||
        def.source === opts.sourceId ||
        this.ctx.content.canDosOf(opts.sourceId ?? "").some((c) => c.id === def.id) ||
        def.skills.some((s) => touched.has(s));
      if (!relevant) continue;
      const f = this.#facts(def);
      const status = canDoStatus(f);
      if (status === null || status === f.previous) continue;
      let at = this.time.iso();
      // The primary key is (cando_id, at): keep a strictly later instant than the last row.
      const last = this.ctx.repos.cando.history(def.id).at(-1);
      if (last !== undefined && last.at >= at) at = new Date(Date.parse(last.at) + 1).toISOString();
      out.push(
        this.ctx.repos.cando.append({
          candoId: def.id,
          status,
          evidenceKind: opts.evidence.kind,
          evidenceId: opts.evidence.id,
          at,
        }),
      );
    }
    return out;
  }
}
