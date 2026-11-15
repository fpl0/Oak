// What the learner can hear after an answer (pure, no audio and no server): the passage again, the answer, yours
// then it, the key, the way home, and since Wave 5 the thing alone, the thing in context, and since Wave 6 the thing
// against its near miss. The machine's audition actor plays these plans; the lesson player uses `earAfterAnswer`
// for the two buttons every ear step offers once it is answered (d16: the note alone, the note in context).
import type { Answer, FamilyDef, LearnerProfile, Trial } from "@oak/api";
import type { AudioPlan } from "@oak/drills";
import { arpeggioPlan, bassPlan, contextPlan, isHarmonyTrial } from "./harmony.ts";
import type { Audition } from "./machine.ts";
import {
  answerPlan,
  comparePlan,
  cuePlan,
  homePlan,
  isFetTrial,
  keyOfTrial,
  resolutionOf,
  sequence,
  stagingOf,
  trialTonicMidi,
} from "./plans.ts";
import {
  barPlan,
  isBassLineTrial,
  noteAlonePlan,
  otherFeelPlan,
  scalePlan,
  sectionPlan,
  tracksPlan,
  withoutSeventhPlan,
} from "./wave5.ts";
import { nearMissOf, wave6Alone } from "./wave6.ts";
import { lanesAnswerPlan, lanesComparePlan, wave7Alone, wave7Context, wave7Near } from "./wave7.ts";

type Captured = { taps: number[] | null; answer: Answer | null; voices?: (0 | 1)[] | null };
type Comfort = Pick<LearnerProfile, "comfLow" | "comfHigh">;

/** Families whose "alone" has its own name; an FET trial's is "The note alone", anything else "Alone". */
const ALONE_LABELS: Readonly<Record<string, string>> = {
  "fam.rhy.swing": "Hats alone",
  "fam.rhy.groove-lock": "Kick and bass",
  "fam.key.mode": "The tune alone",
  "fam.har.bass": "The bass alone",
  "fam.int.isolated": "The two notes",
};

/**
 * What "alone" means for a trial: the hats of a feel trial, the bass with the kick of a groove-lock trial, the asked
 * note of an FET trial, the bass line of a bass trial, the 3rd and 7th of a seventh chord, the outside chord and
 * where it goes, the two homes of a key change, the kick of a push, else the tune by itself.
 */
export function alonePlan(trial: Trial): AudioPlan | null {
  // Wave 7: the 3rds and 7ths of a ii–V, the sung line, the colour note, the clave, the accents, the changed bar.
  const w7 = wave7Alone(trial);
  if (w7) return w7.plan;
  const w6 = wave6Alone(trial);
  if (w6) return w6.plan;
  if (trial.family === "fam.rhy.swing") return tracksPlan(trial, ["hats", "hatClosed", "hatOpen"]);
  if (trial.family === "fam.rhy.groove-lock") return tracksPlan(trial, ["kick", "bass"]);
  if (Array.isArray(trial.params.resolutionTargets)) return noteAlonePlan(trial);
  if (trial.family === "fam.har.bass" || isBassLineTrial(trial)) return bassPlan(trial);
  return tracksPlan(trial, ["mel"]);
}

/** The button's words for `alonePlan`. */
export function aloneLabel(trial: Trial): string {
  return (
    wave7Alone(trial)?.label ??
    wave6Alone(trial)?.label ??
    ALONE_LABELS[trial.family] ??
    (isFetTrial(trial) ? "The note alone" : "Alone")
  );
}

/** The passage again from its cue: the thing in context (Wave 7: a family's own context, the line over its chords). */
function againPlan(trial: Trial, profile: Comfort): AudioPlan {
  const own = wave7Context(trial);
  if (own) return own.plan;
  const st = stagingOf(trial, profile);
  return sequence(
    [st.cue, st.stimulus ?? answerPlan(trial)],
    st.cue ? Math.max(0, st.stimulusAt - (st.cue.durationSec ?? 0)) : 0,
  );
}

/** The plan of an after-answer audition (pure apart from the profile's comfort range). */
export function auditionPlan(
  trial: Trial,
  what: Audition,
  captured: Captured,
  profile: Comfort,
  part: number | null = null,
  def: Pick<FamilyDef, "categories"> | null = null,
): AudioPlan | null {
  switch (what) {
    case "alone":
      return alonePlan(trial);
    case "near":
      return (
        wave7Near(trial, def as Parameters<typeof wave7Near>[1], captured.answer)?.plan ??
        nearMissOf(trial, def, captured.answer)?.plan ??
        null
      );
    case "other":
      return trial.family === "fam.rhy.swing" ? otherFeelPlan(trial) : withoutSeventhPlan(trial);
    case "scale":
      return scalePlan(trial);
    case "part": {
      if (part === null) return null;
      // A section of a form trial (0-based), else a bar of the passage (1-based).
      const section = sectionPlan(trial, part);
      return section ?? barPlan(trial, part);
    }
    case "answer":
      // A two-lane take (Wave 7): both pulses all the way through.
      return lanesAnswerPlan(trial) ?? answerPlan(trial);
    case "resolve": {
      // "Hear it resolve": the asked degree walks home to 1 (a chromatic degree: to the note it leans on).
      const own = resolutionOf(trial).plan;
      const tonic = trialTonicMidi(trial);
      const d = (trial.expected as { degrees?: string[] }).degrees?.at(-1);
      return own && own.events.length > 0
        ? own
        : tonic !== null && d
          ? homePlan(tonic, d as never, keyOfTrial(trial)?.mode ?? "major")
          : null;
    }
    case "cue":
      return cuePlan(trial, profile);
    case "compare":
      return lanesComparePlan(trial, captured.taps, captured.voices) ?? comparePlan(trial, captured, null);
    case "bass":
      return bassPlan(trial);
    case "arpeggio":
      return arpeggioPlan(trial);
    case "context":
      return contextPlan(trial);
    default:
      return againPlan(trial, profile);
  }
}

/** One button of an answered ear step: its words and its sound. */
export interface EarListen {
  label: string;
  plan: AudioPlan;
}

/**
 * The two things every answered ear trial offers (d16; the same two buttons in a drill and in a lesson's ear step):
 * the thing by itself, and the thing in its context (a chord in its key with the way home; anything else as the
 * passage again from its cue). Either is null when the trial has nothing of that kind to play.
 */
export function earAfterAnswer(
  trial: Trial,
  profile: Comfort = { comfLow: 48, comfHigh: 72 },
): { alone: EarListen | null; context: EarListen | null } {
  const alone = alonePlan(trial);
  const harmony = isHarmonyTrial(trial);
  const context = harmony ? contextPlan(trial) : againPlan(trial, profile);
  return {
    alone: alone && alone.events.length > 0 ? { label: aloneLabel(trial), plan: alone } : null,
    context:
      context && context.events.length > 0
        ? {
            label: harmony ? "In its key" : isFetTrial(trial) ? "The note in context" : "In context",
            plan: context,
          }
        : null,
  };
}
