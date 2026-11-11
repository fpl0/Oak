// Appearance: theme, contrast, scale, motion and highlighting live in the browser (UI preferences); the explicit
// Paper/Bark choice and the editor font size are also saved to the server so a new browser starts the same way.
import { createFileRoute } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { useUpdateSetting } from "../../lib/settings.ts";
import { Field, Section, Select, Slider, Switch } from "../../ui/kit/Field.tsx";
import { type MotionPref, type ThemePref, usePrefs } from "../../ui/theme/prefs.ts";

export const Route = createFileRoute("/settings/appearance")({ component: Appearance });

function Appearance() {
  usePageTitle("Settings · Appearance");
  const prefs = usePrefs();
  const bootstrap = useBootstrap();
  const setting = useUpdateSetting();
  return (
    <div className="flex flex-col gap-6">
      <Section title="Theme">
        <Field label="Theme" help="Paper is light, Bark is dark; System follows your computer.">
          {({ id, describedBy }) => (
            <Select<ThemePref>
              id={id}
              describedBy={describedBy}
              value={prefs.theme}
              options={[
                { value: "system", label: "System" },
                { value: "paper", label: "Paper" },
                { value: "bark", label: "Bark" },
              ]}
              onChange={(theme) => {
                prefs.set({ theme });
                if (theme !== "system" && bootstrap.data) setting.set("theme", theme);
              }}
            />
          )}
        </Field>
        <Field label="High contrast">
          {({ id, describedBy }) => (
            <Switch
              id={id}
              describedBy={describedBy}
              checked={prefs.contrast}
              onChange={(contrast) => prefs.set({ contrast })}
            />
          )}
        </Field>
        <Field label="UI scale">
          {({ id, describedBy }) => (
            <Slider
              id={id}
              describedBy={describedBy}
              value={prefs.uiScale}
              min={90}
              max={125}
              step={5}
              format={(v) => `${v}%`}
              onChange={(uiScale) => prefs.set({ uiScale })}
            />
          )}
        </Field>
        <Field label="Editor font size" help="Independent of the UI scale.">
          {({ id, describedBy }) => (
            <Slider
              id={id}
              describedBy={describedBy}
              value={bootstrap.data?.settings.editorFontSize ?? 15}
              min={13}
              max={20}
              format={(v) => `${v}px`}
              onChange={(v) => setting.set("editorFontSize", v)}
            />
          )}
        </Field>
      </Section>
      <Section title="Motion">
        <Field
          label="Reduced motion"
          help="Cross-fades instead of growth and flips. The playhead still moves."
        >
          {({ id, describedBy }) => (
            <Select<MotionPref>
              id={id}
              describedBy={describedBy}
              value={prefs.motion}
              options={[
                { value: "system", label: "System" },
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
              onChange={(motion) => prefs.set({ motion })}
            />
          )}
        </Field>
        <Field
          label="Calm highlighting"
          help="Steady outlines instead of a flash on every note (useful for hh*16)."
        >
          {({ id, describedBy }) => (
            <Switch
              id={id}
              describedBy={describedBy}
              checked={prefs.calmHighlight}
              onChange={(calmHighlight) => prefs.set({ calmHighlight })}
            />
          )}
        </Field>
      </Section>
    </div>
  );
}
