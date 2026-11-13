// Roll pick and staff pick (contracts §5.4 `click-roll`, `click-staff`): point at a note of the music the step
// shows (`AnswerEnv.music`, the workbench's analysed model). Read and select only; staff INPUT of new notes is
// Wave 3. The staff is the workbench's StaffView (abcjs pointer layer, arrows walk the notes, Enter selects); the
// roll is its PianoRoll plus a notes list that makes it keyboard-complete (ux §7.9 "Notes table" alternative).
import { clsx } from "clsx";
import { useEffect, useRef, useState } from "react";
import { HighlightBus, type IssueMark } from "../../workbench/highlight-bus.ts";
import { PianoRoll, StaffView, WorkbenchClock, type WorkbenchModel } from "../../workbench/index.ts";
import { useAnswerEnv } from "../env.tsx";
import { degreeDisplay } from "../normalize.ts";
import type { AnswerWidgetProps } from "../types.ts";
import { AnswerFrame, KeyHint, MarkBadge, markOf, revealedOf, SubmitHint } from "../ui.tsx";

function useBus(model: WorkbenchModel | null | undefined): HighlightBus {
  const [bus] = useState(() => new HighlightBus());
  useEffect(() => {
    bus.setEvents(model?.events ?? [], model?.abc ?? null);
  }, [bus, model]);
  return bus;
}

function noteText(model: WorkbenchModel, id: string): string {
  const e = model.byId.get(id);
  if (!e) return "";
  const what = e.label?.display ?? e.s ?? "a note";
  const deg = e.label?.degree ? `, degree ${degreeDisplay(e.label.degree.raw)}` : "";
  return `${what}${deg}, bar ${e.bar}, beat ${e.beatLabel}`;
}

const NO_MUSIC = "There is no music to point at in this step.";

export function ClickStaffAnswer(p: AnswerWidgetProps<"click-staff">) {
  const { value, onChange, disabled, feedback } = p;
  const model = useAnswerEnv().music ?? null;
  const bus = useBus(model);
  const host = useRef<HTMLDivElement>(null);
  const mark = markOf(feedback, 0);
  const correct = revealedOf<string | null>(feedback);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Staff selection → value (`oak-e{n}`); a click while disabled puts the shown answer back.
  useEffect(
    () =>
      bus.subscribe((s) => {
        if (s.selected.source !== "staff") return;
        const n = bus.staffNsOf(s.selected.events)[0];
        const next = n === undefined ? null : `oak-e${n}`;
        if (next === valueRef.current) return;
        if (disabled) {
          const keep = valueRef.current ? Number(valueRef.current.slice(5)) : null;
          bus.select(keep === null ? null : { events: bus.eventsOfStaffNs([keep]) }, "feedback");
          return;
        }
        onChange(next);
      }),
    [bus, disabled, onChange],
  );
  // Value → selection (a reset, a restored attempt, or the music arriving after the value).
  useEffect(() => {
    const n = value ? Number(value.slice(5)) : null;
    const events = n === null || !model ? [] : bus.eventsOfStaffNs([n]);
    const cur = bus.get().selected.events;
    if (events.join() !== cur.join()) bus.select(events.length ? { events } : null, "feedback");
  }, [bus, value, model]);
  // A revealed answer: its note carries `.oak-answer` (re-applied whenever abcjs re-engraves). A wrong pick is
  // an issue on the bus, as in the workbench.
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    const apply = () => {
      for (const el of root.querySelectorAll(".oak-answer")) el.classList.remove("oak-answer");
      if (correct) for (const el of root.querySelectorAll(`.${correct}`)) el.classList.add("oak-answer");
    };
    apply();
    const obs = new MutationObserver((records) => {
      if (records.some((r) => r.type === "childList")) apply();
    });
    obs.observe(root, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [correct, model]);
  useEffect(() => {
    const issues = new Map<string, IssueMark>();
    const n = value ? Number(value.slice(5)) : null;
    if (n !== null && mark?.ok === false && model)
      for (const id of bus.eventsOfStaffNs([n])) issues.set(id, "error");
    bus.setIssues(issues);
  }, [bus, value, mark?.ok, model]);

  if (!model)
    return (
      <AnswerFrame
        kind="click-staff"
        idBase={p.idBase}
        label={p.label}
        feedback={feedback}
        onSubmit={p.onSubmit}
      >
        <p className="text-sm text-text-2">{NO_MUSIC}</p>
      </AnswerFrame>
    );
  const eventOf = (el: string | null): string | null =>
    el ? (model.abc?.idMap[Number(el.slice(5))]?.eventIds[0] ?? null) : null;
  const selected = eventOf(value);
  const answer = eventOf(correct);
  return (
    <AnswerFrame
      kind="click-staff"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      keys={
        <>
          <KeyHint keys={["←", "→"]}>walk the notes</KeyHint>
          <KeyHint keys={["Enter"]}>on a note: point · elsewhere: check</KeyHint>
        </>
      }
    >
      <div
        ref={host}
        className={clsx(
          "oak-workbench rounded-card border-2 bg-surface p-2",
          mark ? (mark.ok ? "border-accent" : "border-issue") : "border-border",
          "[&_.oak-answer]:fill-[var(--oak-accent-2)] [&_.oak-answer]:stroke-[var(--oak-accent-2)]",
        )}
      >
        <StaffView model={model} bus={bus} />
        <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
      </div>
      <p className="min-h-6 text-sm text-text-2" aria-live="polite">
        {selected ? (
          <>Pointing at {noteText(model, selected)}.</>
        ) : (
          <span className="text-text-3">Click a note on the staff, or Tab to it and press Enter.</span>
        )}
        {answer ? <span className="ml-2">Answer: {noteText(model, answer)}.</span> : null}
      </p>
    </AnswerFrame>
  );
}

