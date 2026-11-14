// The source's roll and staff, shown only once the item is solved or the learner asked to see it (contracts
// §6.12: the hidden code never reaches the page; its events do, and only now are they drawn). A small roll of
// its own (drum lanes or pitch rows) and the staff through @oak/notation.
import type { KeySpec, MeterId, NEvent, Rat } from "@oak/content-kit";
import { R } from "@oak/content-kit";
import { METERS } from "@oak/theory";
import { useEffect, useRef, useState } from "react";

const ROW = 6;
const LANE = 18;
/** Drawn about 1:1 in the side panel, so labels stay readable. */
const W = 300;
const GUTTER = 44;

export function ReferenceRoll({ events, bars }: { events: readonly NEvent[]; bars: number }) {
  const pitched = events.filter((e) => e.midi !== null);
  const drums = events.filter((e) => e.midi === null);
  const lanes = [...new Set(drums.map((e) => e.drum ?? e.s ?? "drum"))];
  const lo = pitched.length ? Math.min(...pitched.map((e) => e.midi as number)) : 60;
  const hi = pitched.length ? Math.max(...pitched.map((e) => e.midi as number)) : 60;
  const rows = pitched.length ? hi - lo + 1 : 0;
  const top = rows ? rows * ROW + 8 : 0;
  const height = top + lanes.length * LANE + 4;
  const left = lanes.length ? GUTTER : 4;
  const x = (r: Rat) => left + (R.toNum(r) / bars) * (W - left - 4);
  const len = (r: Rat) => (R.toNum(r) / bars) * (W - left - 4);
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      className="h-auto w-full rounded-control bg-surface-2"
      role="img"
      aria-label={`The source: ${pitched.length} notes and ${drums.length} drum hits over ${bars} bars`}
      data-testid="reference-roll"
    >
      {Array.from({ length: bars + 1 }, (_, b) => (
        <line
          key={b}
          x1={x([b, 1])}
          x2={x([b, 1])}
          y1={0}
          y2={height}
          className="stroke-text-3"
          strokeWidth={0.5}
        />
      ))}
      {pitched.map((e) => (
        <rect
          key={e.id}
          x={x(e.onset) + 0.5}
          y={4 + (hi - (e.midi as number)) * ROW}
          width={Math.max(2, len(e.clipDur ?? e.dur) - 1)}
          height={ROW - 1}
          rx={1.5}
          className="fill-accent"
        />
      ))}
      {drums.map((e) => {
        const lane = lanes.indexOf(e.drum ?? e.s ?? "drum");
        return (
          <circle
            key={e.id}
            cx={x(e.onset) + 3}
            cy={top + LANE / 2 + lane * LANE}
            r={3}
            className="fill-text"
          />
        );
      })}
      {lanes.map((l, i) => (
        <text key={l} x={4} y={top + LANE / 2 + 4 + i * LANE} className="fill-text-2 text-[10px]">
          {l.replace(/(?<=[a-z])[A-Z].*$/, "").slice(0, 7)}
        </text>
      ))}
    </svg>
  );
}

export function ReferenceStaff({
  events,
  bars,
  meter,
  keySpec,
  swing = false,
}: {
  events: readonly NEvent[];
  bars: number;
  meter: MeterId;
  keySpec: KeySpec | null;
  /**
   * The source swings its eighths: the staff prints them straight under "Swing 8ths", as the Workbench does (d5;
   * contracts §6.10), through @oak/notation's shared `staffHostInput`.
   */
  swing?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let live = true;
    (async () => {
      const [{ notate, staffHostInput }, { renderStaff }] = await Promise.all([
        import("@oak/notation"),
        import("@oak/notation/render"),
      ]);
      const pitched = events.filter((e) => e.midi !== null);
      const drumsOnly = pitched.length === 0;
      const lowTracks = new Set(pitched.filter((e) => (e.midi as number) < 55).map((e) => e.track));
      const highTracks = new Set(pitched.filter((e) => (e.midi as number) >= 55).map((e) => e.track));
      const grand = lowTracks.size > 0 && highTracks.size > 0;
      const { abc } = notate(
        staffHostInput(
          {
            events: [...(drumsOnly ? events : pitched)],
            meter: METERS[meter],
            key: keySpec,
            bars,
            staff: drumsOnly ? "percussion" : grand ? "grand" : "auto",
          },
          { swing: swing ? { subdivision: 8, amount: 1 / 3 } : null },
        ),
      );
      if (!live) return;
      await renderStaff(el, abc.abc, { params: { responsive: "resize" } as never });
    })().catch(() => {
      if (live) setFailed(true);
    });
    return () => {
      live = false;
    };
  }, [events, bars, meter, keySpec, swing]);
  return failed ? (
    <p className="text-sm text-text-2">The staff could not be drawn for this item.</p>
  ) : (
    <div ref={host} className="oak-staff overflow-x-auto" data-testid="reference-staff" />
  );
}
