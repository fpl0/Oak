// Multi-session capstones (docs/design/wave4.md §5.1; contracts §2.4, §6.6, §9.1): each capstone session's status,
// its draft (a sketch version; "the draft save is the Make") and, for transcribe capstones, its phrase and stage
// checks graded in the browser; what a capstone needs to open ("Two more gym sets open X1").
import type {
  CapstoneCheckRecord,
  CapstoneCheckState,
  CapstoneDraftSave,
  CapstoneGate,
  CapstoneSessionState,
  CapstoneSessions,
  Evidence,
} from "@oak/api";
import { type CapstoneSessionDef, type PhraseCheck, skillOf } from "@oak/content-kit";
import { LEVELS } from "@oak/srs";
import { tx } from "../db/index.ts";
import type { CapstoneCheckRow, CheckStage } from "../db/repos/wave4.ts";
import { badRequest, conflict, notFound } from "../errors.ts";
import { LearnerTime, type ServiceContext } from "./context.ts";
import { checkpointName, type GatesService } from "./gates.ts";
import { evidenceWeight, type MasteryService } from "./mastery.ts";
import type { StreakService } from "./streak.ts";

export interface CapstoneSessionsDeps {
  gates: GatesService;
  mastery: MasteryService;
  streak: StreakService;
}

/**
 * The drill family whose skills a transcription of each layer exercises, first that exists in the catalog
 * (`fam.har.rn` and `fam.har.progression` are planned U06 families): evidence for a check or a ladder item.
 */
