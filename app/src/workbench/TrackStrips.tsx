// The advanced tracks' strips under the roll and on the spectrum panel (docs/design/wave7.md §4.2): the clave on its
// two-bar grid, the pulse lanes of a polyrhythm or a polymeter, the density of each section, the chord-scales,
// voicings, substitutions and ii–V brackets under the chord band, and the register bands beside the spectrum. Each is
// DOM or SVG on the roll's own time axis (`RibbonAxis`), so its words are text a screen reader and a test can read;
// the facts come from track-lens.ts.

import type { RibbonAxis } from "./SectionRibbon.tsx";
import type {
  ClaveLens,
  DensitySpan,
  PolyLanes,
  RegionJazz,
  RegisterLens,
  TwoFiveBracket,
} from "./track-lens.ts";
import { hzOf } from "./track-lens.ts";

const LANE_H = 14;

/** The clave's two-bar grid: sixteen eighths, its strokes filled, the 3 side and the 2 side named per bar. */
export function ClaveStrip({ clave, axis }: { clave: ClaveLens; axis: RibbonAxis }) {
  const bars: number[] = [];
  for (let b = Math.floor(axis.from); b < Math.ceil(axis.to); b++) bars.push(b);
  const strokes = new Set(clave.steps);
  const height = 26;
  return (
    <div
      className="oak-track-strip oak-clave-strip"
      data-testid="clave-strip"
      data-clave={`${clave.type} ${clave.direction}`}
    >
      <span className="oak-track-strip-gutter" style={{ width: axis.left }} aria-hidden>
        Clave
      </span>
      <svg
        width={axis.width}
        height={height}
        role="img"
        aria-label={`${clave.text}: the strokes of the clave on its two-bar grid`}
        className="oak-track-strip-svg"
      >
        {bars.map((b) => {
          const inWindow = b % 2;
          const side = clave.direction === "3-2" ? (inWindow === 0 ? "3" : "2") : inWindow === 0 ? "2" : "3";
          const x0 = axis.xOf(b);
          const x1 = axis.xOf(b + 1);
          const w = (x1 - x0) / 8;
          const window = clave.windows.find((x) => x.bar - 1 === b - inWindow);
          return (
            <g key={b} data-bar={b + 1} data-side={side} opacity={window && !window.holds ? 0.45 : 1}>
              <text x={x0 + 3} y={10} className="oak-track-strip-label">
                {side}-side
              </text>
              {Array.from({ length: 8 }, (_, i) => {
                const step = inWindow * 8 + i;
                const on = strokes.has(step);
                const cx = x0 + (i + 0.5) * w;
                return (
                  <circle
                    key={i}
                    cx={cx}
                    cy={18}
                    r={on ? 4 : 1.5}
                    className={on ? "oak-clave-stroke" : "oak-clave-dot"}
                    data-stroke={on ? "1" : undefined}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** One lane per pulse (a polyrhythm), or the cycle of a polymeter against the bar, with where they meet. */
export function PulseLanes({ poly, axis }: { poly: PolyLanes; axis: RibbonAxis }) {
  const visible = (x: number) => x >= axis.from - 1e-9 && x <= axis.to + 1e-9;
  if (poly.kind === "polymeter") {
    const height = LANE_H * 2 + 4;
    return (
      <div className="oak-track-strip oak-pulse-lanes" data-testid="pulse-lanes" data-kind="polymeter">
        <span className="oak-track-strip-gutter" style={{ width: axis.left }} aria-hidden>
          Cycle
        </span>
        <svg
          width={axis.width}
          height={height}
          role="img"
          aria-label={poly.text}
          className="oak-track-strip-svg"
        >
          <text x={axis.left + 3} y={10} className="oak-track-strip-label">
            {poly.length} steps
          </text>
          {poly.starts.filter(visible).map((x) => (
            <rect
              key={x}
              x={axis.xOf(x) - 1}
              y={2}
              width={3}
              height={LANE_H - 2}
              className={Math.abs(x - Math.round(x)) < 1e-9 ? "oak-pulse-meet" : "oak-pulse-tick"}
              data-at={x.toFixed(3)}
            />
          ))}
          <text x={axis.left + 3} y={LANE_H + 12} className="oak-track-strip-label">
            bar
          </text>
          {Array.from(
            { length: Math.ceil(axis.to) - Math.floor(axis.from) + 1 },
            (_, i) => Math.floor(axis.from) + i,
          )
            .filter(visible)
            .map((b) => (
              <rect
                key={b}
                x={axis.xOf(b) - 1}
                y={LANE_H + 4}
                width={3}
                height={LANE_H - 2}
                className="oak-pulse-bar"
              />
            ))}
        </svg>
        <p className="oak-track-strip-caption" data-testid="pulse-caption">
          {poly.text}
        </p>
      </div>
    );
  }
  const lanes = [poly.a, poly.b];
  const height = lanes.length * LANE_H + 4;
  return (
    <div className="oak-track-strip oak-pulse-lanes" data-testid="pulse-lanes" data-kind="polyrhythm">
      <span className="oak-track-strip-gutter" style={{ width: axis.left }} aria-hidden>
        Pulses
      </span>
      <svg
        width={axis.width}
        height={height}
        role="img"
        aria-label={poly.text}
        className="oak-track-strip-svg"
      >
        {lanes.map((lane, li) => (
          <g key={lane.part} data-lane={lane.part} data-pulses={lane.pulses}>
            <text x={axis.left + 3} y={li * LANE_H + 10} className="oak-track-strip-label">
              {lane.pulses}
            </text>
            {lane.onsets.filter(visible).map((x) => (
              <rect
                key={x}
                x={axis.xOf(x) - 1.5}
                y={li * LANE_H + 2}
                width={4}
                height={LANE_H - 3}
                className={
                  poly.together.some((t) => Math.abs(t - x) < 1e-9) ? "oak-pulse-meet" : "oak-pulse-tick"
                }
              />
            ))}
          </g>
        ))}
      </svg>
      <p className="oak-track-strip-caption" data-testid="pulse-caption">
        {poly.text}
      </p>
    </div>
  );
}

/** Density per section: a bar as tall as the section is busy, its numbers in words. */
export function DensityStrip({ spans, axis }: { spans: readonly DensitySpan[]; axis: RibbonAxis }) {
  const height = 30;
  const visible = spans.filter((s) => s.to > axis.from + 1e-9 && s.from < axis.to - 1e-9);
  return (
    <div className="oak-track-strip oak-density-strip" data-testid="density-strip">
      <span className="oak-track-strip-gutter" style={{ width: axis.left }} aria-hidden>
        Density
      </span>
      <ul
        className="oak-density-list"
        style={{ width: axis.width, height }}
        aria-label="Density of each section"
      >
        {visible.map((s) => {
          const left = Math.max(axis.left, axis.xOf(s.from));
          const right = Math.min(axis.width, axis.xOf(s.to));
          return (
            <li
              key={s.from}
              className="oak-density-span"
              style={{ left, width: Math.max(2, right - left - 2) }}
              title={s.text}
              aria-label={s.text}
              data-level={s.level.toFixed(2)}
              data-onsets={s.onsetsPerBar.toFixed(1)}
            >
              <span
                className="oak-density-fill"
                style={{ height: `${Math.round(8 + s.level * 92)}%` }}
                aria-hidden
              />
              <span className="oak-density-text">
                {s.onsetsPerBar.toFixed(1)}/bar · {s.parts} part{s.parts === 1 ? "" : "s"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface JazzRowProps {
  regions: readonly { from: number; to: number }[];
  jazz: readonly RegionJazz[];
  show: { voicings: boolean; scales: boolean };
  /** Substitutions the learner has been taught ("tritone sub", "backdoor", "passing °7"). */
  subs: ReadonlySet<string>;
  twoFives: readonly TwoFiveBracket[] | null;
  axis: RibbonAxis;
}

/** Under the chord band: ii–V brackets, then each chord's voicing, chord-scale ("a common choice") and substitution. */
export function JazzRow(p: JazzRowProps) {
  const visible = (from: number, to: number) => to > p.axis.from + 1e-9 && from < p.axis.to - 1e-9;
  const cells = p.regions
    .map((r, i) => ({ r, j: p.jazz[i] }))
    .filter((x) => x.j && visible(x.r.from, x.r.to))
    .map(({ r, j }) => {
      const jj = j as RegionJazz;
      // The voicing's own label sits over the chord on the roll; the row names the scale and the substitution.
      const parts = [p.show.scales ? jj.scale : null, jj.sub && p.subs.has(jj.sub) ? jj.sub : null].filter(
        (x): x is string => !!x,
      );
      return { r, j: jj, parts };
    });
  const brackets = (p.twoFives ?? []).filter((b) => visible(b.from, b.to));
  if (cells.every((c) => c.parts.length === 0) && brackets.length === 0) return null;
  return (
    <div className="oak-jazz-row" data-testid="jazz-row" style={{ width: p.axis.width }}>
      {brackets.length > 0 ? (
        <ul className="oak-two-fives" aria-label="ii–V pairs" style={{ width: p.axis.width }}>
          {brackets.map((b) => {
            const left = Math.max(p.axis.left, p.axis.xOf(b.from));
            const right = Math.min(p.axis.width, p.axis.xOf(b.to));
            return (
              <li
                key={b.from}
                className="oak-two-five"
                style={{ left, width: Math.max(2, right - left - 2) }}
                data-resolves={b.resolved ? "1" : "0"}
                title={`${b.text}${b.resolved ? ", and it arrives" : "; the chord after the V goes elsewhere"}`}
              >
                {b.text}
              </li>
            );
          })}
        </ul>
      ) : null}
      {cells.some((c) => c.parts.length > 0) ? (
        <ul className="oak-jazz-cells" aria-label="Voicings and chord-scales" style={{ width: p.axis.width }}>
          {cells.map(({ r, j, parts }) => {
            if (parts.length === 0) return null;
            const left = Math.max(p.axis.left, p.axis.xOf(r.from));
            const right = Math.min(p.axis.width, p.axis.xOf(r.to));
            const said = [
              p.show.voicings && j.voicing ? `voicing: ${j.voicing}` : null,
              p.show.scales && j.scale ? `${j.scale}, a common choice of scale` : null,
              j.sub && p.subs.has(j.sub) ? j.subWords : null,
            ]
              .filter(Boolean)
              .join("; ");
            return (
              <li
                key={r.from}
                className={`oak-jazz-cell${j.sub && p.subs.has(j.sub) ? " oak-jazz-cell--sub" : ""}`}
                style={{ left, width: Math.max(2, right - left - 2) }}
                title={said}
                aria-label={`${j.jazz}: ${said}`}
                data-voicing={p.show.voicings && j.voicing ? j.voicing : undefined}
                data-scale={p.show.scales && j.scale ? j.scale : undefined}
                data-sub={j.sub && p.subs.has(j.sub) ? j.sub : undefined}
              >
                {parts.join(" · ")}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

const MIN_HZ = 30;
const MAX_HZ = 16_000;
/** x (0–1) of a frequency on the spectrum's log axis (`spectrumBands`: 30 Hz … 16 kHz). */
export const specX = (hz: number): number =>
  Math.max(0, Math.min(1, Math.log(hz / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ)));

const NOTE = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const noteName = (m: number) => `${NOTE[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;

/**
 * The register bands on the spectrum's own frequency axis (`REGISTER_ROLES`), each part's range (its fundamentals)
 * under them, and the notes that sound together below their low-interval limit.
 */
export function RegisterBands({ registers }: { registers: RegisterLens }) {
  const rows = registers.parts.length;
  const roleH = 30;
  const partH = 16;
  const axisH = 14;
  const height = roleH + rows * partH + axisH;
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  const ticks = [100, 1000, 10_000];
  return (
    <div className="oak-register-bands" data-testid="register-bands" data-clashes={registers.clashes.length}>
      <p className="oak-register-title">
        <b>Registers</b> <span>where each part's notes sit, on the spectrum's axis</span>
      </p>
      <svg
        width="100%"
        height={height}
        role="img"
        aria-label={`The register bands, and each part's range: ${registers.parts
          .map((p) => `${p.track} ${noteName(p.low)} to ${noteName(p.high)}`)
          .join(", ")}`}
      >
        {registers.roles.map((r, i) => {
          const x0 = specX(hzOf(r.low));
          const x1 = specX(hzOf(r.high));
          const y = i % 2 === 0 ? 1 : 15;
          return (
            <g key={r.role} data-role={r.role}>
              <rect
                x={pct(x0)}
                y={y}
                width={pct(x1 - x0)}
                height={13}
                rx={2}
                className={`oak-register-role oak-register-role--${i}`}
              >
                <title>{`${r.role}: ${r.text} (${noteName(r.low)}–${noteName(r.high)})`}</title>
              </rect>
              <text x={pct(x0)} dx={3} y={y + 10} className="oak-register-role-label">
                {r.role}
              </text>
            </g>
          );
        })}
        {registers.parts.map((p, i) => {
          const x0 = specX(hzOf(p.low));
          const x1 = specX(hzOf(p.high));
          const y = roleH + i * partH;
          return (
            <g key={p.track} data-part={p.track}>
              <rect
                x={pct(x0)}
                y={y + 3}
                width={pct(Math.max(0.004, x1 - x0))}
                height={9}
                rx={3}
                className="oak-register-part"
              />
              <text x={pct(x1)} dx={5} y={y + 11} className="oak-register-part-label">
                {p.track}
              </text>
            </g>
          );
        })}
        {ticks.map((hz) => (
          <g key={hz}>
            <line
              x1={pct(specX(hz))}
              x2={pct(specX(hz))}
              y1={roleH - 2}
              y2={height - axisH + 2}
              className="oak-register-tick"
            />
            <text x={pct(specX(hz))} dx={2} y={height - 2} className="oak-register-axis">
              {hz >= 1000 ? `${hz / 1000} kHz` : `${hz} Hz`}
            </text>
          </g>
        ))}
      </svg>
      <ul className="oak-register-legend">
        {registers.parts.map((p) => (
          <li key={p.track} data-part={p.track}>
            <b>{p.track}</b> {noteName(p.low)}–{noteName(p.high)}
          </li>
        ))}
      </ul>
      <p className="oak-register-note" data-testid="register-clashes">
        {registers.clashes.length === 0
          ? "No close intervals low down: every part has room."
          : `${registers.clashes.length === 1 ? "One pair" : `${registers.clashes.length} pairs`} of notes sit close together low down and may blur: ${registers.clashes
              .slice(0, 3)
              .map((c) => `${noteName(c.low)} with ${noteName(c.high)} (bar ${c.bar})`)
              .join(", ")}${registers.clashes.length > 3 ? " …" : ""}.`}
      </p>
    </div>
  );
}
