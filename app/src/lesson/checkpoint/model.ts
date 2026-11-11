// The checkpoint player's pure rules (contracts §7.6): the score the server will give (pass ≥ 0.85 on gating
// items with every gated skill's mean ≥ 0.70; skipped level-setting items left out, skipped gating items 0;
// "Continue anyway" on a retake ≥ 0.75 or from the third attempt), the answer surface of a family item drawn
// from its trial, the drill response it is graded with, and the copy of the result. No DOM: `bun test`.
import type {
  Answer,
  AttemptResponse,
  CheckpointItemSpec,
  CheckpointOutcome,
  GradeResult,
  Trial,
} from "@oak/api";
import type { TrialResponse } from "@oak/drills";
import { CHECKPOINT } from "@oak/srs";
import type { AnswerSpec } from "../../answers/types.ts";

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
    if (r?.skipped === true && item.role === "level-setting") continue;
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
): AnswerSpec | null {
  const p = trial.params as Record<string, unknown>;
  const ui = typeof p.ui === "string" ? p.ui : answer;
  switch (ui) {
    case "choice": {
      const opts = Array.isArray(p.options) ? (p.options as unknown[]).map(String) : [...categories];
      return { ui: "choice", options: opts.map((o) => ({ id: o, label: label(o) })) };
    }
    case "degree-pad": {
      const set = categories.filter((c) => c.startsWith("deg.")).map((c) => c.slice(4));
      return { ui: "degree-pad", set: set as never, syllables: false };
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
): TrialResponse {
  if ("answer" in response) return { answer: response.answer as Answer, rtMs, replays };
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
