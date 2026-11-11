// Small status widgets of the shell chrome: AudioStatus, the Mic-live dot, the tutor toggle, now playing.
import { clsx } from "clsx";
import { MessageCircle, Mic, Square } from "lucide-react";
import { wakeAudio } from "../../lib/oak.ts";
import { useHealth } from "../../lib/queries.ts";
import { audioStatusLabel, useShell } from "../../lib/shell-store.ts";
import { useIsLarge } from "../../lib/use-media.ts";
import { IconButton } from "../kit/Button.tsx";
import { Tooltip } from "../kit/Tooltip.tsx";
import { usePrefs } from "../theme/prefs.ts";

export function AudioStatus({ compact = false }: { compact?: boolean }) {
  const audio = useShell((s) => s.audio);
  const label = audioStatusLabel(audio);
  const dot =
    audio.kind === "ready"
      ? "bg-accent"
      : audio.kind === "error"
        ? "bg-danger"
        : audio.kind === "asleep"
          ? "bg-text-3"
          : audio.kind === "suspended"
            ? "bg-accent-2"
            : "bg-accent-2 animate-pulse reduced:animate-none";
  const full = audio.kind === "error" ? `${label}: ${audio.message}` : label;
  return (
    <Tooltip content={full} side={compact ? "right" : "bottom"}>
      <button
        type="button"
        onClick={() => wakeAudio()}
        aria-label={`Audio: ${full}`}
        data-testid="audio-status"
        className={clsx(
          "inline-flex h-8 items-center gap-2 rounded-control px-2 text-sm text-text-2 hover:bg-surface-2",
          compact && "w-8 justify-center px-0",
          !compact && "max-sm:w-8 max-sm:justify-center max-sm:px-0",
        )}
      >
        <span aria-hidden className={clsx("size-2 rounded-full", dot)} />
        {/* Below 640 px the dot alone stays in the bar; the label remains for screen readers. */}
        {!compact && (
          <span aria-live="polite" className="whitespace-nowrap max-sm:sr-only">
            {label}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

export function MicLiveDot() {
  const live = useShell((s) => s.micLive);
  const closeMic = useShell((s) => s.closeMic);
  if (!live) return null;
  return (
    <Tooltip content="Close the microphone" shortcut="⌘⇧M">
      <button
        type="button"
        onClick={() => closeMic?.()}
        className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-mic hover:bg-surface-2"
        aria-label="Microphone is live. Close it"
      >
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-mic opacity-60 reduced:hidden" />
          <span className="relative inline-flex size-2.5 rounded-full bg-mic" />
        </span>
        <Mic aria-hidden className="size-4" />
        Mic live
      </button>
    </Tooltip>
  );
}

export function useTutorToggle(): { open: boolean; toggle(): void } {
  const large = useIsLarge();
  const docked = usePrefs((s) => s.tutorOpen);
  const setPrefs = usePrefs((s) => s.set);
  const drawer = useShell((s) => s.tutorDrawerOpen);
  const setDrawer = useShell((s) => s.setTutorDrawerOpen);
  const open = large ? docked : drawer;
  return {
    open,
    toggle: () => (large ? setPrefs({ tutorOpen: !docked }) : setDrawer(!drawer)),
  };
}

export function TutorToggle({ side = "bottom" }: { side?: "bottom" | "right" }) {
  const { open, toggle } = useTutorToggle();
  const health = useHealth();
  const off = health.data ? health.data.tutorBackend === null : false;
  return (
    <IconButton
      label={off ? "Tutor (off — see Settings › Tutor)" : open ? "Hide tutor" : "Show tutor"}
      shortcut="⌘J"
      tooltipSide={side}
      pressed={open}
      onClick={toggle}
      data-testid="tutor-toggle"
      icon={<MessageCircle aria-hidden className={clsx("size-5", off && "opacity-50")} />}
    />
  );
}

export function NowPlaying() {
  const np = useShell((s) => s.nowPlaying);
  if (!np) return null;
  return (
    <div className="flex items-center gap-2 rounded-control border border-border px-2 py-1 text-sm">
      <span className="text-text-3">Now playing:</span>
      <span className="max-w-48 truncate">{np.label}</span>
      <IconButton
        size="sm"
        label="Stop"
        shortcut="⌘."
        icon={<Square aria-hidden className="size-3.5" />}
        onClick={np.stop}
      />
    </div>
  );
}
