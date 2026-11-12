// Settings › Voice (ux §2.3, §4.7; contracts §8.2, §8.5, §8.6): the mic and Quiet mode, the singing range and the
// pitch match, the tolerance ladder (where it is, why, how it moves — never as a score), the singing labels,
// timing, and the last calibration results. Each measurement re-runs on its own through
// /settings/voice/setup?part=… (the same screens as onboarding). Quiet mode and the ladder are the server's
// (`GET /voice`), with the profile as the fallback while that endpoint is not built.
import type { CalibrationRecord, Profile } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDate } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { formatNoteMidi } from "../../lib/notes.ts";
import { useCalibrations, useProfile } from "../../lib/queries.ts";
import { useUpdateProfile } from "../../lib/settings.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Callout } from "../../ui/kit/Controls.tsx";
import { Field, ReadOnlyRow, Section, Switch } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { calibrationLine, inputLabel, lastMatch } from "../../voice/history.ts";
import { outputChoiceOf, outputGuidance } from "../../voice/logic.ts";
import { LadderCard, QuietControl, RecheckHint } from "../../voice/panels.tsx";
import { HIGH_FLOOR_DB } from "../../voice/recheck.ts";
import { useVoice, type Voice } from "../../voice/use-voice.ts";

export const Route = createFileRoute("/settings/voice")({ component: VoiceSettings });

function History({ items }: { items: CalibrationRecord[] | null }) {
  if (items === null)
    return <p className="py-3 text-sm text-text-3">No result history on this server yet.</p>;
  if (items.length === 0)
    return (
      <p className="py-3 text-sm text-text-3">Nothing measured yet. Set up the mic to see results here.</p>
    );
  return (
    <ul className="flex flex-col" data-testid="calibration-history">
      {items.slice(0, 8).map((r) => (
        <li key={r.id} className="grid gap-1 py-2 text-sm sm:grid-cols-[14rem_1fr]">
          <span className="text-text-3">{formatDate(r.at)}</span>
          <span>{calibrationLine(r)}</span>
        </li>
      ))}
    </ul>
  );
}

function VoicePage({ p, voice }: { p: Profile; voice: Voice }) {
  const update = useUpdateProfile();
  const runs = useCalibrations();
  const items = runs.isSuccess ? runs.data.items : runs.isError ? null : [];
  const match = items ? lastMatch(items) : null;
  const floorHigh = p.noiseFloorDb !== null && p.noiseFloorDb >= HIGH_FLOOR_DB;
  const bluetooth = p.outputKind === "bluetooth";
  return (
    <div className="flex flex-col gap-6">
      <RecheckHint />
      <Section
        title="Microphone"
        description="Your voice is analysed live on this computer. Nothing is recorded or sent."
      >
        <ReadOnlyRow label="Input" value={inputLabel(p)} />
        <ReadOnlyRow
          label="Noise floor"
          value={
            p.noiseFloorDb === null ? (
              "not measured"
            ) : (
              <span data-testid="noise-floor">
                {Math.round(p.noiseFloorDb)} dBFS
                {floorHigh && (
                  <span className="block text-sm text-text-3">
                    High for singing: Oak may miss a soft voice. A quieter spot and a fresh quiet check help.
                  </span>
                )}
              </span>
            )
          }
        />
        <QuietControl voice={voice} />
        {bluetooth && (
          <div className="py-3">
            <Callout tone="info" title={outputGuidance(outputChoiceOf("bluetooth")).title}>
              {outputGuidance("bluetooth").body}
            </Callout>
          </div>
        )}
        <div className="flex flex-wrap gap-2 py-3">
          <Link to="/settings/voice/setup" className={buttonClass("primary")} data-testid="voice-setup">
            Set up mic and voice
          </Link>
          <Link
            to="/settings/voice/setup"
            search={{ part: "mic" }}
            className={buttonClass("secondary")}
            data-testid="rerun-mic"
          >
            Re-check the mic
          </Link>
          <Link
            to="/settings/voice/setup"
            search={{ part: "noise" }}
            className={buttonClass("secondary")}
            data-testid="rerun-noise"
          >
            Run the quiet check
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
        <ReadOnlyRow
          label="Matching notes"
          value={<span data-testid="match-last">{match ?? "not measured"}</span>}
        />
        <div className="flex flex-wrap gap-2 py-3">
          <Link
            to="/settings/voice/setup"
            search={{ part: "range" }}
            className={buttonClass("secondary")}
            data-testid="rerun-range"
          >
            {p.vocalLowMidi === null ? "Measure the range" : "Measure the range again"}
          </Link>
          <Link
            to="/settings/voice/setup"
            search={{ part: "match" }}
            className={buttonClass("secondary")}
            data-testid="rerun-match"
          >
            Match three notes
          </Link>
        </div>
      </Section>

      <Section
        title="Pitch tolerance"
        description="How close a sung note must be to count. It follows your singing, not the calendar."
      >
        <LadderCard voice={voice} />
        <Field
          label="Sing on syllables"
          help="do re mi instead of numbers. Numbers are always accepted; syllables arrive with U03.L08."
        >
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
            {p.tapLatencyMs === null && p.singLatencyMs === null ? "Measure timing" : "Measure timing again"}
          </Link>
        </div>
      </Section>

      <Section title="Recent results">
        {runs.isPending ? (
          <p className="py-3 text-sm text-text-3">Loading results…</p>
        ) : (
          <History items={items} />
        )}
      </Section>
    </div>
  );
}

function VoiceSettings() {
  usePageTitle("Settings · Voice");
  const profile = useProfile();
  const voice = useVoice();
  return <QueryView query={profile}>{(p: Profile) => <VoicePage p={p} voice={voice} />}</QueryView>;
}
