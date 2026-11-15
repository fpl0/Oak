// PlaySlider (Wave 7): a slider that plays — the swing amount (R1.L02), a microtiming offset (R1.L05, AC2), a
// drive or a cutoff (A1.L05). It is the kit's FineSlider with a Play/Stop button beside it and one line that says
// what the value does in the music ("2:1 — triplet swing", "18.9 ms behind at 99 BPM"), from the owner's
// `describe`. While it plays, each settled change is heard: `onAudition(value)` fires once the value has rested
// `PLAY_SETTLE_MS` (a drag or a held arrow does not restart the sound on every step). The owner keeps the audio;
// `playing` says whether it sounds. Space on the slider plays or stops; the arrows keep their FineSlider steps.
import { clsx } from "clsx";
import { Play, Square } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { IconButton } from "./Button.tsx";
import { FineSlider, type FineSliderProps } from "./FineSlider.tsx";
import { PLAY_SETTLE_MS } from "./model-w7.ts";

export interface PlaySliderProps extends Omit<FineSliderProps, "showLabel" | "keyHint"> {
  /** Sounds now. */
  playing: boolean;
  /** Start or stop the sound (the button and Space on the slider). */
  onPlayToggle(): void;
  /** Called once a new value has settled while playing: play it. */
  onAudition(v: number): void;
  /** What the value does, in words ("2:1 — triplet swing"). */
  describe?: (v: number) => string;
  /** Shows the label above the slider. */
  heading?: boolean;
}

export function PlaySlider({
  playing,
  onPlayToggle,
  onAudition,
  describe,
  heading = true,
  ...props
}: PlaySliderProps) {
  const { "data-testid": testId, className, ...slider } = props;
  const { value, label, disabled } = slider;
  const audition = useRef(onAudition);
  audition.current = onAudition;
  const first = useRef(true);
  useEffect(() => {
    // Not on mount and not while silent: only a change made while it plays is auditioned.
    if (first.current) {
      first.current = false;
      return;
    }
    if (!playing) return;
    const t = setTimeout(() => audition.current(value), PLAY_SETTLE_MS);
    return () => clearTimeout(t);
  }, [value, playing]);
  const words = describe?.(value);
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== " " || disabled) return;
    if (!(e.target instanceof HTMLElement) || e.target.getAttribute("role") !== "slider") return;
    e.preventDefault();
    e.stopPropagation();
    onPlayToggle();
  };
  return (
    <div
      className={clsx("flex min-w-0 flex-col gap-1", className)}
      data-testid={testId}
      data-playing={playing || undefined}
      onKeyDownCapture={onKeyDownCapture}
    >
      {heading && <span className="text-sm font-medium text-text">{label}</span>}
      <div className="flex min-w-0 items-center gap-2">
        <IconButton
          size="sm"
          variant="secondary"
          label={playing ? `Stop ${label.toLowerCase()}` : `Play ${label.toLowerCase()}`}
          shortcut="Space"
          disabled={disabled}
          icon={
            playing ? <Square aria-hidden className="size-3.5" /> : <Play aria-hidden className="size-3.5" />
          }
          onClick={onPlayToggle}
        />
        <FineSlider {...slider} className="min-w-0 flex-1" />
      </div>
      {words && (
        <p className="pl-9 text-sm text-text-2" aria-live="polite" data-testid="play-slider-words">
          {words}
        </p>
      )}
    </div>
  );
}
