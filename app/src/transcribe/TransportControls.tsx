// Transcribe's transport row (ux §9: rate 25–100 %, ±12 semitones, ±50¢ fine-tune, the A–B loop, the A/B
// switch "Source · Mine · Both"). Every control names its key; the keys themselves are bound by the page.
import { clsx } from "clsx";
import { Minus, Pause, Play, Plus, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { Kbd } from "../ui/kit/basics.tsx";
import { SegmentedControl } from "../ui/kit/Controls.tsx";
import {
  type BarGrid,
  formatCents,
  formatRate,
  formatSemitones,
  formatTime,
  loopLabel,
  RATE_MAX,
  RATE_MIN,
} from "./grid.ts";
import type { Side, TransportState } from "./transport.ts";

function Nudge({
  label,
  value,
  onDown,
  onUp,
  downDisabled,
  upDisabled,
  keys,
  disabled,
  testId,
}: {
  label: string;
  value: string;
  onDown(): void;
  onUp(): void;
  downDisabled?: boolean;
  upDisabled?: boolean;
  keys: [string, string];
  disabled?: boolean;
  testId: string;
}) {
  const btn =
    "inline-flex size-8 items-center justify-center text-text-2 hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className={clsx("flex items-center gap-1.5", disabled && "opacity-50")} data-testid={testId}>
      <span className="text-sm text-text-2">{label}</span>
      <div className="inline-flex items-stretch overflow-hidden rounded-control border border-border bg-surface">
        <button
          type="button"
          className={clsx(btn, "border-r border-border")}
          aria-label={`${label} down (${keys[0]})`}
          disabled={disabled || downDisabled}
          onClick={onDown}
        >
          <Minus aria-hidden className="size-4" />
        </button>
        <output
          className="flex min-w-14 items-center justify-center px-1 text-sm tabular-nums text-text"
          aria-live="polite"
          aria-label={label}
        >
          {value}
        </output>
        <button
          type="button"
          className={clsx(btn, "border-l border-border")}
          aria-label={`${label} up (${keys[1]})`}
          disabled={disabled || upDisabled}
          onClick={onUp}
        >
          <Plus aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
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
}: {
  onPlay(): void;
  onSide(side: Side): void;
  state: TransportState;
  grid: BarGrid | null;
  /** A marked with [ and no loop yet: the loop starts there when ] is pressed. */
  pendingA?: number | null;
  onRate(dir: 1 | -1): void;
  onSemitones(dir: 1 | -1): void;
  onCents(dir: 1 | -1): void;
  onToggleLoop(): void;
  onSetPoint(which: "A" | "B"): void;
  extra?: ReactNode;
}) {
  const mineOk = state.mineBlocked === null;
  const sideOptions: { value: Side; label: ReactNode; disabled?: boolean; ariaLabel?: string }[] = [
    { value: "source", label: "Source" },
    { value: "mine", label: "Mine", disabled: !mineOk },
    { value: "both", label: "Both", disabled: !mineOk },
  ];
  return (
    <section
      aria-label="Transport"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-border bg-surface px-3 py-2"
      data-testid="transcribe-transport"
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={!state.ready}
        className="inline-flex h-9 items-center gap-2 rounded-control bg-accent px-3 font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
        aria-label={state.playing ? "Pause (Space)" : "Play (Space)"}
        data-testid="play"
      >
        {state.playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
        {state.playing ? "Pause" : "Play"}
        <Kbd tone="inverse">Space</Kbd>
      </button>
      <span className="min-w-[7.5rem] text-sm tabular-nums text-text-2" data-testid="position">
        {formatTime(state.time)} / {formatTime(state.durationS)}
      </span>
      <Nudge
        label="Speed"
        value={formatRate(state.rate)}
        onDown={() => onRate(-1)}
        onUp={() => onRate(1)}
        downDisabled={state.rate <= RATE_MIN}
        upDisabled={state.rate >= RATE_MAX}
        keys={[",", "."]}
        testId="rate"
      />
      <Nudge
        label="Transpose"
        value={formatSemitones(state.semitones)}
        onDown={() => onSemitones(-1)}
        onUp={() => onSemitones(1)}
        downDisabled={state.semitones <= -12}
        upDisabled={state.semitones >= 12}
        keys={["-", "="]}
        testId="semitones"
      />
      {state.cents !== null ? (
        <Nudge
          label="Fine-tune"
          value={formatCents(state.cents)}
          onDown={() => onCents(-1)}
          onUp={() => onCents(1)}
          downDisabled={state.cents <= -50}
          upDisabled={state.cents >= 50}
          keys={["Shift+-", "Shift+="]}
          testId="cents"
        />
      ) : null}
      <div className="flex items-center gap-1.5" data-testid="tr-loop">
        <button
          type="button"
          onClick={onToggleLoop}
          aria-pressed={state.loop !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border px-2 text-sm text-text-2 hover:bg-surface-2 aria-pressed:border-accent aria-pressed:bg-lane-in aria-pressed:text-text"
          aria-label={`Loop ${state.loop ? "on" : "off"} (L)`}
        >
          <Repeat aria-hidden className="size-4" />
          <span data-testid="loop-label">
            {pendingA !== null && !state.loop
              ? `A at ${formatTime(pendingA)} · ] to close`
              : loopLabel(state.loop, grid)}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSetPoint("A")}
          className="inline-flex h-8 items-center rounded-control border border-border px-2 text-sm text-text-2 hover:bg-surface-2"
          aria-label="Set the loop start at the playhead ([)"
        >
          A <Kbd>[</Kbd>
        </button>
        <button
          type="button"
          onClick={() => onSetPoint("B")}
          className="inline-flex h-8 items-center rounded-control border border-border px-2 text-sm text-text-2 hover:bg-surface-2"
          aria-label="Set the loop end at the playhead (])"
        >
          B <Kbd>]</Kbd>
        </button>
      </div>
      <div className="flex items-center gap-2" data-testid="tr-ab">
        <SegmentedControl
          label="What you hear (V switches, O plays both)"
          size="sm"
          value={state.side}
          options={sideOptions}
          onChange={onSide}
        />
      </div>
      {extra ? <div className="ml-auto flex items-center gap-2">{extra}</div> : null}
      {state.mineBlocked && state.mine.kind !== "none" ? (
        <p className="basis-full text-sm text-text-2" data-testid="ab-blocked">
          {state.mineBlocked}
        </p>
      ) : null}
    </section>
  );
}
