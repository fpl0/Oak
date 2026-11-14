// The Wave 6 rows of the key panel and the circle of fifths: the modes on the piece's tonic (U14), the chords the
// parallel key lends (U16) and the lift by a step (U17.L02). Each row is there only once its lesson is behind the
// learner (key-extras.ts); each can be heard in place, the code untouched.
import type { KeySpec } from "@oak/content-kit";
import { keyDisplay } from "@oak/theory";
import { type Lending, lending, type ModeRow, modeRows } from "./key-extras.ts";
import { sameKey } from "./key-tools.ts";
import type { KeyPreview } from "./use-key-preview.ts";

/** What the panels need to know about the learner to offer the Wave 6 rows. */
export interface KeyExtras {
  /** The unlocked set (`null`: no gating, e.g. the standalone page). */
  unlocked: ReadonlySet<string> | null;
  /** Whether a lesson is behind the learner (or is the one being taken). */
  taught(lesson: string): boolean;
  /** Plays a chord (MIDI notes, low to high). */
  onChord?(midis: readonly number[]): void;
}

/** The lesson that teaches the lift by a step: "Truck-Driver & Direct Modulation". */
export const LIFT_LESSON = "U17.L02";

export function ModeList({
  current,
  extras,
  preview,
}: {
  current: KeySpec;
  extras: KeyExtras;
  preview: KeyPreview | null;
}) {
  const rows: ModeRow[] = modeRows(current, extras.unlocked);
  if (rows.length < 2) return null;
  return (
    <div className="oak-key-extra" data-testid="key-modes">
      <h4 className="oak-key-extra-title">
        Modes on {keyDisplay({ tonic: current.tonic, mode: "major" }).split(" ")[0]}
      </h4>
      <ul className="oak-mode-list" aria-label="Modes on this tonic, brightest first">
        {rows.map((r) => {
          const on = preview?.playing ? sameKey(preview.playing, r.key) : false;
          const can = preview?.movable === true && !r.here;
          return (
            <li key={r.mode} data-mode={r.mode} data-here={r.here ? "1" : undefined}>
              {can && preview ? (
                <button
                  type="button"
                  className="oak-link-button"
                  aria-pressed={on ? true : undefined}
                  onClick={() => (on ? preview.stop() : preview.preview(r.key))}
                  title={on ? "Stop" : `Hear this code in ${r.name}`}
                >
                  {r.name}
                  {preview.pending && sameKey(preview.pending, r.key) ? " …" : on ? " ■" : " ▶"}
                </button>
              ) : (
                <strong>{r.name}</strong>
              )}
              {r.colour ? (
                <span className="oak-mode-colour" title={`Its colour note is ${r.tone}`}>
                  {r.colour} <span className="oak-muted">{r.tone}</span>
                </span>
              ) : null}
              {r.here ? <span className="oak-muted"> · this piece</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LentChords({ current, extras }: { current: KeySpec; extras: KeyExtras }) {
  const lend: Lending | null = lending(current, extras.taught);
  if (!lend) return null;
  return (
    <div className="oak-key-extra" data-testid="key-borrowed" data-from={keyDisplay(lend.from)}>
      <h4 className="oak-key-extra-title">{lend.title}</h4>
      <ul className="oak-lent-list" aria-label={`Borrowed chords: ${lend.title}`}>
        {lend.chords.map((c) => (
          <li key={c.rn} data-rn={c.rn}>
            {extras.onChord ? (
              <button
                type="button"
                className="oak-toggle oak-toggle--small"
                onClick={() => extras.onChord?.(c.midis)}
                title={`Hear ${c.symbol} (${c.lowered})`}
              >
                <b>{c.symbol}</b> <span className="oak-lent-rn">{c.rn}</span>
              </button>
            ) : (
              <span>
                <b>{c.symbol}</b> <span className="oak-lent-rn">{c.rn}</span>
              </span>
            )}
            <span className="oak-muted oak-lent-how">{c.lowered}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LiftRow({ current, preview }: { current: KeySpec; preview: KeyPreview | null }) {
  if (!preview) return null;
  const steps: { semitones: 1 | 2; label: string }[] = [
    { semitones: 1, label: "a half step" },
    { semitones: 2, label: "a whole step" },
  ];
  return (
    <div className="oak-key-extra" data-testid="key-lift">
      <h4 className="oak-key-extra-title">Lift by a step</h4>
      {preview.liftWhy ? (
        <p className="oak-muted">{preview.liftWhy}</p>
      ) : (
        <>
          <p className="oak-key-lift-buttons">
            {steps.map((s) => {
              const on = preview.lifting === s.semitones;
              return (
                <button
                  key={s.semitones}
                  type="button"
                  className="oak-toggle oak-toggle--small"
                  aria-pressed={on}
                  onClick={() => (on ? preview.stop() : preview.lift(s.semitones))}
                  title={
                    on
                      ? "Stop"
                      : `Hear this code in ${keyDisplay(current)}, then the same again ${s.label} higher`
                  }
                  data-testid={`lift-${s.semitones}`}
                >
                  Up {s.label}
                  {preview.liftPending === s.semitones ? " …" : on ? " ■" : " ▶"}
                </button>
              );
            })}
          </p>
          <p className="oak-muted" aria-live="polite" data-testid="lift-status">
            {preview.lifting && preview.liftPlan ? (
              <>
                Once as written, then lifted. In code: <code>.scale("{preview.liftPlan}")</code>
              </>
            ) : (
              "The same music again, a step higher: your code stays as it is."
            )}
          </p>
        </>
      )}
    </div>
  );
}
