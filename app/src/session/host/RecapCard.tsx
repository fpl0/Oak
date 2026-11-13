// The recap after a break (contracts §7.9): 30 seconds with the last can-do statement and the last sketch
// playing, and, when a lesson was left unfinished, two lines on where you were. Then straight on. The gap
// itself is never shown.
import type { SessionPlan } from "@oak/api";
import type { PatternPlayer } from "@oak/strudel";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useContent } from "../../lib/content.ts";
import { lessonTitles, titleOf } from "../../lib/content-model.ts";
import { getOak } from "../../lib/oak.ts";
import { apiQuery } from "../../lib/queries.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card } from "../../ui/kit/basics.tsx";
import { playbackLint } from "../playback.ts";

export const RECAP_MS = 30_000;

export function RecapCard({ plan, onContinue }: { plan: SessionPlan; onContinue(): void }) {
  const content = useContent();
  const recap = plan.returning?.recap ?? null;
  const sketch = useQuery({
    ...apiQuery("sketches.get", { params: { id: recap?.sketchId ?? "" } }),
    enabled: !!recap?.sketchId,
  });
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<PatternPlayer | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const canDo = recap?.canDoId ? content.data?.candos.find((c) => c.id === recap.canDoId) : undefined;
  const version =
    sketch.data?.versions.find((v) => v.version === sketch.data?.currentVersion) ??
    sketch.data?.versions.at(-1);
  const playable = version && !version.flags.reviewBeforeRun ? version : null;
  const titles = lessonTitles(content.data?.syllabus ?? null);
  const lessonId = plan.main?.light?.lessonId ?? plan.mapItemId;
  const outline = content.data?.lessons.find((l) => l.id === lessonId);
  const resume = plan.main?.resumeStep ?? null;
  const resumeIdx = outline && resume ? outline.steps.findIndex((s) => s.id === resume) : -1;

  const stop = () => {
    player.current?.stop();
    if (stopTimer.current) clearTimeout(stopTimer.current);
    setPlaying(false);
  };

  const play = async () => {
    if (!playable) return;
    setError(null);
    try {
      const oak = await getOak();
      await oak.unlock();
      player.current ??= oak.createPatternPlayer();
      const bpm = playable.bpm ?? 90;
      const out = await player.current.load(playable.code, {
        bars: 8,
        cps: bpm / 60 / 4,
        lint: playbackLint(playable),
      });
      if (!out.ok) {
        setError("This sketch doesn't run as it is; open it in Studio to look at it.");
        return;
      }
      await player.current.play();
      setPlaying(true);
      stopTimer.current = setTimeout(stop, RECAP_MS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sound didn't start.");
    }
  };

  useEffect(() => {
    continueRef.current?.focus();
    return () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      player.current?.dispose();
      player.current = null;
    };
  }, []);

  // The last sketch plays by itself (the warm-up before it already woke the sound); Stop is always there.
  const tried = useRef(false);
  useEffect(() => {
    if (!playable || tried.current) return;
    tried.current = true;
    void play();
  });

  const next = () => {
    stop();
    onContinue();
  };
  useHotkeys([
    {
      id: "recap-continue",
      keys: "Enter",
      scope: "global",
      group: "Session",
      description: "Continue",
      when: (c) => !c.onControl && !c.inEditable,
      run: next,
    },
  ]);

  return (
    <Card className="mx-auto flex max-w-2xl flex-col gap-4 p-6" data-testid="recap-card">
      <div>
        <p className="text-sm font-semibold text-text-2">Recap</p>
        <h2 className="text-h2">Where the thread is</h2>
      </div>
      {canDo ? (
        <p className="text-lg">{canDo.statement}</p>
      ) : (
        <p className="text-text-2">Your sketches so far are all in Studio.</p>
      )}
      {playable ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void (playing ? stop() : play())}
            icon={
              playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />
            }
            data-testid="recap-play"
          >
            {playing ? "Stop" : `Play ${sketch.data?.title ?? "your last sketch"}`}
          </Button>
          <span className="text-sm text-text-3">About 30 seconds.</span>
        </div>
      ) : null}
      {error && <p className="text-sm text-text-2">{error}</p>}
      {resume && outline && (
        <div
          className="rounded-control border border-border bg-surface-2 p-3 text-sm"
          data-testid="where-you-were"
        >
          <p className="font-medium">Where you were</p>
          <p className="text-text-2">
            {titleOf(lessonId, titles)}, step {resumeIdx + 1} of {outline.steps.length}
            {outline.steps[resumeIdx] ? ` (${outline.steps[resumeIdx]?.kind})` : ""}. You pick up there; the
            steps before it are saved.
          </p>
        </div>
      )}
      <div>
        <Button ref={continueRef} variant="primary" size="lg" onClick={next} data-testid="recap-continue">
          {plan.kind === "light" ? "On to the light session" : "On to the lesson"}
        </Button>
      </div>
    </Card>
  );
}
