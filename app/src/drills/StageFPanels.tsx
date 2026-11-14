// Stage F panels of the drill runner (Wave 6): the key ribbon of a key-change trial (the bars, the key in force
// under them, the bar where home moves marked in words as well as colour; each bar heard on its own), and the second
// question for the ear after an answer (which chord it was; which way home moved and how far). The second question
// is never recorded and changes no result: it says so. Keyboard-first: digits answer it.
import { clsx } from "clsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { usePlayingBar } from "./StageEPanels.tsx";
import type { FollowUp, KeyChange } from "./wave6.ts";

/** The bars of a passage with the key in force under them; shown once the trial is answered. */
export function KeyRibbon({ change, onPlayBar }: { change: KeyChange; onPlayBar?(bar: number): void }) {
  const playing = usePlayingBar();
  const bars = change.spans.reduce((n, s) => Math.max(n, s.toBar), 0);
  return (
    <section
      className="flex w-full max-w-2xl flex-col gap-1.5"
      data-testid="key-ribbon"
      aria-label="The key, bar by bar"
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${bars}, minmax(0, 1fr))` }}>
        {Array.from({ length: bars }, (_, i) => {
          const bar = i + 1;
          const first = change.bar === bar;
          const isPlaying = playing === bar;
          return (
            <button
              key={bar}
              type="button"
              onClick={() => onPlayBar?.(bar)}
              aria-label={`Bar ${bar}${first ? ", the new key begins here" : ""}${isPlaying ? ", playing" : ""}. Hear this bar alone`}
              className={clsx(
                "flex h-10 flex-col items-center justify-center rounded-control border text-sm tabular-nums transition-colors duration-100",
                "hover:border-text-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                isPlaying ? "border-accent bg-lane-in" : "border-border bg-surface",
                first && "outline-2 outline-offset-1 outline-accent-2",
              )}
            >
              {bar}
            </button>
          );
        })}
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${bars}, minmax(0, 1fr))` }}>
        {change.spans.map((s, i) => (
          <div
            key={s.fromBar}
            data-testid={`key-span-${i}`}
            style={{ gridColumn: `${s.fromBar} / ${s.toBar + 1}` }}
            className={clsx(
              "truncate rounded-control border px-2 py-1 text-left text-sm",
              i === 0 ? "border-border bg-surface-2 text-text-2" : "border-accent/50 bg-lane-in text-text",
            )}
          >
            <span className="font-medium">{s.label}</span>
            {i > 0 && <span className="text-text-2"> · from bar {s.fromBar}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

/** One more question after the answer, for the ear only. */
export function FollowUpCard({
  follow,
  picked,
  onPick,
}: {
  follow: FollowUp;
  picked: string | null;
  onPick(id: string): void;
}) {
  const right = picked === follow.correct;
  return (
    <section
      className="rounded-control border border-border bg-surface px-4 py-3"
      data-testid="follow-up"
      aria-label="One more question for your ear"
    >
      <p className="font-medium">{follow.prompt}</p>
      <p className="text-sm text-text-3">For your ear only: it is not recorded and changes nothing.</p>
      {/* biome-ignore lint/a11y/useSemanticElements: a labelled group of answer buttons */}
      <div role="group" aria-label={follow.prompt} className="mt-2 flex flex-wrap gap-2">
        {follow.options.map((o, i) => {
          const isPick = picked === o.id;
          const isAnswer = picked !== null && o.id === follow.correct;
          return (
            <button
              key={o.id}
              type="button"
              disabled={picked !== null}
              aria-pressed={isPick}
              data-option={o.id}
              onClick={() => onPick(o.id)}
              className={clsx(
                "inline-flex h-9 items-center gap-2 rounded-control border px-3 text-sm font-medium transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                isAnswer
                  ? "border-accent bg-lane-in text-text"
                  : isPick
                    ? "border-accent-2 bg-surface-2 text-text"
                    : "border-border bg-surface text-text hover:border-text-3 disabled:text-text-3",
              )}
            >
              <Kbd>{i + 1}</Kbd>
              {o.label}
              {isAnswer && <span className="sr-only"> (the answer)</span>}
              {isPick && !isAnswer && <span className="sr-only"> (your pick)</span>}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <p
          className="mt-2 text-sm text-text-2"
          role="status"
          data-testid="follow-up-answer"
          data-right={right}
        >
          {right ? "Yes. " : "Not that one. "}
          {follow.answer}
        </p>
      )}
    </section>
  );
}
