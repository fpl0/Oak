import { FLAVOUR_IDS, type Profile, type Settings } from "@oak/api";
import { createFileRoute } from "@tanstack/react-router";
import { FLAVOUR_LABEL } from "../../lib/format.ts";
import { usePageTitle } from "../../lib/nav.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { useUpdateProfile, useUpdateSetting } from "../../lib/settings.ts";
import { Field, Section, Select, Switch } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { TrackSettings } from "./-tracks/TrackSettings.tsx";

export const Route = createFileRoute("/settings/learning")({ component: LearningSettings });

function LearningSettings() {
  usePageTitle("Settings · Learning");
  const bootstrap = useBootstrap();
  const profile = useUpdateProfile();
  const setting = useUpdateSetting();
  return (
    <QueryView query={bootstrap}>
      {({ profile: p, settings: s }) => (
        <div className="flex flex-col gap-6">
          <Section title="Your sessions">
            <Field label="Daily target" help="Sessions scale to fit; 20 minutes is the default.">
              {({ id, describedBy }) => (
                <Select<Profile["targetMinutes"]>
                  id={id}
                  describedBy={describedBy}
                  value={p.targetMinutes}
                  options={[
                    { value: 15, label: "15 min" },
                    { value: 20, label: "20 min" },
                    { value: 25, label: "25 min" },
                  ]}
                  onChange={(targetMinutes) => profile.set({ targetMinutes })}
                />
              )}
            </Field>
            <Field label="Weekly goal" help="Days a week that keep the streak going.">
              {({ id, describedBy }) => (
                <Select<number>
                  id={id}
                  describedBy={describedBy}
                  value={p.weeklyGoal}
                  options={[3, 4, 5, 6, 7].map((v) => ({ value: v, label: `${v} days` }))}
                  onChange={(weeklyGoal) => profile.set({ weeklyGoal })}
                />
              )}
            </Field>
            <Field label="Genre flavour" help="Drums, bass and chords in your capstones follow it.">
              {({ id, describedBy }) => (
                <Select<Profile["flavour"]>
                  id={id}
                  describedBy={describedBy}
                  value={p.flavour}
                  options={FLAVOUR_IDS.map((f) => ({ value: f, label: FLAVOUR_LABEL[f] ?? f }))}
                  onChange={(flavour) => profile.set({ flavour })}
                />
              )}
            </Field>
          </Section>
          <Section title="Display">
            <Field label="Roll labels">
              {({ id, describedBy }) => (
                <Select<Settings["rollLabels"]>
                  id={id}
                  describedBy={describedBy}
                  value={s.rollLabels}
                  options={[
                    { value: "auto", label: "Auto (fade with mastery)" },
                    { value: "degree", label: "Degrees" },
                    { value: "degree+solfege", label: "Degrees and syllables" },
                    { value: "note", label: "Note names" },
                  ]}
                  onChange={(v) => setting.set("rollLabels", v)}
                />
              )}
            </Field>
            <Field label="Next-lesson teaser" help="A short preview at the end of each session.">
              {({ id, describedBy }) => (
                <Switch
                  id={id}
                  describedBy={describedBy}
                  checked={s.teaserOptIn}
                  onChange={(v) => setting.set("teaserOptIn", v)}
                />
              )}
            </Field>
            <Field label="Claude's liner notes on the album" help="You can still choose per track.">
              {({ id, describedBy }) => (
                <Switch
                  id={id}
                  describedBy={describedBy}
                  checked={s.linerNotesInAlbum}
                  onChange={(v) => setting.set("linerNotesInAlbum", v)}
                />
              )}
            </Field>
          </Section>
          <TrackSettings />
        </div>
      )}
    </QueryView>
  );
}
