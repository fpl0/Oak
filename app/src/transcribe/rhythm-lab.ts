// The rhythm lab's checks (Wave 7: the gym's rhythm items; R3.L05 "the rhythm master lab" passes its own tasks
// through `RhythmLab`): a named feel, grouping, clave or polyrhythm is right or not; a rhythm written on the step
// grid is checked bar by bar and the feedback counts what is extra and what is missing, never where the hits are
// (corrections rule d). Pure, so every rule is unit-tested.
import type { RhythmTask } from "./gym-items.ts";

export type RhythmAnswer = string | readonly number[] | null;

export interface RhythmTaskResult {
  id: string;
  ok: boolean;
  /** One sentence; never names the right option or the right steps. */
  text: string;
  /** Dictation: per bar, whether it is right (for the grid's marks). */
  bars?: boolean[];
}

export interface RhythmLabCheck {
  results: RhythmTaskResult[];
  passed: boolean;
  summary: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function checkRhythmTask(task: RhythmTask, answer: RhythmAnswer): RhythmTaskResult {
  if (task.kind === "identify") {
    if (typeof answer !== "string" || !answer)
      return { id: task.id, ok: false, text: "Choose an answer first." };
    return answer === task.answer
      ? { id: task.id, ok: true, text: "Right." }
      : { id: task.id, ok: false, text: "Not that one. Loop two bars and listen again, counting along." };
  }
  const got = new Set(Array.isArray(answer) ? answer : []);
  const want = new Set(task.answer);
  const bars: boolean[] = [];
  const notes: string[] = [];
  for (let b = 0; b < task.bars; b++) {
    const lo = b * task.steps;
    const hi = lo + task.steps;
    let extra = 0;
    let missing = 0;
    for (let i = lo; i < hi; i++) {
      if (got.has(i) && !want.has(i)) extra++;
      if (want.has(i) && !got.has(i)) missing++;
    }
    bars.push(extra === 0 && missing === 0);
    if (extra || missing) {
      const parts = [
        extra ? `${plural(extra, "hit")} where nothing sounds` : null,
        missing ? `${plural(missing, "hit")} missing` : null,
      ].filter(Boolean);
      notes.push(`${task.bars > 1 ? `Bar ${b + 1}: ` : ""}${parts.join(", ")}.`);
    }
  }
  const ok = bars.every(Boolean);
  if (got.size === 0) return { id: task.id, ok: false, text: "Nothing written on the grid yet.", bars };
  return { id: task.id, ok, text: ok ? "Right: every hit in its place." : notes.join(" "), bars };
}

export function checkRhythmLab(
  tasks: readonly RhythmTask[],
  answers: Readonly<Record<string, RhythmAnswer>>,
): RhythmLabCheck {
  const results = tasks.map((t) => checkRhythmTask(t, answers[t.id] ?? null));
  const right = results.filter((r) => r.ok).length;
  return {
    results,
    passed: right === tasks.length,
    summary: `${right} of ${tasks.length} right.`,
  };
}

/** The step a cell is, as the grid names it to a screen reader: "bar 2, eighth 3". */
export const stepName = (task: Extract<RhythmTask, { kind: "dictate" }>, i: number): string =>
  `${task.bars > 1 ? `bar ${Math.floor(i / task.steps) + 1}, ` : ""}${task.stepName} ${(i % task.steps) + 1}`;
