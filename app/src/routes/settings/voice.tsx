import type { Profile } from "@oak/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { formatNoteMidi } from "../../lib/notes.ts";
import { useProfile } from "../../lib/queries.ts";
import { useUpdateProfile } from "../../lib/settings.ts";
import { buttonClass } from "../../ui/kit/Button.tsx";
import { Field, ReadOnlyRow, Section, Select, Switch } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";

export const Route = createFileRoute("/settings/voice")({ component: VoiceSettings });

type Tol = "auto" | 70 | 50 | 35 | 25;

function VoiceSettings() {
  usePageTitle("Settings · Voice");
  const profile = useProfile();
  const update = useUpdateProfile();
  return (
    <QueryView query={profile}>
      {(p: Profile) => {
        const tol: Tol = p.singTolMode === "auto" ? "auto" : p.singToleranceCents;
        return (
          <div className="flex flex-col gap-6">
            <Section
              title="Microphone"
              description="Your voice is analysed live on this computer. Nothing is recorded or sent."
            >
              <ReadOnlyRow label="Input" value={p.inputKind === "none" ? "No microphone" : p.inputKind} />
              <ReadOnlyRow
                label="Noise floor"
                value={p.noiseFloorDb === null ? "not measured" : `${Math.round(p.noiseFloorDb)} dBFS`}
              />
              <div className="py-3">
                <Link to="/settings/voice/setup" className={buttonClass("primary")}>
                  Set up mic and voice
                </Link>
              </div>
            </Section>
            <Section title="Your voice">
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
              <Field label="Pitch tolerance" help="Auto tightens as your aim gets finer.">
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
              <Field label="Quiet mode" help="No singing today. Singing steps become listening steps.">
                {({ id, describedBy }) => (
                  <Switch
                    id={id}
                    describedBy={describedBy}
                    checked={p.quiet}
                    onChange={(on) => update.set({ quiet: on })}
                  />
                )}
              </Field>
            </Section>
          </div>
        );
      }}
    </QueryView>
  );
}
