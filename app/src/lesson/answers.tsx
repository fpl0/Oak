// The answer widgets the lesson and checkpoint players render: the answers engineer's registry
// (`app/src/answers/registry.tsx`), and for the one kind it leaves to a later wave (`staff-input`, writing notes
// on a staff) a plain note-list field, so a notation step is never a dead end. A kind neither has shows a calm
// "not available yet" line and the host lets the learner move on.
import { useEffect, useRef } from "react";
import { answerWidgetFor } from "../answers/registry.tsx";
import type {
  AnswerKind,
  AnswerSpecOf,
  AnswerWidget,
  AnswerWidgetFor,
  AnswerWidgetProps,
} from "../answers/types.ts";

/** Notes typed as the note-list text (`C4:4 E4:4`: name, octave, length) until a staff input exists. */
function StaffText(p: AnswerWidgetProps<"staff-input">) {
  const id = `${p.idBase}-staff`;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (p.autoFocus) input.current?.focus({ preventScroll: true });
  }, [p.autoFocus]);
  return (
    <div className="flex flex-col gap-1">
      <input
        ref={input}
        id={id}
        type="text"
        aria-label={p.label}
        aria-describedby={`${id}-help`}
        disabled={p.disabled}
        value={p.value}
        autoComplete="off"
        spellCheck={false}
        placeholder="C4:4 E4:4 G4:4"
        onChange={(e) => p.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && p.value.trim() !== "") {
            e.preventDefault();
            p.onSubmit();
          }
        }}
        className="h-10 w-full max-w-sm rounded-control border border-border bg-surface px-3 font-mono text-base"
      />
      <span id={`${id}-help`} className="text-sm text-text-3">
        One note per word: letter, octave, length (4 = a beat), as in{" "}
        <code className="font-mono">C4:4 E4:4</code>.
      </span>
    </div>
  );
}

/** The registry first, then the note-list field for `staff-input`. */
export const lessonWidgetFor: AnswerWidgetFor = <K extends AnswerKind>(spec: AnswerSpecOf<K>) => {
  const fromRegistry = answerWidgetFor(spec);
  if (fromRegistry) return fromRegistry;
  if (spec.ui === "staff-input") return StaffText as unknown as AnswerWidget<K>;
  return null;
};