export function ClickRollAnswer(p: AnswerWidgetProps<"click-roll">) {
  const { value, onChange, disabled, feedback } = p;
  const model = useAnswerEnv().music ?? null;
  const bus = useBus(model);
  const [clock] = useState(() => new WorkbenchClock());
  const list = useRef<HTMLDivElement>(null);
  const mark = markOf(feedback, 0);
  const correct = revealedOf<string | null>(feedback);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(
    () =>
      bus.subscribe((s) => {
        if (s.selected.source !== "roll") return;
        const next = s.selected.events[0] ?? null;
        if (next === valueRef.current) return;
        if (disabled) {
          bus.select(valueRef.current ? { events: [valueRef.current] } : null, "feedback");
          return;
        }
        onChange(next);
      }),
    [bus, disabled, onChange],
  );
  useEffect(() => {
    const cur = bus.get().selected.events[0] ?? null;
    if (cur !== value && model) bus.select(value && bus.has(value) ? { events: [value] } : null, "feedback");
  }, [bus, value, model]);
  // Marks on the roll: the learner's pick when it is wrong, the answer once revealed.
  useEffect(() => {
    const issues = new Map<string, IssueMark>();
    if (value && mark?.ok === false) issues.set(value, "error");
    if (correct) issues.set(correct, "info");
    bus.setIssues(issues);
  }, [bus, value, mark?.ok, correct, model]);

  if (!model)
    return (
      <AnswerFrame
        kind="click-roll"
        idBase={p.idBase}
        label={p.label}
        feedback={feedback}
        onSubmit={p.onSubmit}
      >
        <p className="text-sm text-text-2">{NO_MUSIC}</p>
      </AnswerFrame>
    );

  const events = model.events.filter((e) => !e.band);
  const pick = (id: string) => {
    if (!disabled) onChange(id);
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    const dir =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!dir || !(e.target as HTMLElement).hasAttribute("data-event")) return false;
    const at = events.findIndex((x) => x.id === (e.target as HTMLElement).dataset.event);
    const next = events[Math.max(0, Math.min(events.length - 1, at + dir))];
    if (next) {
      pick(next.id);
      list.current?.querySelector<HTMLElement>(`[data-event="${CSS.escape(next.id)}"]`)?.focus();
    }
    return true;
  };
  const tabStop = value ?? events[0]?.id;
  return (
    <AnswerFrame
      kind="click-roll"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["←", "→"]}>walk the notes</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div
        className={clsx(
          "oak-workbench rounded-card border-2 bg-surface p-2",
          mark ? (mark.ok ? "border-accent" : "border-issue") : "border-border",
        )}
      >
        <PianoRoll model={model} bus={bus} clock={clock} height={180} labels="note" />
        <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
      </div>
      <div ref={list} role="radiogroup" aria-label="Notes, in time order" className="flex flex-wrap gap-1">
        {events.map((e) => {
          const on = e.id === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={disabled || undefined}
              aria-label={`${noteText(model, e.id)}${e.id === correct ? " (the answer)" : ""}`}
              data-event={e.id}
              tabIndex={e.id === tabStop ? 0 : -1}
              onClick={() => pick(e.id)}
              className={clsx(
                "inline-flex h-7 items-center rounded-control border px-1.5 text-[0.75rem] tabular-nums",
                on
                  ? "border-accent bg-lane-in text-text"
                  : "border-border bg-surface text-text-2 hover:border-text-3",
                e.id === correct && "border-dashed border-accent-2",
              )}
            >
              {e.label?.display ?? e.s ?? "·"}
              <span className="ml-1 text-text-3">
                {e.bar}.{e.beatLabel}
              </span>
            </button>
          );
        })}
      </div>
      <p className="min-h-6 text-sm text-text-2" aria-live="polite">
        {value ? (
          <>Pointing at {noteText(model, value)}.</>
        ) : (
          <span className="text-text-3">Click a note on the roll, or pick it from the list.</span>
        )}
        {correct ? <span className="ml-2">Answer: {noteText(model, correct)}.</span> : null}
      </p>
    </AnswerFrame>
  );
}
