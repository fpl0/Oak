// Transcribe's transport row (ux §9: rate 25–100 %, ±12 semitones, ±50¢ fine-tune, the A–B loop, the A/B
// switch "Source · Mine · Both"), drawn with the kit's TransportBar and AbSwitch (carry-over c12): the kit draws,
// this file says what the controls mean here. Every control names its key; the keys are bound by the page.
import { Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { Kbd } from "../ui/kit/basics.tsx";
import { type AbOption, AbSwitch, TransportBar } from "../ui/kit/Transport.tsx";
import { type BarGrid, formatTime, loopLabel, RATE_MAX, RATE_MIN } from "./grid.ts";
import type { Side, TransportState } from "./transport.ts";

/** What the loop control says: the pending A, or the loop in bars (from the first full bar after a pickup). */
export function loopText(
  state: Pick<TransportState, "loop">,
  grid: BarGrid | null,
  pendingA: number | null,
  pickup = false,
): string {
  if (pendingA !== null && !state.loop) return `A at ${formatTime(pendingA)} · ] to close`;
  return loopLabel(state.loop, grid, pickup);
}

export function TransportControls({
  onPlay,
  onSide,
  state,
  grid,
  pendingA = null,
  onRate,
  onSemitones,
  onCents,
  onToggleLoop,
  onSetPoint,
  extra,
  pickup = false,
  setRate,
  setSemitones,
  setCents,
}: {
  onPlay(): void;
  onSide(side: Side): void;
  state: TransportState;
  grid: BarGrid | null;
  /** A marked with [ and no loop yet: the loop starts there when ] is pressed. */
  pendingA?: number | null;
  /** A step of the rate (the keys `,` `.`), when `setRate` is not given. */
  onRate(dir: 1 | -1): void;
  onSemitones(dir: 1 | -1): void;
  onCents(dir: 1 | -1): void;
  onToggleLoop(): void;
  onSetPoint(which: "A" | "B"): void;
  extra?: ReactNode;
  /** The material starts with a pickup bar: loops count bars from the first full bar (c4). */
  pickup?: boolean;
  /** Exact values from the kit's slider and nudges (drag, Alt for fine steps); default: one step toward it. */
  setRate?(rate: number): void;
  setSemitones?(st: number): void;
  setCents?(cents: number): void;
}) {
  const mineOk = state.mineBlocked === null;
  const sideOptions: AbOption<Side>[] = [
    { value: "source", letter: "A", label: "Source" },
    { value: "mine", letter: "B", label: "Mine", disabled: !mineOk },
    { value: "both", letter: "A+B", label: "Both", disabled: !mineOk },
  ];
  const toward = (now: number, next: number, step: (d: 1 | -1) => void) => {
    if (next !== now) step(next > now ? 1 : -1);
  };
  const btn =
    "inline-flex h-8 items-center gap-1 rounded-control border border-control-border bg-control px-2 text-sm text-text-2 hover:bg-control-hover hover:text-text";
  return (
    <section aria-label="Transport" data-testid="transcribe-transport" className="flex flex-col gap-1">
      <TransportBar
        label="Transport"
        playing={state.playing}
        onPlayToggle={onPlay}
        disabled={!state.ready}
        rate={{
          value: state.rate,
          onChange: (v) => (setRate ? setRate(v) : toward(state.rate, v, onRate)),
          min: RATE_MIN,
          max: RATE_MAX,
          keys: [",", "."],
        }}
        pitch={{
          semitones: state.semitones,
          onSemitones: (v) => (setSemitones ? setSemitones(v) : toward(state.semitones, v, onSemitones)),
          keys: ["-", "="],
          ...(state.cents !== null
            ? {
                cents: state.cents,
                onCents: (v: number) => (setCents ? setCents(v) : toward(state.cents ?? 0, v, onCents)),
              }
            : {}),
        }}
      >
        <span className="min-w-[7.5rem] text-sm tabular-nums text-text-2" data-testid="position">
          {formatTime(state.time)} <span className="text-text-3">/ {formatTime(state.durationS)}</span>
        </span>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="tr-loop">
          <button
            type="button"
            onClick={onToggleLoop}
            aria-pressed={state.loop !== null}
            disabled={!state.ready}
            className={`${btn} aria-pressed:border-accent/50 aria-pressed:bg-lane-in aria-pressed:text-accent disabled:opacity-50`}
            aria-label={`Loop ${state.loop ? "on" : "off"} (L)`}
          >
            <Repeat aria-hidden className="size-4" />
            <span data-testid="loop-label">{loopText(state, grid, pendingA, pickup)}</span>
            <Kbd>L</Kbd>
          </button>
          <button
            type="button"
            onClick={() => onSetPoint("A")}
            disabled={!state.ready}
            className={btn}
            aria-label="Set the loop start at the playhead ([)"
          >
            A <Kbd>[</Kbd>
          </button>
          <button
            type="button"
            onClick={() => onSetPoint("B")}
            disabled={!state.ready}
            className={btn}
            aria-label="Set the loop end at the playhead (])"
          >
            B <Kbd>]</Kbd>
          </button>
        </div>
        <div data-testid="tr-ab">
          <AbSwitch
            label="What you hear (V switches, O plays both)"
            value={state.side}
            options={sideOptions}
            onChange={onSide}
            keyHint="V"
            disabled={!state.ready}
          />
        </div>
        {extra}
      </TransportBar>
      {state.mineBlocked && state.mine.kind !== "none" ? (
        <p className="px-1 text-sm text-text-2" data-testid="ab-blocked">
          {state.mineBlocked}
        </p>
      ) : null}
    </section>
  );
}
