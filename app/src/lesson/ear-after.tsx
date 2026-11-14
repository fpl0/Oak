// The two buttons a lesson ear step shows once it is answered, as a drill does (decision of 2026-11-13, d16): the
// thing alone, and the thing in context. The rules are in ear-after.ts; a drawn trial's "alone" is the drill
// engine's own plan, a code stimulus plays the asked line only. Shown under the verdict, never before an answer
// (it would give the listening away) and never in a checkpoint.
import type { AllEx, Answer, Exercise, Trial } from "@oak/api";
import { useEffect, useState } from "react";
import { earAfterAnswer } from "../drills/listen.ts";
import { nearMissOf } from "../drills/wave6.ts";
import { Button } from "../ui/kit/Button.tsx";
import { type Playing, playPlan, playStimulus, stimulusTracks } from "./audio.ts";
import { earAfterPlan, earAfterShown, IN_CONTEXT_LABEL, isEarAnswer } from "./ear-after.ts";
import { useStepHost } from "./frame.tsx";

type Part = Exclude<Exercise, AllEx>;

/** The lines of a code stimulus, read once per stimulus (`[]` for a drawn trial or while it is read). */
function useStimulusTracks(ex: Part | undefined, enabled: boolean): readonly string[] {
  const h = useStepHost();
  const stim = ex && "stimulus" in ex && ex.stimulus?.src === "code" ? ex.stimulus : null;
  const meter = ex?.meter ?? h.env.meter;
  const id = stim && enabled ? `${stim.code}|${stim.bars}|${meter}` : null;
  const [tracks, setTracks] = useState<{ for: string; tracks: string[] } | null>(null);
  useEffect(() => {
    if (!stim || !id) return;
    let live = true;
    void stimulusTracks({ code: stim.code, bars: stim.bars, meter })
      .then((t) => {
        if (live) setTracks({ for: id, tracks: t });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return tracks && tracks.for === id ? tracks.tracks : [];
}

/**
 * The learner's pick as the drill engine reads an answer, for the near miss ("Against a major 7th" plays the chord
 * as they heard it, then as it is). Only the shapes a near miss reads: a quality, a choice, degrees.
 */
export function pickedAnswer(ex: Part, value: unknown): Answer | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === "string")) return null;
  const ui = "answer" in ex && ex.answer && typeof ex.answer === "object" ? ex.answer.ui : null;
  if (ui === "quality-pad") return { qualities: value } as Answer;
  if (ui === "degree-pad") return { degrees: value } as Answer;
  if (ui === "choice" || ui === "bar-buttons") return { choice: value } as Answer;
  return null;
}

export function EarAfter({ ex, trial, value }: { ex: Part; trial: Trial | null; value?: unknown }) {
  const h = useStepHost();
  const answered = h.result !== null && h.result.status !== "ungraded" && h.result.status !== "error";
  const shown =
    isEarAnswer(ex) &&
    earAfterShown({ mode: h.mode, answered: answered || h.passed || h.review, checking: h.checking });
  const tracks = useStimulusTracks(ex, shown);
  const [playing, setPlaying] = useState<{ what: "alone" | "context" | "near"; p: Playing } | null>(null);
  useEffect(() => () => playing?.p.stop(), [playing]);
  if (!shown || !isEarAnswer(ex)) return null;
  // A drawn trial: the drill's own two listens, in its own words (drills/listen.ts), so a lesson's ear step and a
  // warm-up say and play the same.
  const drill =
    trial && ex.stimulus.src === "generator"
      ? earAfterAnswer(trial, { comfLow: h.env.profile.comfLow, comfHigh: h.env.profile.comfHigh })
      : null;
  const plan = earAfterPlan(ex, { trial, tracks, trialAlone: (drill?.alone ?? null) !== null });
  if (!plan) return null;
  // The thing against its near miss, as a drill offers it (Wave 6 review: a lesson's ear step had no way to hear
  // a dominant 7th against the major 7th it was taken for): the learner's own wrong pick when there is one.
  const near =
    trial && ex.stimulus.src === "generator" ? nearMissOf(trial, null, pickedAnswer(ex, value)) : null;
  const stim = ex.stimulus;
  const meter = ex.meter ?? h.env.meter;
  const key = ex.key ?? h.env.key;
  const aloneLabel = drill?.alone?.label ?? plan.aloneLabel;
  const contextLabel = drill?.context?.label ?? IN_CONTEXT_LABEL;
  const whole = () =>
    playStimulus({
      ...(stim.src === "code" ? { code: stim.code } : { trial }),
      bars: stim.src === "code" ? stim.bars : Number(trial?.params.bars ?? 1),
      meter,
      key,
      ...(stim.src === "code" ? { context: ex.cue.context } : {}),
    });
  const start = async (what: "alone" | "context" | "near") => {
    playing?.p.stop();
    try {
      const p =
        what === "near" && near
          ? await playPlan(near.plan)
          : what === "alone"
            ? drill?.alone
              ? await playPlan(drill.alone.plan)
              : await playStimulus({
                  code: stim.src === "code" ? stim.code : "",
                  bars: stim.src === "code" ? stim.bars : 1,
                  meter,
                  key,
                  ...(plan.alone.from === "code" ? { tracks: plan.alone.tracks } : {}),
                })
            : drill?.context
              ? await playPlan(drill.context.plan)
              : await whole();
      setPlaying({ what, p });
      void p.done.then(() => setPlaying((cur) => (cur?.p === p ? null : cur)));
    } catch {
      setPlaying(null);
    }
  };
  const button = (what: "alone" | "context" | "near", label: string, testId: string) => (
    <Button
      size="sm"
      aria-pressed={playing?.what === what}
      onClick={() => {
        if (playing?.what === what) {
          playing.p.stop();
          setPlaying(null);
        } else void start(what);
      }}
      data-testid={testId}
    >
      {playing?.what === what ? "Stop" : label}
    </Button>
  );
  return (
    <fieldset className="flex flex-wrap items-center gap-2" data-testid="ear-after">
      <legend className="sr-only">Listen again</legend>
      {button("alone", aloneLabel, "hear-alone")}
      {button("context", contextLabel, "hear-in-context")}
      {near ? button("near", near.label, "hear-near") : null}
    </fieldset>
  );
}
