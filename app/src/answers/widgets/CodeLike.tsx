// Code-shaped answers. `blanks` (code-fill): the starter with inline inputs or selects at ⟦id⟧. `code`: a plain
// code field for hosts without a workbench (`Ctrl/Cmd+Enter` plays it, `Ctrl/Cmd+Shift+Enter` checks). The
// lesson player and the drills render code answers in their own Workbench; this one keeps the registry complete.
// `click-code`: point at a token of the code (`AnswerEnv.code`); arrows walk the tokens as a radio group.
import type { CodeRange } from "@oak/api";
import { clsx } from "clsx";
import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "../../ui/kit/index.ts";
import { codeTokens, starterParts, tokenAt, tokenOnLine } from "../code-tokens.ts";
import { useAnswerEnv } from "../env.tsx";
import type { AnswerWidgetProps } from "../types.ts";
import {
  AnswerFrame,
  focusFirst,
  isMod,
  KeyHint,
  MarkBadge,
  markOf,
  revealedOf,
  SubmitHint,
} from "../ui.tsx";

const CODE_BOX =
  "rounded-card border border-border bg-surface p-3 font-mono text-[0.875rem] leading-7 text-text";

export function BlanksAnswer(p: AnswerWidgetProps<"blanks">) {
  const { spec, value, onChange, disabled, feedback } = p;
  const root = useRef<HTMLDivElement>(null);
  const parts = starterParts(spec.starter);
  const byId = new Map(spec.blanks.map((b) => [b.id, b] as const));
  const correct = revealedOf<Record<string, string>>(feedback);
  useEffect(() => {
    if (p.autoFocus) focusFirst(root.current);
  }, [p.autoFocus]);
  const set = (id: string, text: string) => {
    if (!disabled) onChange({ ...value, [id]: text });
  };
  let n = 0;
  return (
    <AnswerFrame
      kind="blanks"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      keys={
        <>
          <KeyHint keys={["Tab"]}>next blank</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div ref={root} className={clsx(CODE_BOX, "overflow-x-auto whitespace-pre")}>
        {parts.map((part, i) => {
          if (part.kind === "text") return <span key={i}>{part.text}</span>;
          n++;
          const b = byId.get(part.id);
          const mark = markOf(feedback, part.id);
          const v = value[part.id] ?? "";
          const cls = clsx(
            "mx-0.5 h-7 rounded-[5px] border-2 bg-surface-2 px-1.5 align-baseline font-mono text-[0.875rem] text-text",
            mark?.ok === true ? "border-accent" : mark?.ok === false ? "border-issue" : "border-text-3",
          );
          const name = `Blank ${n}${mark ? (mark.ok ? ", right" : ", not this") : ""}`;
          return (
            <span key={`${part.id}-${i}`} className="relative inline-block">
              {b?.input === "select" ? (
                <select
                  aria-label={name}
                  value={v}
                  disabled={disabled}
                  onChange={(e) => set(part.id, e.target.value)}
                  className={cls}
                >
                  <option value="">choose…</option>
                  {(b.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  aria-label={name}
                  value={v}
                  readOnly={disabled}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={b?.maxLen}
                  onChange={(e) => set(part.id, e.target.value)}
                  className={cls}
                  style={{
                    width: `calc(${Math.max(5, Math.min((b?.maxLen ?? 24) + 1, v.length + 1))}ch + 1rem)`,
                  }}
                />
              )}
              <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
            </span>
          );
        })}
      </div>
      <p className="min-h-6 text-sm text-text-2">
        {correct ? (
          <>
            <span>Answer: </span>
            {spec.blanks.map((b, i) => (
              <span key={b.id} className="mr-2">
                <span className="text-text-3">blank {i + 1}</span>{" "}
                <code className="rounded-control border-2 border-dashed border-accent-2 px-1 font-mono text-text">
                  {correct[b.id] ?? ""}
                </code>
              </span>
            ))}
          </>
        ) : null}
      </p>
    </AnswerFrame>
  );
}

export function CodeAnswer(p: AnswerWidgetProps<"code">) {
  const { value, onChange, disabled, feedback } = p;
  const ref = useRef<HTMLTextAreaElement>(null);
  const correct = revealedOf<string>(feedback);
  useEffect(() => {
    if (p.autoFocus) ref.current?.focus();
  }, [p.autoFocus]);
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (e.key === "Enter" && isMod(e) && e.shiftKey) {
      if (!disabled) p.onSubmit();
      return true;
    }
    if (e.key === "Enter" && isMod(e)) {
      p.audition?.(value);
      return true;
    }
    if (e.key === "Tab" && !e.shiftKey && e.target === ref.current && !disabled) {
      const el = ref.current;
      const s = el.selectionStart;
      const next = `${value.slice(0, s)}  ${value.slice(el.selectionEnd)}`;
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
      return true;
    }
    return false;
  };
  const lines = Math.max(3, Math.min(14, value.split("\n").length + 1));
  return (
    <AnswerFrame
      kind="code"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      enterIsNewline
      keys={
        <>
          {p.audition ? <KeyHint keys={["⌘/Ctrl Enter"]}>play</KeyHint> : null}
          <SubmitHint keys={["⌘/Ctrl ⇧ Enter"]} />
        </>
      }
    >
      <textarea
        ref={ref}
        aria-label={p.label}
        value={value}
        readOnly={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        rows={lines}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(CODE_BOX, "w-full resize-y leading-6")}
      />
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {p.audition ? (
          <Button
            size="sm"
            icon={<Play aria-hidden className="size-4" />}
            onClick={() => p.audition?.(value)}
          >
            Play
          </Button>
        ) : null}
        {correct !== null ? (
          <span className="text-sm text-text-2">
            Answer:{" "}
            <code className="rounded-control border-2 border-dashed border-accent-2 px-1 font-mono text-text">
              {correct}
            </code>
          </span>
        ) : null}
      </div>
    </AnswerFrame>
  );
}

export function ClickCodeAnswer(p: AnswerWidgetProps<"click-code">) {
  const { value, onChange, disabled, feedback } = p;
  const env = useAnswerEnv();
  const code = env.code ?? "";
  const tokens = codeTokens(code);
  const root = useRef<HTMLDivElement>(null);
  const selected = tokenAt(tokens, value);
  const [focusAt, setFocusAt] = useState(Math.max(0, selected));
  const correct = revealedOf<CodeRange>(feedback);
  const correctAt = tokenAt(tokens, correct);
  const mark = markOf(feedback, 0);
  useEffect(() => {
    if (p.autoFocus) root.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
  }, [p.autoFocus]);

  const choose = (i: number) => {
    const t = tokens[i];
    if (!t) return;
    setFocusAt(i);
    root.current?.querySelector<HTMLElement>(`[data-token="${i}"]`)?.focus();
    if (!disabled) onChange({ from: t.from, to: t.to });
  };
  const onKey = (e: React.KeyboardEvent<HTMLElement>): boolean => {
    if (!(e.target as HTMLElement).hasAttribute("data-token")) return false;
    if (e.key === "ArrowRight") choose(Math.min(tokens.length - 1, focusAt + 1));
    else if (e.key === "ArrowLeft") choose(Math.max(0, focusAt - 1));
    else if (e.key === "ArrowDown") choose(tokenOnLine(tokens, code, focusAt, 1));
    else if (e.key === "ArrowUp") choose(tokenOnLine(tokens, code, focusAt, -1));
    else if (e.key === "Home") choose(0);
    else if (e.key === "End") choose(tokens.length - 1);
    else return false;
    return true;
  };

  if (!code)
    return (
      <AnswerFrame
        kind="click-code"
        idBase={p.idBase}
        label={p.label}
        feedback={feedback}
        onSubmit={p.onSubmit}
      >
        <p className="text-sm text-text-2">There is no code to point at in this step.</p>
      </AnswerFrame>
    );

  // Render the code with each token as a radio; the text between tokens as plain text.
  const pieces: React.ReactNode[] = [];
  let at = 0;
  tokens.forEach((t, i) => {
    if (t.from > at) pieces.push(<span key={`g${at}`}>{code.slice(at, t.from)}</span>);
    const on = i === selected;
    pieces.push(
      // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the radio group (arrows) and the answer frame (Enter)
      // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios and fieldsets cannot take this layout
      <span
        key={`t${t.from}`}
        role="radio"
        aria-checked={on}
        aria-disabled={disabled || undefined}
        aria-label={`${t.text}, line ${t.line + 1}${i === correctAt ? " (the answer)" : ""}`}
        data-token={i}
        tabIndex={i === focusAt ? 0 : -1}
        onClick={() => choose(i)}
        className={clsx(
          "relative cursor-pointer rounded-[3px] outline-offset-1",
          on ? "ring-2 ring-accent" : "hover:bg-surface-2",
          on && mark?.ok === false && "ring-issue",
          i === correctAt && "outline-2 outline-dashed outline-accent-2",
        )}
        style={on ? { background: "var(--oak-selection)" } : undefined}
      >
        {t.text}
      </span>,
    );
    at = t.to;
  });
  if (at < code.length) pieces.push(<span key={`g${at}`}>{code.slice(at)}</span>);

  return (
    <AnswerFrame
      kind="click-code"
      idBase={p.idBase}
      label={p.label}
      feedback={feedback}
      disabled={disabled}
      onSubmit={p.onSubmit}
      onKey={onKey}
      keys={
        <>
          <KeyHint keys={["←", "→", "↑", "↓"]}>point</KeyHint>
          <SubmitHint />
        </>
      }
    >
      <div className="relative">
        <div
          ref={root}
          role="radiogroup"
          aria-label={p.label}
          className={clsx(
            CODE_BOX,
            "overflow-x-auto whitespace-pre",
            mark && (mark.ok ? "border-accent" : "border-issue"),
          )}
        >
          {pieces}
        </div>
        <MarkBadge mark={mark ? (mark.ok ? "ok" : "bad") : null} note={mark?.note} />
      </div>
      <p className="min-h-6 text-sm text-text-2">
        {selected >= 0 ? (
          <>
            Pointing at <code className="font-mono text-text">{tokens[selected]?.text}</code> on line{" "}
            {(tokens[selected]?.line ?? 0) + 1}
          </>
        ) : (
          <span className="text-text-3">Click a word or a note in the code.</span>
        )}
      </p>
    </AnswerFrame>
  );
}
