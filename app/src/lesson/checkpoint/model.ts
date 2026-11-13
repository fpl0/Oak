// The checkpoint player's pure rules (contracts §7.6): the score the server will give (pass ≥ 0.85 on gating
// items with every gated skill's mean ≥ 0.70; skipped level-setting items left out, skipped gating items 0;
// "Continue anyway" on a retake ≥ 0.75 or from the third attempt), the answer surface of a family item drawn
// from its trial, the drill response it is graded with, and the copy of the result. No DOM: `bun test`.
import type {
  Answer,
  AttemptResponse,
  CheckpointItemSpec,
  CheckpointOutcome,
  FamilyDef,
  GradeResult,
  Trial,
} from "@oak/api";
import type { TrialResponse } from "@oak/drills";
import { CHECKPOINT } from "@oak/srs";
import type { AnswerSpec, SungSummary } from "../../answers/types.ts";
import { surfaceOf } from "../../drills/model.ts";
import { staffAnswer } from "../../drills/staff.ts";
import { sungPerformance } from "../grading.ts";

export interface ItemRecord {
  idx: number;
  score: number;
  skipped: boolean;
  response: AttemptResponse;
  result: GradeResult | null;
}

export type LocalScore = Pick<CheckpointOutcome, "score" | "passed" | "softPassOffered" | "perSkill">;

/** The server's scoring (server/src/services/gates.ts `scoreCheckpoint`), to offer "Continue anyway" first. */
export function scoreLocal(
  items: readonly CheckpointItemSpec[],
  records: ReadonlyMap<number, Pick<ItemRecord, "score" | "skipped">>,
  attemptNo: number,
): LocalScore {
  const bySkill = new Map<string, { role: CheckpointItemSpec["role"]; sum: number; n: number }>();
  let gSum = 0;
  let gN = 0;
  for (const item of items) {
    const r = records.get(item.idx);
    // A level-setting item never answered is handed in as skipped (Quiet mode sets sung items aside): left out.
    if ((r === undefined || r.skipped) && item.role === "level-setting") continue;
    const score = r === undefined || r.skipped ? 0 : Math.max(0, Math.min(1, r.score));
    const agg = bySkill.get(item.skillId) ?? { role: item.role, sum: 0, n: 0 };
    agg.sum += score;
    agg.n += 1;
    bySkill.set(item.skillId, agg);
    if (item.role === "gating") {
      gSum += score;
      gN += 1;
    }
  }
  const perSkill = [...bySkill.entries()].map(([skillId, a]) => {
    const mean = a.n === 0 ? 0 : a.sum / a.n;
    return {
      skillId: skillId as CheckpointItemSpec["skillId"],
      role: a.role,
      mean,
      items: a.n,
      ok: mean >= CHECKPOINT.perSkillPass,
    };
  });
  const score = gN === 0 ? 1 : gSum / gN;
  const passed = score >= CHECKPOINT.pass && perSkill.every((p) => p.role !== "gating" || p.ok);
  const softPassOffered =
    !passed &&
    (attemptNo >= CHECKPOINT.softPassAlwaysFromAttempt || (attemptNo >= 2 && score >= CHECKPOINT.softPass));
  return { score, passed, softPassOffered, perSkill };
}

const label = (s: string) => s.replace(/^deg\./, "").replace(/-/g, " ");

/**
 * The answer surface of a family item, from the family's answer kind and the drawn trial (its own options
 * where it carries them, else the family's categories). `null`: no widget can answer it in this version.
 */
export function familyAnswerSpec(
  answer: string,
  trial: Pick<Trial, "params" | "expected">,
  categories: readonly string[],
  /** The family, for the surfaces this table leaves to the drill runner's (code, contours, choices by label). */
  def?: FamilyDef,
): AnswerSpec | null {
  const own = ownSpec(answer, trial, categories);
  if (own || !def) return own;
  const s = surfaceOf(trial as Trial<unknown>, def);
  return s.kind === "widget" ? s.spec : null;
}

