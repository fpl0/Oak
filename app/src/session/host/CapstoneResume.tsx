// Resuming a capstone (contracts §2.4, ux §1.6 "Capstones span 2–4 sessions"): a later session of the same piece
// opens by playing the draft from the top, so the learner hears where the piece stands before working on it, then
// "On to session 2" mounts the capstone workspace. The draft plays once through and stops; Stop is always there,
// and with no sound (or a draft that does not run) the card still leads straight on.
import { sectionsFromAst } from "@oak/grader";
import type { PatternPlayer } from "@oak/strudel";
import { useQuery } from "@tanstack/react-query";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getOak } from "../../lib/oak.ts";
import { apiQuery } from "../../lib/queries.ts";
import { useHotkeys } from "../../ui/keys/KeymapProvider.tsx";
import { Button } from "../../ui/kit/Button.tsx";
import { Card } from "../../ui/kit/basics.tsx";
import type { CapstoneDay } from "../capstone-day.ts";
import { playbackLint } from "../playback.ts";
import { markShown } from "../resume-once.ts";

/** A draft longer than this is a whole song: the card says that moving on never waits for the play-through. */
export const LONG_DRAFT_BARS = 24;

/** The draft's length in bars: its `arrange()` sum, else what the capstone asks for (C2: 8; X1: 4 phrases of 4). */
export function draftBars(code: string, kind: "compose" | "transcribe" | null): number {
  const ast = sectionsFromAst(code);
  if (ast && "totalBars" in ast && ast.totalBars > 0) return Math.min(128, ast.totalBars);
  return kind === "transcribe" ? 16 : 8;
}

export function CapstoneResume({
  day,
  sessionId,
  kind,
  where = null,
  onContinue,
}: {
  day: CapstoneDay;
  /** CF-T: where the learner is in the standard ("The form map and the bass are down. Today: the changes."). */
  where?: string | null;
  /** The Oak session (`sessions` row) this capstone session runs in. */
  sessionId: string;
  kind: "compose" | "transcribe" | null;
  onContinue(): void;
}) {
  const draft = day.draft;
  const sketch = useQuery({
    ...apiQuery("sketches.get", { params: { id: draft?.sketchId ?? "" } }),
    enabled: !!draft,
  });
  const version =
    sketch.data?.versions.find((v) => v.version === (draft?.sketchVersion ?? sketch.data?.currentVersion)) ??
    sketch.data?.versions.at(-1);
  // A version imported from a backup runs only after review (contracts §11.3): it is not played here.
  const playable = version && !version.flags.reviewBeforeRun ? version : null;
  const [playing, setPlaying] = useState(false);
  const [bar, setBar] = useState<{ at: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const player = useRef<PatternPlayer | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const stop = () => {
    player.current?.stop();
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  };

  const play = async () => {
    if (!playable) return;
    setError(null);
    try {
      const oak = await getOak();
      await oak.unlock();
      player.current ??= oak.createPatternPlayer();
      const bars = draftBars(playable.code, kind);
      const bpm = playable.bpm ?? 90;
      const out = await player.current.load(playable.code, {
        bars,
        cps: bpm / 60 / 4,
        lint: playbackLint(playable),
      });
      if (!out.ok) {
        setError("The draft doesn't run as it is. It opens in the workspace, where you can look at it.");
        return;
      }
      await player.current.play();
      setPlaying(true);
      setBar({ at: 1, of: bars });
      // Once through from the top, then stop: the position wraps when the loop comes round.
      let last = 0;
      timer.current = setInterval(() => {
        const pos = player.current?.position() ?? 0;
        if (pos + 0.05 < last || pos >= bars) {
          stop();
          setBar(null);
          return;
        }
        last = pos;
        setBar({ at: Math.min(bars, Math.floor(pos) + 1), of: bars });
      }, 200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sound didn't start.");
    }
  };

  useEffect(() => {
    continueRef.current?.focus();
    return () => {
      if (timer.current) clearInterval(timer.current);
      player.current?.dispose();
      player.current = null;
    };
  }, []);

  // The draft plays by itself (the warm-up before it already woke the sound).
  const tried = useRef(false);
  useEffect(() => {
    if (!playable || tried.current) return;
    tried.current = true;
    void play();
  });

  const next = () => {
    stop();
    markShown(sessionId);
    onContinue();
  };
  useHotkeys([
    {
      id: "capstone-resume-continue",
      keys: "Enter",
      scope: "global",
      group: "Session",
      description: "On to the capstone",
      when: (c) => !c.onControl && !c.inEditable,
      run: next,
    },
  ]);

  const loading = !!draft && sketch.isPending;
  return (
    <Card className="mx-auto flex max-w-2xl flex-col gap-4 p-6" data-testid="capstone-resume">
      <div>
        <p className="text-sm font-semibold text-text-2">
          Session {day.index} of {day.total}
          {day.sessionTitle ? `: ${day.sessionTitle}` : ""}
        </p>
        <h2 className="text-h2">{day.title}</h2>
      </div>
      <p className="text-text-2">
        {playable
          ? "Your draft, from the top: hear where the piece stands, then pick it up."
          : loading
            ? "Finding your draft…"
            : "Your draft opens in the workspace, where you left it."}
      </p>
      {playable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void (playing ? stop() : play())}
            icon={
              playing ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />
            }
            data-testid="resume-play"
          >
            {playing ? "Stop" : `Play ${sketch.data?.title ?? "the draft"} from the top`}
          </Button>
          <span className="text-sm tabular-nums text-text-3" aria-live="polite" data-testid="resume-bar">
            {bar ? `Bar ${bar.at} of ${bar.of}` : ""}
          </span>
        </div>
      )}
      {/* A whole song takes two minutes to play through (CF-A, CF-T): the way on never waits for it. */}
      {playing && bar && bar.of > LONG_DRAFT_BARS && (
        <p className="text-sm text-text-3" data-testid="resume-long">
          It plays once through. Move on whenever you have heard enough.
        </p>
      )}
      {error && <p className="text-sm text-text-2">{error}</p>}
      {day.checksLine && <p className="text-sm text-text-2">So far: {day.checksLine}.</p>}
      {!day.checksLine && where && (
        <p className="text-sm text-text-2" data-testid="resume-where">
          {where}
        </p>
      )}
      <div>
        <Button ref={continueRef} variant="primary" size="lg" onClick={next} data-testid="resume-continue">
          On to session {day.index}
          {day.sessionTitle ? `: ${day.sessionTitle}` : ""}
        </Button>
      </div>
    </Card>
  );
}
