// The rhythm lab (Wave 7: the gym's rhythm items; R3.L05 "the rhythm master lab" through the public exports): a
// list of tasks, each named or written on a step grid, and one Check. Naming is a radio group (arrows move,
// Space picks); the grid is a row of toggle buttons per bar (arrows move along it, Space or Enter sets a hit), the
// group starts of an odd meter and the beats drawn heavier. After a check each task says right or what to listen
// for, counting extra and missing hits per bar without saying where they are.
import { clsx } from "clsx";
import { type KeyboardEvent, useId, useRef } from "react";
import { Button } from "../ui/kit/Button.tsx";
import type { RhythmTask } from "./gym-items.ts";
import { type RhythmAnswer, type RhythmLabCheck, stepName } from "./rhythm-lab.ts";

export function RhythmLab({
  tasks,
  answers,
  onAnswer,
  check = null,
  onCheck,
  revealed = false,
  groups = null,
}: {
  tasks: readonly RhythmTask[];
  answers: Readonly<Record<string, RhythmAnswer>>;
  onAnswer(id: string, a: RhythmAnswer): void;
  check?: RhythmLabCheck | null;
  onCheck(): void;
  /** The answers are shown (rung 4): the grid and the choices are read-only and show what sounds. */
  revealed?: boolean;
  /** An odd meter's groups (2+2+3): the grid draws each group's first step heavier. */
  groups?: readonly number[] | null;
}) {
  return (
    <section aria-label="The rhythm lab" className="flex flex-col gap-4" data-testid="rhythm-lab">
      {tasks.map((t, i) => {
        const result = check?.results.find((r) => r.id === t.id) ?? null;
        return (
          <div key={t.id} className="flex flex-col gap-2" data-testid={`rhythm-task-${t.id}`}>
            <h3 className="text-base font-medium">
              <span className="text-text-3">{i + 1}. </span>
              {t.prompt}
            </h3>
            {t.kind === "identify" ? (
              <Choices
                task={t}
                value={
                  revealed ? t.answer : typeof answers[t.id] === "string" ? (answers[t.id] as string) : null
                }
                onChange={(v) => onAnswer(t.id, v)}
                disabled={revealed}
              />
            ) : (
              <StepGrid
                task={t}
                value={revealed ? t.answer : Array.isArray(answers[t.id]) ? (answers[t.id] as number[]) : []}
                onChange={(v) => onAnswer(t.id, v)}
                disabled={revealed}
                marks={result?.bars ?? null}
                groups={groups}
              />
            )}
            {result && !revealed ? (
              <p
                className={clsx("text-sm", result.ok ? "text-accent" : "text-text-2")}
                data-testid="rhythm-task-result"
                data-ok={result.ok}
              >
                {result.text}
              </p>
            ) : null}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={onCheck} disabled={revealed} data-testid="rhythm-check">
          Check
        </Button>
        {check ? (
          <p className="text-sm" role="status" data-testid="rhythm-summary">
            {check.passed ? `${check.summary} You heard it.` : check.summary}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Choices({
  task,
  value,
  onChange,
  disabled,
}: {
  task: Extract<RhythmTask, { kind: "identify" }>;
  value: string | null;
  onChange(v: string): void;
  disabled: boolean;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={task.prompt} className="flex flex-wrap gap-1.5">
      {task.options.map((o) => (
        <label
          key={o.id}
          className={clsx(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-control border px-2.5 py-1 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            value === o.id
              ? "border-accent bg-lane-in text-text"
              : "border-border text-text-2 hover:bg-surface-2",
            disabled && "cursor-default opacity-80",
          )}
        >
          <input
            type="radio"
            name={name}
            value={o.id}
            checked={value === o.id}
            disabled={disabled}
            onChange={() => onChange(o.id)}
            className="sr-only"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}

function StepGrid({
  task,
  value,
  onChange,
  disabled,
  marks,
  groups,
}: {
  task: Extract<RhythmTask, { kind: "dictate" }>;
  value: readonly number[];
  onChange(v: number[]): void;
  disabled: boolean;
  marks: readonly boolean[] | null;
  groups: readonly number[] | null;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const total = task.steps * task.bars;
  const on = new Set(value);
  const starts = new Set<number>();
  if (groups && groups.reduce((a, b) => a + b, 0) === task.steps) {
    let at = 0;
    for (const g of groups) {
      starts.add(at);
      at += g;
    }
  } else {
    const beat = task.steps % 4 === 0 ? task.steps / 4 : task.steps % 3 === 0 ? task.steps / 3 : task.steps;
    for (let i = 0; i < task.steps; i += beat) starts.add(i);
  }
  const toggle = (i: number) => {
    const next = new Set(on);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    onChange([...next].sort((a, b) => a - b));
  };
  const key = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? total - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    refs.current[Math.max(0, Math.min(total - 1, to))]?.focus();
  };
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap gap-3 border-0 p-0">
      <legend className="sr-only">{`${task.prompt} The grid: ${task.bars} bar${task.bars > 1 ? "s" : ""} of ${task.steps} steps`}</legend>
      {Array.from({ length: task.bars }, (_, b) => (
        <div
          key={b}
          className={clsx(
            "flex gap-0.5 rounded-control border p-1",
            marks ? (marks[b] ? "border-accent/60" : "border-issue") : "border-border",
          )}
          data-testid="step-bar"
          data-mark={marks ? (marks[b] ? "ok" : "issue") : undefined}
        >
          {Array.from({ length: task.steps }, (_, k) => {
            const i = b * task.steps + k;
            return (
              <button
                key={i}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                aria-pressed={on.has(i)}
                aria-label={stepName(task, i)}
                disabled={disabled}
                tabIndex={i === 0 ? 0 : -1}
                onClick={() => toggle(i)}
                onKeyDown={(e) => key(e, i)}
                onFocus={(e) => {
                  for (const r of refs.current) if (r && r !== e.currentTarget) r.tabIndex = -1;
                  e.currentTarget.tabIndex = 0;
                }}
                className={clsx(
                  "h-9 w-7 rounded-[4px] border text-[0.7rem] tabular-nums focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  on.has(i)
                    ? "border-accent bg-accent text-on-accent"
                    : "border-border bg-surface-2 text-text-3",
                  starts.has(k) && !on.has(i) && "border-text-3",
                  starts.has(k) && k > 0 && "ml-1",
                )}
                data-testid="step"
              >
                {starts.has(k) ? [...starts].sort((x, y) => x - y).indexOf(k) + 1 : ""}
              </button>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}
