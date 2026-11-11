// The weekly rhythm (ux §5.4): a 7/4 bar of this week. Filled notehead = practised, hollow half note =
// Keep-alive, 𝄽 = a banked rest, ⁀ = tied over, an empty slot = a free day (never red), today ringed.
import type { StreakSummary } from "@oak/api";
import { clsx } from "clsx";
import { RestIcon, TieIcon } from "../../ui/icons/index.tsx";
import { rhythmSlots, type SlotState } from "../streak-model.ts";

function Glyph({ state }: { state: SlotState }) {
  switch (state) {
    case "rest":
      return <RestIcon size={16} className="text-text-2" />;
    case "tie":
      return (
        <span className="relative flex h-4 w-4 items-end justify-center">
          <TieIcon size={14} className="absolute -top-1 text-accent" />
          <span aria-hidden className="block h-2.5 w-3 -rotate-12 rounded-[50%] bg-accent" />
        </span>
      );
    default:
      return (
        <span
          aria-hidden
          className={clsx(
            "block h-2.5 w-3.5 -rotate-12 rounded-[50%] border-[1.5px]",
            state === "note" && "border-accent bg-accent",
            state === "half" && "border-accent bg-transparent",
            state === "open" && "border-text-3/60 bg-transparent",
            state === "today" && "border-accent border-dashed bg-transparent",
            state === "future" && "border-border bg-transparent",
            state === "paused" && "border-border bg-surface-2",
          )}
        />
      );
  }
}

export function WeeklyRhythm({
  streak,
  today,
  size = "md",
}: {
  streak: StreakSummary;
  today: string;
  size?: "md" | "lg";
}) {
  const slots = rhythmSlots(streak, today);
  return (
    <ol
      aria-label={`This week: ${streak.thisWeek.qualifyingDays} of ${streak.thisWeek.goal} days`}
      className={clsx("flex items-end", size === "lg" ? "gap-3" : "gap-1.5")}
      data-testid="weekly-rhythm"
    >
      {slots.map((s) => (
        <li
          key={s.day}
          className="flex flex-col items-center gap-1"
          title={s.label}
          data-state={s.state}
          aria-current={s.day === today ? "date" : undefined}
        >
          <span className="flex h-4 items-end">
            <Glyph state={s.state} />
          </span>
          <span
            className={clsx("text-[0.6875rem] leading-none", s.day === today ? "text-text" : "text-text-3")}
          >
            <span aria-hidden>{s.weekday.slice(0, 1)}</span>
            <span className="sr-only">{s.label}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
