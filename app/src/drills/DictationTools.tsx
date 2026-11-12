// Melodic dictation's listening tools (ux §4.5, the Karpinski protocol: listen → enter → Play mine → submit):
// "Play mine" plays what is entered so far (degrees in the heard rhythm, or the code as written), and A/B at
// the bar plays the source's bar, then yours. Hearing the source again counts as a replay; playing your own
// answer does not.
import type { Degree, Trial } from "@oak/api";
import { Button } from "../ui/kit/Button.tsx";
import { Kbd } from "../ui/kit/basics.tsx";
import { abBarPlan, type MineNote, melodyBarsOf, mineFromCode, mineFromDegrees, minePlan } from "./plans.ts";
import type { usePlanPlayer } from "./use-plan-player.ts";

/** A dictation trial written as degrees or code (the contour level is a plain choice). */
export function isDictation(trial: Trial<unknown>, generator: string): boolean {
  return (
    generator === "melody-dictation" &&
    (trial.params.ui === "degree-pad" || trial.params.ui === "code" || trial.params.ui === "staff-input")
  );
}

/** The learner's answer so far as notes (null: nothing playable yet, or code that does not parse). */
export function mineOf(trial: Trial<unknown>, value: unknown): MineNote[] | null {
  if (typeof value === "string") {
    const notes = mineFromCode(trial, value);
    return notes && notes.length > 0 ? notes : null;
  }
  if (Array.isArray(value)) {
    const notes = mineFromDegrees(trial, value as (Degree | null)[]);
    return notes.length > 0 ? notes : null;
  }
  return null;
}

export function DictationTools({
  trial,
  mine,
  player,
  onSourceHeard,
}: {
  trial: Trial;
  mine: MineNote[] | null;
  player: ReturnType<typeof usePlanPlayer>;
  /** A/B played the source again (a replay). */
  onSourceHeard(): void;
}) {
  const bars = melodyBarsOf(trial);
  return (
    <section
      aria-label="Check by ear"
      className="flex flex-wrap items-center gap-2 rounded-control border border-border bg-surface-2 px-3 py-2"
      data-testid="dictation-tools"
    >
      <span className="text-sm text-text-2">Check by ear:</span>
      <Button
        size="sm"
        disabled={!mine}
        onClick={() => mine && player.play("mine", minePlan(trial, mine))}
        data-testid="play-mine"
      >
        {player.playing === "mine" ? "Playing yours…" : "Play mine"} <Kbd>P</Kbd>
      </Button>
      {Array.from({ length: bars }, (_, b) => (
        <Button
          key={b}
          size="sm"
          variant="ghost"
          disabled={!mine}
          aria-label={`A/B bar ${b + 1}: the tune's bar, then yours`}
          onClick={() => {
            if (!mine) return;
            onSourceHeard();
            player.play(`ab${b}`, abBarPlan(trial, mine, b));
          }}
        >
          {player.playing === `ab${b}` ? `Bar ${b + 1}: A, then B…` : `A/B bar ${b + 1}`}
        </Button>
      ))}
      {!mine && <span className="text-sm text-text-3">Enter a note to hear yours.</span>}
    </section>
  );
}
