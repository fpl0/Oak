// <PassiveListen>: a guided listening block (contracts U04.L04, AUTHORING §16.5). A stream of generated examples
// from one family — in-key pairs, degrees — each named as it plays (`reveal: "with"`) or just after (`"after"`:
// guess silently, then see it). Nothing to answer, no evidence, no SRS. Clearly labelled; Enter skips the rest
// or continues, R plays it again from the start. Used by Practice ("Listen first") and exported for the lesson
// player's `listen` steps with a `passive` block:
//
//   <PassiveListen spec={exercise.passive} data={drillData} doneLabel="Continue" onDone={next} />
import type { AudioPlan } from "@oak/drills";
import type { PlaybackHandle } from "@oak/strudel";
import { useEffect, useRef, useState } from "react";
import { useLenses } from "../lib/lenses.ts";
import { getOak } from "../lib/oak.ts";
import { keyScope, useHotkeys } from "../ui/keys/KeymapProvider.tsx";
import { Button } from "../ui/kit/Button.tsx";
import { Card, Kbd, Progress } from "../ui/kit/basics.tsx";
import { listenFor } from "./listen-for.ts";
import { type PassiveItem, type PassiveSpec, passiveItems, passiveSeconds } from "./passive.ts";
import { playSettled, preloadSpec } from "./runtime.ts";
import type { DrillData } from "./use-drill-data.ts";

type Phase = "idle" | "cue" | "example" | "gap" | "done";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function PassiveListen({
  spec,
  data,
  seed,
  title,
  doneLabel,
  onDone,
}: {
  spec: PassiveSpec;
  data: DrillData;
  /** Same seed, same stream (default: the family and level). */
  seed?: number;
  /** Heading above the stream; defaults to the family's title. */
  title?: string;
  doneLabel: string;
  onDone(): void;
}) {
  const lenses = useLenses();
  const def = data.defs.get(spec.family);
  const [items] = useState<PassiveItem[]>(() => {
    try {
      return passiveItems(data.registry.family(spec.family), spec, {
        seed: seed ?? hash(`${spec.family}|${spec.level}`),
        openCategories: data.states.get(spec.family)?.openCategories ?? [],
        profile: data.profile,
        solfege: lenses.shown.solfege,
      });
    } catch {
      return [];
    }
  });
  const [at, setAt] = useState(-1);
  const [phase, setPhase] = useState<Phase>("idle");
  const run = useRef(0);
  const handle = useRef<PlaybackHandle | null>(null);

  const stop = () => {
    run.current++;
    handle.current?.stop();
    handle.current = null;
  };

  const playAll = async () => {
    stop();
    const mine = run.current;
    const live = () => mine === run.current;
    try {
      const oak = await getOak();
      const sounds = [...new Set(items.flatMap((it) => [...(it.cue?.preload ?? []), ...it.example.preload]))];
      await oak.preload(preloadSpec(sounds)).catch(() => {});
      const playOne = async (plan: AudioPlan) => {
        if (!live()) return;
        const h = playSettled(oak, plan, { at: oak.ctx.currentTime + 0.1 });
        handle.current = h;
        await h.done;
      };
      for (let i = 0; i < items.length && live(); i++) {
        const it = items[i] as PassiveItem;
        setAt(i);
        if (it.cue) {
          setPhase("cue");
          await playOne(it.cue);
          await new Promise((r) => setTimeout(r, 400));
        }
        if (!live()) return;
        setPhase("example");
        await playOne(it.example);
        if (!live()) return;
        setPhase("gap");
        await new Promise((r) => setTimeout(r, it.gapSec * 1000));
      }
      if (live()) setPhase("done");
    } catch {
      if (live()) setPhase("done");
    }
  };

  useEffect(() => {
    void playAll();
    return () => stop();
    // Plays once on arrival; R replays from the start.
  }, []);

  const finish = () => {
    stop();
    onDone();
  };

  useHotkeys([
    {
      id: "passive-again",
      keys: "R",
      scope: "answer-pad",
      group: "Drills",
      description: "Listen again from the start",
      run: () => void playAll(),
    },
    {
      id: "passive-continue",
      keys: "Enter",
      scope: "answer-pad",
      group: "Drills",
      description: "Continue (skips the rest of the listening)",
      when: (k) => !k.onControl,
      run: finish,
    },
  ]);

  const cur = at >= 0 ? items[at] : undefined;
  // "after": the name appears once the example has sounded (the gap), never while it plays.
  const showName = cur && (spec.reveal === "with" ? phase !== "cue" : phase === "gap" || phase === "done");
  const minutes = Math.max(1, Math.round(passiveSeconds(items) / 60));
  return (
    <Card
      {...keyScope("answer-pad")}
      tabIndex={-1}
      className="flex flex-col gap-4 p-6 outline-none"
      data-testid="passive-listen"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text-2">Just listen · nothing to answer</p>
          <h2 className="text-h3">{title ?? def?.title ?? "Listening"}</h2>
          <p className="mt-1 text-sm text-text-2">
            {spec.reveal === "with"
              ? "Each one is named as it plays."
              : "Guess each one silently; its name appears just after."}{" "}
            About {minutes} {minutes === 1 ? "minute" : "minutes"}. Nothing here is scored.
          </p>
          <p className="mt-2 max-w-[60ch] text-text-2" data-testid="listen-for">
            <span className="font-medium text-text">Listen for: </span>
            {listenFor(def)}
          </p>
        </div>
        <span className="text-sm tabular-nums text-text-2" data-testid="passive-counter">
          {items.length === 0 ? "" : `${Math.min(items.length, Math.max(1, at + 1))} of ${items.length}`}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="text-text-2">No examples are ready for this level yet.</p>
      ) : (
        <>
          <Progress
            value={phase === "done" ? items.length : Math.max(0, at)}
            max={items.length}
            label="Listening progress"
          />
          <div
            className="flex min-h-28 flex-col items-center justify-center gap-1 rounded-control border border-border bg-surface-2 p-4 text-center"
            aria-live="polite"
            data-testid="passive-now"
          >
            {phase === "cue" ? (
              <p className="text-text-2">Setting the key{cur?.keyName ? `: ${cur.keyName}` : ""}…</p>
            ) : phase === "done" ? (
              <p className="text-text-2">That's the set. Continue when you're ready, or hear it again.</p>
            ) : showName && cur ? (
              <>
                <p className="text-h2 tabular-nums" data-testid="passive-caption">
                  {cur.caption}
                </p>
                {cur.sub && <p className="text-sm text-text-2">{cur.sub}</p>}
              </>
            ) : (
              <p className="text-text-2">{phase === "idle" ? "Getting ready…" : "Listen…"}</p>
            )}
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={finish} autoFocus data-testid="passive-continue">
          {phase === "done" || items.length === 0 ? doneLabel : `Skip the rest · ${doneLabel}`}{" "}
          <Kbd tone="inverse">Enter</Kbd>
        </Button>
        {items.length > 0 && (
          <Button onClick={() => void playAll()}>
            Listen again <Kbd>R</Kbd>
          </Button>
        )}
      </div>
    </Card>
  );
}
