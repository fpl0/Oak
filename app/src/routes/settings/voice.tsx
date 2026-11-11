// Settings › Voice (ux §2.3, §4.7; contracts §8.2, §8.5, §8.6): the mic and Quiet mode, the singing range, the
// tolerance ladder, timing, and the last calibration results. Each measurement re-runs on its own through
// /settings/voice/setup?part=… (the same screens as onboarding).
import type { CalibrationRecord, Profile } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { formatNoteMidi } from "../../lib/notes.ts";
import { useCalibrations, useProfile } from "../../lib/queries.ts";
import { useUpdateProfile } from "../../lib/settings.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Field, ReadOnlyRow, Section, Select, Switch } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { calibrationLine, inputLabel } from "../../voice/history.ts";
import { ladderSummary } from "../../voice/logic.ts";

export const Route = createFileRoute("/settings/voice")({ component: VoiceSettings });

type Tol = "auto" | 70 | 50 | 35 | 25;

function History() {
  const runs = useCalibrations();
  if (runs.isPending) return <p className="py-3 text-sm text-text-3">Loading results…</p>;
  // The history endpoint may not exist on an older server: the profile above still holds every value.
  if (runs.isError) return <p className="py-3 text-sm text-text-3">No result history on this server yet.</p>;
  const items: CalibrationRecord[] = runs.data.items.slice(0, 8);
  if (items.length === 0)
    return (
      <p className="py-3 text-sm text-text-3">Nothing measured yet. Set up the mic to see results here.</p>
    );
  return (
    <ul className="flex flex-col" data-testid="calibration-history">
      {items.map((r) => (
        <li key={r.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[14rem_1fr]">
          <span className="text-text-3">{formatDate(r.at)}</span>
          <span>{calibrationLine(r)}</span>
        </li>
      ))}
    </ul>
  );
}

function VoiceSettings() {
  usePageTitle("Settings · Voice");
  const profile = useProfile();
  const update = useUpdateProfile();
  return (
    <QueryView query={profile}>
      {(p: Profile) => {
        const tol: Tol = p.singTolMode === "auto" ? "auto" : p.singToleranceCents;
        const ladder = ladderSummary(p);
        return (
          <div className="flex flex-col gap-6">
            <Section
              title="Microphone"
              description="Your voice is analysed live on this computer. Nothing is recorded or sent."
            >
              <ReadOnlyRow label="Input" value={inputLabel(p)} />
              <ReadOnlyRow
                label="Noise floor"
                value={p.noiseFloorDb === null ? "not measured" : `${Math.round(p.noiseFloorDb)} dBFS`}
              />
              <Field
                label="Quiet mode"
                help="No singing today: singing steps become listening steps. Nothing is locked or lost."
              >
                {({ id, describedBy }) => (
                  <Switch
                    id={id}
                    describedBy={describedBy}
                    checked={p.quiet}
                    onChange={(on) => update.set({ quiet: on })}
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-2 py-3">
                <Link to="/settings/voice/setup" className={buttonClass("primary")} data-testid="voice-setup">
                  Set up mic and voice
                </Link>
                <Link
                  to="/settings/voice/setup"
                  search={{ part: "mic" }}
                  className={buttonClass("secondary")}
                >
                  Re-check the mic
                </Link>
              </div>
            </Section>
            <Section
              title="Your voice"
              description="Oak moves sung notes into this zone. There are no voice types."
            >
              <ReadOnlyRow
                label="Range"
                value={
                  p.vocalLowMidi !== null && p.vocalHighMidi !== null
                    ? `${formatNoteMidi(p.vocalLowMidi)} – ${formatNoteMidi(p.vocalHighMidi)}`
                    : "not measured"
                }
              />
              <ReadOnlyRow
                label="Comfort zone"
                value={
                  p.comfortLowMidi !== null && p.comfortHighMidi !== null
                    ? `${formatNoteMidi(p.comfortLowMidi)} – ${formatNoteMidi(p.comfortHighMidi)}`
                    : "not measured"
                }
              />
              <div className="py-3">
                <Link
                  to="/settings/voice/setup"
                  search={{ part: "range" }}
                  className={buttonClass("secondary")}
                  data-testid="rerun-range"
                >
                  Measure the range again
                </Link>
              </div>
            </Section>
            <Section
              title="Pitch tolerance"
              description="How close a sung note must be to count. It tightens as your aim gets finer and never loosens by itself."
            >
              <ReadOnlyRow label="Now" value={<span data-testid="ladder-now">{ladder.current}</span>} />
              <ReadOnlyRow label="Next step" value={ladder.next} />
              <Field label="Tolerance" help="Auto follows your singing; a fixed value stays put.">
                {({ id, describedBy }) => (
                  <Select<Tol>
                    id={id}
                    describedBy={describedBy}
                    value={tol}
                    options={[
                      { value: "auto", label: "Auto" },
                      { value: 70, label: "±70¢" },
                      { value: 50, label: "±50¢" },
                      { value: 35, label: "±35¢" },
                      { value: 25, label: "±25¢" },
                    ]}
                    onChange={(v) =>
                      update.set(
                        v === "auto"
                          ? { singTolMode: "auto" }
                          : { singTolMode: "fixed", singToleranceCents: v },
                      )
                    }
                  />
                )}
              </Field>
              <Field label="Syllables" help="Sing on do re mi instead of numbers (from U03.L08).">
                {({ id, describedBy }) => (
                  <Switch
                    id={id}
                    describedBy={describedBy}
                    checked={p.solfege === "syllables"}
                    onChange={(on) => update.set({ solfege: on ? "syllables" : "numbers" })}
                  />
                )}
              </Field>
            </Section>
            <Section
              title="Timing"
              description="Measured with your current headphones; re-run it when they change."
            >
              <ReadOnlyRow
                label="Tap latency"
                value={
                  p.tapLatencyMs === null
                    ? "not measured"
                    : `${Math.round(p.tapLatencyMs)} ms${p.tapJitterMs === null ? "" : ` (±${Math.round(p.tapJitterMs)} ms)`}`
                }
              />
              <ReadOnlyRow
                label="Sing latency"
                value={p.singLatencyMs === null ? "not measured" : `${Math.round(p.singLatencyMs)} ms`}
              />
              <div className="py-3">
                <Link
                  to="/settings/voice/setup"
                  search={{ part: "latency" }}
                  className={buttonClass("secondary")}
                  data-testid="rerun-latency"
                >
                  Measure timing again
                </Link>
              </div>
            </Section>
            <Section title="Recent results">
              <History />
            </Section>
          </div>
        );
      }}
    </QueryView>
  );
}
