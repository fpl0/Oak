// Shared pieces of the Wave 7 answer widgets: playing a pattern of hits (the host's sound, else clicks), a pick
// card (a radio with its mark and the reveal outline, the same border width in every state so nothing moves), and
// the roving-radio keys every pick uses (`1`–`9` pick, arrows move and pick, as a radio group does).
import { clsx } from "clsx";
import type { ReactNode } from "react";
import type { AnswerAudio } from "../env.tsx";
import type { Hit } from "../rhythm7.ts";
import { digitOf, type Mark, MarkBadge, markRing } from "../ui.tsx";

/** Plays hits through the host's `hits`, else as clicks (accented when loud). */
export function playHits(audio: AnswerAudio, hits: readonly Hit[]): void {
  if (audio.hits) {
    audio.hits(hits);
    return;
  }
  void audio.context().then((ctx) => {
    const t0 = ctx.currentTime + 0.15;
    for (const h of hits) audio.click(t0 + h.at, h.gain >= 0.6);
  });
}

export interface PickCardProps {
  id: string;
  checked: boolean;
  disabled?: boolean | undefined;
  /** The answer, shown with a dashed outline once revealed. */
  isAnswer?: boolean;
  mark: Mark;
  note?: string | undefined;
  tabStop: boolean;
  label: string;
  onPick(): void;
  className?: string;
  children: ReactNode;
}

/** One option of a pick: `role="radio"`, marked and outlined without changing size. */
export function PickCard(p: PickCardProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a styled custom control with roving focus (ux §7.9); native radios cannot take this layout
    <button
      type="button"
      role="radio"
      data-option={p.id}
      aria-checked={p.checked}
      aria-disabled={p.disabled || undefined}
      aria-label={`${p.label}${p.mark ? (p.mark === "ok" ? ", right" : ", not this one") : ""}${p.isAnswer ? " (the answer)" : ""}`}
      tabIndex={p.tabStop ? 0 : -1}
      onClick={() => {
        if (!p.disabled) p.onPick();
      }}
      className={clsx(
        "relative flex min-w-0 rounded-control border-2 bg-surface text-left transition-colors reduced:transition-none",
        p.checked ? "border-text bg-surface-2" : "border-border hover:bg-surface-2",
        markRing(p.mark),
        p.isAnswer && "outline-2 outline-offset-2 outline-accent-2 outline-dashed",
        p.className,
      )}
    >
      {p.children}
      <MarkBadge mark={p.mark} note={p.note} />
    </button>
  );
}

/**
 * The keys of a single pick inside `root`: a digit picks the n-th option, arrows move to the next and pick it.
 * Returns true when it handled the key.
 */
export function pickKeys(
  e: React.KeyboardEvent<HTMLElement>,
  root: HTMLElement | null,
  ids: readonly string[],
  pick: (id: string) => void,
): boolean {
  const n = digitOf(e);
  const focus = (id: string) =>
    root?.querySelector<HTMLButtonElement>(`[data-option="${CSS.escape(id)}"]`)?.focus();
  if (n !== null && n >= 1 && n <= ids.length && !e.shiftKey) {
    const id = ids[n - 1] as string;
    pick(id);
    focus(id);
    return true;
  }
  const dir =
    e.key === "ArrowDown" || e.key === "ArrowRight"
      ? 1
      : e.key === "ArrowUp" || e.key === "ArrowLeft"
        ? -1
        : 0;
  if (dir === 0) return false;
  const active = (document.activeElement as HTMLElement | null)?.getAttribute("data-option");
  const at = active ? ids.indexOf(active) : -1;
  if (at < 0) return false;
  const id = ids[(at + dir + ids.length) % ids.length] as string;
  pick(id);
  focus(id);
  return true;
}