export const LAYER_FAMILIES: Record<"melody" | "bass" | "chords" | "form", readonly string[]> = {
  melody: ["fam.mel.dictation"],
  bass: ["fam.har.bass"],
  chords: ["fam.har.rn", "fam.har.progression", "fam.har.function"],
  // Wave 6: the own-audio checklist's form row (OWN_AUDIO_FORM_ROW, full-arrangement mode).
  form: ["fam.frm.sections"],
};
export function familyForLayer(content: ServiceContext["content"], layer: keyof typeof LAYER_FAMILIES) {
  for (const id of LAYER_FAMILIES[layer]) {
    const f = content.family(id);
    if (f !== null) return f;
  }
  return null;
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** "Two more gym sets open X1" (contracts §6.6), "One more gym set opens X1". */
export function gymSetsMessage(sets: number, capstoneId: string): string {
  const n = NUMBER_WORDS[sets] ?? String(sets);
  return sets === 1 ? `${n} more gym set opens ${capstoneId}` : `${n} more gym sets open ${capstoneId}`;
}

/**
 * A check as the server keeps it: a phrase check of the content, or (Wave 6) the session's form map, which is one
 * more check with the layer `form`, no stages and no phrase of its own (reported as phrase 1).
 */
export type SlotCheck = Omit<PhraseCheck, "layer" | "matcher"> & { layer: PhraseCheck["layer"] | "form" };

/**
 * The (check, stage) rows a session's checks expand to, in order: the form map first when the session has one
 * (CF-T.S1, content-kit `FormMapCheck`), then each phrase check, a staged one giving one row per stage.
 */
export function checkSlots(
  def: CapstoneSessionDef | undefined,
): { check: SlotCheck; stage: CheckStage | null }[] {
  const out: { check: SlotCheck; stage: CheckStage | null }[] = [];
  const map = def?.formMap;
  if (map !== undefined)
    out.push({ check: { id: map.id, phrase: 1, layer: "form", pass: map.pass }, stage: null });
  for (const check of def?.checks ?? []) {
    if (check.stages !== undefined && check.stages.length > 0)
      for (const stage of check.stages) out.push({ check, stage });
    else out.push({ check, stage: null });
  }
  return out;
}

export class CapstoneSessionsService {
  readonly time: LearnerTime;
  constructor(
    private readonly ctx: ServiceContext,
    private readonly d: CapstoneSessionsDeps,
  ) {
    this.time = new LearnerTime(ctx);
  }

  get #repos() {
    return this.ctx.repos;
  }
  get #content() {
    return this.ctx.content;
  }

  #meta(id: string) {
    const meta = this.#content.capstoneMeta(id);
    if (meta === null) throw notFound(`capstone ${id}`);
    return meta;
  }
  #sessionDef(id: string, capstoneSessionId: string): CapstoneSessionDef | undefined {
    return this.#content.capstoneDef(id)?.sessionDefs.find((s) => s.id === capstoneSessionId);
  }

  /** `GET /capstones/:id/sessions`. */
  sessions(id: string): CapstoneSessions {
    this.#meta(id);
    const ids = this.#content.capstoneSessionIds(id);
    const row = this.#repos.capstones.get(id);
    const done = new Set(row?.sessions ?? []);
    const stored = new Map(this.#repos.capstoneSessions.of(id).map((s) => [s.capstoneSessionId, s]));
    const checks = this.#repos.capstoneSessions.checks(id);
    const capstoneLocked = this.d.gates.capstoneStatus(id).status === "locked";
    const sessions: CapstoneSessionState[] = ids.map((sid, i) => {
      const s = stored.get(sid);
      const prevDone = i === 0 ? !capstoneLocked : done.has(ids[i - 1] as string);
      const states = this.#checkStates(id, sid, checks, !prevDone && !done.has(sid));
      const worked = (s?.draftSketchId ?? null) !== null || states.some((c) => c.attempts > 0);
      const status: CapstoneSessionState["status"] = done.has(sid)
        ? "done"
        : !prevDone
          ? "locked"
          : worked
            ? "in_progress"
            : "open";
      return {
        capstoneSessionId: sid as CapstoneSessionState["capstoneSessionId"],
        status,
        sessionId: s?.sessionId ?? null,
        draft:
          s?.draftSketchId != null && s.draftSketchVersion != null && s.draftSavedAt != null
            ? { sketchId: s.draftSketchId, sketchVersion: s.draftSketchVersion, savedAt: s.draftSavedAt }
            : null,
        checks: states,
        startedAt: s?.startedAt ?? null,
        completedAt: done.has(sid) ? (s?.completedAt ?? row?.updatedAt ?? null) : null,
      };
    });
    const current = sessions.find((s) => s.status !== "done")?.capstoneSessionId ?? null;
    return { capstoneId: id as CapstoneSessions["capstoneId"], sessions, current };
  }

  #checkStates(
    id: string,
    capstoneSessionId: string,
    rows: readonly CapstoneCheckRow[],
    locked: boolean,
  ): CapstoneCheckState[] {
    const out: CapstoneCheckState[] = [];
    let prevCheck: string | null = null;
    let prevCleared = true;
    // Wave 5 (X2: bass → changes → melody, contracts §6.6): a check naming `after` opens once each of those checks
    // (every stage of it, in whichever session of the capstone it sits) passed or was revealed.
    const allSlots = (this.#content.capstoneDef(id)?.sessionDefs ?? []).flatMap((d) => checkSlots(d));
    const cleared = (checkId: string): boolean => {
      const slots = allSlots.filter((x) => x.check.id === checkId);
      return (
        slots.length > 0 &&
        slots.every(({ stage }) => {
          const r = rows.find((x) => x.checkId === checkId && x.stage === stage);
          return r !== undefined && (r.passed || r.revealed);
        })
      );
    };
    for (const { check, stage } of checkSlots(this.#sessionDef(id, capstoneSessionId))) {
      const r = rows.find((x) => x.checkId === check.id && x.stage === stage) ?? null;
      const after = check.after ?? [];
      // A stage opens once the stage before it passed or was revealed (bass → quality → rn).
      const open =
        !locked &&
        (stage === null || prevCheck !== check.id || prevCleared) &&
        after.every((a) => cleared(a));
      out.push({
        ...(after.length > 0 ? { after: [...after] } : {}),
        passAt: check.pass,
        checkId: check.id,
        phrase: check.phrase,
        layer: check.layer,
        stage,
        open,
        score: r?.bestScore ?? null,
        passed: r?.passed ?? false,
        revealed: r?.revealed ?? false,
        attempts: r?.attempts ?? 0,
        lastAt: r?.lastAt ?? null,
      });
      prevCheck = check.id;
      prevCleared = (r?.passed ?? false) || (r?.revealed ?? false);
    }
    return out;
  }

  /** The capstone row and the session, both open, for a write. */
  #writable(id: string, capstoneSessionId: string) {
    this.#meta(id);
    if (!this.#content.capstoneSessionIds(id).includes(capstoneSessionId))
      throw notFound(`capstone session ${capstoneSessionId}`);
    const state = this.sessions(id).sessions.find((s) => s.capstoneSessionId === capstoneSessionId);
    if (state === undefined || state.status === "locked")
      throw conflict(
        this.d.gates.capstoneStatus(id).lockedReason ??
          `${capstoneSessionId} opens after the session before it`,
      );
    return state;
  }

  #touch(id: string, capstoneSessionId: string, sessionId: string | null, now: string) {
    const prev = this.#repos.capstoneSessions.get(capstoneSessionId);
    const validSession =
      sessionId !== null && this.#repos.sessions.get(sessionId) !== null ? sessionId : null;
    const row = this.#repos.capstones.get(id);
    this.#repos.capstones.save({
      capstoneId: id,
      status: row?.status === "released" ? "released" : "in_progress",
      sessions: row?.sessions ?? [],
      sketchId: row?.sketchId ?? null,
      trackId: row?.trackId ?? null,
      flavour: row?.flavour ?? null,
      lastResult: row?.lastResult ?? null,
      startedAt: row?.startedAt ?? now,
      releasedAt: row?.releasedAt ?? null,
      updatedAt: now,
    });
    return {
      capstoneSessionId,
      capstoneId: id,
      sessionId: validSession ?? prev?.sessionId ?? null,
      draftSketchId: prev?.draftSketchId ?? null,
      draftSketchVersion: prev?.draftSketchVersion ?? null,
      draftSavedAt: prev?.draftSavedAt ?? null,
      startedAt: prev?.startedAt ?? now,
      completedAt: prev?.completedAt ?? null,
      updatedAt: now,
    };
  }

  /** A capstone session was started from Today (`session.start`): remember where it is worked. */
  onSessionStart(capstoneSessionId: string, sessionId: string): void {
    const m = /^(.+)\.S\d+$/.exec(capstoneSessionId);
    const id = m?.[1];
    if (id === undefined || this.#content.capstoneMeta(id) === null) return;
    const now = this.time.iso();
    const prev = this.#repos.capstoneSessions.get(capstoneSessionId);
    this.#repos.capstoneSessions.save({
      capstoneSessionId,
      capstoneId: id,
      sessionId: prev?.sessionId ?? sessionId,
      draftSketchId: prev?.draftSketchId ?? null,
      draftSketchVersion: prev?.draftSketchVersion ?? null,
      draftSavedAt: prev?.draftSavedAt ?? null,
      startedAt: prev?.startedAt ?? now,
      completedAt: prev?.completedAt ?? null,
      updatedAt: now,
    });
  }

  /** A capstone session was completed (`capstones.completeSession`, or the release of the last one). */
  onSessionDone(capstoneSessionId: string): void {
    const m = /^(.+)\.S\d+$/.exec(capstoneSessionId);
    const id = m?.[1];
    if (id === undefined) return;
    const now = this.time.iso();
    const prev = this.#repos.capstoneSessions.get(capstoneSessionId);
    if (prev?.completedAt != null) return;
    this.#repos.capstoneSessions.save({
      capstoneSessionId,
      capstoneId: id,
      sessionId: prev?.sessionId ?? null,
      draftSketchId: prev?.draftSketchId ?? null,
      draftSketchVersion: prev?.draftSketchVersion ?? null,
      draftSavedAt: prev?.draftSavedAt ?? null,
      startedAt: prev?.startedAt ?? now,
      completedAt: now,
      updatedAt: now,
    });
  }

  /** `POST /capstones/:id/drafts`: the session's draft (its Make, contracts §9.1), and a sketch for the streak. */
  saveDraft(id: string, body: CapstoneDraftSave): CapstoneSessions {
    tx(this.#repos.db, () => {
      const state = this.#writable(id, body.capstoneSessionId);
      if (state.status === "done" && this.#repos.capstones.get(id)?.status === "released")
        throw conflict(`${body.capstoneSessionId} is done; release a revision from the album instead`);
      const sketch = this.#repos.sketches.get(body.sketchId);
      if (sketch === null) throw notFound(`sketch ${body.sketchId}`);
      if (this.#repos.sketches.version(body.sketchId, body.sketchVersion) === null)
        throw notFound(`sketch ${body.sketchId} v${body.sketchVersion}`);
      const now = this.time.iso();
      const next = this.#touch(id, body.capstoneSessionId, body.sessionId, now);
      this.#repos.capstoneSessions.save({
        ...next,
        draftSketchId: body.sketchId,
        draftSketchVersion: body.sketchVersion,
        draftSavedAt: now,
      });
      const row = this.#repos.capstones.get(id);
      if (row !== null) this.#repos.capstones.save({ ...row, sketchId: body.sketchId, updatedAt: now });
      // A saved draft is a saved sketch: it qualifies the streak day (contracts §7.8 b).
      this.d.streak.qualify("sketch");
    });
    return this.sessions(id);
  }

  /**
   * `POST /capstones/:id/checks/:checkId`: one check (or one stage of a staged check) graded in the browser in
   * capstone mode. The best score, the pass (≥ the check's `pass`, unrevealed) and the reveal are kept; a stage
   * opens only after the one before passed or was revealed. A revealed check gives no evidence (contracts §6.6),
   * nor does a tutor-assisted version.
   */
  recordCheck(id: string, checkId: string, body: CapstoneCheckRecord): CapstoneSessions {
    tx(this.#repos.db, () => {
      const state = this.#writable(id, body.capstoneSessionId);
      const slots = checkSlots(this.#sessionDef(id, body.capstoneSessionId));
      const ofCheck = slots.filter((s) => s.check.id === checkId);
      if (ofCheck.length === 0) throw notFound(`check ${checkId} in ${body.capstoneSessionId}`);
      const check = (ofCheck[0] as { check: SlotCheck }).check;
      const staged = ofCheck.some((s) => s.stage !== null);
      if (staged && body.stage === null)
        throw badRequest(`${checkId} is checked stage by stage: name the stage`);
      if (!staged && body.stage !== null) throw badRequest(`${checkId} has no stages`);
      if (staged && !ofCheck.some((s) => s.stage === body.stage))
        throw badRequest(`${checkId} has no stage ${body.stage}`);
      const cs = state.checks.find((c) => c.checkId === checkId && c.stage === body.stage);
      if (cs !== undefined && !cs.open)
        throw conflict(
          (cs.after ?? []).length > 0 && cs.stage === null
            ? `${checkId} opens once ${(cs.after ?? []).join(" and ")} passed or was revealed`
            : "this stage opens once the stage before it passes or is revealed",
        );
      const version = this.#repos.sketches.version(body.sketchId, body.sketchVersion);
      if (version === null) throw notFound(`sketch ${body.sketchId} v${body.sketchVersion}`);
      const now = this.time.iso();
      this.#repos.capstoneSessions.save(this.#touch(id, body.capstoneSessionId, null, now));
      const prev = this.#repos.capstoneSessions.check(id, checkId, body.stage);
      const result = body.result;
      const graded = result.status !== "error";
      // Rung 4 of the hint ladder is the reveal (contracts §10.4), whatever the client's `revealed` flag says.
      const revealed = result.assist.revealed === true || result.assist.rung >= 4;
      const passedNow = graded && !revealed && result.status === "pass" && result.score >= check.pass - 1e-9;
      this.#repos.capstoneSessions.saveCheck({
        capstoneId: id,
        checkId,
        stage: body.stage,
        capstoneSessionId: body.capstoneSessionId,
        bestScore: graded ? Math.max(prev?.bestScore ?? 0, result.score) : (prev?.bestScore ?? null),
        passed: (prev?.passed ?? false) || passedNow,
        revealed: (prev?.revealed ?? false) || revealed,
        attempts: (prev?.attempts ?? 0) + (graded ? 1 : 0),
        sketchId: body.sketchId,
        sketchVersion: body.sketchVersion,
        lastResult: result,
        lastAt: now,
      });
      // Evidence once on the first graded attempt and once on the first pass, never for a reveal or tutor code.
      const firstAttempt = graded && (prev?.attempts ?? 0) === 0;
      const firstPass = passedNow && !(prev?.passed ?? false);
      if (graded && !revealed && !version.tutorAssisted && (firstAttempt || firstPass)) {
        // The form map has no drill family of its own: its evidence is the capstone's release and the form lessons'.
        const fam = check.layer === "form" ? null : familyForLayer(this.#content, check.layer);
        const skills = fam?.skills.map((s) => skillOf(s.skill)) ?? [];
        const evidence: Omit<Evidence, "at" | "day">[] = [...new Set(skills)].map((skillId) => ({
          skillId: skillId as Evidence["skillId"],
          category: null,
          score: Math.max(0, Math.min(1, result.score)),
          weight: evidenceWeight("rubric-rule"),
          sourceKind: "rubric-rule",
          sourceId: `${id}/${checkId}${body.stage === null ? "" : `.${body.stage}`}#${body.sketchId}v${body.sketchVersion}`,
        }));
        this.d.mastery.addEvidence(evidence);
      }
    });
    return this.sessions(id);
  }

  /** The checks revealed so far, as the liner notes name them ("Phrase 3 was revealed."). */
  revealedLines(id: string): string[] {
    const def = this.#content.capstoneDef(id);
    const out: string[] = [];
    for (const r of this.#repos.capstoneSessions.checks(id)) {
      if (!r.revealed) continue;
      const check = def?.sessionDefs.flatMap((s) => s.checks ?? []).find((c) => c.id === r.checkId);
      if (def?.sessionDefs.some((s) => s.formMap?.id === r.checkId)) {
        out.push("The form map was revealed with a hint, so it is not counted as heard.");
        continue;
      }
      const phrase = check?.phrase;
      const what =
        phrase === undefined
          ? r.checkId
          : Array.isArray(phrase)
            ? `Phrases ${phrase[0]}–${phrase[1]}`
            : `Phrase ${phrase}`;
      const part =
        r.stage === null ? (check?.layer === "melody" ? "" : ` (${check?.layer})`) : ` (${r.stage})`;
      out.push(`${what}${part} was revealed with a hint, so it is not counted as heard.`);
    }
    return out;
  }

  /**
   * A transcribe capstone is ready to release when every check of every session passed or was revealed (and it has
   * checks); `null` when it has no authored checks (the rubric check decides then).
   */
  checksCleared(id: string): boolean | null {
    const def = this.#content.capstoneDef(id);
    const slots = (def?.sessionDefs ?? []).flatMap((s) => checkSlots(s));
    if (slots.length === 0) return null;
    const rows = this.#repos.capstoneSessions.checks(id);
    return slots.every(({ check, stage }) => {
      const r = rows.find((x) => x.checkId === check.id && x.stage === stage);
      return r !== undefined && (r.passed || r.revealed);
    });
  }

  /** `GET /capstones/:id/gate`: each opening condition (contracts §2.4) and, for a family level, the gym sets. */
  gate(id: string): CapstoneGate {
    const meta = this.#meta(id);
    const g = meta.opensAfter;
    const conditions: CapstoneGate["conditions"] = [];
    for (const cp of g.checkpoints ?? [])
      conditions.push({
        kind: "checkpoint",
        ref: cp,
        label: `${checkpointName(this.#content.checkpointMeta(cp)?.title ?? cp)} passed`,
        met: this.d.gates.checkpointPassed(cp),
        have: null,
        need: null,
      });
    for (const c of g.capstones ?? [])
      conditions.push({
        kind: "capstone",
        ref: c,
        label: `${c} released`,
        met: this.d.gates.capstoneReleased(c),
        have: null,
        need: null,
      });
    for (const l of g.lessonsCompleted ?? [])
      conditions.push({
        kind: "lesson",
        ref: l,
        label: `“${this.#content.lessonTitle(l)}” completed`,
        met: this.d.gates.lessonCompleted(l),
        have: null,
        need: null,
      });
    let gymSets: number | null = null;
    for (const f of g.familyLevels ?? []) {
      const state = this.#repos.srs.family(f.family);
      const have = state?.level ?? 0;
      const met = have >= f.level;
      conditions.push({
        kind: "family-level",
        ref: f.family,
        label: `${this.#content.family(f.family)?.title ?? f.family} at level ${f.level}`,
        met,
        have,
        need: f.level,
      });
      gymSets = (gymSets ?? 0) + (met ? 0 : this.#setsToLevel(have, f.level, state?.promoDay ?? null));
    }
    const open = this.#repos.capstones.get(id) !== null || conditions.every((c) => c.met);
    let message: string | null = null;
    if (!open) {
      const others = conditions.filter((c) => !c.met && c.kind !== "family-level");
      message =
        others.length === 0 && gymSets !== null && gymSets > 0
          ? gymSetsMessage(gymSets, id)
          : `Opens after ${joinWords(this.d.gates.gateMissing(g))}.`;
    }
    return {
      capstoneId: id as CapstoneGate["capstoneId"],
      open,
      conditions,
      gymSetsToOpen: (g.familyLevels ?? []).length === 0 ? null : open ? 0 : (gymSets ?? 0),
      message,
    };
  }

  /**
   * Strong sets (≥ 0.90, on different days, contracts §7.3) that take a family from `have` to `need`: two per level,
   * one fewer when a strong set on an earlier day already counts towards the next promotion.
   */
  #setsToLevel(have: number, need: number, promoDay: string | null): number {
    const levels = Math.max(0, need - Math.max(1, have));
    if (levels === 0) return need > have ? LEVELS.promoteDays : 0;
    // A strong set already recorded (`promoDay`) counts: the next strong set on another day promotes.
    const counted = promoDay !== null ? 1 : 0;
    return Math.max(1, levels * LEVELS.promoteDays - counted);
  }
}

function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