/** A family item answered by singing (contracts §7.6: level-setting, skipped in Quiet mode). */
export function isSungTrial(trial: Pick<Trial, "params">): boolean {
  return (trial.params as Record<string, unknown>).mode === "sing";
}

/** The sung targets a family trial carries (seconds from the response window), as MIDI. */
export function sungTargetsOf(trial: Pick<Trial, "params">): { midi: number; on: number; off: number }[] {
  const raw = (trial.params as Record<string, unknown>).singTargets;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is { midi: number; on: number; off: number } =>
      !!t && typeof t === "object" && typeof (t as { midi?: unknown }).midi === "number",
  );
}

/** A sung family item's score: the mean per-note credit within the learner's current tolerance (§7.6). */
export function sungItemScore(sung: readonly SungSummary[], trial: Pick<Trial, "params">, tolCents: number) {
  const targets = sungTargetsOf(trial).map((t) => t.midi);
  const perf = sungPerformance(sung, targets, tolCents, "global");
  return { score: perf.score, noVoice: perf.diagnostics.some((d) => d.id === "sing.no-voice") };
}

function ownSpec(
  answer: string,
  trial: Pick<Trial, "params" | "expected">,
  categories: readonly string[],
): AnswerSpec | null {
  const p = trial.params as Record<string, unknown>;
  const ui = typeof p.ui === "string" ? p.ui : answer;
  switch (ui) {
    case "choice": {
      const opts = Array.isArray(p.options) ? (p.options as unknown[]).map(String) : [...categories];
      return { ui: "choice", options: opts.map((o) => ({ id: o, label: label(o) })) };
    }
    case "degree-pad": {
      // Categories named by degree (`deg.5`) are the pad's keys. A family whose categories are something else
      // (intervals in a key: "3rd", "up") leaves the pad to the drill runner's surface, which knows its degrees;
      // an empty pad had no keys at all (U04.CP "Intervals in a key").
      const set = categories.filter((c) => c.startsWith("deg.")).map((c) => c.slice(4));
      if (set.length === 0) return null;
      const len = trial.expected.degrees?.length ?? 1;
      return {
        ui: "degree-pad",
        set: set as never,
        syllables: false,
        ...(len > 1 ? { sequenceLen: len } : {}),
      };
    }
    case "number":
      return { ui: "number" };
    case "text":
      return { ui: "text", normalize: (typeof p.textKind === "string" ? p.textKind : "free") as never };
    case "grid": {
      const stepsPerBar = (typeof p.stepsPerBar === "number" ? p.stepsPerBar : 8) as 8 | 12 | 16;
      const bars = typeof p.gridBars === "number" ? p.gridBars : 1;
      return { ui: "grid", rows: ["hit"], stepsPerBar, bars };
    }
    case "tap":
      return { ui: "tap" };
    default:
      return null;
  }
}

/** The drill response a family item is graded with (`gradeTrial`). */
export function familyResponse(
  response: AttemptResponse,
  rtMs: number,
  replays: number,
  /** Seconds from bar 1 of the stimulus to the response window (an echo is tapped after the stimulus). */
  responseAt = 0,
  /** The trial's expected answer: a typed answer of several parts ("C D E F G A B") is split to match it. */
  expected?: Answer,
  /** The trial itself: a tune written on the staff (melodic dictation from level 7) is graded as its code. */
  trial?: Trial<unknown>,
): TrialResponse {
  if ("answer" in response) {
    const a = response.answer as Answer;
    const parts = expected?.text?.length ?? 1;
    if (a.text && a.text.length === 1 && parts > 1) {
      const split = (a.text[0] as string).split(/[\s,]+/).filter(Boolean);
      return { answer: { ...a, text: split }, rtMs, replays };
    }
    return { answer: a, rtMs, replays };
  }
  // A code answer (reading the staff into code) goes to the drill engine as text, as the drill runner sends it.
  if ("code" in response) return { answer: { text: [response.code.trim()] }, rtMs, replays };
  if ("staff" in response && trial) {
    const a = staffAnswer(trial, response.staff);
    return a ? { answer: a, rtMs, replays } : { skipped: true, rtMs, replays };
  }
  if ("taps" in response) return { taps: response.taps.map((t) => t - responseAt), rtMs, replays };
  return { skipped: true, rtMs, replays };
}

