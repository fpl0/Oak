// What a trial shows besides sound: the staff for reading trials (rhythm on a one-line staff, notes on the
// treble staff), and the highlighted key for keyboard naming. Engraved by @oak/notation from the trial's own
// events, the same way the Workbench does.
import type { KeySpec, MeterId, Trial } from "@oak/api";
import { notate, type StaffKind } from "@oak/notation";
import { renderStaff } from "@oak/notation/render";
import { METERS } from "@oak/theory";
import { useEffect, useRef, useState } from "react";

function staffKindOf(trial: Trial<unknown>): StaffKind | null {
  if (trial.params.showStaff !== true) return null;
  if (trial.params.mode === "tap") return "rhythm";
  const clef = (trial.params.staff as { clef?: string } | undefined)?.clef;
  return clef === "bass" ? "bass" : "treble";
}

/** The ABC of a reading trial, or null when the trial shows no staff. */
export function trialAbc(trial: Trial<unknown>): string | null {
  const staff = staffKindOf(trial);
  if (!staff) return null;
  const meterId = (trial.params.meter as MeterId | undefined) ?? "4/4";
  const meter = METERS[meterId] ?? METERS["4/4"];
  const bars = Number(trial.params.bars ?? 1);
  const key = (trial.params.key as KeySpec | undefined) ?? null;
  const track = typeof trial.params.answerTrack === "string" ? trial.params.answerTrack : null;
  const events = trial.events.filter((e) => track === null || e.track === track);
  try {
    return notate({ events, meter, key, bars, staff, labels: "none" }, { barsPerLine: 4 }).abc.abc;
  } catch {
    return null;
  }
}

export function TrialStaff({ trial }: { trial: Trial<unknown> }) {
  const host = useRef<HTMLDivElement>(null);
  const abc = trialAbc(trial);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el || !abc) return;
    let live = true;
    renderStaff(el, abc).catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
      el.replaceChildren();
    };
  }, [abc]);
  if (!abc) return null;
  return (
    <figure className="w-full max-w-xl" aria-label="The rhythm or melody to read">
      <div ref={host} data-testid="trial-staff" className="oak-staff text-text [&_svg]:max-h-36" />
      {failed && <p className="text-sm text-text-2">The staff could not be drawn. Hear it again instead.</p>}
    </figure>
  );
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];

/** Two octaves of keys around `highlight`, the highlighted key filled (keyboard naming trials). */
export function KeyHighlight({ highlight }: { highlight: number }) {
  const startC = Math.floor(highlight / 12) * 12 - (highlight % 12 >= 6 ? 0 : 12);
  const whites: number[] = [];
  for (let m = startC; m < startC + 24; m++) if (WHITE_PCS.includes(m % 12)) whites.push(m);
  const W = 26;
  const H = 96;
  const blackOf = (m: number) => !WHITE_PCS.includes(m % 12);
  const blacks: { m: number; x: number }[] = [];
  whites.forEach((m, i) => {
    if (blackOf(m + 1) && m + 1 < startC + 24) blacks.push({ m: m + 1, x: (i + 1) * W - 8 });
  });
  return (
    <svg
      viewBox={`0 0 ${whites.length * W} ${H}`}
      className="h-24 w-full max-w-md"
      role="img"
      aria-label="A keyboard with one key highlighted"
      data-testid="key-highlight"
    >
      {whites.map((m, i) => (
        <rect
          key={m}
          x={i * W + 0.5}
          y={0.5}
          width={W - 1}
          height={H - 1}
          rx={3}
          className={m === highlight ? "fill-accent stroke-accent" : "fill-surface stroke-border"}
        />
      ))}
      {blacks.map((b) => (
        <rect
          key={b.m}
          x={b.x}
          y={0.5}
          width={16}
          height={H * 0.6}
          rx={2}
          className={b.m === highlight ? "fill-accent stroke-accent" : "fill-text stroke-text"}
        />
      ))}
    </svg>
  );
}
