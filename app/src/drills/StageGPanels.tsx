// Wave 7 panels of the drill runner: the rhythm drawn as lanes once a clave, odd-grouping or polyrhythm trial is
// answered (the clave's two sides, the bar's groups with their accents, one lane per pulse); the two-lane tap pad of a
// two-hand take (F for the left hand, J for the right, each lane with its own targets and taps); and the Quiet-mode
// card of a sung trial (hear it in your head, then Space). Keyboard-first; nothing here animates under reduced motion
// except the playhead, which is information (ux §7.6).
import type { Trial } from "@oak/api";
import { clsx } from "clsx";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Kbd } from "../ui/kit/basics.tsx";
import type { Stage } from "./machine.ts";
import { useLive } from "./runtime.ts";
import { Playhead } from "./TapPanel.tsx";
import { lanesReport, laneTaps, quietSingText, type RhythmLanes, type TapLaneSpec } from "./wave7.ts";

const pct = (x: number): string => `${Math.max(0, Math.min(100, x * 100))}%`;

/** The answer as lanes: each lane's hits over the span, the grid under them, group brackets and side labels. */
export function RhythmLanesView({ lanes }: { lanes: RhythmLanes }) {
  const steps = lanes.bars * lanes.grid;
  return (
    <figure
      className="flex w-full max-w-2xl flex-col gap-1.5"
      data-testid="rhythm-lanes"
      aria-label={lanes.label}
    >
      {lanes.groups && (
        // The brackets sit over the lane's own span (after the label column, inside the same padding).
        <div className="flex gap-3" aria-hidden>
          <span className="w-24 shrink-0" />
          <div className="relative h-6 flex-1 px-3">
            <div className="relative h-full">
              {lanes.groups.map((g) => (
                <span
                  key={g.start}
                  className={clsx(
                    "absolute top-0 flex h-5 items-start justify-center rounded-t border-x border-t text-xs font-medium",
                    g.length === 3 ? "border-accent text-text" : "border-text-3 text-text-2",
                  )}
                  style={{
                    left: `calc(${pct(g.start / steps)} + 2px)`,
                    width: `calc(${pct(g.length / steps)} - 4px)`,
                  }}
                >
                  {g.length}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {lanes.lanes.map((lane) => (
        <div key={lane.label} className="flex items-center gap-3">
          <span className="w-24 shrink-0 text-left text-xs text-text-2">{lane.label}</span>
          <div className="h-8 flex-1 rounded-control border border-border bg-surface-2 px-3" aria-hidden>
            {/* Hits sit on the grid lines of their onsets; the padding keeps the first and last whole. */}
            <div className="relative h-full">
              {Array.from({ length: steps + 1 }, (_, i) => (
                <span
                  key={i}
                  className={clsx(
                    "absolute top-0 h-full w-px",
                    i % lanes.grid === 0 ? "bg-text-3/60" : "bg-border",
                  )}
                  style={{ left: pct(i / steps) }}
                />
              ))}
              {lane.hits.map((h) => {
                const strong = lane.strong?.some((s) => Math.abs(s - h) < 1e-6) ?? false;
                return (
                  <span
                    key={h}
                    className={clsx(
                      "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                      strong || !lane.strong ? "size-3.5 bg-accent" : "size-2 bg-text-2",
                    )}
                    style={{ left: pct(h) }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ))}
      {lanes.barLabels && (
        <div className="flex gap-3">
          <span className="w-24 shrink-0" aria-hidden />
          <div
            className="grid flex-1 px-3 text-xs text-text-2"
            style={{ gridTemplateColumns: `repeat(${lanes.bars}, 1fr)` }}
          >
            {lanes.barLabels.map((l, i) => (
              <span key={`${l}${i}`} className="text-left">
                Bar {i + 1} · {l}
              </span>
            ))}
          </div>
        </div>
      )}
      <figcaption className="sr-only">{lanes.label}</figcaption>
    </figure>
  );
}

/**
 * A two-lane tap pad: F taps the left-hand lane, J the right; each lane shows its beats, its taps as they land and,
 * after the take, its targets. Pointer taps on each lane's button work too.
 */
export function LaneTapPanel({
  trial,
  lanes,
  stage,
  done,
  taps,
  voices,
}: {
  trial: Trial;
  lanes: readonly TapLaneSpec[];
  stage: Stage;
  done: boolean;
  taps: number[] | null;
  voices: (0 | 1)[] | null;
}) {
  const liveTaps = useLive((s) => s.taps);
  const liveVoices = useLive((s) => s.voices);
  const windowSec = useLive((s) => s.windowSec);
  const tapNow = useLive((s) => s.tapNow);
  const allTaps = done ? (taps ?? []) : liveTaps;
  const allVoices = done ? voices : liveVoices;
  const lastTarget = Math.max(0, ...lanes.flatMap((l) => l.targets));
  const span = Math.max(windowSec, lastTarget + 0.4, 1);
  const barSec = 1 / trial.cps;
  const bars = Array.from({ length: Math.floor(span / barSec) + 1 }, (_, i) => i * barSec);
  const armed = tapNow !== null;
  const x = (t: number) => pct(t / span);
  const running = !done && (stage === "respond" || stage === "listen" || stage === "count-in");
  const report = done ? lanesReport(lanes, taps ?? [], voices) : null;
  return (
    <div className="flex flex-col gap-3" data-keyscope="tap-pad" data-testid="lane-tap">
      {lanes.map((lane) => {
        const mine = laneTaps(allTaps, allVoices, lane.voice);
        return (
          <div key={lane.key} className="flex items-center gap-3" data-testid={`tap-lane-${lane.key}`}>
            <button
              type="button"
              disabled={!armed}
              onPointerDown={(e) => {
                if (e.button === 0) tapNow?.(e.timeStamp, lane.voice);
              }}
              aria-label={`Tap the ${lane.key === "F" ? "left" : "right"}-hand lane (${lane.key})`}
              className={clsx(
                "flex h-12 w-14 shrink-0 items-center justify-center rounded-card border text-base font-medium transition-colors",
                armed
                  ? "border-accent bg-lane-in text-text active:bg-accent active:text-on-accent"
                  : "border-border bg-surface text-text-3",
              )}
            >
              <Kbd>{lane.key}</Kbd>
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-left text-sm text-text-2">{lane.label}</span>
              <div
                className="relative h-10 w-full overflow-hidden rounded-control border border-border bg-surface-2"
                role="img"
                aria-label={`${lane.label}: ${mine.length} ${mine.length === 1 ? "tap" : "taps"}${
                  done ? `, ${lane.targets.length} to match` : ""
                }`}
              >
                {bars.map((b) => (
                  <span
                    key={b}
                    aria-hidden
                    className="absolute top-0 h-full w-px bg-text-3/60"
                    style={{ left: x(b) }}
                  />
                ))}
                {done &&
                  lane.targets.map((t) => (
                    <span
                      key={`t${t}`}
                      aria-hidden
                      className="absolute top-1 h-3.5 w-1.5 -translate-x-1/2 rounded-sm bg-accent/50"
                      style={{ left: x(t) }}
                    />
                  ))}
                {mine.map((t, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className="absolute bottom-1 h-3.5 w-1 -translate-x-1/2 rounded-sm bg-text"
                    style={{ left: x(t) }}
                  />
                ))}
                <Playhead span={span} running={running} />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-sm text-text-2" aria-live="polite" data-testid="lane-report">
        {done
          ? report
          : armed
            ? `${allTaps.length} ${allTaps.length === 1 ? "tap" : "taps"}: F for the left hand, J for the right.`
            : "The pads wake when the trial starts. F for the left hand, J for the right."}
      </p>
      {done && (
        <p className="text-sm text-text-3">Upper marks are the hits to match; lower marks are your taps.</p>
      )}
    </div>
  );
}

/** A sung trial in Quiet mode: hear it in your head while it plays, then Space. Nothing is recorded against you. */
export function QuietSingCard({ trial, onHeard }: { trial: Trial; onHeard(): void }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-5 text-center" data-testid="quiet-sing">
      <p className="text-text">{quietSingText(trial)}</p>
      <p className="text-sm text-text-2">
        The microphone stays closed. Nothing is recorded for this one, and nothing counts against you.
      </p>
      <Button variant="primary" autoFocus onClick={onHeard} data-testid="quiet-heard">
        I heard it <Kbd tone="inverse">Space</Kbd>
      </Button>
    </Card>
  );
}