/** A per-skill line for the result: never a fail mark on a level-setting skill. */
export function skillLine(p: LocalScore["perSkill"][number]): {
  tone: "ok" | "look" | "level";
  text: string;
} {
  const pct = Math.round(p.mean * 100);
  if (p.role === "level-setting")
    return { tone: "level", text: `${pct}%: sets your practice level; it never holds you back` };
  return p.ok
    ? { tone: "ok", text: `${pct}%: solid` }
    : { tone: "look", text: `${pct}%: worth another look` };
}

/** The line under "All N items answered" when sung items were set aside (Quiet mode, contracts §8.5). */
export function quietNote(setAside: number): string | null {
  if (setAside <= 0) return null;
  return `${setAside === 1 ? "One sung item was" : `${setAside} sung items were`} set aside in Quiet mode. Singing never counts against a checkpoint.`;
}

/**
 * What a pass opens, by name ("Grit, Verse–Chorus Demo"), never by ID: lessons, checkpoints and capstones by their
 * syllabus titles; a capstone session as its capstone. An item the syllabus does not name is left out.
 */
export function openedText(ids: readonly string[], titles: ReadonlyMap<string, string>): string {
  const names = ids.map((id) => {
    const own = titles.get(id);
    if (own) return own;
    const m = /^(.+)\.S\d+$/.exec(id);
    return m ? (titles.get(m[1] as string) ?? null) : null;
  });
  return [...new Set(names.filter((n): n is string => n !== null))].join(", ");
}

/** The headline of the result screen (calm in every case; "not yet" is never "failed"). */
export function resultCopy(o: Pick<CheckpointOutcome, "passed" | "softPass">): {
  title: string;
  body: string;
} {
  if (o.passed)
    return {
      title: "Checkpoint passed",
      body: "The next lessons are open. Everything you showed here counts.",
    };
  if (o.softPass)
    return {
      title: "On you go",
      body: "The next lessons are open. A few skills are worth another look: they come back in your warm-ups and in the next checkpoint.",
    };
  return {
    title: "Not yet",
    body: "Practice plan: two short sets for each skill below go into your next warm-ups. Retake it on another day; Studio and Practice stay open.",
  };
}

const KEY = (cpId: string, attemptNo: number) => `oak.checkpoint.${cpId}.${attemptNo}`;

/** Answers given so far, kept in this browser so a reload resumes the attempt (the server holds the items). */
export function loadRecords(cpId: string, attemptNo: number): ItemRecord[] {
  try {
    const raw = globalThis.localStorage?.getItem(KEY(cpId, attemptNo));
    const v = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(v) ? (v as ItemRecord[]) : [];
  } catch {
    return [];
  }
}
export function saveRecords(cpId: string, attemptNo: number, records: readonly ItemRecord[]): void {
  try {
    globalThis.localStorage?.setItem(KEY(cpId, attemptNo), JSON.stringify(records));
  } catch {
    // Storage unavailable: the attempt still works, it just cannot resume after a reload.
  }
}
export function clearRecords(cpId: string, attemptNo: number): void {
  try {
    globalThis.localStorage?.removeItem(KEY(cpId, attemptNo));
  } catch {
    // ignore
  }
}

/**
 * The footer's count and the review's title. A skipped item is not "answered": after skipping every item the
 * footer read "25 of 26 answered" and the review "All 26 items answered".
 */
export function progressLine(records: readonly Pick<ItemRecord, "skipped">[], total: number): string {
  const skipped = records.filter((r) => r.skipped).length;
  const answered = records.length - skipped;
  return `${answered} of ${total} answered${skipped > 0 ? `, ${skipped} skipped` : ""}`;
}

export function reviewTitle(records: readonly Pick<ItemRecord, "skipped">[], total: number): string {
  const skipped = records.filter((r) => r.skipped).length;
  if (skipped === 0) return `All ${total} items answered`;
  const answered = records.length - skipped;
  return `${answered} of ${total} items answered, ${skipped} skipped`;
}
