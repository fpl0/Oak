// A passive-listen block (wave3.md §10, `ListenEx.passive`; U04.L04): a stream of generated examples from a
// drill family at one level, each named as it plays (`with`) or just after (`after`), with a few beats of
// silence between. Nothing is asked and nothing is recorded (no evidence, no SRS). The chords that set home
// play before the first example and whenever the key changes. The step is done when the stream ends; Continue
// is open all along.
import type { ListenEx, MeterId, Trial } from "@oak/api";
import { Play, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/kit/Button.tsx";
import { playStimulus } from "./audio.ts";
import { StepLayout, useStepHost } from "./frame.tsx";
import { familyTrial, hashSeed, openCategories } from "./grading.ts";
import { coreRank, passiveLabel } from "./rules.ts";

type Passive = NonNullable<ListenEx["passive"]>;

/** The block's examples: seeded by the lesson, the step and the series, so a replay hears the same stream. */
export function passiveTrials(
  p: Passive,
  ownerId: string,
  stepId: string,
  seriesNo: number,
  profile: Parameters<typeof familyTrial>[4],
): Trial[] {
  const here = coreRank(ownerId);
  const cats = openCategories(p.family, ownerId, (l) => {
    const r = coreRank(l);
    return here !== null && r !== null && r < here;
  });
  return Array.from({ length: Math.max(0, p.items) }, (_, i) => {
    const seed = hashSeed(`${ownerId}/${stepId}#${seriesNo}:${i}`);
    const category = cats[seed % Math.max(1, cats.length)] ?? null;
    return familyTrial(p.family, p.level, category, seed, profile);
  });
}

const keyOf = (t: Trial) => {
  const k = (t.params as { key?: { tonic: string; mode: string } }).key;
  return k ? `${k.tonic}:${k.mode}` : "";
};

export function PassiveListenRenderer() {
  const h = useStepHost();
  const ex = h.exercise as ListenEx;
  const p = ex.passive as Passive;
  const trials = useMemo(
    () => passiveTrials(p, h.lesson.id, h.step.id, h.seriesNo, h.env.profile),
    [p, h.lesson.id, h.step.id, h.seriesNo, h.env.profile],
  );
  const [at, setAt] = useState(-1);
  const [named, setNamed] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const run = useRef(0);
  const stopNow = useRef<(() => void) | null>(null);
  const markDone = h.markDone;
  useEffect(
    () => () => {
      run.current += 1;
      stopNow.current?.();
    },
    [],
  );

  const stop = () => {
    run.current += 1;
    stopNow.current?.();
    stopNow.current = null;
    setRunning(false);
  };

  const start = async () => {
    const my = ++run.current;
    setRunning(true);
    setFinished(false);
    setAt(-1);
    setNamed(0);
    let lastKey = "";
    try {
      for (let i = 0; i < trials.length; i++) {
        if (run.current !== my) return;
        const t = trials[i] as Trial;
        const meter = ((t.params as { meter?: MeterId }).meter ?? "4/4") as MeterId;
        const key = (t.params as { key?: { tonic: string; mode: string } }).key ?? h.env.key;
        const fresh = keyOf(t) !== lastKey;
        lastKey = keyOf(t);
        setAt(i);
        if (p.reveal === "with") setNamed(i + 1);
        // The trial's own cue (its chords that set home) only when the key is new.
        const playing = await playStimulus({
          trial: fresh
            ? t
            : { ...t, params: { ...t.params, cueBars: 0 }, cue: { ...t.cue, context: "none" } },
          bars: Number(t.params.bars ?? 1),
          meter,
          key: key as never,
        });
        stopNow.current = () => playing.stop();
        await playing.done;
        if (run.current !== my) return;
        if (p.reveal === "after") setNamed(i + 1);
        const beatMs = 1000 / t.cps / 4;
        await new Promise((r) => window.setTimeout(r, Math.max(0, p.gapBeats) * beatMs));
      }
      if (run.current !== my) return;
      setFinished(true);
      setRunning(false);
      markDone();
    } catch {
      if (run.current === my) setRunning(false);
    }
  };

  const shown = trials.slice(0, named);
  return (
    <StepLayout
      answer={
        <section
          aria-label="Listening block"
          className="flex flex-col gap-3"
          data-testid="passive"
          data-reveal={p.reveal}
          data-items={trials.length}
        >
          <p className="text-sm text-text-2">
            {p.reveal === "with"
              ? "Just listen. Each example is named as it plays."
              : "Just listen. Name each one silently; Oak names it just after."}{" "}
            Nothing here is marked.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              icon={
                running ? (
                  <Square aria-hidden className="size-3.5" />
                ) : (
                  <Play aria-hidden className="size-4" />
                )
              }
              onClick={() => (running ? stop() : void start())}
              data-testid="passive-play"
            >
              {running ? "Stop" : finished ? "Play it again" : at >= 0 ? "Start again" : "Start listening"}
            </Button>
            <span className="text-sm text-text-3" aria-live="polite" data-testid="passive-progress">
              {at < 0
                ? `${trials.length} examples`
                : `${Math.min(at + 1, trials.length)} of ${trials.length}`}
            </span>
          </div>
          <ol className="flex flex-col gap-1" aria-label="Heard so far" data-testid="passive-names">
            {shown.map((t, i) => (
              <li
                key={`${t.seed}-${i}`}
                className={`rounded-control px-2 py-1 text-sm ${i === at ? "bg-lane-in font-medium" : "text-text-2"}`}
              >
                <span className="mr-2 font-mono text-text-3">{i + 1}.</span>
                {passiveLabel(t)}
              </li>
            ))}
          </ol>
          {finished && (
            <p role="status" className="text-sm text-text-2" data-testid="passive-done">
              That's the block. Continue when you're ready.
            </p>
          )}
        </section>
      }
    />
  );
}
