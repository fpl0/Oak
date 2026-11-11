import { createFileRoute, Link } from "@tanstack/react-router";
import { usePageTitle } from "../../lib/nav.ts";
import { getOak, peekOak } from "../../lib/oak.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { useUpdateSetting } from "../../lib/settings.ts";
import { audioStatusLabel, useShell } from "../../lib/shell-store.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Field, ReadOnlyRow, Section, Slider } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";

export const Route = createFileRoute("/settings/audio")({ component: AudioSettings });

const ms = (v: number | null) => (v === null ? "not measured" : `${Math.round(v)} ms`);

function AudioSettings() {
  usePageTitle("Settings · Audio");
  const bootstrap = useBootstrap();
  const update = useUpdateSetting();
  const audio = useShell((s) => s.audio);
  const preloadAll = async () => {
    try {
      const oak = peekOak() ?? (await getOak());
      useShell.getState().setAudio({ kind: "loading", done: 0, total: 1 });
      const report = await oak.preload({ sounds: oak.sounds().map((s) => ({ s })) }, (done, total) =>
        useShell.getState().setAudio({ kind: "loading", done, total }),
      );
      useShell.getState().setAudio({ kind: "ready" });
      toast.success(
        "Sounds ready",
        `${report.warmed} sounds warmed in ${Math.round(report.ms / 100) / 10} s.`,
      );
    } catch (e) {
      toast.error("Couldn't preload the sounds", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <QueryView query={bootstrap}>
      {({ settings, profile }) => (
        <div className="flex flex-col gap-6">
          <Section title="Output">
            <Field label="Master volume">
              {({ id, describedBy }) => (
                <Slider
                  id={id}
                  describedBy={describedBy}
                  value={Math.round(settings.volume * 100)}
                  min={0}
                  max={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => update.set("volume", v / 100)}
                />
              )}
            </Field>
            <Field label="Click volume" help="The metronome and count-in.">
              {({ id, describedBy }) => (
                <Slider
                  id={id}
                  describedBy={describedBy}
                  value={Math.round(settings.clickVolume * 100)}
                  min={0}
                  max={100}
                  format={(v) => `${v}%`}
                  onChange={(v) => update.set("clickVolume", v / 100)}
                />
              )}
            </Field>
            <ReadOnlyRow label="Limiter" value="On (protects your ears and speakers)" />
            <ReadOnlyRow label="Output device" value={profile.outputKind} />
          </Section>
          <Section
            title="Timing"
            description="Measured once at set-up; recalibrate if you change headphones."
          >
            <ReadOnlyRow label="Tap latency" value={ms(profile.tapLatencyMs)} />
            <ReadOnlyRow label="Sing latency" value={ms(profile.singLatencyMs)} />
            <ReadOnlyRow label="Output latency" value={ms(profile.outputLatencyMs)} />
            <div className="py-3">
              <Link to="/settings/voice/setup" className={buttonClass("secondary")}>
                Recalibrate
              </Link>
            </div>
          </Section>
          <Section title="Sound pack">
            <ReadOnlyRow label="Status" value={audioStatusLabel(audio)} />
            <div className="py-3">
              <Button
                onClick={() => void preloadAll()}
                loading={audio.kind === "loading" || audio.kind === "waking"}
              >
                Preload all
              </Button>
            </div>
          </Section>
        </div>
      )}
    </QueryView>
  );
}
