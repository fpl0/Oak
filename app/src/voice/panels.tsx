// The voice controls Settings and the set-up share: the one Quiet-mode switch, the tolerance-ladder card, the
// "re-run the quiet check" hint and the live output level meter. Calm words, no scores (contracts §8.2: the ladder
// is explained, never graded), keyboard-first, themed by the --oak-* tokens.
import type { SingTolCents } from "@oak/content-kit";
import { Link } from "@tanstack/react-router";
import { clsx } from "clsx";
import { MicOff } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { formatDate } from "../lib/format.ts";
import { peekOak } from "../lib/oak.ts";
import { Button, buttonClass } from "../ui/kit/Button.tsx";
import { Callout, SegmentedControl } from "../ui/kit/Controls.tsx";
import { Select, Switch } from "../ui/kit/Field.tsx";
import { clearRecheck, useRecheck } from "./recheck.ts";
import type { LadderView, TolChoice } from "./state.ts";
import { tolChoiceOf } from "./state.ts";
import { useVoiceSync } from "./sync.ts";
import { useVoice, type Voice } from "./use-voice.ts";

// --- Quiet mode ------------------------------------------------------------------------------------

/**
 * The one Quiet-mode switch (contracts §8.5): on for today or until switched off, with what it does in one line.
 * With no microphone there is nothing to switch back to, so the control offers the set-up instead of a dead
 * switch.
 */
export function QuietControl({ voice }: { voice: Voice }) {
  const id = useId();
  const helpId = useId();
  // This switch tells the other open tabs (a lesson, a drill) when Quiet mode changes.
  useVoiceSync();
  const q = voice.quiet;
  const [scope, setScope] = useState<"today" | "always">(q.reason === "always" ? "always" : "today");
  return (
    <div className="flex flex-col gap-3 py-3" data-testid="quiet-control" data-quiet={q.quiet ? "1" : "0"}>
      <div className="grid gap-2 sm:grid-cols-[14rem_1fr] sm:items-start">
        <div>
          <label htmlFor={id} className="font-medium">
            Quiet mode
          </label>
          <p id={helpId} className="text-sm text-text-2" data-testid="quiet-line">
            {q.line}
          </p>
        </div>
        <div className="flex min-w-0 flex-col items-start gap-3">
          {q.canSwitchOff ? (
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                id={id}
                describedBy={helpId}
                checked={q.quiet}
                disabled={voice.pending}
                // Switching off undoes what is on: "always" off for good, a day's choice for today.
                onChange={(on) =>
                  void voice.setQuiet(on, on ? scope : q.reason === "always" ? "always" : "today")
                }
              />
              <span className="text-sm text-text-2" aria-hidden>
                {q.quiet ? (q.reason === "today" ? "On for today" : "On") : "Off"}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm text-text-2" id={id}>
                <MicOff aria-hidden className="size-4" /> On: no microphone
              </span>
              <Link
                to="/settings/voice/setup"
                search={{ part: "mic" }}
                className={buttonClass("secondary", "sm")}
                data-testid="quiet-setup-mic"
              >
                Set up a microphone
              </Link>
            </div>
          )}
          {q.canSwitchOff && !q.quiet && (
            <SegmentedControl<"today" | "always">
              label="When Quiet mode is switched on"
              size="sm"
              value={scope}
              options={[
                { value: "today", label: "Just for today" },
                { value: "always", label: "Until I switch it off" },
              ]}
              onChange={setScope}
            />
          )}
        </div>
      </div>
      {voice.source === "profile" && q.quiet && q.reason === "always" && (
        <p className="text-sm text-text-3">
          This server keeps Quiet mode until you switch it off; "just for today" arrives with its next update.
        </p>
      )}
    </div>
  );
}

// --- the tolerance ladder ------------------------------------------------------------------------------

