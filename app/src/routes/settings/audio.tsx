// Settings › Audio (ux §2.3; contracts §8.6): volumes, a left/right output check, the limiter, timing (with
// re-runs through /settings/voice/setup), and the sound pack: its version, what is cached for offline use, and
// "Preload all".
import { LIMITER } from "@oak/strudel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useEffect, useState } from "react";
import { usePageTitle } from "../../lib/nav.ts";
import { getOak, peekOak } from "../../lib/oak.ts";
import { useBootstrap } from "../../lib/queries.ts";
import { useUpdateSetting } from "../../lib/settings.ts";
import { audioStatusLabel, useShell } from "../../lib/shell-store.ts";
import { Button, buttonClass } from "../../ui/kit/Button.tsx";
import { Field, ReadOnlyRow, Section, Slider } from "../../ui/kit/Field.tsx";
import { QueryView } from "../../ui/kit/QueryState.tsx";
import { toast } from "../../ui/kit/Toast.tsx";
import { outputChoiceOf, outputGuidance } from "../../voice/logic.ts";
import { browserPackDeps, type PackStatus, packLine, readPackStatus } from "../../voice/pack-status.ts";
import { voiceAudio } from "../../voice/services.ts";

export const Route = createFileRoute("/settings/audio")({ component: AudioSettings });

const ms = (v: number | null) => (v === null ? "not measured" : `${Math.round(v)} ms`);
const OUTPUT_WORDS = {
  wired: "Wired headphones",
  bluetooth: "Bluetooth or AirPods",
  speakers: "Speakers",
} as const;

function OutputCheck({ onPlayed }: { onPlayed(): void }) {
  const [state, setState] = useState<"idle" | "playing" | "played">("idle");
  const play = async () => {
    setState("playing");
    try {
      const { oak, calibration } = await voiceAudio();
      await oak.unlock();
      await calibration.outputCheck();
      setState("played");
      onPlayed();
    } catch (e) {
      setState("idle");
      toast.error("Sound didn't start", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <Button
        onClick={() => void play()}
        loading={state === "playing"}
        icon={<Play aria-hidden className="size-4" />}
        data-testid="audio-lr"
      >
        Play the left/right test
      </Button>
      <span className="text-sm text-text-2" aria-live="polite">
        {state === "playing"
          ? "A low tone on the left, then a higher one on the right…"
          : state === "played"
            ? "Low on the left, high on the right? If they swapped, check the L and R of your headphones."
            : "A low tone in the left ear, then a higher one in the right."}
      </span>
    </div>
  );
}

function usePackStatus(key: string) {
  const [status, setStatus] = useState<PackStatus | null>(null);
  // Re-read when sound wakes (the adapter's sound list appears then) or after a preload.
  useEffect(() => {
    let live = true;
    void readPackStatus(browserPackDeps(() => peekOak()?.sounds().length ?? 0)).then(
      (s) => live && setStatus(s),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return status;
}

function AudioSettings() {
  usePageTitle("Settings · Audio");
  const bootstrap = useBootstrap();
  const update = useUpdateSetting();
  const audio = useShell((s) => s.audio);
  const [played, setPlayed] = useState(0);
  const pack = usePackStatus(`${audio.kind}:${played}`);
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
      useShell.getState().setAudio({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      toast.error("Couldn't preload the sounds", e instanceof Error ? e.message : undefined);
    }
  };
  return (
    <QueryView query={bootstrap}>
      {({ settings, profile }) => {
        const out = outputChoiceOf(profile.outputKind);
        const lines = pack ? packLine(pack) : null;
        return (
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
              <ReadOnlyRow
                label="Limiter"
                value={`On: nothing goes above ${LIMITER.threshold} dBFS (protects your ears and speakers)`}
              />
              <ReadOnlyRow
                label="Listening on"
                value={
                  profile.outputKind === "unknown" ? (
                    "not set up yet"
                  ) : (
                    <span>
                      {OUTPUT_WORDS[out]}
                      <span className="block text-sm text-text-3">{outputGuidance(out).title}</span>
                    </span>
                  )
                }
              />
              <OutputCheck onPlayed={() => setPlayed((n) => n + 1)} />
              <div className="pb-1">
                <Link
                  to="/settings/voice/setup"
                  search={{ part: "headphones" }}
                  className={buttonClass("secondary")}
                >
                  Change headphones
                </Link>
              </div>
            </Section>
            <Section
              title="Timing"
              description="Measured once at set-up; measure again when you change headphones."
            >
              <ReadOnlyRow label="Tap latency" value={ms(profile.tapLatencyMs)} />
              <ReadOnlyRow label="Sing latency" value={ms(profile.singLatencyMs)} />
              <ReadOnlyRow label="Output latency" value={ms(profile.outputLatencyMs)} />
              <div className="py-3">
                <Link
                  to="/settings/voice/setup"
                  search={{ part: "latency" }}
                  className={buttonClass("secondary")}
                  data-testid="audio-recalibrate"
                >
                  Measure timing again
                </Link>
              </div>
            </Section>
            <Section title="Sound pack">
              <ReadOnlyRow label="Sound" value={audioStatusLabel(audio)} />
              <ReadOnlyRow
                label="Installed"
                value={<span data-testid="pack-status">{lines ? lines.status : "Checking…"}</span>}
              />
              <ReadOnlyRow
                label="Offline"
                value={<span data-testid="pack-offline">{lines ? lines.offline : "Checking…"}</span>}
              />
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
        );
      }}
    </QueryView>
  );
}