const TOL_OPTIONS: readonly { value: TolChoice; label: string }[] = [
  { value: "auto", label: "Auto (recommended)" },
  { value: 70, label: "±70¢" },
  { value: 50, label: "±50¢" },
  { value: 35, label: "±35¢" },
  { value: 25, label: "±25¢" },
];

/** Dots for the days inside the window: filled when the day counted. Never numbers, never a grade. */
function DayDots({ view }: { view: LadderView }) {
  if (!view.progress) return null;
  const { have, need, next } = view.progress;
  return (
    <div className="flex flex-col gap-2" data-testid="ladder-progress">
      <div
        className="flex items-center gap-1.5"
        role="img"
        aria-label={`${have} of the ${need} days it needs`}
      >
        {Array.from({ length: need }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={clsx(
              "inline-block size-3 rounded-full border",
              i < have ? "border-accent bg-accent" : "border-text-3 bg-surface",
            )}
          />
        ))}
        <span className="ml-2 text-sm text-text-2">
          {have === 0
            ? `No day has counted yet toward ±${next}¢.`
            : `${have} of the ${need} days toward ±${next}¢.`}
        </span>
      </div>
      {view.days.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-3" aria-label="Days you sang lately">
          {view.days.map((d) => (
            <li key={d.day} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={clsx(
                  "inline-block size-2 rounded-full",
                  d.counted ? "bg-accent" : "border border-text-3",
                )}
              />
              {formatDate(`${d.day}T12:00:00`)} · {d.notes} notes{d.counted ? " · counted" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Settings › Voice: where the tolerance is, why, how it moves, and the choice of Auto or a fixed value. */
export function LadderCard({ voice }: { voice: Voice }) {
  const v = voice.ladder;
  const id = useId();
  const helpId = useId();
  return (
    <div className="flex flex-col gap-4 py-3" data-testid="ladder-card">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-h2 tabular-nums" data-testid="ladder-now">
          {v.now}
        </span>
        <span className="text-text-2">{v.mode === "auto" ? "Auto" : "Fixed"}</span>
      </div>
      <p className="max-w-[62ch] text-text-2" data-testid="ladder-why">
        {v.why}
      </p>
      {v.lastChange && <Callout tone="success" title={v.lastChange} className="max-w-[62ch]" />}
      {v.held && <Callout tone="info" title={v.held} className="max-w-[62ch]" />}
      <DayDots view={v} />
      {v.offerLoosen && (
        <Callout
          tone="info"
          title="It has been a while since you last sang"
          className="max-w-[62ch]"
          actions={
            <Button
              size="sm"
              onClick={() => void voice.setLadder({ mode: "loosen" })}
              data-testid="ladder-loosen"
            >
              Loosen one step for now
            </Button>
          }
        >
          A voice that has rested takes a few days to settle. Loosening one step is fine; Auto tightens it
          again as before.
        </Callout>
      )}
      <details className="max-w-[62ch] text-sm text-text-2">
        <summary className="cursor-pointer font-medium text-text">How it moves</summary>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5" data-testid="ladder-how">
          {v.how.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      <div className="grid gap-2 sm:grid-cols-[14rem_1fr] sm:items-center">
        <div>
          <label htmlFor={id} className="font-medium">
            Tolerance
          </label>
          <p id={helpId} className="text-sm text-text-2">
            Auto follows your singing; a fixed value stays put.
          </p>
        </div>
        <div>
          <Select<TolChoice>
            id={id}
            describedBy={helpId}
            value={tolChoiceOf(v)}
            options={TOL_OPTIONS}
            disabled={voice.pending}
            onChange={(c) =>
              void voice.setLadder(
                c === "auto" ? { mode: "auto" } : { mode: "fixed", cents: c as SingTolCents },
              )
            }
          />
        </div>
      </div>
    </div>
  );
}

// --- re-run the quiet check -----------------------------------------------------------------------

/**
 * The non-modal suggestion a take that heard no voice (or mostly noise) leaves behind; and, when the mic heard
 * Oak's own playback (contracts §8.6, `sing.bleed`), the line with its fallback: Quiet mode for today in one
 * press, or the bleed check of the set-up.
 */
export function RecheckHint({ className }: { className?: string }) {
  const advice = useRecheck();
  if (!advice) return null;
  if (advice.kind === "bleed")
    return <BleedHint className={className} body={advice.body} title={advice.title} />;
  return (
    <Callout
      tone="attention"
      title={advice.title}
      onDismiss={clearRecheck}
      {...(className ? { className } : {})}
      actions={
        <Link
          to="/settings/voice/setup"
          search={{ part: "noise" }}
          className={buttonClass("secondary", "sm")}
          data-testid="recheck-run"
        >
          Run the quiet check
        </Link>
      }
    >
      <span data-testid="recheck-hint">{advice.body}</span>
    </Callout>
  );
}

/** `sing.bleed` and the fallback (contracts §8.6): Quiet mode for today, or the bleed check. */
function BleedHint({
  className,
  title,
  body,
}: {
  className?: string | undefined;
  title: string;
  body: string;
}) {
  const voice = useVoice();
  const quiet = voice.quiet.quiet;
  return (
    <Callout
      tone="attention"
      title={title}
      onDismiss={clearRecheck}
      {...(className ? { className } : {})}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {quiet ? (
            <span className="text-sm text-text-2" data-testid="bleed-quiet-on">
              Quiet mode is on for today.
            </span>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<MicOff aria-hidden className="size-4" />}
              loading={voice.pending}
              disabled={!voice.ready}
              onClick={() => void voice.setQuiet(true, "today").then(clearRecheck)}
              data-testid="bleed-quiet"
            >
              Quiet mode for today
            </Button>
          )}
          <Link
            to="/settings/voice/setup"
            search={{ part: "bleed" }}
            className={buttonClass("ghost", "sm")}
            data-testid="bleed-check"
          >
            Run the bleed check
          </Link>
        </div>
      }
    >
      <span data-testid="recheck-hint" data-kind="bleed">
        {body}
      </span>
    </Callout>
  );
}

// --- the output level meter ---------------------------------------------------------------------------

const SEGMENTS = 24;
const FLOOR_DB = -60;

/** dBFS of the master bus's RMS, or −∞ when sound has not started. */
function outputDb(): number {
  const level = peekOak()?.master.level();
  if (!level || !(level.rms > 0)) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(level.rms);
}

/**
 * Settings › Audio: what Oak is sending to the headphones right now (post-limiter RMS of the master bus), so a
 * learner who hears nothing can tell "Oak is silent" from "my output is muted or elsewhere".
 */
export function OutputMeter() {
  const [db, setDb] = useState(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      // About 20 readings a second is plenty for the eye and for a screen reader's polite updates.
      if (now - last > 50) {
        last = now;
        setDb(outputDb());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const playing = Number.isFinite(db) && db > FLOOR_DB;
  const level = playing ? Math.min(1, Math.max(0, (db - FLOOR_DB) / -FLOOR_DB)) : 0;
  const lit = Math.round(level * SEGMENTS);
  const text = playing ? `${Math.round(db)} dBFS` : "Silent";
  return (
    <div className="flex flex-col gap-1.5" data-testid="output-meter" data-playing={playing ? "1" : "0"}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-text-2">Output level</span>
        <span className="font-medium tabular-nums">{text}</span>
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: a segmented level display; a native <meter> is one bar. */}
      <div
        role="meter"
        aria-label="Output level"
        aria-valuemin={FLOOR_DB}
        aria-valuemax={0}
        aria-valuenow={playing ? Math.round(db) : FLOOR_DB}
        aria-valuetext={text}
        className="flex h-3 items-stretch gap-0.5"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={clsx(
              "flex-1 rounded-[2px]",
              i < lit ? (i >= SEGMENTS - 2 ? "bg-accent-2" : "bg-accent") : "bg-surface-2",
            )}
          />
        ))}
      </div>
    </div>
  );
}
